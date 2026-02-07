import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.5-flash";

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function extractText(response: Record<string, unknown>): string {
  const candidates = response.candidates as { content: { parts: { text?: string }[] } }[];
  if (!candidates?.[0]?.content?.parts) return "";
  return candidates[0].content.parts.map((p) => p.text || "").join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || question.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Please provide a valid question (at least 3 characters)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedQuestion = question.trim().slice(0, 500);
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = serviceClient();

    // ── Step 1: Search published articles for relevant matches ──────────
    const searchTerms = trimmedQuestion
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 8);

    let matchedArticles: { id: string; title: string; slug: string; excerpt: string | null; content: string | null }[] = [];

    if (searchTerms.length > 0) {
      // Search using ilike for each significant word
      const orFilters = searchTerms
        .map((term) => {
          const safe = term.replace(/%/g, "\\%").replace(/_/g, "\\_");
          return `title.ilike.%${safe}%,excerpt.ilike.%${safe}%,content.ilike.%${safe}%`;
        })
        .join(",");

      const { data: articles } = await db
        .from("articles")
        .select("id, title, slug, excerpt, content")
        .eq("status", "published")
        .or(orFilters)
        .limit(10);

      if (articles) matchedArticles = articles;
    }

    // ── Step 2: Use AI to rank relevance and generate answer ────────────
    const articleContext = matchedArticles.length > 0
      ? matchedArticles
          .map((a, i) => `[Article ${i + 1}] Title: "${a.title}" | Slug: ${a.slug} | Excerpt: ${a.excerpt || "N/A"} | Content Preview: ${(a.content || "").substring(0, 500)}`)
          .join("\n\n")
      : "No articles found in the database.";

    const systemPrompt = `You are a helpful AI assistant for DigitalHelp, a beginner-friendly tech help website.

Your job is to answer the user's tech question following these rules:

1. FIRST, check if any of the provided articles from our database are relevant to the user's question.
2. If relevant articles exist:
   - Provide a brief, helpful 2-3 line summary answering their question
   - Recommend the relevant article(s) with the format: **📖 Read more:** [Article Title](/article/slug-here)
   - You can recommend up to 3 articles max
3. If NO relevant articles exist in the database:
   - Answer the question from your own knowledge clearly and helpfully
   - Keep answers beginner-friendly, concise, and actionable
   - At the end add: "💡 *We don't have a detailed guide on this topic yet, but we're working on creating one!*"
   - Set the "shouldCreateArticle" field to true

IMPORTANT FORMATTING:
- Use markdown for formatting (bold, lists, links)
- Keep answers under 300 words
- Be warm and helpful in tone
- Links to articles MUST use the format: [Title](/article/slug)
- Do NOT invent article slugs. Only use slugs from the provided articles.

Respond in JSON format:
{
  "answer": "Your markdown-formatted answer here",
  "hasRelevantArticles": true/false,
  "recommendedArticles": [{"title": "...", "slug": "..."}],
  "shouldCreateArticle": true/false,
  "suggestedTopic": "Topic for new article if shouldCreateArticle is true"
}`;

    const url = `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `User question: "${trimmedQuestion}"

Here are the articles currently published on our website:
${articleContext}

Analyze the question and articles, then respond in the required JSON format.`,
              },
            ],
          },
        ],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.4,
          response_mime_type: "application/json",
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Gemini API error:", resp.status, errText);
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Our AI is currently busy. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "AI service temporarily unavailable." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await resp.json();
    const rawText = extractText(geminiData);

    let parsed: {
      answer: string;
      hasRelevantArticles: boolean;
      recommendedArticles: { title: string; slug: string }[];
      shouldCreateArticle: boolean;
      suggestedTopic?: string;
    };

    try {
      parsed = JSON.parse(rawText);
    } catch {
      // If JSON parsing fails, use the raw text as the answer
      parsed = {
        answer: rawText || "I couldn't process your question right now. Please try again.",
        hasRelevantArticles: false,
        recommendedArticles: [],
        shouldCreateArticle: false,
      };
    }

    // ── Step 3: Trigger article generation if no relevant content ──────
    if (parsed.shouldCreateArticle && parsed.suggestedTopic) {
      const topic = parsed.suggestedTopic.trim();
      console.log(`Triggering article generation for topic: "${topic}"`);

      // Fire-and-forget: trigger the AI agent to create the article
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      fetch(`${supabaseUrl}/functions/v1/ai-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          action: "generate",
          topic: topic,
        }),
      }).catch((err) => console.error("Failed to trigger article generation:", err));
    }

    return new Response(
      JSON.stringify({
        answer: parsed.answer,
        hasRelevantArticles: parsed.hasRelevantArticles,
        recommendedArticles: parsed.recommendedArticles || [],
        articleGenerationTriggered: parsed.shouldCreateArticle && !!parsed.suggestedTopic,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ai-ask error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Something went wrong." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
