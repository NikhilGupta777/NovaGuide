import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL_FLASH = "gemini-2.5-flash";
const MODEL_LITE = "gemini-2.5-flash-lite";

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

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Deep Research via Gemini Flash + Google Search Grounding ──────
// Using the standard generateContent API with google_search tool
// (more reliable than the Interactions API which may not be available)

async function deepResearchCategory(
  apiKey: string,
  categoryName: string,
  categoryDescription: string,
  existingTitles: string[],
  topicsCount: number
): Promise<string[]> {
  console.log(`Deep researching category: ${categoryName}`);

  const prompt = `You are researching for a tech help website called DigitalHelp.

CATEGORY: ${categoryName}
DESCRIPTION: ${categoryDescription || "General tech help articles"}

EXISTING ARTICLES IN THIS CATEGORY (do NOT suggest these again):
${existingTitles.length > 0 ? existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n") : "None yet"}

YOUR TASK:
Find the top ${topicsCount} most commonly searched questions, problems, and how-to topics that people search for online related to "${categoryName}" in the tech/digital help space.

Focus on:
- Questions real people ask on Google, Reddit, Quora, forums
- Common problems and troubleshooting guides
- Step-by-step how-to guides
- Beginner-friendly topics that get high search volume
- Recent/trending topics (2024-2026)

IMPORTANT: Do NOT include any topics that are too similar to the existing articles listed above.

Return ONLY a valid JSON array of strings with ${topicsCount} unique, specific questions/topics. Each should be a clear, searchable question or how-to title.
Example: ["How to reset iPhone password", "Fix slow WiFi connection on Windows 11"]`;

  // Use Gemini Flash with Google Search grounding for real web data
  const url = `${GEMINI_BASE}/models/${MODEL_FLASH}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 8192,
    },
    systemInstruction: {
      parts: [{ text: "You are a research assistant that discovers trending tech help topics. Use web search to find real, commonly-asked questions. Return ONLY a JSON array of strings." }]
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`Research error for ${categoryName}:`, resp.status, txt);
    if (resp.status === 429) {
      console.log("Rate limited during research, waiting 30s...");
      await delay(30000);
      return deepResearchCategory(apiKey, categoryName, categoryDescription, existingTitles, topicsCount);
    }
    throw new Error(`Research failed (${resp.status}): ${txt}`);
  }

  const data = await resp.json();
  const candidates = data.candidates || [];
  if (!candidates[0]?.content?.parts) {
    console.error("No content in research response");
    return [];
  }

  const responseText = candidates[0].content.parts.map((p: { text?: string }) => p.text || "").join("");

  // Parse JSON array from response
  let topics: string[] = [];
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      topics = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Failed to parse research topics JSON:", e);
    console.log("Raw response:", responseText.substring(0, 500));

    // Fallback: try to parse line-by-line
    try {
      const parsePrompt = `Extract all questions/topics from this text and return them as a JSON array of strings. Only include clear, specific questions or how-to topics.\n\nText:\n${responseText.substring(0, 12000)}\n\nReturn ONLY a valid JSON array.`;
      const parsed = await callGeminiFlash(apiKey, MODEL_LITE, parsePrompt, "Return ONLY a JSON array of strings.");
      const fallbackMatch = parsed.match(/\[[\s\S]*\]/);
      if (fallbackMatch) {
        topics = JSON.parse(fallbackMatch[0]);
      }
    } catch {
      console.error("Fallback parsing also failed");
    }
  }

  // Filter out non-string items
  topics = topics.filter(t => typeof t === "string" && t.trim().length > 10);
  console.log(`Category "${categoryName}": found ${topics.length} topics`);
  return topics;
}

// ── Gemini Flash Call (for parsing / dedup) ───────────────────────

async function callGeminiFlash(
  apiKey: string,
  model: string,
  prompt: string,
  systemInstruction?: string
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
    if (resp.status === 429) {
      console.log("Rate limited, waiting 30s...");
      await delay(30000);
      return callGeminiFlash(apiKey, model, prompt, systemInstruction);
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

  // Create default settings
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

  // Ensure settings exist
  const settings = await ensureSettings(db);
  if (!settings) throw new Error("Failed to get/create nightly builder settings");

  // Check if enabled
  if (!settings.enabled) {
    console.log("Nightly builder is disabled. Skipping.");
    return;
  }

  // Check stop requested
  if (settings.stop_requested) {
    console.log("Stop was requested. Resetting flag and skipping.");
    await db.from("nightly_builder_settings").update({ stop_requested: false }).eq("id", settings.id);
    return;
  }

  // Create run record
  const { data: runData } = await db.from("nightly_builder_runs").insert({
    status: batch === 1 ? "researching" : "generating",
    batch_number: batch,
    started_at: new Date().toISOString(),
  }).select().single();

  const runId = runData?.id;
  if (!runId) throw new Error("Failed to create run record");

  // Update last_run_at
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

  // Phase B: Research per category using Gemini Flash + Google Search
  console.log("Phase B: Starting research for each category...");
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

      // Rate limit between categories
      await delay(3000);
    } catch (err) {
      console.error(`Error researching category "${category.name}":`, err);
      detailsMap[category.name] = {
        error: err instanceof Error ? err.message : String(err),
      };
      categoriesProcessed++;
    }
  }

  // Phase C: Deduplication against all existing titles
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

  // Use AI for fuzzy dedup if there are many topics
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

        const dedupResult = await callGeminiFlash(apiKey, MODEL_LITE, dedupPrompt,
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
  if (allowCategoryCreation && categories.length > 0) {
    console.log("Phase D: Checking for missing categories...");
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

Return ONLY a valid JSON array. Example: [{"name": "Smart Home", "description": "Help with smart home devices", "icon": "Wifi"}]`;

      const catResult = await callGeminiFlash(apiKey, MODEL_FLASH, catPrompt,
        "Return ONLY a valid JSON array of category objects. No markdown.");

      try {
        const jsonMatch = catResult.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const newCats: { name: string; description: string; icon: string }[] = JSON.parse(jsonMatch[0]);

          for (const newCat of newCats.slice(0, 5)) {
            const icon = SAFE_ICONS.includes(newCat.icon) ? newCat.icon : "Lightbulb";
            const slug = newCat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

            // Check if category already exists
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

              // Research topics for new category
              try {
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

              await delay(3000);
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

  // Insert all into queue
  const today = new Date().toISOString().split("T")[0];
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

  // Phase F: Generate Batch 1 articles
  console.log("Phase F: Generating Batch 1 articles...");
  await generateArticlesFromQueue(db, settings, runId, 1, today);
}

// ── Overflow Batch Processing ─────────────────────────────────────

async function runOverflowBatch(
  db: ReturnType<typeof serviceClient>,
  _apiKey: string,
  settings: Record<string, unknown>,
  runId: string,
  batch: number
) {
  const today = new Date().toISOString().split("T")[0];

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

  console.log(`Processing ${count} pending items for batch ${batch}`);
  await db.from("nightly_builder_runs").update({ status: "generating" }).eq("id", runId);
  await generateArticlesFromQueue(db, settings, runId, batch, today);
}

// ── Article Generation from Queue ─────────────────────────────────

async function generateArticlesFromQueue(
  db: ReturnType<typeof serviceClient>,
  settings: Record<string, unknown>,
  runId: string,
  batch: number,
  runDate: string
) {
  const settingsId = settings.id as string;
  const minQuality = (settings.auto_publish_min_quality as number) || 7;
  const minFactual = (settings.auto_publish_min_factual as number) || 7;

  let articlesGenerated = 0;
  let articlesPublished = 0;
  let articlesFailed = 0;

  // Fetch pending queue items for this batch
  const { data: queueItems } = await db.from("nightly_builder_queue")
    .select("*")
    .eq("run_date", runDate)
    .eq("batch_number", batch)
    .eq("status", "pending")
    .order("priority", { ascending: true });

  if (!queueItems || queueItems.length === 0) {
    console.log("No pending queue items. Completing.");
    await db.from("nightly_builder_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return;
  }

  console.log(`Generating ${queueItems.length} articles for batch ${batch}...`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  for (const item of queueItems) {
    // Check stop flag
    const { data: freshSettings } = await db.from("nightly_builder_settings")
      .select("stop_requested")
      .eq("id", settingsId)
      .single();

    if (freshSettings?.stop_requested) {
      console.log("Stop requested. Halting generation.");
      await db.from("nightly_builder_runs").update({
        status: "stopped",
        articles_generated: articlesGenerated,
        articles_published: articlesPublished,
        articles_failed: articlesFailed,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
      await db.from("nightly_builder_settings").update({ stop_requested: false }).eq("id", settingsId);
      return;
    }

    // Mark queue item as processing
    await db.from("nightly_builder_queue").update({ status: "processing" }).eq("id", item.id);

    try {
      console.log(`Generating article: "${item.topic}"`);

      // Call ai-agent edge function via HTTP with service-role key
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
        continue;
      }

      if (agentData.error) {
        throw new Error(agentData.error);
      }

      // ai-agent returns articleId directly in the response (via ...savedArticle spread)
      const articleId = agentData.id || agentData.articleId || agentData.article_id;
      articlesGenerated++;

      // Update queue item
      await db.from("nightly_builder_queue").update({
        status: "completed",
        article_id: articleId || null,
      }).eq("id", item.id);

      // ai-agent returns _quality_score and _factual_score directly
      const qualityScore = agentData._quality_score || 0;
      const factualScore = agentData._factual_score || 0;

      console.log(`Scores - Quality: ${qualityScore}, Factual: ${factualScore} (thresholds: ${minQuality}, ${minFactual})`);

      if (qualityScore >= minQuality && factualScore >= minFactual && articleId) {
        await db.from("articles").update({
          status: "published",
          published_at: new Date().toISOString(),
        }).eq("id", articleId);

        articlesPublished++;
        console.log(`Auto-published: "${item.topic}"`);
      } else {
        console.log(`Kept as draft: "${item.topic}" (Q:${qualityScore} F:${factualScore})`);
      }

      // Update run progress
      await db.from("nightly_builder_runs").update({
        articles_generated: articlesGenerated,
        articles_published: articlesPublished,
        articles_failed: articlesFailed,
      }).eq("id", runId);

    } catch (err) {
      console.error(`Failed to generate "${item.topic}":`, err);
      articlesFailed++;
      await db.from("nightly_builder_queue").update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      }).eq("id", item.id);

      // Update run progress on failure too
      await db.from("nightly_builder_runs").update({
        articles_failed: articlesFailed,
      }).eq("id", runId);
    }

    // Rate limit delay between articles
    await delay(5000);
  }

  // Mark run as completed
  await db.from("nightly_builder_runs").update({
    status: "completed",
    articles_generated: articlesGenerated,
    articles_published: articlesPublished,
    articles_failed: articlesFailed,
    completed_at: new Date().toISOString(),
  }).eq("id", runId);

  console.log(`Batch ${batch} complete: ${articlesGenerated} generated, ${articlesPublished} published, ${articlesFailed} failed`);
}

// ── HTTP Handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: require either service-role key or admin user
    const authHeader = req.headers.get("Authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!authHeader) {
      return jsonResp({ error: "Unauthorized: missing Authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");

    if (token !== serviceKey) {
      // Verify admin user
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
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

    const body = await req.json().catch(() => ({}));
    const batch = body.batch || 1;

    console.log(`Nightly Builder triggered for batch ${batch}`);

    // Run the builder and await completion — fire-and-forget dies when the container shuts down
    // Edge functions have ~400s max, so this may time out on very large workloads
    try {
      await runNightlyBuilder(batch);
      return jsonResp({
        success: true,
        message: `Nightly builder batch ${batch} completed`,
        batch,
      });
    } catch (e) {
      console.error("Nightly builder execution error:", e);
      return jsonResp({
        success: false,
        message: `Nightly builder batch ${batch} failed: ${e instanceof Error ? e.message : String(e)}`,
        batch,
      });
    }
  } catch (err) {
    console.error("Nightly builder handler error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: msg }, 500);
  }
});
