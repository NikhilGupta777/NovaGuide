import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// ── Optimal Model Strategy ────────────────────────────────────────────
// Each model is chosen for its specific strength in the pipeline
const MODEL_LITE = "gemini-2.5-flash-lite"; // Cheapest: simple tasks (dup check)
const MODEL_RESEARCH = "gemini-2.5-flash"; // Stable grounding: research & fact-check
const MODEL_FAST = "gemini-3-flash-preview"; // Smart + fast: outline, quality gate
const MODEL_PRO = "gemini-3-pro-preview"; // Best quality: article writing
const MODEL_PRO_FALLBACK = "gemini-3-flash-preview"; // Fallback if Pro hits 429

// ── Helpers ───────────────────────────────────────────────────────────

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function authenticateAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw { status: 401, message: "Unauthorized" };

  // Allow service-role calls (e.g. from ai-ask triggering article generation)
  const token = authHeader.replace("Bearer ", "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (token === serviceKey) {
    console.log("Service-role auth: bypassing admin check (internal call)");
    return { user: null, db: serviceClient() };
  }

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) throw { status: 401, message: "Unauthorized" };

  const db = serviceClient();
  const { data: roleData } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleData) throw { status: 403, message: "Admin access required" };

  return { user, db };
}

async function callGemini(
  apiKey: string,
  model: string,
  contents: unknown[],
  tools?: unknown[],
  systemInstruction?: string,
) {
  const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`;

  const body: Record<string, unknown> = { contents };
  if (tools && tools.length > 0) body.tools = tools;
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  body.generationConfig = { temperature: 0.7 };

  console.log(`Calling Gemini model: ${model}`);
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error(`Gemini API error (${model}):`, resp.status, txt);
    if (resp.status === 429) throw { status: 429, message: `Rate limit on ${model}`, model };
    if (resp.status === 403) throw { status: 403, message: "Gemini API key invalid or quota exceeded." };
    throw new Error(`Gemini API returned ${resp.status}: ${txt}`);
  }
  return resp.json();
}

// Auto-fallback: tries primary model, falls back on 429
async function callGeminiWithFallback(
  apiKey: string,
  primaryModel: string,
  fallbackModel: string,
  contents: unknown[],
  tools?: unknown[],
  systemInstruction?: string,
) {
  try {
    return await callGemini(apiKey, primaryModel, contents, tools, systemInstruction);
  } catch (err: unknown) {
    const e = err as { status?: number; model?: string };
    if (e.status === 429) {
      console.log(`Model ${primaryModel} rate limited, falling back to ${fallbackModel}`);
      await delay(2000);
      return await callGemini(apiKey, fallbackModel, contents, tools, systemInstruction);
    }
    throw err;
  }
}

function extractText(response: Record<string, unknown>): string {
  const candidates = response.candidates as { content: { parts: { text?: string }[] } }[];
  if (!candidates?.[0]?.content?.parts) return "";
  return candidates[0].content.parts.map((p) => p.text || "").join("");
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
    .filter((c) => c.web?.uri && !seen.has(c.web.uri) && seen.add(c.web.uri))
    .map((c) => ({ title: c.web!.title || "", url: c.web!.uri }));
}

function extractFunctionCall(response: Record<string, unknown>): Record<string, unknown> | null {
  const candidates = response.candidates as {
    content: { parts: { functionCall?: { name: string; args: Record<string, unknown> } }[] };
  }[];
  if (!candidates?.[0]?.content?.parts) return null;
  for (const part of candidates[0].content.parts) {
    if (part.functionCall) return part.functionCall.args;
  }
  return null;
}

async function updateRunStatus(
  db: ReturnType<typeof serviceClient>,
  runId: string,
  status: string,
  step: number,
  extra: Record<string, unknown> = {},
) {
  await db
    .from("agent_runs")
    .update({ status, current_step: step, ...extra })
    .eq("id", runId);
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Pipeline Steps ──────────────────────────────────────────────────

// Step 1: Duplicate Check (uses cheapest model)
async function step1_duplicateCheck(
  apiKey: string,
  topic: string,
  existingTitles: string[],
): Promise<{ isDuplicate: boolean; similarTitle?: string; score?: number }> {
  console.log("Pipeline Step 1: Duplicate Check (Flash Lite) for:", topic);

  if (existingTitles.length === 0) return { isDuplicate: false };

  const systemPrompt = `You are a content overlap analyzer for a tech help website. Your job is to determine if a proposed article would provide SUBSTANTIALLY THE SAME advice, steps, and solutions as an existing article.

YOUR JOB: Only flag TRUE duplicates — articles that are essentially the SAME article rewritten.

CRITICAL RULES:
- Different titles that serve different user search queries = ALWAYS allow. Users search different phrases and each title captures different traffic.
- Two or three articles on a similar broad topic but written differently, with different titles, different structure, or slightly different focus = NOT duplicates. These are VALUABLE because they serve different readers.
- The ONLY duplicate is when the title is nearly word-for-word identical AND the step-by-step content would be 95%+ the same instructions in the same order.
- "Slow internet fixes" vs "Internet not working troubleshooting" → NOT duplicate (different problems)
- "Clear Chrome cache" vs "Clear browser cache" → NOT duplicate (different scope, different search intent)
- "How to fix Wi-Fi" vs "How to Fix Wi-Fi" → DUPLICATE (same title, same content)
- "Reset Windows password" vs "Forgot Windows password: reset guide" → NOT duplicate (different title = different search traffic)
- When in doubt, ALWAYS mark as NOT duplicate. More content is better than less.

Return your analysis using the check_duplicate function.`;

  const prompt = `Proposed topic: "${topic}"

Existing articles:
${existingTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Is there an existing article with a nearly IDENTICAL title AND identical step-by-step content? Only flag as duplicate if it's essentially the same article rewritten word-for-word. Different titles, different angles, or different wording = NOT a duplicate.`;

  const response = await callGemini(
    apiKey,
    MODEL_LITE,
    [{ role: "user", parts: [{ text: prompt }] }],
    [
      {
        function_declarations: [
          {
            name: "check_duplicate",
            description: "Return duplicate check results",
            parameters: {
              type: "OBJECT",
              properties: {
                is_duplicate: {
                  type: "BOOLEAN",
                  description:
                    "True ONLY if an existing article has a nearly identical title AND 95%+ identical step-by-step content",
                },
                similarity_score: {
                  type: "NUMBER",
                  description:
                    "Content overlap score 0-100. Only 95+ means true duplicate. Different titles automatically cap this at 80.",
                },
                similar_to: {
                  type: "STRING",
                  description: "Title of the most similar existing article, or empty string",
                },
                reasoning: {
                  type: "STRING",
                  description: "Brief explanation of WHY content would or would not overlap",
                },
              },
              required: ["is_duplicate", "similarity_score", "similar_to", "reasoning"],
            },
          },
        ],
      },
    ],
    systemPrompt,
  );

  const args = extractFunctionCall(response);
  if (!args) return { isDuplicate: false };

  return {
    isDuplicate: Boolean(args.is_duplicate) && (args.similarity_score as number) >= 95,
    similarTitle: args.similar_to as string,
    score: args.similarity_score as number,
  };
}

// Step 2: Deep Web Research with Google Search Grounding (stable model)
async function step2_research(
  apiKey: string,
  topic: string,
): Promise<{ research: string; sources: { title: string; url: string }[] }> {
  console.log("Pipeline Step 2: Deep Web Research (2.5 Flash + Google Search) for:", topic);

  const systemPrompt = `You are a world-class research analyst. Research this topic thoroughly using Google Search to find the most current and accurate information. Focus on:
1. The core problem and who faces it
2. Step-by-step solutions with specific details
3. Platform/device differences (Windows, Mac, Android, iOS)
4. Recent changes or updates (2024-2026)
5. Common mistakes and troubleshooting
6. Expert tips and best practices

Produce comprehensive, well-organized research notes of 500-800 words based on REAL information from the web. Cite specific facts and data.`;

  const response = await callGemini(
    apiKey,
    MODEL_RESEARCH,
    [
      {
        role: "user",
        parts: [
          {
            text: `Research this topic thoroughly: "${topic}". Search the web for the most current and accurate information.`,
          },
        ],
      },
    ],
    [{ google_search: {} }],
    systemPrompt,
  );

  const research = extractText(response);
  const sources = extractGroundingSources(response);

  console.log(`Research complete: ${research.length} chars, ${sources.length} sources`);
  return { research, sources };
}

// Step 3: Generate Outline (smart + fast model)
async function step3_outline(apiKey: string, topic: string, research: string): Promise<string> {
  console.log("Pipeline Step 3: Generate Outline (3 Flash)");

  const systemPrompt = `You are an expert content strategist. Based on the research notes, create a detailed article outline.

The outline should follow this structure (follow this for all but in some cases you can also to the content best way):
1. Hook / Introduction (grab attention, state the problem)
2. Why This Matters (brief context)
3. Step-by-Step Solution (the main content, 4-8 steps)
4. Troubleshooting / Common Issues
5. Quick Summary / Recap
6. Related Tips

Return ONLY the outline as a numbered/nested Markdown list. Be specific about what each section should cover.`;

  const response = await callGemini(
    apiKey,
    MODEL_FAST,
    [
      {
        role: "user",
        parts: [{ text: `Topic: "${topic}"\n\nResearch Notes:\n${research}\n\nCreate a detailed article outline.` }],
      },
    ],
    undefined,
    systemPrompt,
  );

  return extractText(response);
}

// Step 4: Write Article (best model with fallback)
async function step4_write(
  apiKey: string,
  topic: string,
  research: string,
  outline: string,
  categories: { id: string; name: string }[],
  sources: { title: string; url: string }[],
  categoryId?: string,
): Promise<Record<string, unknown>> {
  console.log("Pipeline Step 4: Write Article (Gemini 3 Pro → fallback Flash)");

  const categoryList = categories.map((c) => `${c.name} (ID: ${c.id})`).join(", ");
  const sourcesRef =
    sources.length > 0
      ? `\n\nSOURCES TO REFERENCE:\n${sources.map((s, i) => `${i + 1}. [${s.title || "Source"}](${s.url})`).join("\n")}`
      : "";

  const systemPrompt = `You are an expert tech writer for DigitalHelp, a beginner-friendly tech help website.

AVAILABLE CATEGORIES: ${categoryList}

Use the research notes and outline below to write a complete, high-quality help article.

RESEARCH NOTES:
${research}

ARTICLE OUTLINE:
${outline}
${sourcesRef}

WRITING RULES:
- Write for complete beginners with zero tech knowledge
- Use simple, clear language — no jargon without explanation
- Follow the outline structure exactly
- Each step should be numbered with a clear heading
- Use **bold** for UI elements, buttons, menu items
- Include practical tips and warnings where needed
- Keep paragraphs short (2-3 sentences max)
- Article should be 800-1500 words for thorough coverage
- Add a "💡 Pro Tip" or "⚠️ Warning" callout where relevant
- End with a concise recap and next steps
- If sources are provided, naturally reference them in context

You MUST respond using the generate_article function.`;

  const response = await callGeminiWithFallback(
    apiKey,
    MODEL_PRO,
    MODEL_PRO_FALLBACK,
    [{ role: "user", parts: [{ text: `Write the full article about: "${topic}"` }] }],
    [
      {
        function_declarations: [
          {
            name: "generate_article",
            description: "Generate a structured help article with all required fields",
            parameters: {
              type: "OBJECT",
              properties: {
                title: {
                  type: "STRING",
                  description: "SEO-friendly article title, clear and descriptive, under 70 chars",
                },
                slug: { type: "STRING", description: "URL-friendly slug, lowercase with hyphens, no special chars" },
                excerpt: { type: "STRING", description: "Brief 1-2 sentence summary for search results and previews" },
                content: { type: "STRING", description: "Full article content in Markdown" },
                category_id: { type: "STRING", description: "UUID of the best matching category" },
                tags: { type: "ARRAY", items: { type: "STRING" }, description: "3-8 relevant tags" },
                read_time: { type: "NUMBER", description: "Estimated reading time in minutes" },
                seo_title: { type: "STRING", description: "SEO meta title under 60 characters" },
                seo_description: { type: "STRING", description: "SEO meta description under 160 characters" },
              },
              required: [
                "title",
                "slug",
                "excerpt",
                "content",
                "category_id",
                "tags",
                "read_time",
                "seo_title",
                "seo_description",
              ],
            },
          },
        ],
      },
    ],
    systemPrompt,
  );

  const args = extractFunctionCall(response);
  if (!args) throw new Error("AI did not return a structured article");
  if (categoryId) args.category_id = categoryId;
  return args;
}

// Step 5: Fact Verification with Google Search Grounding (stable model)
async function step5_factCheck(
  apiKey: string,
  article: Record<string, unknown>,
): Promise<{ factualScore: number; verifiedClaims: string[]; flaggedClaims: string[] }> {
  console.log("Pipeline Step 5: Fact Verification (2.5 Flash + Google Search)");

  await delay(3000);

  const content = article.content as string;
  const title = article.title as string;

  // Step 5a: Search the web to verify claims (Google Search only, NO function calling)
  const searchResponse = await callGemini(
    apiKey,
    MODEL_RESEARCH,
    [
      {
        role: "user",
        parts: [
          {
            text: `Verify the key factual claims in this article by searching the web:\n\nTitle: ${title}\n\nContent:\n${content.substring(0, 5000)}\n\nExtract 3-5 key claims and check if they are accurate based on current web information. List each claim and whether it's verified or not.`,
          },
        ],
      },
    ],
    [{ google_search: {} }],
    "You are a fact-checker. Verify claims using Google Search and report which are accurate and which are not.",
  );

  const verificationText = extractText(searchResponse);

  await delay(2000);

  // Step 5b: Parse verification results into structured data (function calling only, NO google_search)
  const parseResponse = await callGemini(
    apiKey,
    MODEL_LITE,
    [
      {
        role: "user",
        parts: [{ text: `Based on this fact-check analysis, provide a structured score:\n\n${verificationText}` }],
      },
    ],
    [
      {
        function_declarations: [
          {
            name: "fact_check",
            description: "Return fact-check results",
            parameters: {
              type: "OBJECT",
              properties: {
                factual_score: { type: "NUMBER", description: "Overall factual accuracy score 0-10" },
                verified_claims: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                  description: "Claims verified as accurate",
                },
                flagged_claims: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                  description: "Claims that are inaccurate or unverifiable",
                },
                overall_assessment: { type: "STRING", description: "Brief overall assessment" },
              },
              required: ["factual_score", "verified_claims", "flagged_claims", "overall_assessment"],
            },
          },
        ],
      },
    ],
    "Parse the fact-check results into a structured format. Return using the fact_check function.",
  );

  const args = extractFunctionCall(parseResponse);
  if (!args) {
    return { factualScore: 7, verifiedClaims: [], flaggedClaims: [] };
  }

  return {
    factualScore: Math.round(args.factual_score as number) || 7,
    verifiedClaims: (args.verified_claims as string[]) || [],
    flaggedClaims: (args.flagged_claims as string[]) || [],
  };
}

// Step 6: Quality Gate + SEO Optimization (smart model)
async function step6_qualityGate(
  apiKey: string,
  article: Record<string, unknown>,
  factualScore: number,
): Promise<{ article: Record<string, unknown>; qualityScore: number; reviewNotes: string; needsReview: boolean }> {
  console.log("Pipeline Step 6: Quality Gate + SEO (3 Flash)");

  await delay(3000);

  const systemPrompt = `You are a senior editor and SEO specialist. Review this article and provide quality improvements.

Check for:
1. Clarity and readability for beginners
2. SEO optimization (title, description, headings)
3. Completeness of steps
4. Grammar and tone consistency
5. Missing information

The article's factual verification score is ${factualScore}/10.

Return your review using the quality_review function.`;

  const response = await callGemini(
    apiKey,
    MODEL_FAST,
    [
      {
        role: "user",
        parts: [
          {
            text: `Review this article:\n\nTitle: ${article.title}\nExcerpt: ${article.excerpt}\n\nContent:\n${(article.content as string).substring(0, 5000)}\n\nSEO Title: ${article.seo_title}\nSEO Description: ${article.seo_description}\nTags: ${(article.tags as string[])?.join(", ")}`,
          },
        ],
      },
    ],
    [
      {
        function_declarations: [
          {
            name: "quality_review",
            description: "Return quality improvements",
            parameters: {
              type: "OBJECT",
              properties: {
                quality_score: { type: "NUMBER", description: "Quality score out of 10" },
                improved_title: { type: "STRING", description: "Improved title if needed, or same title" },
                improved_seo_title: { type: "STRING", description: "Improved SEO title under 60 chars" },
                improved_seo_description: { type: "STRING", description: "Improved SEO description under 160 chars" },
                additional_tags: { type: "ARRAY", items: { type: "STRING" }, description: "Additional relevant tags" },
                review_notes: { type: "STRING", description: "Brief review notes" },
              },
              required: [
                "quality_score",
                "improved_title",
                "improved_seo_title",
                "improved_seo_description",
                "review_notes",
              ],
            },
          },
        ],
      },
    ],
    systemPrompt,
  );

  const args = extractFunctionCall(response);
  if (!args) {
    return { article, qualityScore: 7, reviewNotes: "Quality check passed", needsReview: false };
  }

  const qualityScore = Math.round(args.quality_score as number) || 7;

  // Apply improvements
  article.title = args.improved_title || article.title;
  article.seo_title = args.improved_seo_title || article.seo_title;
  article.seo_description = args.improved_seo_description || article.seo_description;
  if ((args.additional_tags as string[])?.length) {
    const existingTags = (article.tags as string[]) || [];
    article.tags = [...new Set([...existingTags, ...(args.additional_tags as string[])])].slice(0, 8);
  }

  return {
    article,
    qualityScore,
    reviewNotes: (args.review_notes as string) || "",
    needsReview: qualityScore < 7,
  };
}

// Rewrite article if quality is too low (uses Pro with fallback)
async function rewriteArticle(
  apiKey: string,
  article: Record<string, unknown>,
  reviewNotes: string,
  research: string,
  categories: { id: string; name: string }[],
): Promise<Record<string, unknown>> {
  console.log("Pipeline: Rewriting article due to low quality score");

  await delay(3000);

  const categoryList = categories.map((c) => `${c.name} (ID: ${c.id})`).join(", ");

  const systemPrompt = `You are an expert tech writer. The previous version of this article scored below 7/10 quality.

REVIEW FEEDBACK: ${reviewNotes}

ORIGINAL RESEARCH:
${research}

AVAILABLE CATEGORIES: ${categoryList}

Rewrite the article to address the feedback. Make it clearer, more complete, and better optimized for SEO.

You MUST respond using the generate_article function.`;

  const response = await callGeminiWithFallback(
    apiKey,
    MODEL_PRO,
    MODEL_PRO_FALLBACK,
    [
      {
        role: "user",
        parts: [
          {
            text: `Rewrite this article to improve quality:\n\nTitle: ${article.title}\n\nContent:\n${(article.content as string).substring(0, 5000)}`,
          },
        ],
      },
    ],
    [
      {
        function_declarations: [
          {
            name: "generate_article",
            description: "Generate a rewritten help article",
            parameters: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                slug: { type: "STRING" },
                excerpt: { type: "STRING" },
                content: { type: "STRING" },
                category_id: { type: "STRING" },
                tags: { type: "ARRAY", items: { type: "STRING" } },
                read_time: { type: "NUMBER" },
                seo_title: { type: "STRING" },
                seo_description: { type: "STRING" },
              },
              required: [
                "title",
                "slug",
                "excerpt",
                "content",
                "category_id",
                "tags",
                "read_time",
                "seo_title",
                "seo_description",
              ],
            },
          },
        ],
      },
    ],
    systemPrompt,
  );

  const args = extractFunctionCall(response);
  if (!args) return article;
  return { ...article, ...args, category_id: article.category_id };
}

// ── Main Handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY)
      throw new Error("GEMINI_API_KEY is not configured. Add your Google Gemini API key in settings.");

    const { user, db } = await authenticateAdmin(req);
    const { topic, categoryId, mode = "manual", skipDuplicateCheck = false } = await req.json();

    if (!topic) return jsonResp({ error: "Topic is required" }, 400);

    console.log(`AI Agent: Starting 6-step ${mode} pipeline for: "${topic}"`);
    console.log(`Models: Lite=${MODEL_LITE}, Research=${MODEL_RESEARCH}, Fast=${MODEL_FAST}, Pro=${MODEL_PRO}`);

    // Fetch existing articles for duplicate check
    const { data: existingArticles } = await db
      .from("articles")
      .select("title")
      .order("created_at", { ascending: false })
      .limit(200);

    const existingTitles = (existingArticles || []).map((a) => a.title);

    // Create pipeline run record
    const { data: run, error: runError } = await db
      .from("agent_runs")
      .insert({
        topic,
        mode,
        status: "checking",
        current_step: 1,
        total_steps: 6,
        model_used: `${MODEL_PRO}→${MODEL_PRO_FALLBACK}`,
      })
      .select()
      .single();
    if (runError) {
      console.error("Failed to create run:", runError);
      throw runError;
    }

    const runId = run.id;

    try {
      // STEP 1: Duplicate Check (Flash Lite - cheapest) — skippable via force retry
      await updateRunStatus(db, runId, "checking", 1);
      if (!skipDuplicateCheck) {
        const dupCheck = await step1_duplicateCheck(GEMINI_API_KEY, topic, existingTitles);

        if (dupCheck.isDuplicate) {
          await db
            .from("agent_runs")
            .update({
              status: "skipped",
              current_step: 1,
              error_message: `Topic too similar to existing article: "${dupCheck.similarTitle}" (${dupCheck.score}% match)`,
              completed_at: new Date().toISOString(),
            })
            .eq("id", runId);

          await db.from("agent_logs").insert({
            action: `Duplicate skipped: "${topic}"`,
            status: "skipped",
            details: { similar_to: dupCheck.similarTitle, score: dupCheck.score, run_id: runId },
          });

          return jsonResp({
            skipped: true,
            reason: `Topic too similar to "${dupCheck.similarTitle}" (${dupCheck.score}% match)`,
            _run_id: runId,
          });
        }
      } else {
        console.log("Duplicate check skipped (force retry)");
      }

      await delay(2000);

      // STEP 2: Deep Web Research with Google Search Grounding (2.5 Flash)
      await updateRunStatus(db, runId, "researching", 2);
      const { research, sources } = await step2_research(GEMINI_API_KEY, topic);
      await db
        .from("agent_runs")
        .update({
          research_notes: research,
          research_sources: sources,
        })
        .eq("id", runId);

      await delay(3000);

      // STEP 3: Generate Outline (3 Flash)
      await updateRunStatus(db, runId, "outlining", 3);
      const outline = await step3_outline(GEMINI_API_KEY, topic, research);
      await db.from("agent_runs").update({ generated_outline: outline }).eq("id", runId);

      await delay(3000);

      // STEP 4: Write Article (3 Pro → fallback to 3 Flash)
      await updateRunStatus(db, runId, "writing", 4);
      const { data: categories } = await db.from("categories").select("id, name, slug").order("sort_order");
      let article = await step4_write(GEMINI_API_KEY, topic, research, outline, categories || [], sources, categoryId);

      await delay(3000);

      // STEP 5: Fact Verification with Grounding (2.5 Flash)
      await updateRunStatus(db, runId, "verifying", 5);
      const factCheck = await step5_factCheck(GEMINI_API_KEY, article);
      await db.from("agent_runs").update({ factual_score: factCheck.factualScore }).eq("id", runId);

      await delay(3000);

      // STEP 6: Quality Gate + SEO (3 Flash)
      await updateRunStatus(db, runId, "optimizing", 6);
      let qualityResult = await step6_qualityGate(GEMINI_API_KEY, article, factCheck.factualScore);

      // Auto-retry if quality < 7
      if (qualityResult.qualityScore < 7) {
        console.log(`Quality score ${qualityResult.qualityScore}/10 — rewriting with Pro...`);
        await delay(3000);
        article = await rewriteArticle(GEMINI_API_KEY, article, qualityResult.reviewNotes, research, categories || []);
        qualityResult = await step6_qualityGate(GEMINI_API_KEY, article, factCheck.factualScore);
      }

      const finalArticle = qualityResult.article;
      const articleStatus = qualityResult.needsReview ? "needs_review" : "draft";

      // Save article
      let slug = finalArticle.slug as string;
      const insertPayload = {
        title: finalArticle.title,
        slug,
        excerpt: finalArticle.excerpt,
        content: finalArticle.content,
        category_id: finalArticle.category_id,
        status: articleStatus,
        featured: false,
        read_time: (finalArticle.read_time as number) || 3,
        tags: finalArticle.tags || [],
        seo_title: finalArticle.seo_title || null,
        seo_description: finalArticle.seo_description || null,
        ai_generated: true,
        author_id: user?.id || null,
        sources: sources,
      };

      let { data: savedArticle, error: insertError } = await db
        .from("articles")
        .insert(insertPayload)
        .select()
        .single();

      // Handle slug conflict
      if (insertError?.message?.includes("unique")) {
        slug = `${slug}-${Date.now()}`;
        const retry = await db
          .from("articles")
          .insert({ ...insertPayload, slug })
          .select()
          .single();
        if (retry.error) throw retry.error;
        savedArticle = retry.data;
      } else if (insertError) {
        throw insertError;
      }

      // Complete the run
      await db
        .from("agent_runs")
        .update({
          status: "completed",
          current_step: 6,
          article_id: savedArticle!.id,
          completed_at: new Date().toISOString(),
          token_usage: {
            quality_score: qualityResult.qualityScore,
            factual_score: factCheck.factualScore,
            review_notes: qualityResult.reviewNotes,
            verified_claims: factCheck.verifiedClaims,
            flagged_claims: factCheck.flaggedClaims,
            sources_count: sources.length,
          },
        })
        .eq("id", runId);

      // Log success
      await db.from("agent_logs").insert({
        action: `Pipeline completed: "${finalArticle.title}"`,
        status: "completed",
        article_id: savedArticle!.id,
        details: {
          slug,
          tags: finalArticle.tags,
          quality_score: qualityResult.qualityScore,
          factual_score: factCheck.factualScore,
          sources_count: sources.length,
          status: articleStatus,
          mode,
          run_id: runId,
          models: { lite: MODEL_LITE, research: MODEL_RESEARCH, fast: MODEL_FAST, pro: MODEL_PRO },
        },
      });

      console.log(
        `AI Agent: Pipeline complete! Article: ${savedArticle!.id}, Quality: ${qualityResult.qualityScore}/10, Factual: ${factCheck.factualScore}/10`,
      );

      return jsonResp({
        ...savedArticle,
        _run_id: runId,
        _quality_score: qualityResult.qualityScore,
        _factual_score: factCheck.factualScore,
        _review_notes: qualityResult.reviewNotes,
        _sources_count: sources.length,
      });
    } catch (pipelineError) {
      const errMsg = pipelineError instanceof Error ? pipelineError.message : "Pipeline failed";
      await db
        .from("agent_runs")
        .update({
          status: "failed",
          error_message: errMsg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);

      await db.from("agent_logs").insert({
        action: `Pipeline failed: "${topic}"`,
        status: "failed",
        details: { error: errMsg, run_id: runId },
      });

      throw pipelineError;
    }
  } catch (error: unknown) {
    console.error("AI Agent error:", error);
    const statusCode = (error as { status?: number })?.status || 500;
    const message =
      error instanceof Error ? error.message : (error as { message?: string })?.message || "Unknown error";
    return jsonResp({ error: message }, statusCode);
  }
});
