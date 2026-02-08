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

async function callAI(apiKey: string, prompt: string, systemInstruction: string): Promise<string> {
  const url = `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${apiKey}`;

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
    if (resp.status === 429) {
      console.log("Rate limited, waiting 15s...");
      await delay(15000);
      return callAI(apiKey, prompt, systemInstruction);
    }
    throw new Error(`Gemini API error (${resp.status}): ${txt}`);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ── Duplicate Detection ──────────────────────────────────────────

function findDuplicates(articles: { id: string; title: string; slug: string; content: string | null; status: string }[]) {
  const duplicates: { articleId: string; relatedId: string; articleTitle: string; relatedTitle: string; similarity: string }[] = [];

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const a = articles[i];
      const b = articles[j];

      const titleA = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, "");
      const titleB = b.title.toLowerCase().replace(/[^a-z0-9\s]/g, "");

      if (titleA === titleB || (titleA.length > 10 && titleB.length > 10 && (titleA.includes(titleB) || titleB.includes(titleA)))) {
        duplicates.push({
          articleId: a.id, relatedId: b.id,
          articleTitle: a.title, relatedTitle: b.title,
          similarity: "title_match"
        });
        continue;
      }

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
    `--- ARTICLE ${i} (ID: ${a.id}) ---\nTitle: ${a.title}\nExcerpt: ${a.excerpt || "None"}\nContent (first 2000 chars):\n${(a.content || "").substring(0, 2000)}\n`
  ).join("\n");

  const systemPrompt = `You are an expert content editor and SEO specialist. Analyze each article for issues. For each article, identify:

1. **grammar** - Grammar, spelling, or punctuation errors
2. **wording** - Awkward phrasing, unclear sentences, or jargon without explanation
3. **seo** - Missing or poor SEO (title too long/short, weak excerpt, missing structure, duplicate H1)
4. **factual** - Potentially outdated or incorrect information, speculative future dates
5. **quality** - Low quality content, too short, incomplete, or lacks depth (includes truncated/cut-off content)
6. **formatting** - Poor markdown formatting, missing headers, walls of text

IMPORTANT RULES:
- Do NOT report the same issue under multiple categories. Each problem should only appear ONCE under the MOST appropriate category.
- If content is truncated/cut-off/incomplete, report it ONLY as "quality" (not also as "formatting").
- If an article has both formatting AND quality issues for the same truncation, merge them into ONE "quality" finding.

For each issue found, specify:
- type: one of the above categories
- severity: "critical" (must fix), "warning" (should fix), or "info" (nice to fix)
- description: what the specific issue is (be concrete, quote the problematic text)
- suggestion: exactly how to fix it (be specific and actionable)
- autoFixable: true ONLY for simple grammar fixes, typo corrections, or minor wording improvements. NEVER mark "quality" issues (incomplete/truncated content) as autoFixable.

Return ONLY a valid JSON array where each element has "articleId" (string) and "issues" (array of issue objects).
If an article has no issues, include it with an empty issues array.
Be thorough but avoid false positives and duplicate findings.`;

  const result = await callAI(apiKey, `Analyze these articles for issues:\n\n${articlesText}`, systemPrompt);

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

  const result = await callAI(apiKey, prompt, systemPrompt);

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

    // Update progress after phase 1
    await db.from("content_audit_runs").update({
      duplicates_found: duplicatesFound,
      articles_set_to_draft: articlesSetToDraft,
      total_issues_found: totalIssues,
    }).eq("id", runId);

    // Phase 2: AI-powered content analysis (in batches of 3 for reliability)
    console.log("Phase 2: AI content analysis...");
    const BATCH_SIZE = 3;
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
        await delay(2000);
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

    console.log(`Audit complete: ${articles.length} scanned, ${totalIssues} issues, ${autoFixesApplied} auto-fixes`);

  } catch (err) {
    console.error("Content audit error:", err);
    await db.from("content_audit_runs").update({
      status: "failed",
      error_message: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
  }
}

// ── Apply Fix to Single Article ──────────────────────────────────

async function applyFixToArticle(findingId: string) {
  const db = serviceClient();
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  // Get finding
  const { data: finding } = await db.from("content_audit_findings")
    .select("*")
    .eq("id", findingId)
    .single();

  if (!finding) throw new Error("Finding not found");
  if (!finding.article_id) throw new Error("No article associated with this finding");

  // Get article
  const { data: article } = await db.from("articles")
    .select("id, title, content, excerpt")
    .eq("id", finding.article_id)
    .single();

  if (!article) throw new Error("Article not found");

  // Detect if this is a truncated/incomplete article issue
  const isTruncationIssue = finding.issue_type === "quality" && (
    finding.description.toLowerCase().includes("incomplete") ||
    finding.description.toLowerCase().includes("truncat") ||
    finding.description.toLowerCase().includes("cut off") ||
    finding.description.toLowerCase().includes("cuts off") ||
    finding.description.toLowerCase().includes("abruptly ends") ||
    finding.description.toLowerCase().includes("mid-sentence") ||
    finding.description.toLowerCase().includes("mid-header")
  );

  let systemPrompt: string;
  let prompt: string;

  if (isTruncationIssue) {
    // For truncated articles, regenerate the FULL content
    systemPrompt = `You are an expert tech writer. The article below is TRUNCATED/INCOMPLETE — its content was cut off during generation. You must COMPLETE it fully.

CRITICAL INSTRUCTIONS:
- Write the COMPLETE article from start to finish based on the title and excerpt
- The article MUST fulfill everything promised in the title and excerpt
- Use proper markdown formatting with ## for main sections
- Include all steps, tips, and explanations mentioned in the title
- Make it comprehensive, well-structured, and at least 1500 words
- Do NOT start content with an H1 heading (the title serves as H1)
- Start with a compelling introduction paragraph

Return a JSON object with:
- "title": the article title (keep the same)
- "content": the COMPLETE article content in markdown
- "excerpt": a compelling excerpt (1-2 sentences)
- "fixDescription": "Regenerated complete article content to replace truncated version"`;

    prompt = `Article Title: ${article.title}
Excerpt: ${article.excerpt || "None"}

Current TRUNCATED content (this is incomplete and needs to be fully rewritten):
${(article.content || "").substring(0, 2000)}

Issue: ${finding.description}

Write the COMPLETE article from scratch. Return as JSON.`;
  } else {
    systemPrompt = `You are a careful editor. Apply the specific fix described below to this article. Maintain the overall tone and structure.

CRITICAL: You MUST actually make changes to fix the issue. If the issue describes a real problem, fix it. Do NOT claim "no changes needed" — that means you failed to fix it.
- Do NOT add placeholder citations like [Source 1] or [Source 2] — either find real sources or remove unsourced claims
- Do NOT add H1 headings to content (the article title serves as H1)

Return a JSON object with:
- "title": corrected title
- "content": corrected FULL content (not just the changed parts)
- "excerpt": corrected excerpt  
- "fixDescription": one sentence describing what you ACTUALLY changed (must describe a real change, not "no changes were necessary")
- "changesApplied": true if you made actual changes, false if no changes were needed`;

    prompt = `Article Title: ${article.title}
Excerpt: ${article.excerpt || "None"}
Content:
${article.content || ""}

Issue: ${finding.description}
Suggestion: ${finding.suggestion}

Apply this fix and return the corrected article as JSON.`;
  }

  const result = await callAI(apiKey, prompt, systemPrompt);

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI did not return valid JSON");

  const fixed = JSON.parse(jsonMatch[0]);
  const updatePayload: Record<string, unknown> = {};
  if (fixed.title && fixed.title !== article.title) updatePayload.title = fixed.title;
  if (fixed.content && fixed.content !== article.content) updatePayload.content = fixed.content;
  if (fixed.excerpt && fixed.excerpt !== article.excerpt) updatePayload.excerpt = fixed.excerpt;

  const actuallyChanged = Object.keys(updatePayload).length > 0;

  if (actuallyChanged) {
    await db.from("articles").update(updatePayload).eq("id", article.id);
    // Mark finding as resolved only if we made real changes
    await db.from("content_audit_findings").update({
      status: "resolved",
      auto_fixed: true,
      fix_applied: fixed.fixDescription || "Applied AI-suggested fix",
    }).eq("id", findingId);
  } else {
    // No changes made — mark as "skipped" not "resolved"
    await db.from("content_audit_findings").update({
      fix_applied: "No changes could be applied — manual review needed",
      status: "open", // Keep open so user knows it needs attention
    }).eq("id", findingId);
    console.log(`No actual changes for finding ${findingId} — keeping open`);
  }

  return { fixed: actuallyChanged, description: fixed.fixDescription };
}

// ── HTTP Handler ──────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    // Handle "apply fix" action
    if (body.action === "apply_fix" && body.findingId) {
      console.log(`Applying fix to finding: ${body.findingId}`);
      const result = await applyFixToArticle(body.findingId);
      return jsonResp({ success: true, ...result });
    }

    // Handle "fix all" action - runs entirely server-side, updates DB for progress
    if (body.action === "fix_all" && body.runId) {
      console.log(`Fixing all open findings for run: ${body.runId}`);
      const db = serviceClient();

      // Mark run as fixing
      await db.from("content_audit_runs").update({ fix_all_status: "fixing" }).eq("id", body.runId);

      const { data: openFindings } = await db.from("content_audit_findings")
        .select("id, article_id, suggestion")
        .eq("run_id", body.runId)
        .eq("status", "open")
        .not("article_id", "is", null)
        .not("suggestion", "is", null);

      if (!openFindings || openFindings.length === 0) {
        await db.from("content_audit_runs").update({ fix_all_status: "fixed" }).eq("id", body.runId);
        return jsonResp({ success: true, fixed: 0, message: "No fixable findings found" });
      }

      // Fire-and-forget: respond immediately, process in background
      const backgroundWork = (async () => {
        let fixed = 0;
        let failed = 0;
        for (const finding of openFindings) {
          try {
            await applyFixToArticle(finding.id);
            fixed++;
            console.log(`Fixed ${fixed}/${openFindings.length}`);
            // Update auto_fixes_applied count on the run for progress tracking
            await db.from("content_audit_runs").update({
              auto_fixes_applied: fixed,
            }).eq("id", body.runId);
            if (fixed < openFindings.length) await delay(2000);
          } catch (err) {
            console.error(`Failed to fix finding ${finding.id}:`, err);
            failed++;
          }
        }
        await db.from("content_audit_runs").update({ fix_all_status: "fixed" }).eq("id", body.runId);
        console.log(`Fix all complete: ${fixed} fixed, ${failed} failed out of ${openFindings.length}`);
      })();

      // Use waitUntil for true background execution (survives client disconnect)
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(backgroundWork);
        return jsonResp({ success: true, message: "Fix all started in background", total: openFindings.length });
      }

      // Fallback: await (still works but won't survive timeout)
      await backgroundWork;
      return jsonResp({ success: true, message: "Fix all completed server-side" });
    }

    const autoFix = body.autoFix !== false;
    console.log(`Content audit triggered (autoFix: ${autoFix})`);

    // Run in background so it survives client disconnect / container timeout
    const work = (async () => {
      try {
        await runContentAudit(autoFix);
      } catch (e) {
        console.error("Content audit execution error:", e);
      }
    })();

    // @ts-ignore - EdgeRuntime.waitUntil available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(work);
      return jsonResp({ success: true, message: "Content audit started in background" });
    }

    // Fallback: await
    await work;
    return jsonResp({ success: true, message: "Content audit completed" });
  } catch (err) {
    console.error("Content audit handler error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResp({ error: msg }, 500);
  }
});
