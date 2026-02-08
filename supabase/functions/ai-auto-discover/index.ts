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
  systemInstruction?: string,
  toolConfig?: unknown,
) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = { contents, generation_config: { temperature: 0.8 } };
  if (tools && tools.length > 0) body.tools = tools;
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };
  if (toolConfig) body.tool_config = toolConfig;

  console.log(`Calling Gemini model: ${model}, tools: ${tools ? JSON.stringify(Object.keys(tools[0] || {})) : "none"}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("Gemini API error:", resp.status, txt);
    if (resp.status === 429) throw { status: 429, message: "Rate limit exceeded. Try again later." };
    throw new Error(`Gemini API returned ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return resp.json();
}

function extractText(response: Record<string, unknown>): string {
  const candidates = response.candidates as { content: { parts: { text?: string }[] } }[];
  if (!candidates?.[0]?.content?.parts) return "";
  return candidates[0].content.parts.map((p) => p.text || "").join("");
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
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { count = 5, targetCategories = [], discoverRunId, autoMake = false, autoPublish = false } = await req.json();

    // Fetch existing articles and categories
    const [categoriesRes, articlesRes] = await Promise.all([
      db.from("categories").select("id, name, slug, description").order("sort_order"),
      db.from("articles").select("title, slug, category_id").order("created_at", { ascending: false }).limit(100),
    ]);

    const categories = categoriesRes.data || [];
    const existingArticles = articlesRes.data || [];

    const categoryList = categories.map((c) => `${c.name} (ID: ${c.id}): ${c.description || "General"}`).join("\n");
    const existingTitles = existingArticles.map((a) => `- ${a.title}`).join("\n");
    const targetCatFilter =
      targetCategories.length > 0
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

    const searchResp = await callGemini(
      GEMINI_API_KEY,
      MODEL_RESEARCH,
      [
        {
          role: "user",
          parts: [
            {
              text: `Search the web and discover ${count} trending tech help topics that would attract organic search traffic. Look at what people are actually searching for and asking about right now. Be specific and actionable.`,
            },
          ],
        },
      ],
      [{ google_search: {} }],
      searchSystemPrompt,
    );

    const searchResults = extractText(searchResp);
    console.log("Search results length:", searchResults.length);

    if (!searchResults || searchResults.length < 50) {
      console.error("Google Search returned insufficient results");
      return new Response(JSON.stringify({ topics: [], error: "Google Search returned no results" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Parse search results into structured topics using JSON output mode (no function calling)
    const parsePrompt = `You are a content strategist. Based on the web research below, extract exactly ${count} specific, actionable tech help topic suggestions.

AVAILABLE CATEGORIES:
${categoryList}

EXISTING ARTICLES (avoid duplicates):
${existingTitles || "(none yet)"}

WEB RESEARCH RESULTS:
${searchResults}

Return a JSON object with a "topics" array. Each topic must have:
- "topic": specific question/problem to write about
- "category_id": best matching category UUID from the list above
- "priority": "high", "medium", or "low"
- "reasoning": why this topic is valuable right now
- "search_keywords": array of related search keywords

Return ONLY valid JSON, no markdown, no explanation.`;

    // Use response_mime_type to force JSON output - much more reliable than function calling
    const parseUrl = `${GEMINI_BASE}/models/${MODEL_PARSE}:generateContent?key=${GEMINI_API_KEY}`;
    const parseBody = {
      contents: [{ role: "user", parts: [{ text: parsePrompt }] }],
      generation_config: {
        temperature: 0.5,
        response_mime_type: "application/json",
      },
    };

    console.log(`Calling Gemini model: ${MODEL_PARSE}, mode: JSON output`);

    let result: { topics: unknown[] } = { topics: [] };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const parseResp = await fetch(parseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parseBody),
        });

        if (!parseResp.ok) {
          const errText = await parseResp.text();
          console.error(`Parse attempt ${attempt + 1} API error:`, parseResp.status, errText.slice(0, 300));
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          break;
        }

        const parseData = await parseResp.json();
        const text = extractText(parseData);
        console.log(`Parse attempt ${attempt + 1}: text length ${text.length}`);

        if (text.length > 0) {
          try {
            const parsed = JSON.parse(text);
            if (parsed.topics && Array.isArray(parsed.topics) && parsed.topics.length > 0) {
              result = parsed;
              console.log("Parsed topics successfully:", result.topics.length);
              break;
            }
          } catch (e) {
            console.error(`Parse attempt ${attempt + 1}: JSON parse error`, (e as Error).message);
          }
        }

        if (attempt === 0) {
          console.log("Retrying parse step...");
          await new Promise((r) => setTimeout(r, 2000));
        }
      } catch (e) {
        console.error(`Parse attempt ${attempt + 1} error:`, (e as Error).message);
        if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log("Auto-discover: Found", result.topics?.length, "topics");

    // Persist results to discover_runs table
    if (discoverRunId) {
      await db
        .from("discover_runs")
        .update({
          status: "completed",
          topics: result.topics || [],
          topic_count: result.topics?.length || 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", discoverRunId);
      console.log("Updated discover_run:", discoverRunId);
    }

    // If autoMake is enabled, handle queue + batch trigger server-side
    let batchTriggered = false;
    if (autoMake && result.topics?.length > 0) {
      console.log("Auto-make enabled: inserting", result.topics.length, "topics into nightly_builder_queue");
      const insertRows = result.topics.map((t: { topic: string; category_id?: string; priority?: string }) => ({
        topic: t.topic,
        category_id: t.category_id || null,
        priority: t.priority === "high" ? 1 : t.priority === "medium" ? 2 : 3,
        status: "pending",
        run_date: null, // Must be null — generateOneFromManualQueue filters by run_date IS NULL
        batch_number: null, // Must be null — DB default is 1 which would route to nightly flow
      }));

      const { error: queueError } = await db.from("nightly_builder_queue").insert(insertRows);
      if (queueError) {
        console.error("Failed to insert queue items:", queueError);
      } else {
        console.log("Queue items inserted, triggering ai-nightly-builder...");
        batchTriggered = true;

        // Fire-and-forget: trigger batch generation server-side
        const batchUrl = `${SUPABASE_URL}/functions/v1/ai-nightly-builder`;
        EdgeRuntime.waitUntil(
          fetch(batchUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ action: "start_manual_batch", autoPublish }),
          })
            .then((resp) => {
              console.log("Batch trigger response:", resp.status);
            })
            .catch((err) => {
              console.error("Failed to trigger batch:", err);
            }),
        );
      }
    }

    // Log the discovery
    await db.from("agent_logs").insert({
      action: `Discovered ${result.topics?.length || 0} topics (Gemini + Google Search)${batchTriggered ? " + batch triggered" : ""}`,
      status: "completed",
      details: {
        topics: result.topics,
        mode: "auto_discover",
        autoMake,
        autoPublish,
        batchTriggered,
        models: { research: MODEL_RESEARCH, parse: MODEL_PARSE },
      },
    });

    return new Response(JSON.stringify({ ...result, batchTriggered }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auto-discover error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = (error as { status?: number })?.status || 500;

    // Mark discover run as failed in DB
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const body = await req
        .clone()
        .json()
        .catch(() => ({}));
      if (body.discoverRunId) {
        const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await db
          .from("discover_runs")
          .update({
            status: "failed",
            error_message: message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", body.discoverRunId);
      }
    } catch (_) {
      /* best effort */
    }

    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
