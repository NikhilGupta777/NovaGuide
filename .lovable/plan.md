

# Upgrade AI Agent to Use Your Google Gemini API Directly

## What Changes and Why

Right now, the AI agent uses the Lovable AI Gateway, which proxies to Gemini models. This works, but it has limitations:

- **No real web search** -- the AI "researches" from its training data, not from the live internet
- **No Grounding with Google Search** -- a Gemini-specific feature that lets the AI pull real-time facts from the web and return actual source URLs
- **Limited model selection** -- only the models available through the gateway
- **No Deep Research** -- your paid API includes Deep Research Pro Preview, which does multi-step internet research automatically

By switching to your Google Gemini API key directly, we unlock:

1. **Grounding with Google Search** -- Every research step will search the real internet, pull facts from live websites, and return actual source citations
2. **Multiple specialized models** -- Use the right model for each pipeline step (Deep Research for research, Flash for speed tasks, Pro for quality writing)
3. **Real source URLs** -- Articles will include actual references to where the information came from
4. **Higher quality articles** -- Grounded in real, current information rather than training data

---

## Architecture: Multi-Model Pipeline

Each pipeline step will use the best Gemini model for that job:

```text
Step 1: Topic Discovery + Duplicate Check
  Model: Gemini 2.5 Flash (fast, cheap)
  Purpose: Find topics, check against existing articles

Step 2: Deep Web Research
  Model: Gemini 2.5 Flash WITH Google Search Grounding
  Purpose: Search the real internet, gather facts with source URLs
  Key Feature: googleSearch tool returns real citations

Step 3: Outline Generation
  Model: Gemini 2.5 Flash (fast)
  Purpose: Structure the article based on real research

Step 4: Article Writing
  Model: Gemini 2.5 Pro (highest quality)
  Purpose: Write the full article with embedded source references

Step 5: Fact Verification
  Model: Gemini 2.5 Flash WITH Google Search Grounding
  Purpose: Cross-check key claims against live web, assign factual score

Step 6: Quality Gate + SEO Optimization
  Model: Gemini 2.5 Flash (fast)
  Purpose: Score quality, improve SEO, auto-retry if score < 7/10
```

---

## What Gets Built

### 1. Store Your Gemini API Key Securely
- You will be prompted to provide your Google Gemini API key
- It gets stored as a secure secret (`GEMINI_API_KEY`) accessible only by backend functions
- Never exposed to the frontend

### 2. Upgraded `ai-agent` Edge Function (6-Step Pipeline)
The core pipeline is rewritten to call Google's Gemini API directly at `https://generativelanguage.googleapis.com/v1beta/`:

**Step 1 -- Duplicate Check**: Before generating, compare topic against all existing article titles using AI similarity scoring. Skip if 80%+ similar content exists.

**Step 2 -- Deep Web Research with Grounding**: Call Gemini with the `googleSearch` tool enabled. The model will:
  - Search the real internet for current information
  - Return grounded facts with actual source URLs
  - Produce 500-800 word research notes based on real web content
  - Store source URLs (not just "types of sources")

**Step 3 -- Outline Generation**: Same as current, but now based on real researched facts.

**Step 4 -- Article Writing**: Uses Gemini 2.5 Pro for highest quality writing. Embeds real source references in the article content.

**Step 5 -- Fact Verification (NEW)**: A second grounded search pass that:
  - Extracts 3-5 key claims from the article
  - Searches the web to verify each claim
  - Assigns a factual confidence score (0-10)
  - Flags any unverifiable claims

**Step 6 -- Quality Gate + SEO (NEW)**: 
  - Scores overall quality (0-10)
  - If score < 7: auto-rewrites the article (one retry)
  - If still below 7 after retry: saves as `needs_review` status
  - Optimizes SEO title, description, and tags

### 3. Upgraded `ai-auto-discover` Edge Function
- Also switches to direct Gemini API with Google Search Grounding
- Discovers topics based on what people are actually searching for right now
- Returns real trending topics, not just AI-generated guesses

### 4. New `ai-scheduled-runner` Edge Function
A new function that enables fully autonomous operation:
- Reads settings from `auto_generation_settings` table
- If enabled, discovers topics and runs the full pipeline
- Designed to be triggered by a database scheduled job (pg_cron)
- Processes articles one at a time with delays to respect rate limits
- Logs everything to `agent_logs`
- All articles saved as `draft` -- nothing publishes without your approval

### 5. Database Changes
- Add `sources` column (JSONB) to `articles` table -- stores actual source URLs for each article
- Add `factual_score` column (integer) to `agent_runs` table -- tracks fact-verification score
- Update `agent_runs.total_steps` default from 4 to 6
- Enable `pg_cron` and `pg_net` extensions for scheduled autonomous runs
- Create a cron job entry that triggers `ai-scheduled-runner` based on your configured frequency

### 6. Updated Admin UI (AIAgentPanel)
- Pipeline visualizer updated to show 6 steps instead of 4
- New "Automation" mode tab alongside Generate, Discover, and Batch
- Automation controls: enable/disable, frequency selector, articles per run, target categories
- Display last run info, next scheduled run, success/fail counts
- Emergency stop button
- Show factual score and source count in pipeline run details
- Status filter includes `needs_review` for articles that failed quality gate

---

## How the Google Search Grounding Works

When we call Gemini with the `googleSearch` tool, the API response includes:
- `groundingMetadata.groundingChunks` -- actual web content used
- `groundingMetadata.webSearchQueries` -- what searches were performed  
- `groundingMetadata.groundingSupports` -- which parts of the response are supported by which sources

This means every article produced will have real, verifiable sources attached to it.

---

## How Autonomous Mode Works End-to-End

1. You enable automation in Admin > AI Agent > Automation tab
2. You set frequency (e.g., "Every 12 hours") and articles per run (e.g., 3)
3. A database scheduled job calls `ai-scheduled-runner` at that interval
4. The runner reads your settings, discovers topics with real web search, and runs the full 6-step pipeline
5. Articles scoring 7+ quality are saved as "draft"
6. Articles below 7 are retried once, then saved as "needs_review"
7. You review everything in the admin panel and click "Go Live" when ready
8. Full audit trail in `agent_logs` and `agent_runs`

---

## Safety Controls

- **Nothing auto-publishes** -- all articles require you to click "Go Live"
- **Quality gate** -- articles below 7/10 get flagged for review
- **Duplicate detection** -- prevents generating the same content twice
- **Rate limiting** -- 3-second delay between API calls, configurable articles per run
- **Emergency stop** -- disable automation instantly from admin panel
- **Full logging** -- every step, success, and failure is recorded

---

## Technical Summary

| Component | Change |
|---|---|
| Secret | Add `GEMINI_API_KEY` |
| `ai-agent/index.ts` | Rewrite: 6-step pipeline, direct Gemini API, Google Search Grounding, multi-model |
| `ai-auto-discover/index.ts` | Update: direct Gemini API with grounding |
| `ai-scheduled-runner/index.ts` | NEW: autonomous orchestrator for cron-triggered runs |
| Database migration | Add columns, enable pg_cron/pg_net, create cron job |
| `AIAgentPanel.tsx` | Update: 6-step visualizer, automation controls tab |
| `AdminDashboard.tsx` | Add `needs_review` status filter |
| `supabase/config.toml` | Add `ai-scheduled-runner` function entry |

