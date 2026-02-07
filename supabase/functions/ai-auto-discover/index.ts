import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_FLASH = "gemini-2.5-flash-preview-05-20";

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

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
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

    console.log("Auto-discover: Finding trending topics with Google Search, count:", count);

    const systemPrompt = `You are a content strategist for DigitalHelp, a tech help website for non-technical users.

AVAILABLE CATEGORIES:
${categoryList}

EXISTING ARTICLES (avoid duplicates):
${existingTitles || "(none yet)"}

${targetCatFilter}

Your job: Discover ${count} trending, high-demand tech help topics that would attract organic search traffic.

Think about:
- Common tech problems people search for RIGHT NOW (2024-2026)
- Seasonal tech issues (new device setups, software updates, etc.)
- Evergreen digital literacy topics beginners always struggle with
- Problems that get asked repeatedly on Reddit, forums, and support sites
- Topics with high search volume but low competition

Each topic should be specific and actionable (not vague like "how to use a computer").

Use Google Search to find what people are currently searching for and struggling with.

You MUST respond using the discover_topics function.`;

    const url = `${GEMINI_BASE}/models/${MODEL_FLASH}:generateContent?key=${GEMINI_API_KEY}`;

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `Discover ${count} trending tech help topics that would be valuable for our audience. Search the web to find what people are actually looking for right now.` }] }
        ],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        tools: [
          { googleSearch: {} },
          {
            functionDeclarations: [{
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
        ],
        generationConfig: { temperature: 0.8 },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Gemini API error:", resp.status, txt);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`Gemini API returned ${resp.status}`);
    }

    const data = await resp.json();

    // Extract function call from Gemini response
    const candidates = data.candidates;
    let result: { topics: unknown[] } = { topics: [] };

    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.functionCall?.name === "discover_topics") {
          result = part.functionCall.args;
          break;
        }
      }
    }

    // If no function call, try to extract from text
    if (result.topics.length === 0) {
      const text = candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
      console.log("No function call returned, text response length:", text.length);
      // Return empty topics rather than fail
    }

    console.log("Auto-discover: Found", result.topics?.length, "topics");

    // Log the discovery
    await db.from("agent_logs").insert({
      action: `Discovered ${result.topics?.length || 0} topics (Gemini + Google Search)`,
      status: "completed",
      details: { topics: result.topics, mode: "auto_discover", model: MODEL_FLASH },
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Auto-discover error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
