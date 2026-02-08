
# Nightly Builder Bug Fixes — COMPLETED

All 11 bugs from the deep audit have been fixed.

## Fixes Applied

| Bug | Severity | Fix |
|-----|----------|-----|
| 1. Cron Auth Mismatch | CRITICAL | Auth now accepts anon key alongside service role key |
| 2. Edge Function Timeout | CRITICAL | Research phase uses `EdgeRuntime.waitUntil()` for fire-and-forget |
| 3. handleRunNow Blocking | CRITICAL | Fire-and-forget pattern, returns immediately with toast |
| 4. No Parallelism in Nightly | HIGH | Launches 3 parallel chains (same as manual batch) |
| 5. next_run_at Never Set | HIGH | Calculated after each batch completes + frontend fallback |
| 6. Stale Cleanup Too Aggressive | HIGH | Timeout increased from 10 min to 6 hours |
| 7. Infinite Recursion Risk | HIGH | Max 3 retries on 429 rate limits |
| 8. addToQueue Missing Null | MEDIUM | Explicitly sets `run_date: null, batch_number: null` |
| 9. Nightly Gen Missing Features | MEDIUM | Added stale recovery + atomic claiming to nightly path |
| 10. last_run_at Cascading | MEDIUM | Fixed by Bugs 1+2 fixes |
| 11. Stuck Processing Item | MEDIUM | Reset via DB + on-load recovery in frontend |

## Files Modified

- `supabase/functions/ai-nightly-builder/index.ts`
- `src/components/NightlyBuilderTab.tsx`
- `src/components/AIAgentPanel.tsx`
