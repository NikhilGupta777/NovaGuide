

# Deep Audit: Nightly Builder -- All Bugs, Missing Implementations, and Issues

## Summary

After thoroughly analyzing the edge function (`ai-nightly-builder/index.ts`, 1003 lines), the frontend tab (`NightlyBuilderTab.tsx`, 547 lines), the database schema, and the cron job configuration, I found **11 bugs/issues** across 3 severity levels.

---

## CRITICAL Bugs (Will Prevent Cron From Working)

### 1. Cron Auth Mismatch -- Cron Sends Anon Key, But Function Expects Service Role Key

The 3 cron jobs send the **anon key** in the `Authorization` header. But the edge function's auth logic (lines 910-934) does this:

```text
1. Has auth header? Yes (anon key)
2. Is token === service_role_key? No
3. Try auth.getUser() with anon key -> FAILS (no user session)
4. Return 401 Unauthorized
```

**Result**: Every cron trigger will fail with 401. The nightly builder will never run automatically.

**Fix**: Either change the cron jobs to use the service role key, OR update the auth logic to recognize the anon key as a valid cron trigger.

---

### 2. Edge Function Timeout During Research Phase

`runNightlyBuilder()` is called with `await` (line 988). Inside `runBatch1()`, it loops through ALL categories sequentially, calling `deepResearchCategory()` for each one. Each call takes ~5-10 seconds + a 3-second delay between categories.

With 10+ categories: **80-130+ seconds minimum**. Supabase edge functions typically timeout at ~60-150 seconds.

The entire research phase (`Phase A` through `Phase E`) runs synchronously inside the HTTP request handler. It will timeout before completion, losing all work.

**Fix**: Make the research phase fire-and-forget using `EdgeRuntime.waitUntil()`, or split into a self-chaining pattern (research one category at a time).

---

### 3. `handleRunNow` Blocks the Browser

The frontend's `handleRunNow()` (line 184-214) awaits the edge function response:
```typescript
const { data, error } = await supabase.functions.invoke("ai-nightly-builder", {
  body: { batch },
});
```

For a nightly build that discovers topics across all categories, deduplicates, queues, and starts generation -- this can take 30+ minutes. The button stays stuck on "Running pipeline..." until the edge function times out or completes. This is not fire-and-forget.

**Fix**: Fire the edge function without awaiting, show a "triggered" toast, and rely on polling to track progress (the polling is already partially implemented).

---

## HIGH Severity Bugs

### 4. No Parallelism in Nightly Batch Generation

The manual batch (from AIAgentPanel) launches 3 parallel chains (line 971-977). But the nightly batch generation fires only ONE chain (line 557):

```typescript
selfInvoke({ action: "generate_one", runId, batch: 1, runDate: today });
```

With 100+ topics per batch, processing one-at-a-time (~2 min each) would take **3+ hours per batch**. It should use the same parallel pattern as the manual batch.

**Fix**: Launch multiple parallel chains for nightly generation, similar to `start_manual_batch`.

---

### 5. `next_run_at` is Never Set

The `nightly_builder_settings` table has a `next_run_at` column, and the UI displays it when available (line 351). But **nothing ever writes to it** -- not the cron job, not `runNightlyBuilder()`, not the frontend. It's always `null`.

**Fix**: After each completed run, calculate and set `next_run_at` based on the cron schedule (next occurrence of 12AM/12PM/6PM IST).

---

### 6. Stale Run Cleanup is Too Aggressive

The frontend (lines 123-129) marks any run in "researching", "generating", or "pending" status as "failed" if `started_at` is older than 10 minutes:

```typescript
const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
await supabase.from("nightly_builder_runs").update({
  status: "failed",
  error_message: "Timed out..."
}).in("status", ["researching", "generating", "pending"])
  .lt("started_at", tenMinAgo);
```

A legitimate nightly run with 100+ articles takes **hours**. Opening the admin page during a run will kill it by marking it as "failed". The self-chaining generation will keep going, but the run status becomes incorrect.

**Fix**: Increase timeout to 6+ hours, or use `updated_at` instead of `started_at`, updating `nightly_builder_runs` after each article is generated.

---

### 7. Rate Limit Retry Has No Max Depth (Infinite Recursion Risk)

Both `deepResearchCategory()` (line 114) and `callGeminiFlash()` (line 187) recursively retry on 429 errors with no attempt counter:

```typescript
if (resp.status === 429) {
  await delay(30000);
  return deepResearchCategory(...); // infinite recursion!
}
```

If the Gemini API rate-limits persistently, this creates infinite recursion until the function crashes or times out.

**Fix**: Add a `maxRetries` parameter (e.g., 3) and fail after exhausting retries.

---

## MEDIUM Severity Issues

### 8. `addToQueue` Doesn't Explicitly Set `run_date: null`

The `addToQueue` function in `AIAgentPanel.tsx` (line 470-475) inserts queue items without specifying `run_date`:

```typescript
await supabase.from("nightly_builder_queue").insert({
  topic: topic.topic,
  category_id: topic.category_id || null,
  priority: ...,
  status: "pending",
  // run_date not specified!
});
```

The column default is `CURRENT_DATE`. This means manually-added items will get today's date, NOT null. The manual batch processor filters by `run_date IS NULL`, so these items would be **invisible** to it.

Currently, all 40 existing items have `null` run_date (likely inserted via `ai-auto-discover` which explicitly sets `run_date: null`). But any item added via the "Add to Queue" button in the UI will be lost.

**Fix**: Explicitly set `run_date: null` and `batch_number: null` in the insert.

---

### 9. Nightly Generation Uses Different Action Name Than Manual

Nightly batch generation uses `action: "generate_one"` with `runId`, `batch`, `runDate` params (line 557, 941-944). Manual batch uses `action: "generate_manual_batch"` with `autoPublish` (line 948-951).

They're separate code paths with different features:
- Nightly `generate_one`: single chain, run-based progress tracking, quality-gate auto-publish
- Manual `generate_manual_batch`: parallel chains, stale recovery, simple auto-publish

The nightly path is missing: stale recovery, parallel chains, atomic claiming.
The manual path is missing: run-based progress tracking, quality-gate thresholds.

**Fix**: Unify these two generation paths, or add missing features to each.

---

### 10. `last_run_at` Only Updates for Cron-Triggered Runs, Not Manual "Run Now"

`last_run_at` is updated inside `runNightlyBuilder()` (line 252-254). Since the cron auth is broken (Bug 1), it has never been set. But even when fixed, the "Run Now" button calls the same function, so it will update on manual runs too. However, if the function times out (Bug 2), the update may never happen.

This is a cascading issue from Bugs 1 and 2.

---

### 11. 1 Item Still Stuck in "processing" Status

The database shows 1 item stuck in "processing" from a previous crashed chain:

```
pending: 4, processing: 1, completed: 35
```

The stale recovery (`recoverStaleManualItems`) runs at the start of `generateOneFromManualQueue`, but it only runs when that function is called. Since no batch is currently running, this item stays stuck.

**Fix**: Add on-load stale recovery in the frontend, or run recovery on cron/startup.

---

## Implementation Plan

### File Changes

| File | Changes |
|------|---------|
| `supabase/functions/ai-nightly-builder/index.ts` | Fix auth to accept anon key for cron; use `EdgeRuntime.waitUntil()` for research phase; add parallel chains for nightly generation; add max retry limits; add stale recovery for nightly items |
| `src/components/NightlyBuilderTab.tsx` | Make `handleRunNow` fire-and-forget; fix stale cleanup timeout (10 min -> 6 hours); calculate and display `next_run_at` |
| `src/components/AIAgentPanel.tsx` | Add `run_date: null, batch_number: null` to `addToQueue` insert |
| Database migration | Update cron jobs to use service role key instead of anon key |

### Priority Order

1. Fix cron auth (Bug 1) -- without this, nothing works
2. Fix edge function timeout (Bug 2) -- without this, Run Now crashes
3. Fix handleRunNow blocking (Bug 3) -- UX is broken
4. Fix addToQueue missing null (Bug 8) -- items silently lost
5. Add parallel chains to nightly gen (Bug 4) -- 3x speed
6. Fix stale cleanup timeout (Bug 6) -- stops killing active runs
7. Add retry limits (Bug 7) -- prevents infinite loops
8. Set next_run_at (Bug 5) -- display fix
9. Recover stuck processing item (Bug 11) -- data cleanup
10. Unify generation paths (Bug 9) -- code quality

