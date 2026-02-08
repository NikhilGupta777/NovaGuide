

# Deep Audit: Nightly Builder (Post-Fix Round 2) -- All Remaining Bugs and Issues

After thoroughly re-analyzing the edge function (1086 lines), the frontend NightlyBuilderTab (570 lines), AIAgentPanel (1249 lines), the database schema, and the cron job configuration, I found **10 bugs/issues** -- including 1 **critical** bug that will prevent the cron system from ever working.

---

## CRITICAL Bug

### 1. Date Mismatch: Overflow Batches Will Never Find Their Queue Items

The midnight cron (batch 1) runs at **18:30 UTC** (12:00 AM IST). Inside `runBatch1()`, it inserts queue items with:

```
const today = new Date().toISOString().split("T")[0];
// At 18:30 UTC on Feb 8 -> today = "2026-02-08"
```

Items are created with `run_date = "2026-02-08"` and `batch_number = 1, 2, or 3`.

The noon cron (batch 2) runs at **06:30 UTC the next day** (12:00 PM IST). Inside `runOverflowBatch()`, it computes:

```
const today = new Date().toISOString().split("T")[0];
// At 06:30 UTC on Feb 9 -> today = "2026-02-09"
```

It then queries for `run_date = "2026-02-09" AND batch_number = 2` -- but the items have `run_date = "2026-02-08"`. **Nothing is found. Batch 2 and 3 will never process anything.**

**Fix**: Use the IST date (UTC+5:30) instead of UTC date when computing `today`, or store and pass the `run_date` from batch 1 through the cron payload. The simplest fix: calculate `today` using IST offset so all three batches agree on the same "day".

---

## HIGH Severity Bugs

### 2. "Run Now" Silently Does Nothing When Builder is Disabled

When you click "Run Now", the edge function enters `runNightlyBuilder()` which checks `settings.enabled`. If disabled, it just returns silently:

```typescript
if (!settings.enabled) {
  console.log("Nightly builder is disabled. Skipping.");
  return;
}
```

But the HTTP handler wraps this in `EdgeRuntime.waitUntil()` and returns success immediately:

```typescript
EdgeRuntime.waitUntil(runNightlyBuilder(batch)...);
return jsonResp({ success: true, message: "Nightly builder triggered" });
```

The frontend shows a "Nightly Builder Triggered" toast. The user thinks it's running, but nothing happens. No run record is created. No error is shown.

**Fix**: Check `settings.enabled` BEFORE `EdgeRuntime.waitUntil()` and return an error if disabled. Or allow "Run Now" to bypass the enabled check (treat it as a manual override).

### 3. Race Condition on `articles_generated` / `articles_published` Counters

With 3 parallel chains, multiple chains can finish an article at the same time. Each reads the counter, increments by 1, and writes back:

```typescript
const { data: currentRun } = await db.from("nightly_builder_runs")
  .select("articles_generated, articles_published").eq("id", runId).single();
const gen = (currentRun?.articles_generated || 0) + 1;
await db.from("nightly_builder_runs").update({ articles_generated: gen }).eq("id", runId);
```

If two chains read `articles_generated = 5` simultaneously, both write `6` instead of `7`. Over a batch of 100+ articles, the final count can be significantly under-reported.

**Fix**: Use a database function with `articles_generated = articles_generated + 1` (an atomic increment via RPC or raw SQL function).

### 4. `selfInvoke()` Never Consumes the Response Body

In Deno, every `fetch()` response body must be consumed (read) to avoid resource leaks. The `selfInvoke` function fires fetch but only attaches a `.catch()`:

```typescript
fetch(url, { ... }).catch(err => console.error(...));
```

The response is never consumed (`await resp.text()`). Over many self-chain iterations (100+ articles), this causes resource leaks that can crash the function or cause unpredictable behavior.

**Fix**: Consume the response in a `.then()`:

```typescript
fetch(url, { ... })
  .then(r => r.text())
  .catch(err => console.error(...));
```

### 5. Dead "Automation" Tab Still Active and Confusing

The `AIAgentPanel.tsx` still has a full "Automation" tab (lines 837-960) that reads/writes to `auto_generation_settings`. This table's `enabled` is set to `true`. But there is no backend that uses it -- the `ai-scheduled-runner` was deleted. This is dead UI that confuses users into thinking they have two separate automation systems (Automation tab vs Nightly tab).

**Fix**: Remove the Automation tab entirely, or merge its useful settings (target categories) into the Nightly Builder.

---

## MEDIUM Severity Issues

### 6. Multiple Parallel Chains All Mark Run as "completed" Simultaneously

When the last queue items are processed by different chains near-simultaneously, each chain checks `remaining === 0` and executes:

```typescript
await db.from("nightly_builder_runs").update({
  status: "completed",
  completed_at: new Date().toISOString(),
}).eq("id", runId);
```

This causes 2-3 redundant updates. While not breaking, it also means `next_run_at` gets calculated and written 2-3 times. Minor wasted work.

**Fix**: Use an atomic "complete if not already completed" pattern: `.eq("status", "generating")` on the update filter.

### 7. `next_run_at` Updated in Two Separate Places (Race)

`next_run_at` is updated in:
- Line 798-801: Inside `generateOneFromQueue` when a batch completes
- Line 1063-1071: In `EdgeRuntime.waitUntil().then()` after `runNightlyBuilder` resolves

For batch 1, `runNightlyBuilder` resolves after the research phase completes and generation chains are launched (not when generation finishes). So the `.then()` callback fires early, setting `next_run_at` while generation is still ongoing. Then hours later when generation finishes, `next_run_at` is set again.

**Fix**: Remove the `next_run_at` update from the `EdgeRuntime.waitUntil().then()` callback. Only set it when generation actually completes.

### 8. No `updated_at` Column on `nightly_builder_runs` for Progress Tracking

The `nightly_builder_runs` table has `started_at` and `completed_at` but no `updated_at`. During a multi-hour generation phase, there's no way to distinguish between a run that's actively making progress vs one that silently died. The stale cleanup (6 hours) is a blunt instrument.

**Fix**: Add an `updated_at` column that gets touched every time `articles_generated` is incremented. Use this for smarter stale detection.

### 9. Stale Cleanup Runs on Every Page Load

Every time an admin opens the nightly builder page, the frontend runs:

```typescript
await supabase.from("nightly_builder_runs")
  .update({ status: "failed", error_message: "Timed out..." })
  .in("status", ["researching", "generating", "pending"])
  .lt("started_at", sixHoursAgo);
```

This is idempotent, so it won't cause data loss. But it runs unconditionally on every page load, even when there are no stale runs. It also runs the manual queue recovery (reset processing items to pending) on every load, which can interfere with an actively running batch if the browser is refreshed.

**Fix**: Add a check for processing items' age before resetting them. Only reset items stuck in "processing" for more than 15 minutes (not just any "processing" item).

### 10. `auto_generation_settings.enabled = true` with No Backend

The `auto_generation_settings` table has `enabled: true` but there's no cron job or edge function that reads this flag. It's completely orphaned. The Automation tab in the UI lets users toggle it on/off and change settings, but nothing happens. This is misleading.

**Fix**: Either remove the `auto_generation_settings` table entirely, or disable it and remove the Automation tab.

---

## Implementation Plan

### File Changes

| File | Changes |
|------|---------|
| `supabase/functions/ai-nightly-builder/index.ts` | Fix date calculation to use IST offset; check `enabled` before `EdgeRuntime.waitUntil`; consume `selfInvoke` response body; atomic run completion; remove duplicate `next_run_at` update |
| `src/components/NightlyBuilderTab.tsx` | Add age check to processing item recovery (15 min threshold) |
| `src/components/AIAgentPanel.tsx` | Remove or disable Automation tab; remove references to `auto_generation_settings` |
| Database migration | Add `updated_at` column to `nightly_builder_runs`; create atomic increment function for counters |

### Priority Order

1. **Fix date mismatch** (Bug 1) -- without this, overflow batches are completely broken
2. **Fix "Run Now" when disabled** (Bug 2) -- user-facing confusion
3. **Fix `selfInvoke` resource leak** (Bug 4) -- can crash long-running chains
4. **Fix counter race condition** (Bug 3) -- inaccurate stats
5. **Remove dead Automation tab** (Bug 5 + 10) -- user confusion
6. **Atomic run completion** (Bug 6) -- clean up redundant writes
7. **Remove duplicate `next_run_at` update** (Bug 7) -- minor cleanup
8. **Add `updated_at` to runs** (Bug 8) -- better progress tracking
9. **Add age threshold to processing recovery** (Bug 9) -- prevent interfering with active batches

