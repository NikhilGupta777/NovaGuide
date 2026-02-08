

# Fix: True Fire-and-Forget Pipeline for Discover + Auto-Make

## The Problem

Right now, even with both toggles enabled (Auto-Make + Auto-Publish), the pipeline is only **partially** server-side:

1. The browser calls `ai-auto-discover` and **waits** for the full response (30-60 seconds)
2. The browser receives topics, then **client-side** inserts them into `nightly_builder_queue`
3. The browser **client-side** calls `ai-nightly-builder` to start batch generation
4. Only then does the self-chaining batch run server-side

If you close the browser during steps 1-3, the batch never starts. The topics may be saved to `discover_runs` but they never get queued or generated.

## The Solution

Move the entire "discover -> queue -> generate" pipeline into the server. The browser just fires one call and walks away.

```text
Browser clicks "Find Topics" (with Auto-Make ON)
    |
    v
Browser fires ai-auto-discover (with autoMake=true, autoPublish=true)
Browser shows "Pipeline started" toast + starts polling discover_runs
Browser can be CLOSED at this point
    |
    v
ai-auto-discover (server-side):
  1. Discovers topics via Gemini + Google Search
  2. Saves topics to discover_runs table
  3. IF autoMake=true:
     - Inserts all topics into nightly_builder_queue (SERVER-SIDE)
     - Calls ai-nightly-builder "start_manual_batch" (fire-and-forget)
  4. Returns response (browser may or may not be there to receive it)
    |
    v
ai-nightly-builder self-chains through all queue items (already works)
```

## Changes

### 1. Edge Function: `ai-auto-discover` -- Handle Full Pipeline Server-Side

- Accept new parameters: `autoMake` (boolean) and `autoPublish` (boolean)
- After discovering topics, if `autoMake` is true:
  - Insert all topics directly into `nightly_builder_queue` using the service role client
  - Fire-and-forget call to `ai-nightly-builder` with `{ action: "start_manual_batch", autoPublish }`
- Update `discover_runs` status to include whether batch was triggered

### 2. Frontend: `AIAgentPanel.tsx` -- True Fire-and-Forget

- Pass `autoMake` and `autoPublish` flags to the `ai-auto-discover` edge function
- Remove the client-side queue insertion code from `handleDiscover` (the edge function handles it now)
- Remove the client-side `startServerBatch()` call from `handleDiscover` (the edge function handles it now)
- After firing the edge function, immediately set `batchRunning = true` if `autoMake` is on (don't wait for the response)
- The existing polling `useEffect` for `discover_runs` and `nightly_builder_queue` already handles progress updates -- no change needed there
- When the discover run completes and `autoMake` was on, the batch polling will pick up the queue items automatically

### 3. Frontend: On-Mount Batch Detection Fix

- On page load, `fetchBatchQueue` already checks for `pending` and `processing` items
- Add: also check `discover_runs` for any `running` discover run and resume polling for it
- This ensures that if you come back after closing the browser, the UI correctly shows the batch is in progress

## Files to Modify

| File | What Changes |
|------|-------------|
| `supabase/functions/ai-auto-discover/index.ts` | Accept `autoMake`/`autoPublish` params; after discovery, insert queue items and trigger batch server-side |
| `src/components/AIAgentPanel.tsx` | Pass `autoMake`/`autoPublish` to edge function; remove client-side queue insert + batch trigger from `handleDiscover`; set batch state immediately when autoMake is on |

## Technical Details

### Edge function changes (`ai-auto-discover`):

After the existing topic discovery and `discover_runs` update (around line 221-228), add:

```typescript
// If autoMake is enabled, handle queue + batch trigger server-side
if (autoMake && result.topics?.length > 0) {
  const insertRows = result.topics.map(t => ({
    topic: t.topic,
    category_id: t.category_id || null,
    priority: t.priority === "high" ? 1 : t.priority === "medium" ? 2 : 3,
    status: "pending",
  }));

  // Insert into queue
  await db.from("nightly_builder_queue").insert(insertRows);

  // Fire-and-forget: trigger batch generation
  const batchUrl = `${SUPABASE_URL}/functions/v1/ai-nightly-builder`;
  fetch(batchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ action: "start_manual_batch", autoPublish }),
  }).catch(err => console.error("Failed to trigger batch:", err));
}
```

### Frontend changes (`AIAgentPanel.tsx`):

The `handleDiscover` function becomes:

```typescript
const handleDiscover = async () => {
  setDiscovering(true);
  setDiscoveredTopics([]);

  const { data: runData } = await supabase
    .from("discover_runs")
    .insert({ status: "running", topic_count: discoverCount })
    .select("id")
    .single();
  const runId = runData?.id;
  if (runId) setDiscoverRunId(runId);

  // If autoMake is on, set batch state immediately
  if (autoMake) {
    setBatchRunning(true);
    setBatchTotal(discoverCount);
  }

  try {
    // Pass autoMake and autoPublish to edge function
    // The edge function handles queue insertion + batch trigger server-side
    const { data, error } = await supabase.functions.invoke("ai-auto-discover", {
      body: { count: discoverCount, targetCategories: [], discoverRunId: runId, autoMake, autoPublish },
    });
    if (error) throw error;
    const topics = data?.topics || [];
    setDiscoveredTopics(topics);
    setDiscoverRunId(null);
    setDiscovering(false);

    if (autoMake && topics.length > 0) {
      setBatchTotal(topics.length);
      setBatchQueue(topics);
      toast({ title: "Pipeline Active", description: `${topics.length} topics queued -- generating in background.` });
    } else {
      toast({ title: "Topics Discovered!", description: `Found ${topics.length} topics.` });
    }
  } catch (err) {
    // Even if the browser loses connection, the edge function continues server-side
    // The polling will pick up the results
    if (autoMake) {
      toast({ title: "Pipeline Started", description: "Running in background. Check back for progress." });
    } else {
      const msg = err instanceof Error ? err.message : "Discovery failed";
      setDiscovering(false);
      setDiscoverRunId(null);
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  }
};
```

Key difference: even if the `supabase.functions.invoke` call fails (e.g., browser closes during the 30-60s discovery), the edge function is already running server-side and will complete the full pipeline. The `catch` block now handles this gracefully when `autoMake` is on.

## What This Means

- Click "Find Topics" with both toggles on -- one click
- Close the browser immediately
- The server discovers topics, queues them, and generates all articles
- Come back whenever -- articles are done
- The UI polls the database for progress if you stay on the page

