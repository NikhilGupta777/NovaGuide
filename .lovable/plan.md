

# Deep Audit: Nightly Builder (Round 3) -- All Remaining Bugs Fixed

## Issues Found & Fixed

### CRITICAL
1. **Stale recovery uses `created_at` instead of `updated_at`** — All 3 stale recovery checks (nightly, manual, frontend) compared `created_at < 15min`, but `created_at` is when the item was inserted, not when it was claimed. In large batches, items created >15min ago would be immediately "recovered" even if just claimed, causing duplicate article generation. **Fixed**: Added `updated_at` column with trigger to `nightly_builder_queue`, changed all stale checks to use `updated_at`.

### HIGH
2. **Queue column defaults `run_date = CURRENT_DATE`, `batch_number = 1`** — Any insert that forgot to set these would get wrong values. **Fixed**: Changed defaults to `NULL`.
3. **No `updated_at` trigger on `nightly_builder_runs`** — Status changes didn't touch `updated_at`, only the counter RPC did. **Fixed**: Added auto-update trigger.
4. **`next_run_at` update used `.neq("id", "")` wildcard** — Unsafe "update all rows" hack. **Fixed**: Now uses `settings.id` directly.

### MEDIUM
5. **`stop_requested` not checked during Phases C, D, E** — After research, dedup + category creation could run minutes without checking stop. **Fixed**: Added stop checks between every phase.
6. **No error handling on `increment_nightly_counter` RPC calls** — Failed RPC would crash the generation chain. **Fixed**: Wrapped in try/catch.
7. **`auto_generation_settings` still `enabled = true`** — Tab removed but data still active. **Fixed**: Set to `false`.
8. **Unused `isManualRun` parameter** — Dead parameter in `runNightlyBuilder`. **Fixed**: Removed.

## All Previous Fixes (Rounds 1-2) Still In Place
- Cron auth accepts anon key ✅
- EdgeRuntime.waitUntil for background processing ✅
- Fire-and-forget handleRunNow ✅
- IST date alignment for overflow batches ✅
- Atomic counter increments via RPC ✅
- selfInvoke response body consumption ✅
- Parallel chains for nightly generation ✅
- Retry limits on Gemini calls ✅
- Atomic run completion (.eq status guard) ✅
- 6-hour stale run cleanup ✅
- Dead Automation tab removed ✅
