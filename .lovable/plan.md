

## The Core Problem

Right now, ALL long-running operations (Content Audit scan, Fix All, Batch Generation) work the same broken way:

1. The browser starts a `while` loop
2. Each iteration calls the edge function for one small chunk
3. The edge function processes it and returns
4. The browser calls again for the next chunk
5. **If you refresh or leave, the loop dies and remaining work is abandoned**

The "auto-resume" workaround (localStorage flag + checking on mount) only restarts when you come back -- it does NOT continue in the background.

`EdgeRuntime.waitUntil()` also does NOT work for long tasks because the container shuts down after ~60-150 seconds regardless.

## The Solution: Self-Chaining Edge Functions

The edge function will call ITSELF to process the next chunk before returning. This creates a server-side chain that runs independently of the browser:

```text
Browser clicks "Fix All"
       |
       v
  Edge Function (chunk 1)
    - Processes 3 findings
    - Saves progress to DB
    - Fires fetch() to ITSELF for chunk 2 (fire-and-forget)
    - Returns immediately to browser
       |
       v
  Edge Function (chunk 2)  <-- triggered by server, NOT browser
    - Processes next 3 findings
    - Saves progress to DB
    - Fires fetch() to ITSELF for chunk 3
    - Returns
       |
       v
  ... continues until all done ...
```

The browser simply polls the database for progress updates. It never drives the loop.

## What Changes

### 1. Edge Function: `ai-content-audit` -- Self-Chaining

**Scan action:**
- First call: create run, detect duplicates, then self-invoke for first AI batch
- Each subsequent self-invocation: process 3 articles, save progress, self-invoke for next batch
- When no articles remain: mark run as "completed"
- Uses `SUPABASE_URL` + service role key to call itself

**Fix All action:**
- First call: mark run as `fix_all_status: "fixing"`, self-invoke for first batch
- Each self-invocation: fix 3 findings, update DB, self-invoke for next batch
- When no open findings remain: mark `fix_all_status: "fixed"`

**New helper function:**
```typescript
async function selfInvoke(body: Record<string, unknown>) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-content-audit`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify(body),
  }).catch(err => console.error("Self-invoke failed:", err));
  // Fire-and-forget -- don't await
}
```

### 2. Frontend: `ContentAuditTab.tsx` -- Poll-Only

- `handleRunAudit`: single fire-and-forget call to start the scan, then just poll DB
- `handleFixAll`: single fire-and-forget call to start fix-all, then just poll DB
- Remove the `while` loops from both `handleRunAudit` and `triggerFixAllForRun`
- Add a polling `useEffect` that checks the run status every 5 seconds when status is "scanning" or `fix_all_status` is "fixing"
- When the run status changes to "completed" or `fix_all_status` to "fixed", show toast and stop polling

### 3. Edge Function: `ai-nightly-builder` -- Self-Chaining for Batch

Same pattern: instead of relying on `EdgeRuntime.waitUntil()` for the entire batch loop, process one article per invocation and self-invoke for the next.

### 4. Frontend: `AIAgentPanel.tsx` -- Batch Processing via Server

- Remove the client-side `runBatch` while loop
- Instead: a single call starts the batch, the edge function self-chains through all items
- The UI polls `nightly_builder_queue` and `agent_runs` tables for progress
- Remove `localStorage` "batch_running" workaround (no longer needed)

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/ai-content-audit/index.ts` | Add `selfInvoke()`, convert scan and fix-all to self-chaining |
| `src/components/ContentAuditTab.tsx` | Replace while loops with single trigger + DB polling |
| `supabase/functions/ai-nightly-builder/index.ts` | Add `selfInvoke()`, process one article per invocation, self-chain |
| `src/components/AIAgentPanel.tsx` | Replace client-side batch loop with single trigger + DB polling |

## What This Means for You

- Click "Run Audit" or "Fix All" or "Generate All" -- one click
- Close the browser, go to another page, shut your laptop
- Come back whenever -- all work will be done
- The UI shows real-time progress by reading the database

