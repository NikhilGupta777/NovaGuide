import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

// ── Helpers ──────────────────────────────────────────────────────────

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function authenticateAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw { status: 401, message: "Unauthorized" };

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error } = await userClient.auth.getUser();
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

async function callAI(apiKey: string, messages: unknown[], tools?: unknown[], toolChoice?: unknown) {
  const body: Record<string, unknown> = { model: MODEL, messages };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const resp = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("AI gateway error:", resp.status, txt);
    if (resp.status === 429) throw { status: 429, message: "AI rate limit exceeded. Please try again later." };
    if (resp.status === 402) throw { status: 402, message: "AI credits exhausted. Please add credits." };
    throw new Error(`AI gateway returned ${resp.status}`);
  }
  return resp.json();
}

async function updateRunStatus(db: ReturnType<typeof serviceClient>, runId: string, status: string, step: number, extra: Record<string, unknown> = {}) {
  await db.from("agent_runs").update({ status, current_step: step, ...extra }).eq("id", runId);
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Pipeline Steps ──────────────────────────────────────────────────

async function step1_research(apiKey: string, topic: string): Promise<{ research: string; sources: string[] }> {
  console.log("Pipeline Step 1: Deep Research for:", topic);

  const researchPrompt = `You are a world-class research analyst. Your job is to do deep research on a topic and produce comprehensive research notes.

TOPIC: "${topic}"

Produce thorough research notes covering:
1. **Core Problem**: What exact problem does this topic address? Who faces it?
2. **Key Solutions**: What are the main solutions/steps to solve this?
3. **Common Mistakes**: What do people typically get wrong?
4. **Platform/Device Specifics**: Are there differences across platforms (Windows, Mac, Android, iOS)?
5. **Recent Changes**: Any recent updates (2024-2025) that affect this topic?
6. **Expert Tips**: What do experts recommend that beginners miss?
7. **Related Issues**: What related problems might users also face?

You MUST respond using the research_notes function.`;

  const data = await callAI(apiKey, [
    { role: "system", content: researchPrompt },
    { role: "user", content: `Research this topic thoroughly: "${topic}"` },
  ], [
    {
      type: "function",
      function: {
        name: "research_notes",
        description: "Return structured research notes",
        parameters: {
          type: "object",
          properties: {
            research_summary: { type: "string", description: "Comprehensive research notes in Markdown, 500-800 words" },
            key_points: { type: "array", items: { type: "string" }, description: "5-10 key findings" },
            sources_consulted: { type: "array", items: { type: "string" }, description: "Types of sources consulted (e.g., 'Official documentation', 'User forums', 'Tech blogs')" },
            difficulty_level: { type: "string", enum: ["beginner", "intermediate", "advanced"], description: "Difficulty level of the topic" },
            estimated_word_count: { type: "number", description: "Recommended article word count based on topic complexity" },
          },
          required: ["research_summary", "key_points", "sources_consulted", "difficulty_level"],
          additionalProperties: false,
        },
      },
    },
  ], { type: "function", function: { name: "research_notes" } });

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("AI did not return research notes");
  const result = JSON.parse(toolCall.function.arguments);
  return { research: result.research_summary, sources: result.sources_consulted };
}

async function step2_outline(apiKey: string, topic: string, research: string): Promise<string> {
  console.log("Pipeline Step 2: Generate Outline");

  const data = await callAI(apiKey, [
    {
      role: "system",
      content: `You are an expert content strategist. Based on the research notes, create a detailed article outline.
      
The outline should follow this structure:
1. Hook / Introduction (grab attention, state the problem)
2. Why This Matters (brief context)
3. Step-by-Step Solution (the main content, 4-8 steps)
4. Troubleshooting / Common Issues
5. Quick Summary / Recap
6. Related Tips

Return ONLY the outline as a numbered/nested Markdown list. Be specific about what each section should cover.`,
    },
    { role: "user", content: `Topic: "${topic}"\n\nResearch Notes:\n${research}\n\nCreate a detailed article outline.` },
  ]);

  return data.choices?.[0]?.message?.content || "";
}

async function step3_write(apiKey: string, topic: string, research: string, outline: string, categories: { id: string; name: string }[], categoryId?: string): Promise<Record<string, unknown>> {
  console.log("Pipeline Step 3: Write Article");

  const categoryList = categories.map((c) => `${c.name} (ID: ${c.id})`).join(", ");

  const systemPrompt = `You are an expert tech writer for DigitalHelp, a beginner-friendly tech help website.
You write clear, step-by-step guides that solve everyday digital problems.

AVAILABLE CATEGORIES: ${categoryList}

Use the research notes and outline below to write a complete, high-quality help article.

RESEARCH NOTES:
${research}

ARTICLE OUTLINE:
${outline}

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

You MUST respond using the generate_article function.`;

  const data = await callAI(apiKey, [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Write the full article about: "${topic}"` },
  ], [
    {
      type: "function",
      function: {
        name: "generate_article",
        description: "Generate a structured help article with all required fields",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "SEO-friendly article title, clear and descriptive, under 70 chars" },
            slug: { type: "string", description: "URL-friendly slug, lowercase with hyphens, no special chars" },
            excerpt: { type: "string", description: "Brief 1-2 sentence summary for search results and previews" },
            content: { type: "string", description: "Full article content in Markdown" },
            category_id: { type: "string", description: "UUID of the best matching category" },
            tags: { type: "array", items: { type: "string" }, description: "3-8 relevant tags" },
            read_time: { type: "number", description: "Estimated reading time in minutes" },
            seo_title: { type: "string", description: "SEO meta title under 60 characters" },
            seo_description: { type: "string", description: "SEO meta description under 160 characters" },
          },
          required: ["title", "slug", "excerpt", "content", "category_id", "tags", "read_time", "seo_title", "seo_description"],
          additionalProperties: false,
        },
      },
    },
  ], { type: "function", function: { name: "generate_article" } });

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("AI did not return a structured article");
  const article = JSON.parse(toolCall.function.arguments);
  if (categoryId) article.category_id = categoryId;
  return article;
}

async function step4_quality_check(apiKey: string, article: Record<string, unknown>): Promise<Record<string, unknown>> {
  console.log("Pipeline Step 4: Quality & SEO Check");

  const data = await callAI(apiKey, [
    {
      role: "system",
      content: `You are a senior editor and SEO specialist. Review this article and provide improvements.
      
Check for:
1. Clarity and readability for beginners
2. SEO optimization (title, description, headings)
3. Completeness of steps
4. Grammar and tone consistency
5. Missing information

Return your review using the quality_review function.`,
    },
    {
      role: "user",
      content: `Review this article:\n\nTitle: ${article.title}\nExcerpt: ${article.excerpt}\n\nContent:\n${article.content}\n\nSEO Title: ${article.seo_title}\nSEO Description: ${article.seo_description}\nTags: ${(article.tags as string[])?.join(", ")}`,
    },
  ], [
    {
      type: "function",
      function: {
        name: "quality_review",
        description: "Return quality improvements",
        parameters: {
          type: "object",
          properties: {
            quality_score: { type: "number", description: "Quality score out of 10" },
            improved_title: { type: "string", description: "Improved title if needed, or same title" },
            improved_seo_title: { type: "string", description: "Improved SEO title under 60 chars" },
            improved_seo_description: { type: "string", description: "Improved SEO description under 160 chars" },
            additional_tags: { type: "array", items: { type: "string" }, description: "Any additional relevant tags" },
            review_notes: { type: "string", description: "Brief review notes" },
          },
          required: ["quality_score", "improved_title", "improved_seo_title", "improved_seo_description", "review_notes"],
          additionalProperties: false,
        },
      },
    },
  ], { type: "function", function: { name: "quality_review" } });

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return article;

  const review = JSON.parse(toolCall.function.arguments);
  
  // Apply improvements
  article.title = review.improved_title || article.title;
  article.seo_title = review.improved_seo_title || article.seo_title;
  article.seo_description = review.improved_seo_description || article.seo_description;
  if (review.additional_tags?.length) {
    const existingTags = (article.tags as string[]) || [];
    article.tags = [...new Set([...existingTags, ...review.additional_tags])].slice(0, 8);
  }

  return { ...article, _quality_score: review.quality_score, _review_notes: review.review_notes };
}

// ── Main Handler ────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { user, db } = await authenticateAdmin(req);
    const { topic, categoryId, mode = "manual" } = await req.json();

    if (!topic) return jsonResp({ error: "Topic is required" }, 400);

    console.log(`AI Agent: Starting ${mode} pipeline for: "${topic}"`);

    // Create pipeline run record
    const { data: run, error: runError } = await db
      .from("agent_runs")
      .insert({ topic, mode, status: "researching", current_step: 1, total_steps: 4 })
      .select()
      .single();
    if (runError) {
      console.error("Failed to create run:", runError);
      throw runError;
    }

    const runId = run.id;

    try {
      // STEP 1: Deep Research
      await updateRunStatus(db, runId, "researching", 1);
      const { research, sources } = await step1_research(LOVABLE_API_KEY, topic);
      await db.from("agent_runs").update({ research_notes: research, research_sources: sources }).eq("id", runId);

      // STEP 2: Generate Outline
      await updateRunStatus(db, runId, "outlining", 2);
      const outline = await step2_outline(LOVABLE_API_KEY, topic, research);
      await db.from("agent_runs").update({ generated_outline: outline }).eq("id", runId);

      // STEP 3: Write Article
      await updateRunStatus(db, runId, "writing", 3);
      const { data: categories } = await db.from("categories").select("id, name, slug").order("sort_order");
      const article = await step3_write(LOVABLE_API_KEY, topic, research, outline, categories || [], categoryId);

      // STEP 4: Quality Check & SEO
      await updateRunStatus(db, runId, "optimizing", 4);
      const finalArticle = await step4_quality_check(LOVABLE_API_KEY, article);

      // Save article
      const qualityScore = (finalArticle as Record<string, unknown>)._quality_score;
      const reviewNotes = (finalArticle as Record<string, unknown>)._review_notes;
      delete (finalArticle as Record<string, unknown>)._quality_score;
      delete (finalArticle as Record<string, unknown>)._review_notes;

      let slug = finalArticle.slug as string;
      const insertPayload = {
        title: finalArticle.title,
        slug,
        excerpt: finalArticle.excerpt,
        content: finalArticle.content,
        category_id: finalArticle.category_id,
        status: "draft",
        featured: false,
        read_time: (finalArticle.read_time as number) || 3,
        tags: finalArticle.tags || [],
        seo_title: finalArticle.seo_title || null,
        seo_description: finalArticle.seo_description || null,
        ai_generated: true,
        author_id: user.id,
      };

      let { data: savedArticle, error: insertError } = await db.from("articles").insert(insertPayload).select().single();

      // Handle slug conflict
      if (insertError?.message?.includes("unique")) {
        slug = `${slug}-${Date.now()}`;
        const retry = await db.from("articles").insert({ ...insertPayload, slug }).select().single();
        if (retry.error) throw retry.error;
        savedArticle = retry.data;
      } else if (insertError) {
        throw insertError;
      }

      // Complete the run
      await db.from("agent_runs").update({
        status: "completed",
        current_step: 4,
        article_id: savedArticle!.id,
        completed_at: new Date().toISOString(),
        token_usage: { quality_score: qualityScore, review_notes: reviewNotes },
      }).eq("id", runId);

      // Log success
      await db.from("agent_logs").insert({
        action: `Pipeline completed: "${finalArticle.title}"`,
        status: "completed",
        article_id: savedArticle!.id,
        details: { slug, tags: finalArticle.tags, quality_score: qualityScore, mode, run_id: runId },
      });

      console.log("AI Agent: Pipeline complete!", savedArticle!.id);

      return jsonResp({
        ...savedArticle,
        _run_id: runId,
        _quality_score: qualityScore,
        _review_notes: reviewNotes,
      });

    } catch (pipelineError) {
      // Mark run as failed
      const errMsg = pipelineError instanceof Error ? pipelineError.message : "Pipeline failed";
      await db.from("agent_runs").update({
        status: "failed",
        error_message: errMsg,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);

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
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message || "Unknown error";
    return jsonResp({ error: message }, statusCode);
  }
});
