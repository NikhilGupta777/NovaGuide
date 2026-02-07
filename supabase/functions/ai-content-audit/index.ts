import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.5-flash";

async function callGemini(apiKey: string, prompt: string, systemInstruction: string) {
  const url = `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    if (resp.status === 429) {
      console.log("Rate limited, waiting 30s...");
      await delay(30000);
      return callGemini(apiKey, prompt, systemInstruction);
    }
    throw new Error(`Gemini error (${resp.status}): ${txt}`);
  }

  const data = await resp.json();
  const candidates = data.candidates || [];
  if (!candidates[0]?.content?.parts) return "";
  return candidates[0].content.parts.map((p: { text?: string }) => p.text || "").join("");
}

// ── Duplicate Detection ──────────────────────────────────────────

function findDuplicates(articles: { id: string; title: string; slug: string; content: string | null; status: string }[]) {
  const duplicates: { articleId: string; relatedId: string; articleTitle: string; relatedTitle: string; similarity: string }[] = [];

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i];
      const b = articles[j];

      // Check title similarity
      const titleA = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, "");
      const titleB = b.title.toLowerCase().replace(/[^a-z0-9\s]/g, "");

      // Exact or near-exact title match
      if (titleA === titleB || titleA.includes(titleB) || titleB.includes(titleA)) {
        duplicates.push({
          articleId: a.id, relatedId: b.id,
          articleTitle: a.title, relatedTitle: b.title,
          similarity: "title_match"
        });
        continue;
      }

      // Slug match
      if (a.slug === b.slug) {
        duplicates.push({
          articleId: a.id, relatedId: b.id,
          articleTitle: a.title, relatedTitle: b.title,
          similarity: "slug_match"
        });
      }
    }
  }

  return duplicates;
}

// ── AI Article Analysis (batch) ──────────────────────────────────

async function analyzeArticlesBatch(
  apiKey: string,
  articles: { id: string; title: string; content: string | null; excerpt: string | null }[]
): Promise<{
  articleId: string;
  issues: { type: string; severity: string; description: string; suggestion: string; autoFixable: boolean }[];
}[]> {

  const articlesText = articles.map((a, i) =>
    `--- ARTICLE ${i} (ID: ${a.id}) ---\nTitle: ${a.title}\nExcerpt: ${a.excerpt || "None"}\nContent (first 1500 chars):\n${(a.content || "").substring(0, 1500)}\n`
  ).join("\n");

  const systemPrompt = `You are an expert content editor and SEO specialist. Analyze each article for issues. For each article, identify:

1. **grammar** - Grammar, spelling, or punctuation errors
2. **wording** - Awkward phrasing, unclear sentences, or jargon without explanation
3. **seo** - Missing or poor SEO (title too long/short, weak excerpt, missing structure)
4. **factual** - Potentially outdated or incorrect information
5. **quality** - Low quality content, too short, or lacks depth
6. **formatting** - Poor markdown formatting, missing headers, walls of text

For each issue found, specify:
- type: one of the above categories
- severity: "critical", "warning", or "info"
- description: what the specific issue is
- suggestion: how to fix it
- autoFixable: true only for minor grammar/wording tweaks that can be fixed without changing meaning

Return ONLY a valid JSON array where each element has "articleId" (string) and "issues" (array of issue objects).
If an article has no issues, include it with an empty issues array.`;

  const result = await callGemini(apiKey, `Analyze these articles for issues:\n\n${articlesText}`, systemPrompt);

  try {
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Failed to parse audit results:", e);
  }

  return [];
}

// ── Auto-fix minor issues ────────────────────────────────────────

async function autoFixArticle(
  apiKey: string,
  article: { id: string; title: string; content: string | null; excerpt: string | null },
  issues: { type: string; description: string; suggestion: string }[]
): Promise<{ title?: string; content?: string; excerpt?: string; fixes: string[] } | null> {

  const issuesList = issues.map((iss, i) =>
    `${i + 1}. [${iss.type}] ${iss.description} → Suggestion: ${iss.suggestion}`
  ).join("\n");

  const systemPrompt = `You are a careful editor. Apply ONLY the specific minor fixes listed below to this article. Do NOT change meaning, tone, or structure. Only fix grammar, spelling, and awkward wording.

Return a JSON object with:
- "title": the corrected title (or same if no change)
- "content": the corrected full content (or same if no change)  
- "excerpt": the corrected excerpt (or same if no change)
- "fixes": array of strings describing each fix applied

IMPORTANT: Return the FULL content, not just the changed parts. Keep all formatting and structure intact.`;

  const prompt = `Article Title: ${article.title}
Excerpt: ${article.excerpt || "None"}
Content:
${(article.content || "").substring(0, 8000)}

Issues to fix:
${issuesList}

Apply only these minor fixes and return the corrected article as JSON.`;

  const result = await callGemini(apiKey, prompt, systemPrompt);

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Failed to parse auto-fix result:", e);
  }

  return null;
}

// ── Main Audit Orchestrator ──────────────────────────────────────

async function runContentAudit(autoFix: boolean) {
  const db = serviceClient();
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  // Create audit run
  const { data: runData } = await db.from("content_audit_runs").insert({
    status: "scanning",
    started_at: new Date().toISOString(),
  }).select().single();

  const runId = runData?.id;
  if (!runId) throw new Error("Failed to create audit run");

  try {
    // Load ALL articles
    const { data: articles, error } = await db.from("articles")
      .select("id, title, slug, content, excerpt, status, category_id")
      .order("created_at", { ascending: false });

    if (error) throw error;
    if (!articles || articles.length === 0) {
      await db.from("content_audit_runs").update({
        status: "completed",
        total_articles_scanned: 0,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
      return;
    }

    console.log(`Auditing ${articles.length} articles...`);

    let totalIssues = 0;
    let autoFixesApplied = 0;
    let duplicatesFound = 0;
    let articlesSetToDraft = 0;

    // Phase 1: Duplicate detection (local, fast)
    console.log("Phase 1: Detecting duplicates...");
    const duplicates = findDuplicates(articles);
    duplicatesFound = duplicates.length;

    for (const dup of duplicates) {
      // Insert finding
      await db.from("content_audit_findings").insert({
        run_id: runId,
        article_id: dup.articleId,
        article_title: dup.articleTitle,
        issue_type: "duplicate",
        severity: "critical",
        description: `Duplicate or near-duplicate of "${dup.relatedTitle}" (${dup.similarity})`,
        suggestion: "Consider merging these articles or removing the duplicate.",
        related_article_id: dup.relatedId,
        related_article_title: dup.relatedTitle,
        status: "open",
      });
      totalIssues++;

      // Auto-action: set the newer duplicate to draft if it's published
      const newerArticle = articles.find(a => a.id === dup.relatedId);
      if (newerArticle && newerArticle.status === "published") {
        await db.from("articles").update({ status: "draft" }).eq("id", dup.relatedId);
        articlesSetToDraft++;
        console.log(`Set duplicate to draft: "${dup.relatedTitle}"`);

        await db.from("content_audit_findings").insert({
          run_id: runId,
          article_id: dup.relatedId,
          article_title: dup.relatedTitle,
          issue_type: "auto_action",
          severity: "warning",
          description: `Automatically set to draft because it's a duplicate of "${dup.articleTitle}"`,
          suggestion: "Review and decide whether to merge, edit, or delete.",
          auto_fixed: true,
          fix_applied: "Set status from published to draft",
          status: "resolved",
        });
        totalIssues++;
      }
    }

    // Phase 2: AI-powered content analysis (in batches of 5)
    console.log("Phase 2: AI content analysis...");
    const BATCH_SIZE = 5;
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      console.log(`Analyzing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(articles.length / BATCH_SIZE)}...`);

      try {
        const results = await analyzeArticlesBatch(apiKey, batch);

        for (const result of results) {
          for (const issue of result.issues) {
            await db.from("content_audit_findings").insert({
              run_id: runId,
              article_id: result.articleId,
              article_title: batch.find(a => a.id === result.articleId)?.title || "Unknown",
              issue_type: issue.type,
              severity: issue.severity,
              description: issue.description,
              suggestion: issue.suggestion,
              status: "open",
            });
            totalIssues++;
          }

          // Phase 3: Auto-fix minor issues if enabled
          if (autoFix) {
            const fixableIssues = result.issues.filter(i => i.autoFixable);
            if (fixableIssues.length > 0) {
              const article = batch.find(a => a.id === result.articleId);
              if (article) {
                try {
                  const fixed = await autoFixArticle(apiKey, article, fixableIssues);
                  if (fixed && fixed.fixes && fixed.fixes.length > 0) {
                    const updatePayload: Record<string, unknown> = {};
                    if (fixed.title && fixed.title !== article.title) updatePayload.title = fixed.title;
                    if (fixed.content && fixed.content !== article.content) updatePayload.content = fixed.content;
                    if (fixed.excerpt && fixed.excerpt !== article.excerpt) updatePayload.excerpt = fixed.excerpt;

                    if (Object.keys(updatePayload).length > 0) {
                      await db.from("articles").update(updatePayload).eq("id", article.id);
                      autoFixesApplied++;

                      await db.from("content_audit_findings").insert({
                        run_id: runId,
                        article_id: article.id,
                        article_title: article.title,
                        issue_type: "auto_fix",
                        severity: "info",
                        description: `Auto-fixed ${fixed.fixes.length} minor issues`,
                        suggestion: fixed.fixes.join("; "),
                        auto_fixed: true,
                        fix_applied: fixed.fixes.join("; "),
                        status: "resolved",
                      });
                      totalIssues++;
                      console.log(`Auto-fixed ${fixed.fixes.length} issues in: "${article.title}"`);
                    }
                  }
                } catch (err) {
                  console.error(`Auto-fix failed for "${article.title}":`, err);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`Batch analysis error:`, err);
      }

      // Update progress
      await db.from("content_audit_runs").update({
        total_articles_scanned: Math.min(i + BATCH_SIZE, articles.length),
        total_issues_found: totalIssues,
        auto_fixes_applied: autoFixesApplied,
        duplicates_found: duplicatesFound,
        articles_set_to_draft: articlesSetToDraft,
      }).eq("id", runId);

      // Rate limit between batches
      if (i + BATCH_SIZE < articles.length) {
        await delay(3000);
      }
    }

    // Complete
    await db.from("content_audit_runs").update({
      status: "completed",
      total_articles_scanned: articles.length,
      total_issues_found: totalIssues,
      auto_fixes_applied: autoFixesApplied,
      duplicates_found: duplicatesFound,
      articles_set_to_draft: articlesSetToDraft,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);

    console.log(`Audit complete: ${articles.length} articles scanned, ${totalIssues} issues found, ${autoFixesApplied} auto-fixes, ${duplicatesFound} duplicates, ${articlesSetToDraft} set to draft`);

  } catch (err) {
    console.error("Content audit error:", err);
    await db.from("content_audit_runs").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
  }
}

// ── HTTP Handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: require admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResp({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (token !== serviceKey) {
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
    const autoFix = body.autoFix !== false; // default true

    console.log(`Content audit triggered (autoFix: ${autoFix})`);

    // Run in background
    runContentAudit(autoFix).catch((e) =>
      console.error("Content audit background error:", e)
    );

    return jsonResp({
      success: true,
      message: "Content audit started in background",
      autoFix,
    });
  } catch (err) {
    console.error("Content audit handler error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: msg }, 500);
  }
});
