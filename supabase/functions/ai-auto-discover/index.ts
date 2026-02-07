import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_RESEARCH = "gemini-2.5-flash"; // Stable grounding model
const MODEL_PARSE = "gemini-2.5-flash"; // Reliable function calling model

async function callGemini(
  apiKey: string,
  model: string,
  contents: unknown[],
  tools?: unknown[],
  systemInstruction?: string
) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = { contents, generationConfig: { temperature: 0.8 } };
  if (tools && tools.length > 0) body.tools = tools;
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

  console.log(`Calling Gemini model: ${model}, tools: ${tools ? JSON.stringify(Object.keys(tools[0] || {})) : 'none'}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("Gemini API error:", resp.status, txt);
    if (resp.status === 429) throw { status: 429, message: "Rate limit exceeded. Try again later." };
    throw new Error(`Gemini API returned ${resp.status}`);
  }
  return resp.json();
}

function extractText(response: Record<string, unknown>): string {
  const candidates = response.candidates as { content: { parts: { text?: string }[] } }[];
  if (!candidates?.[0]?.content?.parts) return "";
  return candidates[0].content.parts.map(p => p.text || "").join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await db.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { count = 5, targetCategories = [] } = await req.json();

    // Fetch existing articles and categories
    const [categoriesRes, articlesRes] = await Promise.all([
      db.from("categories").select("id, name, slug, description").order("sort_order"),
      db.from("articles").select("title, slug, category_id").order("created_at", { ascending: false }).limit(100),
    ]);

    const categories = categoriesRes.data || [];
    const existingArticles = articlesRes.data || [];

    const categoryList = categories.map((c) => `${c.name} (ID: ${c.id}): ${c.description || "General"}`).join("\n");
    const existingTitles = existingArticles.map((a) => `- ${a.title}`).join("\n");
    const targetCatFilter = targetCategories.length > 0
      ? `Focus on these categories: ${targetCategories.map((id: string) => categories.find((c) => c.id === id)?.name || id).join(", ")}`
      : "Cover a variety of categories";

    console.log("Auto-discover: Finding trending topics with Google Search grounding, count:", count);

    // Step 1: Search the web for trending topics (Google Search grounding - NO function calling)
    const searchSystemPrompt = `You are a content strategist for DigitalHelp, a tech help website for non-technical users.
Search the web to find what tech topics people are currently struggling with and searching for help on.
Focus on: common tech problems, recent software/device updates, digital literacy gaps, and frequently asked questions.
${targetCatFilter}

Provide a detailed list of ${count} specific, actionable topics that would make great help articles. For each topic include:
- The specific question or problem
- Why it's trending or important right now
- Which category it fits best
- Related search keywords`;

    const searchResp = await callGemini(GEMINI_API_KEY, MODEL_RESEARCH, [
      { role: "user", parts: [{ text: `Search the web and discover ${count} trending tech help topics that would attract organic search traffic. Look at what people are actually searching for and asking about right now. Be specific and actionable.` }] }
    ], [
      { google_search: {} }
    ], searchSystemPrompt);

    const searchResults = extractText(searchResp);
    console.log("Search results length:", searchResults.length);

    if (!searchResults || searchResults.length < 50) {
      console.error("Google Search returned insufficient results");
      return new Response(JSON.stringify({ topics: [], error: "Google Search returned no results" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Parse search results into structured topics (function calling ONLY, NO google_search)
    const parseSystemPrompt = `You are a content strategist. Based on the web research below, extract exactly ${count} specific, actionable tech help topic suggestions.

AVAILABLE CATEGORIES:
${categoryList}

EXISTING ARTICLES (avoid duplicates):
${existingTitles || "(none yet)"}

WEB RESEARCH RESULTS:
${searchResults}

Each topic must be specific and actionable (not vague). Match each to the best category. You MUST respond using the discover_topics function.`;

    const parseTools = [
      {
        function_declarations: [{
          name: "discover_topics",
          description: "Return discovered topic suggestions",
          parameters: {
            type: "OBJECT",
            properties: {
              topics: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    topic: { type: "STRING", description: "The specific topic/question to write about" },
                    category_id: { type: "STRING", description: "Best matching category UUID" },
                    priority: { type: "STRING", description: "Priority: high, medium, or low" },
                    reasoning: { type: "STRING", description: "Why this topic is valuable right now" },
                    search_keywords: { type: "ARRAY", items: { type: "STRING" }, description: "Related search keywords" },
                  },
                  required: ["topic", "category_id", "priority", "reasoning"]
                }
              }
            },
            required: ["topics"]
          }
        }]
      }
    ];

    const parseUserMsg = `Based on the research, give me exactly ${count} topic suggestions as structured data using the discover_topics function.`;

    // Try up to 2 times for function calling
    let result: { topics: unknown[] } = { topics: [] };
    for (let attempt = 0; attempt < 2; attempt++) {
      const parseResp = await callGemini(GEMINI_API_KEY, MODEL_PARSE, [
        { role: "user", parts: [{ text: parseUserMsg }] }
      ], parseTools, parseSystemPrompt);

      // Try to extract function call
      const candidates = parseResp.candidates;
      if (candidates?.[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.functionCall?.name === "discover_topics") {
            result = part.functionCall.args;
            break;
          }
        }
      }

      if (result.topics.length > 0) break;

      // Fallback: try to extract JSON from text response
      const text = extractText(parseResp);
      console.log(`Attempt ${attempt + 1}: No function call, text length: ${text.length}`);
      if (text.length > 0) {
        try {
          const jsonMatch = text.match(/\{[\s\S]*"topics"[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
              result = parsed;
              console.log("Extracted topics from text fallback:", result.topics.length);
              break;
            }
          }
        } catch (e) {
          console.log("Could not parse JSON from text response");
        }
      }

      if (attempt === 0) {
        console.log("Retrying parse step...");
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log("Auto-discover: Found", result.topics?.length, "topics");

    // Log the discovery
    await db.from("agent_logs").insert({
      action: `Discovered ${result.topics?.length || 0} topics (Gemini + Google Search)`,
      status: "completed",
      details: { topics: result.topics, mode: "auto_discover", models: { research: MODEL_RESEARCH, parse: MODEL_PARSE } },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Auto-discover error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = (error as { status?: number })?.status || 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
