

# Nightly Content Builder -- Deep Research Autonomous Pipeline

## Overview

A fully autonomous content generation system that runs nightly at 12:00 AM IST. It uses the **Gemini Deep Research Agent** (via the Interactions API at `/v1beta/interactions`) -- not basic Google Search grounding -- to perform comprehensive, multi-step web research across all categories. It discovers 30-100+ common questions per category, filters out duplicates against every existing article (draft + published), optionally creates new categories, then generates all articles through the existing 6-step `ai-agent` pipeline with auto-publish.

If the discovered topics exceed ~30 per category in one batch, overflow topics are queued for 12:00 PM IST and 6:00 PM IST batches, ensuring everything gets covered within 24 hours.

**This is a completely separate system** -- the existing `ai-scheduled-runner` and all 4 existing AI Agent tabs remain untouched.

---

## How It Works

```text
DAILY CYCLE (3 time slots):

12:00 AM IST (18:30 UTC) -- MAIN RUN
+-----------------------------------------------+
| 1. Load ALL categories + ALL articles         |
|    (draft + published, titles + slugs)        |
| 2. Deep Research per category via             |
|    Interactions API (30-100 questions each)    |
| 3. Filter duplicates against existing         |
| 4. Identify missing categories, create them   |
| 5. Split topics into 3 batches by time slot   |
| 6. Generate Batch 1 articles via ai-agent     |
| 7. Auto-publish if quality+factual >= 7       |
+-----------------------------------------------+

12:00 PM IST (06:30 UTC) -- OVERFLOW BATCH 2
+-----------------------------------------------+
| Pick up queued Batch 2 topics                 |
| Generate articles via ai-agent pipeline       |
| Auto-publish passing articles                 |
+-----------------------------------------------+

6:00 PM IST (12:30 UTC) -- OVERFLOW BATCH 3
+-----------------------------------------------+
| Pick up remaining Batch 3 topics              |
| Generate remaining articles                   |
| Auto-publish passing articles                 |
+-----------------------------------------------+

Next day 12:00 AM -- New research cycle begins
```

---

## Deep Research API (Not Google Search Grounding)

The key difference from the existing system: instead of calling `generateContent` with `google_search` tools (basic grounding), this uses the **Interactions API** which triggers a full multi-step research agent that reads dozens of sources, synthesizes findings, and produces comprehensive reports.

```text
REST API Flow:

1. START RESEARCH (async):
   POST https://generativelanguage.googleapis.com/v1beta/interactions
   Headers: x-goog-api-key: GEMINI_API_KEY
   Body: {
     "input": "<research prompt with full site context>",
     "agent": "deep-research-pro-preview-12-2025",
     "background": true
   }
   Response: { "id": "INTERACTION_ID", ... }

2. POLL FOR COMPLETION:
   GET https://generativelanguage.googleapis.com/v1beta/interactions/INTERACTION_ID
   Headers: x-goog-api-key: GEMINI_API_KEY
   Response: { "status": "COMPLETED", "outputs": [...] }
   (Poll every 10 seconds until status is COMPLETED)
```

This performs real multi-step deep web research -- far more thorough than basic search grounding.

---

## What Gets Built

### 1. Database Table: `nightly_builder_settings`

Configuration for the nightly builder (separate from existing `auto_generation_settings`).

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| id | uuid | auto | Primary key |
| enabled | boolean | false | Master on/off |
| topics_per_category | integer | 50 | How many topics to research per category (30-100) |
| auto_publish_min_quality | integer | 7 | Min quality score for auto-publish (1-10) |
| auto_publish_min_factual | integer | 7 | Min factual score for auto-publish (1-10) |
| allow_category_creation | boolean | true | Let AI create new categories |
| stop_requested | boolean | false | Emergency stop flag |
| last_run_at | timestamptz | null | When last run started |
| next_run_at | timestamptz | null | Next scheduled run |
| created_at / updated_at | timestamptz | now() | Timestamps |

RLS: Admin-only access (matching existing patterns).

### 2. Database Table: `nightly_builder_runs`

Tracks each nightly run execution.

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| id | uuid | auto | Primary key |
| status | text | 'pending' | pending/researching/generating/completed/failed/stopped |
| batch_number | integer | 1 | Which batch (1=midnight, 2=noon, 3=evening) |
| total_categories_processed | integer | 0 | Categories researched |
| categories_created | integer | 0 | New categories made by AI |
| total_topics_found | integer | 0 | Raw topics discovered |
| total_after_dedup | integer | 0 | After removing duplicates |
| articles_generated | integer | 0 | Successfully created |
| articles_published | integer | 0 | Auto-published |
| articles_failed | integer | 0 | Failed generation |
| details | jsonb | {} | Per-category breakdown |
| error_message | text | null | Error if failed |
| started_at / completed_at | timestamptz | | Timing |
| created_at | timestamptz | now() | Record creation |

RLS: Admin-only.

### 3. Database Table: `nightly_builder_queue`

Stores discovered topics split across time-slot batches.

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| id | uuid | auto | Primary key |
| run_date | date | today | Which day this belongs to |
| batch_number | integer | 1 | 1=midnight, 2=noon, 3=evening |
| topic | text | | The question/topic |
| category_id | uuid | | Target category |
| priority | integer | 0 | Sort order (lower = higher priority) |
| status | text | 'pending' | pending/processing/completed/failed/skipped |
| article_id | uuid | null | Linked article after generation |
| error_message | text | null | Error details if failed |
| created_at | timestamptz | now() | |

RLS: Admin-only.

### 4. New Edge Function: `ai-nightly-builder`

The main orchestrator function. Accepts a `batch` parameter (1, 2, or 3).

**Batch 1 (Midnight) -- Full Research + Generation:**

- **Phase A -- Full Knowledge Gathering:**
  - Loads ALL categories from the database
  - Loads ALL articles (draft + published) with title, slug, category_id, status
  - Builds a complete knowledge map of what exists on the site

- **Phase B -- Deep Research per Category (Interactions API):**
  - For each category, starts a Deep Research interaction via POST to `/v1beta/interactions` with `agent: "deep-research-pro-preview-12-2025"` and `background: true`
  - The prompt includes all existing article titles for that category so it avoids suggesting duplicates
  - Polls every 10 seconds until the research completes
  - Deep Research performs multi-step web research internally (reads dozens of sources, synthesizes findings)
  - Parses the research output into structured topics using Gemini Flash with JSON output mode

- **Phase C -- Deduplication:**
  - Cross-references all discovered topics against existing article titles using Gemini Flash Lite for fuzzy matching
  - Removes topics that are too similar to existing content

- **Phase D -- Smart Category Creation (if enabled):**
  - After all categories are processed, a final Deep Research call asks: "What major tech help categories are missing from this website?"
  - If valid gaps are found (e.g., "Smart Home", "Privacy & VPN", "Email"), creates new categories in the database with proper name, slug, description, and a safe icon from the existing icon set (defaults to "Lightbulb")
  - Researches topics for new categories too

- **Phase E -- Queue Splitting:**
  - All unique topics are inserted into `nightly_builder_queue`
  - First ~30 topics per category go to batch 1 (processed immediately)
  - Next batch goes to batch 2 (12 PM IST)
  - Remaining go to batch 3 (6 PM IST)
  - No hard limit on total articles -- generates as many as discovered

- **Phase F -- Article Generation:**
  - For each batch 1 topic, calls the existing `ai-agent` edge function internally via HTTP with the service-role key
  - 5-second delay between articles to respect rate limits
  - Checks `stop_requested` flag in settings before each article
  - After each article is generated, checks quality + factual scores against thresholds
  - If both scores >= threshold: auto-publishes (sets status to "published" with `published_at`)
  - If below threshold: keeps as "draft" for manual review

**Batch 2 and 3 (Noon/Evening) -- Queue Processing Only:**
- No research phase -- just picks up pending topics from `nightly_builder_queue` for the matching batch number
- Generates articles through the same ai-agent pipeline
- Same auto-publish logic
- Same stop check

**Background Execution:**
- Uses `EdgeRuntime.waitUntil()` pattern -- returns an immediate acknowledgment response, then continues processing in the background (critical since generating many articles takes significant time)

### 5. Three Cron Jobs (pg_cron + pg_net)

| Schedule (UTC) | IST Time | Purpose |
|---------------|----------|---------|
| `30 18 * * *` | 12:00 AM IST | Main run: Deep Research + Batch 1 generation |
| `30 6 * * *` | 12:00 PM IST | Batch 2: overflow topic generation |
| `30 12 * * *` | 6:00 PM IST | Batch 3: remaining topic generation |

Each calls `ai-nightly-builder` with the appropriate batch number in the request body.

### 6. Admin UI -- New "Nightly Builder" Tab

Added as a 5th tab in the `AIAgentPanel` component (existing 4 tabs remain unchanged). The tab grid changes from `grid-cols-4` to `grid-cols-5`.

**Configuration Controls:**
- Enable/Disable toggle (master switch)
- "Topics per category" slider (30-100, default 50)
- "Auto-publish quality threshold" slider (5-10, default 7)
- "Auto-publish factual threshold" slider (5-10, default 7)
- "Allow AI to create new categories" toggle
- Manual "Run Now" button for testing

**Status Display:**
- Current status indicator (idle / researching / generating / stopped)
- Last run summary: X topics found, Y articles generated, Z published, W failed
- Next scheduled run time
- Queue status: how many topics pending in each batch
- Emergency Stop button (sets `stop_requested = true`)

**Recent Runs List:**
- Shows recent nightly builder runs with expandable per-category details
- Batch number indicator

### 7. Icon Map Update

Update `src/lib/iconMap.ts` to include additional Lucide icons that new AI-created categories might use: `Wifi`, `Shield`, `Mail`, `Camera`, `Headphones`, `Gamepad2`, `Globe`, `Tv`, `Printer`, `Cloud`. Each gets a fallback color mapping so they render properly.

---

## Auto-Publish Logic

```text
After each article is generated by ai-agent:

1. Fetch the article's quality_score and factual_score from agent_runs
2. IF quality_score >= min_quality AND factual_score >= min_factual:
     UPDATE articles SET status = 'published', published_at = now()
     Log: "Auto-published: [title]"
3. ELSE:
     Keep as 'draft' (or 'needs_review' if ai-agent set it)
     Log: "Kept as draft (quality: X, factual: Y): [title]"
```

---

## Files Changed

| File | Change Type |
|------|------------|
| `supabase/functions/ai-nightly-builder/index.ts` | NEW -- orchestrator with Deep Research Interactions API |
| `supabase/config.toml` | Add `ai-nightly-builder` function config |
| `src/components/AIAgentPanel.tsx` | Add 5th "Nightly Builder" tab with controls |
| `src/lib/iconMap.ts` | Add more Lucide icons for AI-created categories |
| Database migration | Create 3 new tables (`nightly_builder_settings`, `nightly_builder_runs`, `nightly_builder_queue`) with RLS policies |
| SQL (non-migration) | Create 3 pg_cron jobs for the 3 daily time slots |

## Existing Code NOT Touched

- `ai-scheduled-runner` -- completely unchanged
- `ai-agent` -- unchanged (called as a service by the nightly builder)
- `ai-auto-discover` -- unchanged
- `ai-ask` -- unchanged
- All 4 existing AI Agent tabs (Generate, Discover, Batch, Automation) -- unchanged
- `AdminDashboard` -- unchanged

