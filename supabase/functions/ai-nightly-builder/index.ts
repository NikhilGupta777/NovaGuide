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
const DEEP_RESEARCH_AGENT = "deep-research-pro-preview-12-2025";

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

// ── Deep Research API ─────────────────────────────────────────────

async function startDeepResearch(apiKey: string, prompt: string): Promise<string> {
  console.log("Starting Deep Research interaction...");
  const resp = await fetch(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      input: prompt,
      agent: DEEP_RESEARCH_AGENT,
      background: true,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("Deep Research start error:", resp.status, txt);
    throw new Error(`Deep Research start failed (${resp.status}): ${txt}`);
  }

  const data = await resp.json();
  const interactionId = data.id || data.name;
  console.log("Deep Research started, interaction ID:", interactionId);
  return interactionId;
}

async function pollDeepResearch(apiKey: string, interactionId: string, maxWaitMs = 600000): Promise<string> {
  console.log("Polling Deep Research interaction:", interactionId);
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    await delay(10000); // Poll every 10 seconds

    const resp = await fetch(`${GEMINI_BASE}/interactions/${interactionId}`, {
      method: "GET",
      headers: { "x-goog-api-key": apiKey },
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Poll error:", resp.status, txt);
      // Continue polling on transient errors
      if (resp.status >= 500) continue;
      throw new Error(`Poll failed (${resp.status}): ${txt}`);
    }

    const data = await resp.json();
    const status = (data.status || "").toUpperCase();
    console.log("Poll status:", status);

    if (status === "COMPLETED" || status === "COMPLETE") {
      // Extract text from outputs
      const outputs = data.outputs || [];
      let resultText = "";
      for (const output of outputs) {
        if (output.text) {
          resultText += output.text + "\n";
        } else if (output.content?.parts) {
          for (const part of output.content.parts) {
            if (part.text) resultText += part.text + "\n";
          }
        }
      }
      if (!resultText && data.output?.text) {
        resultText = data.output.text;
      }
      console.log(`Deep Research completed: ${resultText.length} chars`);
      return resultText;
    }

    if (status === "FAILED") {
      throw new Error(`Deep Research failed: ${JSON.stringify(data)}`);
    }
  }

  throw new Error("Deep Research timed out after " + (maxWaitMs / 1000) + "s");
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

// ── Main Orchestrator ─────────────────────────────────────────────

async function runNightlyBuilder(batch: number) {
  const db = serviceClient();
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  // Check if enabled
  const { data: settingsArr } = await db.from("nightly_builder_settings").select("*").limit(1);
  const settings = settingsArr?.[0];
  if (!settings?.enabled) {
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

  // Phase B: Deep Research per category
  console.log("Phase B: Starting Deep Research for each category...");
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
      return;
    }

    const categoryArticles = articles?.filter(a => a.category_id === category.id) || [];
    const existingTitles = categoryArticles.map(a => a.title);

    console.log(`Researching category: ${category.name} (${existingTitles.length} existing articles)`);

    try {
      const researchPrompt = `You are researching for a tech help website called DigitalHelp. 

CATEGORY: ${category.name}
DESCRIPTION: ${category.description || "General tech help articles"}

EXISTING ARTICLES IN THIS CATEGORY (do NOT suggest these again):
${existingTitles.length > 0 ? existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n") : "None yet"}

YOUR TASK:
Find the top ${topicsPerCategory} most commonly searched questions, problems, and how-to topics that people search for online related to "${category.name}" in the tech/digital help space.

Focus on:
- Questions real people ask on Google, Reddit, Quora, forums
- Common problems and troubleshooting guides
- Step-by-step how-to guides
- Beginner-friendly topics that get high search volume
- Recent/trending topics (2024-2026)

IMPORTANT: Do NOT include any topics that are too similar to the existing articles listed above.

Return a numbered list of ${topicsPerCategory} unique, specific questions/topics. Each should be a clear, searchable question or how-to title.`;

      // Start Deep Research
      const interactionId = await startDeepResearch(apiKey, researchPrompt);

      // Poll for completion (max 10 min per category)
      const researchResult = await pollDeepResearch(apiKey, interactionId, 600000);

      // Parse research output into structured topics using Flash
      const parsePrompt = `Extract all distinct questions/topics from this research output. Return them as a JSON array of strings. Only include clear, specific questions or how-to topics suitable for help articles. Remove any duplicates or overly similar items.

Research output:
${researchResult.substring(0, 15000)}

Return ONLY a valid JSON array of strings, nothing else. Example: ["How to reset iPhone password", "Fix slow WiFi connection"]`;

      const parsedText = await callGeminiFlash(apiKey, MODEL_FLASH, parsePrompt,
        "You are a JSON parser. Return ONLY a valid JSON array of strings. No markdown, no explanation.");

      let parsedTopics: string[] = [];
      try {
        // Extract JSON array from response
        const jsonMatch = parsedText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          parsedTopics = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("Failed to parse topics JSON:", e);
        console.log("Raw parse output:", parsedText.substring(0, 500));
      }

      console.log(`Category "${category.name}": found ${parsedTopics.length} topics`);
      totalTopicsFound += parsedTopics.length;

      for (let i = 0; i < parsedTopics.length; i++) {
        allTopics.push({
          topic: parsedTopics[i],
          category_id: category.id,
          priority: i,
        });
      }

      detailsMap[category.name] = {
        topics_found: parsedTopics.length,
        existing_articles: existingTitles.length,
      };

      categoriesProcessed++;

      // Rate limit: wait between categories
      await delay(5000);
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
    // Basic exact/near-exact match filter
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
      for (const batch of dedupBatches) {
        const dedupPrompt = `Compare these proposed topics against existing article titles. Remove any proposed topic that would cover essentially the same content as an existing article (even if worded differently).

EXISTING ARTICLES:
${allExistingTitles.slice(0, 200).join("\n")}

PROPOSED TOPICS:
${batch.map((t, i) => `${i}. ${t.topic}`).join("\n")}

Return ONLY a JSON array of the INDEX NUMBERS (0-based) of topics that are UNIQUE and should be KEPT. Example: [0, 2, 5, 7]`;

        const dedupResult = await callGeminiFlash(apiKey, MODEL_LITE, dedupPrompt,
          "Return ONLY a JSON array of integers. No explanation.");

        try {
          const jsonMatch = dedupResult.match(/\[[\s\S]*?\]/);
          if (jsonMatch) {
            const keepIndices: number[] = JSON.parse(jsonMatch[0]);
            for (const idx of keepIndices) {
              if (idx >= 0 && idx < batch.length) {
                finalDeduped.push(batch[idx]);
              }
            }
          } else {
            finalDeduped.push(...batch); // Keep all if parsing fails
          }
        } catch {
          finalDeduped.push(...batch);
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
      const catResearchPrompt = `You are analyzing a tech help website called DigitalHelp.

EXISTING CATEGORIES: ${categoryNames}

Research what major tech help categories are MISSING from this website. Think about what people commonly search for help with in technology that isn't covered by the existing categories.

Consider areas like: Smart Home, Privacy & VPN, Email, Cloud Storage, Gaming, Wearables, Networking, Printing, Streaming, etc.

Only suggest categories that would have substantial content (at least 20+ common questions). Don't suggest categories that overlap significantly with existing ones.

List 0-5 missing category suggestions with a name and brief description for each.`;

      const catInteractionId = await startDeepResearch(apiKey, catResearchPrompt);
      const catResearchResult = await pollDeepResearch(apiKey, catInteractionId, 300000);

      // Parse into structured categories
      const catParsePrompt = `Extract the suggested new categories from this research. Return a JSON array of objects with "name", "description", and "icon" fields.

For the "icon" field, choose the most appropriate icon from this list: ${SAFE_ICONS.join(", ")}. Default to "Lightbulb" if unsure.

Research output:
${catResearchResult.substring(0, 5000)}

Return ONLY a valid JSON array. Example: [{"name": "Smart Home", "description": "Help with smart home devices", "icon": "Wifi"}]`;

      const catParsed = await callGeminiFlash(apiKey, MODEL_FLASH, catParsePrompt,
        "Return ONLY a valid JSON array. No markdown, no explanation.");

      try {
        const jsonMatch = catParsed.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const newCats: { name: string; description: string; icon: string }[] = JSON.parse(jsonMatch[0]);

          for (const newCat of newCats.slice(0, 5)) {
            // Validate icon
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

              // Research topics for new category too
              try {
                const newCatPrompt = `Find the top ${topicsPerCategory} most commonly searched questions and how-to topics about "${newCat.name}" (${newCat.description}) in the tech/digital help space. Return a numbered list of specific, searchable questions.`;

                const newCatInteractionId = await startDeepResearch(apiKey, newCatPrompt);
                const newCatResult = await pollDeepResearch(apiKey, newCatInteractionId, 300000);

                const newCatParse = await callGeminiFlash(apiKey, MODEL_FLASH,
                  `Extract all questions/topics as a JSON array of strings:\n${newCatResult.substring(0, 10000)}`,
                  "Return ONLY a JSON array of strings.");

                const newJsonMatch = newCatParse.match(/\[[\s\S]*\]/);
                if (newJsonMatch) {
                  const newTopics: string[] = JSON.parse(newJsonMatch[0]);
                  for (let i = 0; i < newTopics.length; i++) {
                    dedupedTopics.push({
                      topic: newTopics[i],
                      category_id: insertedCat.id,
                      priority: i,
                    });
                  }
                  totalTopicsFound += newTopics.length;
                  detailsMap[newCat.name] = { topics_found: newTopics.length, new_category: true };
                }
              } catch (err) {
                console.error(`Error researching new category "${newCat.name}":`, err);
              }

              await delay(5000);
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

  // Group by category
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
    // Insert in batches of 100
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
  await generateArticlesFromQueue(db, apiKey, settings, runId, 1, today);
}

// ── Overflow Batch Processing ─────────────────────────────────────

async function runOverflowBatch(
  db: ReturnType<typeof serviceClient>,
  apiKey: string,
  settings: Record<string, unknown>,
  runId: string,
  batch: number
) {
  const today = new Date().toISOString().split("T")[0];

  // Count pending items for this batch
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
  await generateArticlesFromQueue(db, apiKey, settings, runId, batch, today);
}

// ── Article Generation from Queue ─────────────────────────────────

async function generateArticlesFromQueue(
  db: ReturnType<typeof serviceClient>,
  _apiKey: string,
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
      // Reset stop flag
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

      const articleId = agentData.articleId || agentData.article_id;
      articlesGenerated++;

      // Update queue item
      await db.from("nightly_builder_queue").update({
        status: "completed",
        article_id: articleId,
      }).eq("id", item.id);

      // Check quality and factual scores for auto-publish
      if (agentData._run_id) {
        const { data: runRecord } = await db.from("agent_runs")
          .select("factual_score, token_usage")
          .eq("id", agentData._run_id)
          .single();

        if (runRecord) {
          const factualScore = runRecord.factual_score || 0;
          const qualityScore = (runRecord.token_usage as Record<string, unknown>)?.quality_score as number || 0;

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
        }
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
    // Auth: allow service-role calls (from cron) or admin users
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      if (token !== serviceKey) {
        // Verify admin
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
    }

    const body = await req.json().catch(() => ({}));
    const batch = body.batch || 1;

    console.log(`Nightly Builder triggered for batch ${batch}`);

    // Run in background - fire and forget
    runNightlyBuilder(batch).catch((e) =>
      console.error("Nightly builder background error:", e)
    );

    return jsonResp({
      success: true,
      message: `Nightly builder batch ${batch} started in background`,
      batch,
    });
  } catch (err) {
    console.error("Nightly builder handler error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status || 500;
    return jsonResp({ error: msg }, status);
  }
});
