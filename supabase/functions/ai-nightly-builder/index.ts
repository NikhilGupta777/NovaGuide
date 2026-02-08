import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ── Optimal Model Strategy (upgraded) ─────────────────────────────
// Deep Research: topic discovery via Interactions API (best research quality)
const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";
// Gemini 2.5 Flash Lite: cheapest for parsing/dedup (4K RPM, Unlimited RPD)
const MODEL_LITE = "gemini-2.5-flash-lite";
// Gemini 2.5 Flash: category creation, fallback research (1K RPM, 10K RPD)
const MODEL_FLASH = "gemini-2.5-flash";
// Gemini 3 Flash: scoring tasks (1K RPM, 10K RPD)
const MODEL_SCORING = "gemini-3-flash-preview";

// Safe icons that exist in the frontend iconMap
const SAFE_ICONS = [
  "Smartphone", "Tablet", "Monitor", "AppWindow", "Youtube", "Share2",
  "KeyRound", "FileText", "Lightbulb", "Wifi", "Shield", "Mail",
  "Camera", "Headphones", "Gamepad2", "Globe", "Tv", "Printer", "Cloud"
];

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// ── Helper: Get IST date string (UTC+5:30) ───────────────────────
function getISTDateString(): string {
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffsetMs);
  return istDate.toISOString().split("T")[0];
}

// ── Self-Chaining: fire-and-forget call to ourselves ─────────────
function selfInvoke(body: Record<string, unknown>) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-nightly-builder`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body),
  })
    .then(r => r.text())
    .catch(err => console.error("Self-invoke failed:", err));
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

function calculateNextRunAt(): string {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const cronTimesUTC = [
    { h: 6, m: 30 },
    { h: 12, m: 30 },
    { h: 18, m: 30 },
  ];
  for (const t of cronTimesUTC) {
    if (utcH < t.h || (utcH === t.h && utcM < t.m)) {
      const next = new Date(now);
      next.setUTCHours(t.h, t.m, 0, 0);
      return next.toISOString();
    }
  }
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(6, 30, 0, 0);
  return next.toISOString();
}

// ── Deep Research via Interactions API ────────────────────────────
// Uses deep-research-pro-preview agent for superior web research
// 1 RPM limit — we space calls 65s apart between categories

async function deepResearchCategory(
  apiKey: string,
  categoryName: string,
  categoryDescription: string,
  existingTitles: string[],
  topicsCount: number,
  retryCount = 0
): Promise<string[]> {
  console.log(`[Deep Research] Starting for category: ${categoryName}`);

  const existingList = existingTitles.length > 0
    ? `\n\nEXISTING ARTICLES (do NOT suggest duplicates):\n${existingTitles.slice(0, 100).map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  const researchPrompt = `Research the most commonly searched questions, problems, and how-to topics that people search for online related to "${categoryName}" (${categoryDescription || "tech help"}) in the tech/digital help space.

Focus on:
- Questions real people ask on Google, Reddit, Quora, forums
- Common problems and troubleshooting guides  
- Step-by-step how-to guides
- Beginner-friendly topics that get high search volume
- Recent/trending topics (2024-2026)

Find at least ${topicsCount} unique, specific, searchable topics. Each should be a clear question or how-to title like "How to reset iPhone password" or "Fix slow WiFi connection on Windows 11".${existingList}

Return a comprehensive numbered list of ${topicsCount} topics.`;

  try {
    // Step 1: Start Deep Research interaction (background mode)
    const startUrl = `${GEMINI_BASE}/interactions?key=${apiKey}`;
    const startResp = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: researchPrompt,
        agent: DEEP_RESEARCH_AGENT,
        background: true,
      }),
    });

    if (!startResp.ok) {
      const errText = await startResp.text();
      console.error(`[Deep Research] Start failed for ${categoryName}:`, startResp.status, errText);
      if (startResp.status === 429 && retryCount < 2) {
        console.log(`[Deep Research] Rate limited (attempt ${retryCount + 1}/2), waiting 65s...`);
        await delay(65000);
        return deepResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount, retryCount + 1);
      }
      // Fallback to Flash + Google Search grounding
      console.log(`[Deep Research] Falling back to Flash + Search grounding for ${categoryName}`);
      return fallbackResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount);
    }

    const startData = await startResp.json();
    const interactionId = startData.name || startData.id;

    if (!interactionId) {
      console.error("[Deep Research] No interaction ID returned, falling back");
      return fallbackResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount);
    }

    console.log(`[Deep Research] Started interaction ${interactionId} for ${categoryName}`);

    // Step 2: Poll for results (max 10 minutes per category)
    const maxPollTime = 10 * 60 * 1000; // 10 minutes
    const pollInterval = 15000; // 15 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollTime) {
      await delay(pollInterval);

      const pollUrl = `${GEMINI_BASE}/interactions/${interactionId}?key=${apiKey}`;
      const pollResp = await fetch(pollUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!pollResp.ok) {
        const errText = await pollResp.text();
        console.error(`[Deep Research] Poll error for ${categoryName}:`, pollResp.status, errText);
        // Don't fail immediately — might be transient
        continue;
      }

      const pollData = await pollResp.json();
      const status = pollData.status;

      console.log(`[Deep Research] ${categoryName}: status=${status} (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);

      if (status === "completed" || status === "COMPLETED") {
        // Extract the research report text
        let reportText = "";
        if (pollData.output?.content?.parts) {
          reportText = pollData.output.content.parts
            .map((p: { text?: string }) => p.text || "")
            .join("");
        } else if (pollData.output?.text) {
          reportText = pollData.output.text;
        } else if (typeof pollData.output === "string") {
          reportText = pollData.output;
        }

        if (!reportText || reportText.length < 100) {
          console.error(`[Deep Research] Empty report for ${categoryName}, falling back`);
          return fallbackResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount);
        }

        console.log(`[Deep Research] Got report for ${categoryName}: ${reportText.length} chars`);
        // Parse the report into individual topics using Flash Lite
        return parseResearchReport(apiKey, reportText, topicsCount, categoryName);
      }

      if (status === "failed" || status === "FAILED") {
        const errMsg = pollData.error?.message || pollData.error || "Unknown error";
        console.error(`[Deep Research] Failed for ${categoryName}: ${errMsg}`);
        return fallbackResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount);
      }
    }

    // Timed out
    console.error(`[Deep Research] Timed out for ${categoryName} after ${maxPollTime / 1000}s, falling back`);
    return fallbackResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount);

  } catch (err) {
    console.error(`[Deep Research] Error for ${categoryName}:`, err);
    if (retryCount < 1) {
      await delay(10000);
      return deepResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount, retryCount + 1);
    }
    return fallbackResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount);
  }
}

// ── Parse Deep Research report into topics (Flash Lite) ──────────

async function parseResearchReport(
  apiKey: string,
  report: string,
  topicsCount: number,
  categoryName: string,
): Promise<string[]> {
  console.log(`[Parse] Extracting topics from Deep Research report for ${categoryName}`);

  const parsePrompt = `Extract exactly ${topicsCount} specific, searchable tech help topics from this research report. Each topic should be a clear question or how-to title.

RESEARCH REPORT:
${report.substring(0, 30000)}

Return ONLY a valid JSON array of strings. Each string should be a specific, actionable question or how-to title.
Example: ["How to reset iPhone password", "Fix slow WiFi connection on Windows 11"]`;

  const url = `${GEMINI_BASE}/models/${MODEL_LITE}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: parsePrompt }] }],
      generationConfig: { temperature: 0.3 },
      systemInstruction: { parts: [{ text: "Extract topics from research and return as a JSON array of strings. No markdown, no explanation." }] },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`[Parse] Error:`, resp.status, txt);
    return [];
  }

  const data = await resp.json();
  const candidates = data.candidates || [];
  if (!candidates[0]?.content?.parts) return [];
  const responseText = candidates[0].content.parts.map((p: { text?: string }) => p.text || "").join("");

  let topics: string[] = [];
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      topics = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("[Parse] JSON parse error:", e);
  }

  topics = topics.filter(t => typeof t === "string" && t.trim().length > 10);
  console.log(`[Parse] ${categoryName}: extracted ${topics.length} topics`);
  return topics;
}

// ── Fallback: Flash + Google Search Grounding ────────────────────
// Used when Deep Research fails, times out, or hits rate limits

async function fallbackResearchCategory(
  apiKey: string,
  categoryName: string,
  categoryDescription: string,
  existingTitles: string[],
  topicsCount: number,
  retryCount = 0
): Promise<string[]> {
  console.log(`[Fallback Research] Using Flash + Search for ${categoryName}`);

  const prompt = `You are researching for a tech help website called DigitalHelp.

CATEGORY: ${categoryName}
DESCRIPTION: ${categoryDescription || "General tech help articles"}

EXISTING ARTICLES (do NOT suggest these again):
${existingTitles.length > 0 ? existingTitles.slice(0, 100).map((t, i) => `${i + 1}. ${t}`).join("\n") : "None yet"}

Find the top ${topicsCount} most commonly searched questions, problems, and how-to topics related to "${categoryName}" in the tech/digital help space.

Focus on:
- Questions real people ask on Google, Reddit, Quora, forums
- Common problems and troubleshooting guides
- Step-by-step how-to guides
- Beginner-friendly topics with high search volume
- Recent/trending topics (2024-2026)

Return ONLY a valid JSON array of strings with ${topicsCount} unique topics.
Example: ["How to reset iPhone password", "Fix slow WiFi connection on Windows 11"]`;

  const url = `${GEMINI_BASE}/models/${MODEL_FLASH}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    systemInstruction: {
      parts: [{ text: "You are a research assistant. Use web search to find real, commonly-asked questions. Return ONLY a JSON array of strings." }]
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`[Fallback] Error for ${categoryName}:`, resp.status, txt);
    if (resp.status === 429 && retryCount < 3) {
      console.log(`[Fallback] Rate limited (attempt ${retryCount + 1}/3), waiting 30s...`);
      await delay(30000);
      return fallbackResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount, retryCount + 1);
    }
    throw new Error(`Research failed (${resp.status}): ${txt}`);
  }

  const data = await resp.json();
  const candidates = data.candidates || [];
  if (!candidates[0]?.content?.parts) return [];

  const responseText = candidates[0].content.parts.map((p: { text?: string }) => p.text || "").join("");

  let topics: string[] = [];
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      topics = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("[Fallback] Parse error:", e);
    // Second chance: use Lite to extract
    try {
      const parsed = await callGeminiModel(apiKey, MODEL_LITE,
        `Extract all questions/topics from this text as a JSON array of strings:\n\n${responseText.substring(0, 12000)}`,
        "Return ONLY a JSON array of strings.");
      const fallbackMatch = parsed.match(/\[[\s\S]*\]/);
      if (fallbackMatch) topics = JSON.parse(fallbackMatch[0]);
    } catch {
      console.error("[Fallback] Second-chance parsing also failed");
    }
  }

  topics = topics.filter(t => typeof t === "string" && t.trim().length > 10);
  console.log(`[Fallback] ${categoryName}: found ${topics.length} topics`);
  return topics;
}

// ── Generic Gemini model call ────────────────────────────────────

async function callGeminiModel(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string,
  retryCount = 0
): Promise<string> {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3 },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`Gemini ${model} error:`, resp.status, txt);
    if (resp.status === 429 && retryCount < 3) {
      console.log(`Rate limited (attempt ${retryCount + 1}/3), waiting 30s...`);
      await delay(30000);
      return callGeminiModel(apiKey, model, prompt, systemInstruction, retryCount + 1);
    }
    throw new Error(`Gemini ${model} error (${resp.status}): ${txt}`);
  }

  const data = await resp.json();
  const candidates = data.candidates || [];
  if (!candidates[0]?.content?.parts) return "";
  return candidates[0].content.parts.map((p: { text?: string }) => p.text || "").join("");
}

// ── Ensure settings row exists ────────────────────────────────────

async function ensureSettings(db: ReturnType<typeof serviceClient>) {
  const { data: existing } = await db.from("nightly_builder_settings").select("*").limit(1);
  if (existing && existing.length > 0) return existing[0];

  const { data: created } = await db.from("nightly_builder_settings").insert({
    enabled: false,
    topics_per_category: 50,
    auto_publish_min_quality: 7,
    auto_publish_min_factual: 7,
    allow_category_creation: true,
    stop_requested: false,
  }).select().single();

  return created;
}

// ── Main Orchestrator ─────────────────────────────────────────────

async function runNightlyBuilder(batch: number) {
  const db = serviceClient();
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const settings = await ensureSettings(db);
  if (!settings) throw new Error("Failed to get/create nightly builder settings");

  if (settings.stop_requested) {
    console.log("Stop was requested. Resetting flag and skipping.");
    await db.from("nightly_builder_settings").update({ stop_requested: false }).eq("id", settings.id);
    return;
  }

  const { data: runData } = await db.from("nightly_builder_runs").insert({
    status: batch === 1 ? "researching" : "generating",
    batch_number: batch,
    started_at: new Date().toISOString(),
  }).select().single();

  const runId = runData?.id;
  if (!runId) throw new Error("Failed to create run record");

  await db.from("nightly_builder_settings").update({
    last_run_at: new Date().toISOString(),
  }).eq("id", settings.id);

  try {
    if (batch === 1) {
      await runBatch1(db, apiKey, settings, runId);
    } else {
      await runOverflowBatch(db, apiKey, settings, runId, batch);
    }
  } catch (err) {
    console.error("Nightly builder error:", err);
    await db.from("nightly_builder_runs").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
  }
}

// ── Batch 1: Full Research + Generation ───────────────────────────

async function runBatch1(
  db: ReturnType<typeof serviceClient>,
  apiKey: string,
  settings: Record<string, unknown>,
  runId: string
) {
  const settingsId = settings.id as string;
  const topicsPerCategory = (settings.topics_per_category as number) || 50;
  const allowCategoryCreation = settings.allow_category_creation as boolean;

  // Phase A: Load all knowledge
  console.log("Phase A: Loading all categories and articles...");
  const { data: categories } = await db.from("categories").select("id, name, slug, description, icon");
  const { data: articles } = await db.from("articles").select("id, title, slug, category_id, status");

  if (!categories || categories.length === 0) {
    throw new Error("No categories found in database");
  }

  console.log(`Loaded ${categories.length} categories and ${articles?.length || 0} articles`);

  const allTopics: { topic: string; category_id: string; priority: number }[] = [];
  let totalTopicsFound = 0;
  let categoriesProcessed = 0;
  let categoriesCreated = 0;
  const detailsMap: Record<string, unknown> = {};

  // Phase B: Research per category using Deep Research (Interactions API)
  // Deep Research has 1 RPM limit, so we space calls 65s apart
  console.log("Phase B: Starting Deep Research for each category (1 RPM, ~65s between calls)...");
  for (const category of categories) {
    // Check stop
    const { data: freshSettings } = await db.from("nightly_builder_settings").select("stop_requested").eq("id", settingsId).single();
    if (freshSettings?.stop_requested) {
      console.log("Stop requested during research phase. Stopping.");
      await db.from("nightly_builder_runs").update({
        status: "stopped",
        total_categories_processed: categoriesProcessed,
        total_topics_found: totalTopicsFound,
        details: detailsMap,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
      await db.from("nightly_builder_settings").update({ stop_requested: false }).eq("id", settingsId);
      return;
    }

    const categoryArticles = articles?.filter(a => a.category_id === category.id) || [];
    const existingTitles = categoryArticles.map(a => a.title);

    try {
      const topics = await deepResearchCategory(
        apiKey,
        category.name,
        category.description || "",
        existingTitles,
        topicsPerCategory
      );

      totalTopicsFound += topics.length;
      for (let i = 0; i < topics.length; i++) {
        allTopics.push({
          topic: topics[i],
          category_id: category.id,
          priority: i,
        });
      }

      detailsMap[category.name] = {
        topics_found: topics.length,
        existing_articles: existingTitles.length,
      };
      categoriesProcessed++;

      // Deep Research: 1 RPM limit — wait 65s between categories
      // (the polling inside deepResearchCategory already takes time,
      // but we add a buffer to respect the RPM limit for starting new interactions)
      console.log(`Waiting 65s before next Deep Research call (RPM limit)...`);
      await delay(65000);
    } catch (err) {
      console.error(`Error researching category "${category.name}":`, err);
      detailsMap[category.name] = {
        error: err instanceof Error ? err.message : String(err),
      };
      categoriesProcessed++;
    }
  }

  // Phase C: Deduplication against all existing titles
  const { data: stopCheckC } = await db.from("nightly_builder_settings").select("stop_requested").eq("id", settingsId).single();
  if (stopCheckC?.stop_requested) {
    console.log("Stop requested before dedup phase. Stopping.");
    await db.from("nightly_builder_runs").update({ status: "stopped", total_categories_processed: categoriesProcessed, total_topics_found: totalTopicsFound, details: detailsMap, completed_at: new Date().toISOString() }).eq("id", runId);
    await db.from("nightly_builder_settings").update({ stop_requested: false }).eq("id", settingsId);
    return;
  }
  console.log("Phase C: Deduplicating topics...");
  const allExistingTitles = articles?.map(a => a.title.toLowerCase()) || [];
  let dedupedTopics = allTopics.filter(t => {
    const topicLower = t.topic.toLowerCase();
    return !allExistingTitles.some(existing =>
      existing === topicLower ||
      existing.includes(topicLower) ||
      topicLower.includes(existing)
    );
  });

  // AI-powered fuzzy dedup using Flash Lite (4K RPM, unlimited RPD — perfect for this)
  if (dedupedTopics.length > 10 && allExistingTitles.length > 0) {
    try {
      const dedupBatches = [];
      const BATCH_SIZE = 50;
      for (let i = 0; i < dedupedTopics.length; i += BATCH_SIZE) {
        dedupBatches.push(dedupedTopics.slice(i, i + BATCH_SIZE));
      }

      const finalDeduped: typeof dedupedTopics = [];
      for (const batchItems of dedupBatches) {
        const dedupPrompt = `Compare these proposed topics against existing article titles. Remove any proposed topic that would cover essentially the same content as an existing article (even if worded differently).

EXISTING ARTICLES:
${allExistingTitles.slice(0, 200).join("\n")}

PROPOSED TOPICS:
${batchItems.map((t, i) => `${i}. ${t.topic}`).join("\n")}

Return ONLY a JSON array of the INDEX NUMBERS (0-based) of topics that are UNIQUE and should be KEPT. Example: [0, 2, 5, 7]`;

        const dedupResult = await callGeminiModel(apiKey, MODEL_LITE, dedupPrompt,
          "Return ONLY a JSON array of integers. No explanation.");

        try {
          const jsonMatch = dedupResult.match(/\[[\s\S]*?\]/);
          if (jsonMatch) {
            const keepIndices: number[] = JSON.parse(jsonMatch[0]);
            for (const idx of keepIndices) {
              if (idx >= 0 && idx < batchItems.length) {
                finalDeduped.push(batchItems[idx]);
              }
            }
          } else {
            finalDeduped.push(...batchItems);
          }
        } catch {
          finalDeduped.push(...batchItems);
        }

        await delay(2000);
      }
      dedupedTopics = finalDeduped;
    } catch (err) {
      console.error("AI dedup error (keeping basic dedup):", err);
    }
  }

  console.log(`After dedup: ${dedupedTopics.length} unique topics (was ${allTopics.length})`);

  // Phase D: Smart Category Creation
  const { data: stopCheckD } = await db.from("nightly_builder_settings").select("stop_requested").eq("id", settingsId).single();
  if (stopCheckD?.stop_requested) {
    console.log("Stop requested before category creation phase. Stopping.");
    await db.from("nightly_builder_runs").update({ status: "stopped", total_categories_processed: categoriesProcessed, total_topics_found: totalTopicsFound, total_after_dedup: dedupedTopics.length, details: detailsMap, completed_at: new Date().toISOString() }).eq("id", runId);
    await db.from("nightly_builder_settings").update({ stop_requested: false }).eq("id", settingsId);
    return;
  }
  if (allowCategoryCreation && categories.length > 0) {
    console.log("Phase D: Checking for missing categories (using Flash)...");
    try {
      const categoryNames = categories.map(c => c.name).join(", ");
      const catPrompt = `You are analyzing a tech help website called DigitalHelp.

EXISTING CATEGORIES: ${categoryNames}

What major tech help categories are MISSING from this website? Think about what people commonly search for help with in technology that isn't covered.

Consider areas like: Smart Home, Privacy & VPN, Email, Cloud Storage, Gaming, Wearables, Networking, Printing, Streaming, etc.

Only suggest categories that would have substantial content (at least 20+ common questions). Don't suggest categories that overlap significantly with existing ones.

Return a JSON array of objects with "name", "description", and "icon" fields.
For "icon", choose from: ${SAFE_ICONS.join(", ")}. Default to "Lightbulb" if unsure.
Suggest 0-5 categories max.

Return ONLY a valid JSON array.`;

      const catResult = await callGeminiModel(apiKey, MODEL_FLASH, catPrompt,
        "Return ONLY a valid JSON array of category objects. No markdown.");

      try {
        const jsonMatch = catResult.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const newCats: { name: string; description: string; icon: string }[] = JSON.parse(jsonMatch[0]);

          for (const newCat of newCats.slice(0, 5)) {
            const icon = SAFE_ICONS.includes(newCat.icon) ? newCat.icon : "Lightbulb";
            const slug = newCat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            const existing = categories.find(c =>
              c.name.toLowerCase() === newCat.name.toLowerCase() ||
              c.slug === slug
            );
            if (existing) continue;

            const { data: insertedCat } = await db.from("categories").insert({
              name: newCat.name,
              slug,
              description: newCat.description,
              icon,
              sort_order: categories.length + categoriesCreated,
            }).select().single();

            if (insertedCat) {
              console.log(`Created new category: ${newCat.name}`);
              categoriesCreated++;

              // Research topics for new category via Deep Research
              try {
                console.log(`Waiting 65s for RPM limit before researching new category...`);
                await delay(65000);
                const newTopics = await deepResearchCategory(
                  apiKey,
                  newCat.name,
                  newCat.description,
                  [],
                  topicsPerCategory
                );

                for (let i = 0; i < newTopics.length; i++) {
                  dedupedTopics.push({
                    topic: newTopics[i],
                    category_id: insertedCat.id,
                    priority: i,
                  });
                }
                totalTopicsFound += newTopics.length;
                detailsMap[newCat.name] = { topics_found: newTopics.length, new_category: true };
              } catch (err) {
                console.error(`Error researching new category "${newCat.name}":`, err);
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to parse new categories:", e);
      }
    } catch (err) {
      console.error("Category creation error:", err);
    }
  }

  // Phase E: Queue Splitting
  const { data: stopCheckE } = await db.from("nightly_builder_settings").select("stop_requested").eq("id", settingsId).single();
  if (stopCheckE?.stop_requested) {
    console.log("Stop requested before queue splitting phase. Stopping.");
    await db.from("nightly_builder_runs").update({ status: "stopped", total_categories_processed: categoriesProcessed, total_topics_found: totalTopicsFound, total_after_dedup: dedupedTopics.length, details: detailsMap, completed_at: new Date().toISOString() }).eq("id", runId);
    await db.from("nightly_builder_settings").update({ stop_requested: false }).eq("id", settingsId);
    return;
  }
  console.log("Phase E: Splitting topics into batches...");
  const BATCH1_PER_CAT = 30;
  const BATCH2_PER_CAT = 50;

  const topicsByCategory: Record<string, typeof dedupedTopics> = {};
  for (const t of dedupedTopics) {
    if (!topicsByCategory[t.category_id]) topicsByCategory[t.category_id] = [];
    topicsByCategory[t.category_id].push(t);
  }

  const batch1Items: typeof dedupedTopics = [];
  const batch2Items: typeof dedupedTopics = [];
  const batch3Items: typeof dedupedTopics = [];

  for (const [_catId, topics] of Object.entries(topicsByCategory)) {
    topics.forEach((t, i) => {
      if (i < BATCH1_PER_CAT) batch1Items.push(t);
      else if (i < BATCH1_PER_CAT + BATCH2_PER_CAT) batch2Items.push(t);
      else batch3Items.push(t);
    });
  }

  // Insert all into queue — use IST date so overflow batches can find them
  const today = getISTDateString();
  const queueInserts = [
    ...batch1Items.map(t => ({ run_date: today, batch_number: 1, topic: t.topic, category_id: t.category_id, priority: t.priority, status: "pending" })),
    ...batch2Items.map(t => ({ run_date: today, batch_number: 2, topic: t.topic, category_id: t.category_id, priority: t.priority, status: "pending" })),
    ...batch3Items.map(t => ({ run_date: today, batch_number: 3, topic: t.topic, category_id: t.category_id, priority: t.priority, status: "pending" })),
  ];

  if (queueInserts.length > 0) {
    for (let i = 0; i < queueInserts.length; i += 100) {
      await db.from("nightly_builder_queue").insert(queueInserts.slice(i, i + 100));
    }
  }

  console.log(`Queue: Batch 1: ${batch1Items.length}, Batch 2: ${batch2Items.length}, Batch 3: ${batch3Items.length}`);

  // Update run with research stats
  await db.from("nightly_builder_runs").update({
    status: "generating",
    total_categories_processed: categoriesProcessed,
    categories_created: categoriesCreated,
    total_topics_found: totalTopicsFound,
    total_after_dedup: dedupedTopics.length,
    details: detailsMap,
  }).eq("id", runId);

  // Phase F: Start generating Batch 1 articles via parallel self-chaining
  const parallelism = Math.min(3, batch1Items.length, 5);
  console.log(`Phase F: Starting Batch 1 article generation (${parallelism} parallel chains)...`);
  for (let i = 0; i < parallelism; i++) {
    selfInvoke({ action: "generate_one", runId, batch: 1, runDate: today });
  }
}

// ── Overflow Batch Processing ─────────────────────────────────────

async function runOverflowBatch(
  db: ReturnType<typeof serviceClient>,
  _apiKey: string,
  settings: Record<string, unknown>,
  runId: string,
  batch: number
) {
  const today = getISTDateString();

  const { count } = await db.from("nightly_builder_queue")
    .select("*", { count: "exact", head: true })
    .eq("run_date", today)
    .eq("batch_number", batch)
    .eq("status", "pending");

  if (!count || count === 0) {
    console.log(`No pending items for batch ${batch} on ${today}. Skipping.`);
    await db.from("nightly_builder_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return;
  }

  const parallelism = Math.min(3, count, 5);
  console.log(`Processing ${count} pending items for batch ${batch} (${parallelism} parallel chains)...`);
  await db.from("nightly_builder_runs").update({ status: "generating" }).eq("id", runId);
  for (let i = 0; i < parallelism; i++) {
    selfInvoke({ action: "generate_one", runId, batch, runDate: today });
  }
}

// ── Article Generation from Queue (one at a time, self-chaining) ──

async function generateOneFromQueue(
  runId: string,
  batch: number,
  runDate: string
) {
  const db = serviceClient();
  const settings = await ensureSettings(db);
  if (!settings) throw new Error("Failed to get settings");

  const settingsId = settings.id as string;
  const minQuality = (settings.auto_publish_min_quality as number) || 7;
  const minFactual = (settings.auto_publish_min_factual as number) || 7;

  // Check stop flag
  if (settings.stop_requested) {
    console.log("Stop requested. Halting generation.");
    await db.from("nightly_builder_runs").update({
      status: "stopped",
      completed_at: new Date().toISOString(),
    }).eq("id", runId).eq("status", "generating");
    await db.from("nightly_builder_settings").update({ stop_requested: false }).eq("id", settingsId);
    return;
  }

  // Recover stale "processing" nightly items (>15 min old via updated_at)
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: staleItems } = await db.from("nightly_builder_queue")
    .select("id, topic")
    .eq("status", "processing")
    .eq("run_date", runDate)
    .eq("batch_number", batch)
    .lt("updated_at", fifteenMinAgo);

  if (staleItems && staleItems.length > 0) {
    console.log(`Recovering ${staleItems.length} stale nightly items (>15min old)...`);
    for (const si of staleItems) {
      const searchTerm = si.topic.substring(0, 40).replace(/[%_]/g, "");
      const { data: existing } = await db.from("articles")
        .select("id").ilike("title", `%${searchTerm}%`).limit(1);
      if (existing && existing.length > 0) {
        await db.from("nightly_builder_queue").update({ status: "completed", article_id: existing[0].id }).eq("id", si.id);
      } else {
        await db.from("nightly_builder_queue").update({ status: "pending" }).eq("id", si.id);
      }
    }
  }

  // Fetch ONE pending queue item
  const { data: queueItems } = await db.from("nightly_builder_queue")
    .select("*")
    .eq("run_date", runDate)
    .eq("batch_number", batch)
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .limit(1);

  if (!queueItems || queueItems.length === 0) {
    console.log("No pending queue items. Completing run.");
    await db.from("nightly_builder_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId).eq("status", "generating");

    try {
      const nextRun = calculateNextRunAt();
      await db.from("nightly_builder_settings").update({ next_run_at: nextRun }).eq("id", settingsId);
    } catch (e) {
      console.error("Failed to set next_run_at:", e);
    }

    console.log(`Batch ${batch} complete.`);
    return;
  }

  const item = queueItems[0];
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Atomically claim the item
  const { data: claimed } = await db.from("nightly_builder_queue")
    .update({ status: "processing" })
    .eq("id", item.id)
    .eq("status", "pending")
    .select();

  if (!claimed || claimed.length === 0) {
    console.log(`Item "${item.topic}" already claimed by another chain, trying next...`);
    selfInvoke({ action: "generate_one", runId, batch, runDate });
    return;
  }

  try {
    console.log(`Generating article: "${item.topic}"`);

    const agentResp = await fetch(`${supabaseUrl}/functions/v1/ai-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        topic: item.topic,
        categoryId: item.category_id,
        mode: "nightly",
      }),
    });

    if (!agentResp.ok) {
      const errText = await agentResp.text();
      throw new Error(`ai-agent returned ${agentResp.status}: ${errText}`);
    }

    const agentData = await agentResp.json();

    if (agentData.skipped) {
      console.log(`Skipped: ${agentData.reason}`);
      await db.from("nightly_builder_queue").update({
        status: "skipped",
        error_message: agentData.reason,
      }).eq("id", item.id);
    } else if (agentData.error) {
      throw new Error(agentData.error);
    } else {
      const articleId = agentData.id || agentData.articleId || agentData.article_id;

      await db.from("nightly_builder_queue").update({
        status: "completed",
        article_id: articleId || null,
      }).eq("id", item.id);

      try {
        await db.rpc("increment_nightly_counter", { _run_id: runId, _column: "articles_generated" });
      } catch (e) {
        console.error("Failed to increment articles_generated:", e);
      }

      const qualityScore = agentData._quality_score || 0;
      const factualScore = agentData._factual_score || 0;

      if (qualityScore >= minQuality && factualScore >= minFactual && articleId) {
        await db.from("articles").update({
          status: "published",
          published_at: new Date().toISOString(),
        }).eq("id", articleId);
        try {
          await db.rpc("increment_nightly_counter", { _run_id: runId, _column: "articles_published" });
        } catch (e) {
          console.error("Failed to increment articles_published:", e);
        }
        console.log(`Auto-published: "${item.topic}"`);
      }
    }
  } catch (err) {
    console.error(`Failed to generate "${item.topic}":`, err);
    await db.from("nightly_builder_queue").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
    }).eq("id", item.id);

    try {
      await db.rpc("increment_nightly_counter", { _run_id: runId, _column: "articles_failed" });
    } catch (e) {
      console.error("Failed to increment articles_failed:", e);
    }
  }

  // Self-chain: check if there are more items
  const { count: remaining } = await db.from("nightly_builder_queue")
    .select("*", { count: "exact", head: true })
    .eq("run_date", runDate)
    .eq("batch_number", batch)
    .in("status", ["pending", "processing"]);

  if (remaining && remaining > 0) {
    console.log(`Self-invoking for next article (${remaining} remaining/recoverable)...`);
    selfInvoke({ action: "generate_one", runId, batch, runDate });
  } else {
    await db.from("nightly_builder_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId).eq("status", "generating");

    try {
      const nextRun = calculateNextRunAt();
      await db.from("nightly_builder_settings").update({ next_run_at: nextRun }).eq("id", settingsId);
    } catch (e) {
      console.error("Failed to set next_run_at:", e);
    }

    console.log(`Batch ${batch} complete.`);
  }
}

// ── Recover stale "processing" items ─────────────────────────────

async function recoverStaleManualItems(db: ReturnType<typeof serviceClient>) {
  const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: staleItems } = await db.from("nightly_builder_queue")
    .select("id, topic")
    .eq("status", "processing")
    .is("run_date", null)
    .lt("updated_at", fifteenMinAgo);

  if (!staleItems || staleItems.length === 0) return 0;

  console.log(`Found ${staleItems.length} items stuck in "processing" for >15min — recovering...`);
  let recovered = 0;

  for (const item of staleItems) {
    const searchTerm = item.topic.substring(0, 40).replace(/[%_]/g, "");
    const { data: existingArticle } = await db.from("articles")
      .select("id")
      .ilike("title", `%${searchTerm}%`)
      .limit(1);

    if (existingArticle && existingArticle.length > 0) {
      await db.from("nightly_builder_queue").update({
        status: "completed",
        article_id: existingArticle[0].id,
      }).eq("id", item.id);
    } else {
      await db.from("nightly_builder_queue").update({
        status: "pending",
      }).eq("id", item.id);
    }
    recovered++;
  }

  return recovered;
}

// ── Generate from manual batch queue (no run_date) ───────────────

async function generateOneFromManualQueue(autoPublish: boolean) {
  const db = serviceClient();

  await recoverStaleManualItems(db);

  const { data: queueItems } = await db.from("nightly_builder_queue")
    .select("*")
    .eq("status", "pending")
    .is("run_date", null)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);

  if (!queueItems || queueItems.length === 0) {
    console.log("Manual batch complete — no more pending items.");
    return;
  }

  const item = queueItems[0];
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const { data: claimed } = await db.from("nightly_builder_queue")
    .update({ status: "processing" })
    .eq("id", item.id)
    .eq("status", "pending")
    .select();

  if (!claimed || claimed.length === 0) {
    console.log(`Item "${item.topic}" already claimed by another chain, trying next...`);
    selfInvoke({ action: "generate_manual_batch", autoPublish });
    return;
  }

  try {
    console.log(`Manual batch: generating "${item.topic}"`);

    const agentResp = await fetch(`${supabaseUrl}/functions/v1/ai-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        topic: item.topic,
        categoryId: item.category_id,
        mode: "batch",
      }),
    });

    if (!agentResp.ok) {
      const errText = await agentResp.text();
      throw new Error(`ai-agent returned ${agentResp.status}: ${errText}`);
    }

    const agentData = await agentResp.json();

    if (agentData.skipped) {
      await db.from("nightly_builder_queue").update({
        status: "skipped",
        error_message: agentData.reason,
      }).eq("id", item.id);
      console.log(`Skipped: "${item.topic}" — ${agentData.reason}`);
    } else if (agentData.error) {
      throw new Error(agentData.error);
    } else {
      const articleId = agentData.id || agentData.articleId || agentData.article_id;
      await db.from("nightly_builder_queue").update({
        status: "completed",
        article_id: articleId || null,
      }).eq("id", item.id);
      console.log(`Completed: "${item.topic}" → article ${articleId}`);

      if (autoPublish && articleId) {
        await db.from("articles").update({
          status: "published",
          published_at: new Date().toISOString(),
        }).eq("id", articleId);
        console.log(`Auto-published: "${item.topic}"`);
      }
    }
  } catch (err) {
    console.error(`Manual batch failed for "${item.topic}":`, err);
    await db.from("nightly_builder_queue").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
    }).eq("id", item.id);
  }

  selfChainManualBatch(autoPublish);
}

// ── Self-chain helper for manual batch ───────────────────────────

function selfChainManualBatch(autoPublish: boolean) {
  const db = serviceClient();
  db.from("nightly_builder_queue")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "processing"])
    .is("run_date", null)
    .then(({ count }) => {
      if (count && count > 0) {
        console.log(`Self-invoking for next manual batch item (${count} remaining/recoverable)...`);
        selfInvoke({ action: "generate_manual_batch", autoPublish });
      } else {
        console.log("Manual batch fully complete — all items processed.");
      }
    })
    .catch(err => {
      console.error("Error checking remaining items, self-invoking anyway as safety:", err);
      selfInvoke({ action: "generate_manual_batch", autoPublish });
    });
}

// ── HTTP Handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");

      if (token !== serviceKey && token !== anonKey) {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          anonKey,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user }, error } = await userClient.auth.getUser();
        if (error || !user) return jsonResp({ error: "Unauthorized" }, 401);

        const db = serviceClient();
        const { data: roleData } = await db.from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (!roleData) return jsonResp({ error: "Admin access required" }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));

    // Self-chain action: generate one article from nightly queue
    if (body.action === "generate_one" && body.runId) {
      console.log(`Self-chained: generating one article for run ${body.runId}, batch ${body.batch}`);
      await generateOneFromQueue(body.runId, body.batch || 1, body.runDate || getISTDateString());
      return jsonResp({ success: true });
    }

    // Self-chain action: generate one from manual batch queue
    if (body.action === "generate_manual_batch") {
      console.log("Self-chained: generating one from manual batch queue");
      await generateOneFromManualQueue(body.autoPublish || false);
      return jsonResp({ success: true });
    }

    // Start manual batch processing
    if (body.action === "start_manual_batch") {
      const checkDb = serviceClient();
      const { count: pendingCount } = await checkDb.from("nightly_builder_queue")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "processing"])
        .is("run_date", null);

      if (!pendingCount || pendingCount === 0) {
        console.log("No manual batch items to process.");
        return jsonResp({ success: true, message: "No items to process" });
      }

      const parallelism = Math.min(body.parallelism || 3, pendingCount, 5);
      console.log(`Starting manual batch generation (${pendingCount} items, ${parallelism} parallel chains)...`);
      
      for (let i = 0; i < parallelism; i++) {
        selfInvoke({ action: "generate_manual_batch", autoPublish: body.autoPublish || false, chainId: i });
      }
      
      return jsonResp({ success: true, message: `Manual batch started with ${parallelism} parallel chains`, parallelism });
    }

    // Default: start nightly builder run
    const batch = body.batch || 1;
    const isManualRun = !!body.manual;
    console.log(`Nightly Builder triggered for batch ${batch} (manual: ${isManualRun})`);

    if (!isManualRun) {
      const db = serviceClient();
      const settings = await ensureSettings(db);
      if (settings && !settings.enabled) {
        console.log("Nightly builder is disabled and this is not a manual run. Skipping.");
        return jsonResp({ error: "Nightly builder is disabled. Enable it in settings or use manual run.", disabled: true }, 400);
      }
    }

    EdgeRuntime.waitUntil(
      runNightlyBuilder(batch)
        .catch(e => console.error("Nightly builder execution error:", e))
    );

    return jsonResp({
      success: true,
      message: `Nightly builder batch ${batch} triggered (running in background)`,
      batch,
    });
  } catch (err) {
    console.error("Nightly builder handler error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: msg }, 500);
  }
});
