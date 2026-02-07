import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_FLASH = "gemini-2.5-flash";
const MODEL_PRO = "gemini-2.5-pro";

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callGemini(apiKey: string, model: string, contents: unknown[], tools?: unknown[], systemInstruction?: string) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = { contents };
  if (tools && tools.length > 0) body.tools = tools;
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  body.generationConfig = { temperature: 0.7 };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Gemini API ${model}: ${resp.status} - ${txt.substring(0, 200)}`);
  }
  return resp.json();
}

function extractText(response: Record<string, unknown>): string {
  const candidates = response.candidates as { content: { parts: { text?: string }[] } }[];
  if (!candidates?.[0]?.content?.parts) return "";
  return candidates[0].content.parts.map(p => p.text || "").join("");
}

function extractFunctionCall(response: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = response.candidates as { content: { parts: { functionCall?: { args: Record<string, unknown> } }[] } }[];
  if (!candidates?.[0]?.content?.parts) return null;
  for (const part of candidates[0].content.parts) {
    if (part.functionCall) return part.functionCall.args;
  }
  return null;
}

function extractGroundingSources(response: Record<string, unknown>): { title: string; url: string }[] {
  const candidates = response.candidates as Record<string, unknown>[];
  if (!candidates?.[0]) return [];
  const metadata = candidates[0].groundingMetadata as Record<string, unknown> | undefined;
  if (!metadata) return [];
  const chunks = metadata.groundingChunks as { web?: { uri: string; title: string } }[] | undefined;
  if (!chunks) return [];
  const seen = new Set<string>();
  return chunks
    .filter(c => c.web?.uri && !seen.has(c.web.uri) && seen.add(c.web.uri))
    .map(c => ({ title: c.web!.title || "", url: c.web!.uri }));
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
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check automation settings
    const { data: settings } = await db
      .from("auto_generation_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!settings || !settings.enabled) {
      console.log("Scheduled runner: Automation is disabled");
      return new Response(JSON.stringify({ status: "disabled", message: "Automation is not enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const articlesPerRun = settings.articles_per_run || 3;
    const targetCategories = (settings.target_categories as string[]) || [];

    console.log(`Scheduled runner: Starting autonomous run. Articles: ${articlesPerRun}`);

    // Update last_run_at
    await db.from("auto_generation_settings").update({
      last_run_at: new Date().toISOString(),
    }).eq("id", settings.id);

    // Log start
    await db.from("agent_logs").insert({
      action: `Scheduled run started: ${articlesPerRun} articles`,
      status: "started",
      details: { articles_per_run: articlesPerRun, target_categories: targetCategories },
    });

    // Fetch categories and existing articles
    const [categoriesRes, articlesRes] = await Promise.all([
      db.from("categories").select("id, name, slug, description").order("sort_order"),
      db.from("articles").select("title").order("created_at", { ascending: false }).limit(200),
    ]);

    const categories = categoriesRes.data || [];
    const existingTitles = (articlesRes.data || []).map(a => a.title);

    // Step 1: Discover topics with Google Search Grounding
    const categoryList = categories.map(c => `${c.name} (ID: ${c.id}): ${c.description || "General"}`).join("\n");
    const existingList = existingTitles.map(t => `- ${t}`).join("\n");
    const catFilter = targetCategories.length > 0
      ? `Focus on: ${targetCategories.map(id => categories.find(c => c.id === id)?.name || id).join(", ")}`
      : "Cover a variety of categories";

    const discoverResp = await callGemini(GEMINI_API_KEY, MODEL_FLASH, [
      { role: "user", parts: [{ text: `Discover ${articlesPerRun} trending tech help topics. Search the web for what people need help with right now.` }] }
    ], [
      { googleSearch: {} },
      {
        functionDeclarations: [{
          name: "discover_topics",
          description: "Return topic suggestions",
          parameters: {
            type: "OBJECT",
            properties: {
              topics: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    topic: { type: "STRING" },
                    category_id: { type: "STRING" },
                    priority: { type: "STRING" },
                  },
                  required: ["topic", "category_id", "priority"]
                }
              }
            },
            required: ["topics"]
          }
        }]
      }
    ], `You are a content strategist. CATEGORIES:\n${categoryList}\n\nEXISTING:\n${existingList}\n\n${catFilter}\n\nFind topics people are searching for RIGHT NOW.`);

    const discoverArgs = extractFunctionCall(discoverResp);
    const topics = (discoverArgs?.topics as { topic: string; category_id: string; priority: string }[]) || [];

    if (topics.length === 0) {
      console.log("Scheduled runner: No topics discovered");
      await db.from("agent_logs").insert({
        action: "Scheduled run: No topics discovered",
        status: "completed",
        details: { articles_generated: 0 },
      });
      return new Response(JSON.stringify({ status: "completed", articles_generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Discovered ${topics.length} topics, processing...`);

    let successCount = 0;
    let failCount = 0;

    // Process each topic through the full pipeline
    for (let i = 0; i < Math.min(topics.length, articlesPerRun); i++) {
      const t = topics[i];
      console.log(`\n--- Processing topic ${i + 1}/${topics.length}: "${t.topic}" ---`);

      try {
        // Create run record
        const { data: run } = await db.from("agent_runs").insert({
          topic: t.topic,
          mode: "scheduled",
          status: "checking",
          current_step: 1,
          total_steps: 6,
          model_used: `${MODEL_FLASH}/${MODEL_PRO}`,
        }).select().single();

        if (!run) throw new Error("Failed to create run record");
        const runId = run.id;

        // Duplicate check
        const dupResp = await callGemini(GEMINI_API_KEY, MODEL_FLASH, [
          { role: "user", parts: [{ text: `Is "${t.topic}" too similar to any of these?\n${existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nRespond with the check_duplicate function.` }] }
        ], [{
          functionDeclarations: [{
            name: "check_duplicate",
            parameters: {
              type: "OBJECT",
              properties: {
                is_duplicate: { type: "BOOLEAN" },
                similarity_score: { type: "NUMBER" },
              },
              required: ["is_duplicate", "similarity_score"]
            }
          }]
        }], "Check if the topic is a duplicate of existing content.");

        const dupArgs = extractFunctionCall(dupResp);
        if (dupArgs?.is_duplicate && (dupArgs.similarity_score as number) >= 80) {
          console.log(`Skipping duplicate topic: "${t.topic}"`);
          await db.from("agent_runs").update({ status: "skipped", error_message: "Duplicate topic", completed_at: new Date().toISOString() }).eq("id", runId);
          continue;
        }

        await delay(3000);

        // Research with grounding
        await db.from("agent_runs").update({ status: "researching", current_step: 2 }).eq("id", runId);
        const researchResp = await callGemini(GEMINI_API_KEY, MODEL_FLASH, [
          { role: "user", parts: [{ text: `Research thoroughly: "${t.topic}"` }] }
        ], [{ googleSearch: {} }], "You are a research analyst. Provide comprehensive research notes of 500-800 words.");

        const research = extractText(researchResp);
        const sources = extractGroundingSources(researchResp);
        await db.from("agent_runs").update({ research_notes: research, research_sources: sources }).eq("id", runId);

        await delay(3000);

        // Outline
        await db.from("agent_runs").update({ status: "outlining", current_step: 3 }).eq("id", runId);
        const outlineResp = await callGemini(GEMINI_API_KEY, MODEL_FLASH, [
          { role: "user", parts: [{ text: `Create an article outline for: "${t.topic}"\n\nResearch:\n${research}` }] }
        ], undefined, "Create a structured article outline.");
        const outline = extractText(outlineResp);
        await db.from("agent_runs").update({ generated_outline: outline }).eq("id", runId);

        await delay(3000);

        // Write (Pro model)
        await db.from("agent_runs").update({ status: "writing", current_step: 4 }).eq("id", runId);
        const catList = categories.map(c => `${c.name} (ID: ${c.id})`).join(", ");
        const writeResp = await callGemini(GEMINI_API_KEY, MODEL_PRO, [
          { role: "user", parts: [{ text: `Write a complete beginner-friendly help article about: "${t.topic}"` }] }
        ], [{
          functionDeclarations: [{
            name: "generate_article",
            parameters: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" }, slug: { type: "STRING" }, excerpt: { type: "STRING" },
                content: { type: "STRING" }, category_id: { type: "STRING" },
                tags: { type: "ARRAY", items: { type: "STRING" } },
                read_time: { type: "NUMBER" }, seo_title: { type: "STRING" }, seo_description: { type: "STRING" }
              },
              required: ["title", "slug", "excerpt", "content", "category_id", "tags", "read_time", "seo_title", "seo_description"]
            }
          }]
        }], `Tech writer for DigitalHelp. CATEGORIES: ${catList}\n\nRESEARCH:\n${research}\n\nOUTLINE:\n${outline}\n\nWrite for beginners. 800-1500 words.`);

        const article = extractFunctionCall(writeResp);
        if (!article) throw new Error("No article generated");

        await delay(3000);

        // Fact check - Step 5a: Search web to verify (Google Search only)
        await db.from("agent_runs").update({ status: "verifying", current_step: 5 }).eq("id", runId);
        const factSearchResp = await callGemini(GEMINI_API_KEY, MODEL_FLASH, [
          { role: "user", parts: [{ text: `Verify the key factual claims in this article by searching the web:\nTitle: ${article.title}\nContent: ${(article.content as string).substring(0, 4000)}\n\nList each claim and whether it's verified or not.` }] }
        ], [
          { googleSearch: {} }
        ], "Fact-check the key claims using web search.");
        const verificationText = extractText(factSearchResp);
        
        await delay(2000);
        
        // Step 5b: Parse into score (function calling only)
        const factResp = await callGemini(GEMINI_API_KEY, MODEL_FLASH, [
          { role: "user", parts: [{ text: `Based on this fact-check analysis, provide a structured score:\n\n${verificationText}` }] }
        ], [
          { functionDeclarations: [{ name: "fact_check", parameters: { type: "OBJECT", properties: { factual_score: { type: "NUMBER" } }, required: ["factual_score"] } }] }
        ], "Parse the fact-check results. Return a factual_score 0-10 using the fact_check function.");
        const factArgs = extractFunctionCall(factResp);
        const factualScore = Math.round((factArgs?.factual_score as number) || 7);
        await db.from("agent_runs").update({ factual_score: factualScore }).eq("id", runId);

        await delay(3000);

        // Quality gate
        await db.from("agent_runs").update({ status: "optimizing", current_step: 6 }).eq("id", runId);
        const qualResp = await callGemini(GEMINI_API_KEY, MODEL_FLASH, [
          { role: "user", parts: [{ text: `Review quality:\nTitle: ${article.title}\nContent: ${(article.content as string).substring(0, 4000)}` }] }
        ], [{
          functionDeclarations: [{
            name: "quality_review",
            parameters: {
              type: "OBJECT",
              properties: {
                quality_score: { type: "NUMBER" },
                improved_seo_title: { type: "STRING" },
                improved_seo_description: { type: "STRING" }
              },
              required: ["quality_score"]
            }
          }]
        }], "Rate quality 0-10 and improve SEO.");
        const qualArgs = extractFunctionCall(qualResp);
        const qualityScore = Math.round((qualArgs?.quality_score as number) || 7);
        const articleStatus = qualityScore < 7 ? "needs_review" : "draft";

        if (qualArgs?.improved_seo_title) article.seo_title = qualArgs.improved_seo_title;
        if (qualArgs?.improved_seo_description) article.seo_description = qualArgs.improved_seo_description;

        // Save article
        let slug = article.slug as string;
        const payload = {
          title: article.title, slug, excerpt: article.excerpt, content: article.content,
          category_id: t.category_id || article.category_id,
          status: articleStatus, featured: false, read_time: (article.read_time as number) || 3,
          tags: article.tags || [], seo_title: article.seo_title, seo_description: article.seo_description,
          ai_generated: true, sources,
        };

        let { data: saved, error: saveErr } = await db.from("articles").insert(payload).select().single();
        if (saveErr?.message?.includes("unique")) {
          slug = `${slug}-${Date.now()}`;
          const retry = await db.from("articles").insert({ ...payload, slug }).select().single();
          if (retry.error) throw retry.error;
          saved = retry.data;
        } else if (saveErr) throw saveErr;

        // Complete run
        await db.from("agent_runs").update({
          status: "completed", current_step: 6, article_id: saved!.id,
          completed_at: new Date().toISOString(),
          token_usage: { quality_score: qualityScore, factual_score: factualScore, sources_count: sources.length },
        }).eq("id", runId);

        existingTitles.push(article.title as string);
        successCount++;
        console.log(`✓ Article "${article.title}" saved as ${articleStatus}`);

      } catch (topicErr) {
        console.error(`✗ Failed topic "${t.topic}":`, topicErr);
        failCount++;
      }

      // Delay between articles
      if (i < topics.length - 1) await delay(5000);
    }

    // Calculate next run
    const freq = settings.frequency || "daily";
    const freqHours: Record<string, number> = {
      "every_6_hours": 6, "every_12_hours": 12, "daily": 24,
      "every_2_days": 48, "weekly": 168,
    };
    const nextRunHours = freqHours[freq] || 24;
    const nextRunAt = new Date(Date.now() + nextRunHours * 60 * 60 * 1000).toISOString();

    await db.from("auto_generation_settings").update({ next_run_at: nextRunAt }).eq("id", settings.id);

    await db.from("agent_logs").insert({
      action: `Scheduled run completed: ${successCount} success, ${failCount} failed`,
      status: "completed",
      details: { success: successCount, failed: failCount, total_topics: topics.length },
    });

    console.log(`\nScheduled run complete: ${successCount} success, ${failCount} failed. Next run: ${nextRunAt}`);

    return new Response(JSON.stringify({
      status: "completed",
      articles_generated: successCount,
      articles_failed: failCount,
      next_run_at: nextRunAt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Scheduled runner error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
