import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    console.log("Auto-discover: Finding trending topics, count:", count);

    const discoverPrompt = `You are a content strategist for DigitalHelp, a tech help website for non-technical users.

AVAILABLE CATEGORIES:
${categoryList}

EXISTING ARTICLES (avoid duplicates):
${existingTitles || "(none yet)"}

${targetCatFilter}

Your job: Discover ${count} trending, high-demand tech help topics that would attract organic search traffic.

Think about:
- Common tech problems people search for RIGHT NOW (2024-2025)
- Seasonal tech issues (new device setups, software updates, etc.)
- Evergreen digital literacy topics beginners always struggle with
- Problems that get asked repeatedly on Reddit, forums, and support sites
- Topics with high search volume but low competition

Each topic should be specific and actionable (not vague like "how to use a computer").

You MUST respond using the discover_topics function.`;

    const resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: discoverPrompt },
          { role: "user", content: `Discover ${count} trending tech help topics that would be valuable for our audience.` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "discover_topics",
              description: "Return discovered topic suggestions",
              parameters: {
                type: "object",
                properties: {
                  topics: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        topic: { type: "string", description: "The specific topic/question to write about" },
                        category_id: { type: "string", description: "Best matching category UUID" },
                        priority: { type: "string", enum: ["high", "medium", "low"], description: "Priority based on search demand" },
                        reasoning: { type: "string", description: "Why this topic is valuable right now" },
                        search_keywords: { type: "array", items: { type: "string" }, description: "Related search keywords" },
                      },
                      required: ["topic", "category_id", "priority", "reasoning"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["topics"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "discover_topics" } },
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("AI gateway error:", resp.status, txt);
      if (resp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway returned ${resp.status}`);
    }

    const data = await resp.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return topics");

    const result = JSON.parse(toolCall.function.arguments);
    console.log("Auto-discover: Found", result.topics?.length, "topics");

    // Log the discovery
    await db.from("agent_logs").insert({
      action: `Discovered ${result.topics?.length || 0} topics`,
      status: "completed",
      details: { topics: result.topics, mode: "auto_discover" },
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
