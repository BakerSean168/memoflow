# Add Context menu: browser work versus host scheduling

Investigation for [#512](https://github.com/BakerSean168/memoflow/issues/512).
Measured on 2026-10-19 at `fe93e0442730b1cbf0887303d31432a26837106d`,
in the UI lane, with Chromium headless on an 8-vCPU shared development host.

## Decision and remaining acceptance

Both loaded and single-browser Chromium-profiled overruns are dominated by
**off-CPU time**, not by a lazy menu import or a CPU task exceeding 300ms. Keep the product and acceptance
assertion unchanged. A unit test cannot guard host scheduling.

This investigation does **not** establish that the original 334.3ms sample
had precisely the same cause: its Chromium CPU trace was not available in
this worktree. Nor does a passing sample guarantee the wall-clock contract
on an arbitrarily contended host.

The remaining correction belongs to the CI/host scheduling owner:
establish and verify this performance spec in an exclusive host execution
window (including other lanes/processes), or on a dedicated runner. The existing audit config
already inherits `workers: 1`, so reducing Playwright workers alone cannot
solve cross-process contention. Preserve the browser-side start point,
visible geometry criterion, and 300ms wall-clock assertion.

Sprint ownership forbids changes to Playwright/CI configuration, root
configuration, and CI tools in this UI lane. No such files were changed.
The exclusive execution mechanism and its acceptance remain outstanding;
this document is evidence and a handoff, not a delivered scheduling fix.

## Measurements

The acceptance measurement is exactly the existing browser-side
`trigger.click()` → upload-item `getClientRects().length > 0` loop, with
`requestAnimationFrame` polling. No threshold, retries, sleeps, timeout,
or assertions were changed.

| Condition                                                            | Samples | Median (ms) | Maximum (ms) | Above 300ms |
| -------------------------------------------------------------------- | ------: | ----------: | -----------: | ----------: |
| Overlapping browser workload, CDP trace harness                      |       6 |       219.1 |        615.2 |           2 |
| Single-browser focused spec, no deliberate overlap (shared host)     |       8 |       179.6 |       1724.6 |           1 |
| Subsequent actual-spec cohort with Chromium CPU tracing, shared host |       3 |       331.3 |        735.7 |           2 |

The single-browser raw samples were
`186.6, 114.1, 172.5, 134.7, 273.0, 206.6, 121.6, 1724.6` ms.
Ten attempts produced **7 passes / 3 failures**: one menu-budget breach and
two failures before measurement (a composer wait timeout, alongside a Vite
bootstrap import error, and an auth redirect timeout). Those two are excluded
from the latency distribution, not counted as passes or retried. No deliberate
second browser was running in this cohort, but other work on this shared host
was not suspended. The 1,724.6ms sample had only Playwright action tracing,
not Chromium CPU tracing; its cause cannot be inferred from the loaded
cohort's CPU profile. Removing this lane's overlap did not fix the contract.

The subsequent CPU-traced spec cohort measured `331.3, 735.7, 298.4` ms
(**1 pass / 2 failures**). This is a separate instrumented cohort; it is not
a retry of a failed test. The original 300ms assertion still failed normally.

The loaded raw samples, in order, were
`212.4, 154.4, 225.8, 615.2, 140.2, 325.7` ms.
The harness ran a second browser against the same lane-owned API/Web while
the actual focused spec was running. This is a contention sensitivity
experiment, not a claim to have run or exactly recreated Full Audit.
The audit itself uses one worker.

An initial ten-repeat run of the actual spec produced **9 passes / 1 failure**,
with a **384.2ms** failure during the overlap. The first six spec repetitions
passed before the extra browser was started; the final four overlapped it.
That mixed run is not presented as a clean isolated baseline.

The trace harness had no Playwright video recording; the actual spec retained
its existing video/trace settings. Instrumented and uninstrumented measurements
therefore remain separate cohorts. A seventh harness iteration lost its
authentication response when the owning Playwright run shut down the servers;
it produced no menu measurement and is excluded, rather than retried.

## Chromium attribution

CDP tracing enabled `devtools.timeline,v8.execute,blink.user_timing,
disabled-by-default-v8.cpu_profiler`. Browser User Timing marks bracketed the
same click-to-geometry window. Chromium complete events provide both wall
duration (`dur`) and thread CPU duration (`tdur`), in microseconds.
Mark-to-mark durations include small instrumentation overhead (0.3–7.6ms
in the loaded samples); contract values in the tables use the returned
latency, while attribution uses trace event durations.

| Loaded sample | Click→geometry (ms) | Main mount microtask wall (ms) | Thread CPU (ms) | Wall minus CPU (ms) |
| ------------- | ------------------: | -----------------------------: | --------------: | ------------------: |
| 0             |               212.4 |                          207.6 |           152.6 |                55.0 |
| 1             |               154.4 |                          150.6 |           135.5 |                15.1 |
| 2             |               225.8 |                          220.7 |           175.4 |                45.3 |
| 3             |               615.2 |                          603.8 |           152.4 |               451.4 |
| 4             |               140.2 |                          136.2 |           123.3 |                12.9 |
| 5             |               325.7 |                          315.2 |           162.3 |               152.9 |

These are the longest `RunMicrotasks` events within each window, not a sum
of nested events. In the worst sample, the mount task used nearly the same
CPU as sample 0 while its wall time tripled. About 75% of that task's wall
duration was off-CPU. This establishes scheduling/blocking sensitivity;
it does not identify the competing process responsible for every pause.

The worst loaded trace's nested focus dispatch took **131.3ms wall time**; all
`EventDispatch` events in that window together used only **7.4ms thread CPU**
(the nested wall durations must not be added). Style recalculation across
the window used **24.7ms CPU** and layout **1.1ms CPU**. The sampled stacks
show Vue component setup/render, Reka focus handling, body scroll locking,
and Floating UI's computed-style/positioning work.

A subsequent **single-browser actual-spec** trace reproduced **331.3ms**,
with **317.0ms wall / 162.7ms CPU** in the main mount microtask (154.3ms
off-CPU). A second sample measured **735.7ms**, with **727.1ms wall /
179.7ms CPU** in the main mount microtask (547.4ms off-CPU).
The third sample measured **298.4ms**, with **293.5ms wall / 157.5ms CPU**
in its main mount microtask. No deliberate second browser was running.
This confirms the off-CPU signature is not confined to the artificial overlapping-browser
experiment. This still was a shared host, not an exclusive runner.

The longest mount microtask uses roughly 123–180ms thread CPU in this development
build. That is real UI work and leaves finite headroom, but it does not
explain the reproduced threshold breaches without the off-CPU delays.

### Product path examined

- `packages/app-vue/src/modules/ai/components/AIFooterComposer.vue` imports
  the dropdown wrappers and Lucide icons synchronously.
- Opening sets Reka's open state and mounts the teleported menu, its items,
  submenu wrappers, focus scope, scroll lock, and floating positioning.
- Recent goal/task/note lists are existing props, capped at eight menu items
  per category; opening has no data-fetch handler.
- The click-to-visible trace windows contain no `EvaluateScript` task.
  No lazy chunk or icon import was observed on this path.
- Style/layout and portal positioning are present, but the traced overruns
  do not show a >300ms CPU-bound rendering task.

Preloading an already imported module, mounting a closed modal early, or
removing keyboard/focus behavior would not address the demonstrated
off-CPU delay and would add behavior risk without evidence.

## Reproduction

Only run the focused spec; Full Audit and GitHub CI were not run.

From the repository root:

```bash
pnpm nx run web:e2e --config=playwright.audit.config.ts \
  e2e/performance/ai-workspace-performance.spec.ts \
  --grep="within 300ms" --repeat-each=10 --workers=1 --reporter=list
```

For a distribution, temporarily log `latency` immediately before the existing
assertion. Restore the file after diagnosis. Logging happens outside the
browser measurement and does not change the assertion. The isolated rerun
used `E2E_PREBUILT_ARTIFACT=1` only after the first invocation had built the
API at the same source revision.

For CPU attribution, use a lane-local ignored harness. Import
`apps/web/playwright.server.ts` first to load the normal E2E environment,
launch Chromium with a fresh 1280×720 browser context, call the existing
`registerAndLogin` with a unique account and `landingPath: '/'`, and wait for
the same three shell/workspace/composer test IDs as the spec. Start CDP tracing
before evaluating the unchanged measurement:

```ts
const client = await context.newCDPSession(page);
await client.send('Tracing.start', {
  categories: 'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-v8.cpu_profiler',
  transferMode: 'ReturnAsStream',
});
// Add performance.mark('add-context-start') immediately before startedAt,
// and performance.mark('add-context-visible') immediately before returning
// the measured latency. Keep the existing click and rAF/geometry loop.
const complete = new Promise<string>((resolve) =>
  client.once('Tracing.tracingComplete', (event) => resolve(event.stream!)),
);
await client.send('Tracing.end');
const stream = await complete;
let trace = '';
for (;;) {
  const chunk = await client.send('IO.read', { handle: stream });
  trace += chunk.data;
  if (chunk.eof) break;
}
await client.send('IO.close', { handle: stream });
// Write trace to an ignored lane-local file, then close the context.
```

Open the JSON in Chromium DevTools Performance. Filter complete events to
the renderer process and the two marks, inspect `RunMicrotasks` wall and
thread durations, then inspect nested layout/focus events and CPU samples.
Do not sum nested task durations or substitute CPU time for the wall-clock
acceptance assertion.

For controlled contention, run the same harness concurrently with a second
fresh-context browser workload, using only this lane's servers. Keep those
servers alive until both workloads finish. Do not call that experiment
Full Audit, and do not run governance/build/test commands concurrently with
the isolated performance cohort.

Local raw artifacts are retained in the ignored UI-lane `.tmp-512/`
directory: `before-0.json` through `before-5.json`, `before.log`,
`isolated-spec.log`, `solo-traced-spec.log`, `solo-trace-*.json`, `measure.mts`, `analyze.py`, and `profile.py`.
Raw auth/browser traces are intentionally not committed.

## 2026-10-20 follow-up: CPU cut on open (conductor)

The ~160ms main-thread CPU on open is the menu mount itself. Two changes in
`AIFooterComposer.vue`:

- `DropdownMenu :modal="false"`: the modal mode hides every sibling subtree
  from assistive tech (aria-hidden walk over the whole app shell) and locks
  body scroll on each open; the Add Context menu is a non-blocking popover, so
  modal behaviour is not needed. Outside click/Escape still dismiss it.
- Goal/Task/Note submenu content is mounted only when its submenu opens
  (`v-model:open` + `v-if`), so opening the root menu no longer renders up to
  24 hidden items with icons. Unit test:
  `mounts context submenu content only after its submenu opens`.

Same command as above (`--repeat-each=10 --workers=1`), same shared host,
run back to back (host load average 30–49 during both runs), latency logged
temporarily before the unchanged assertion:

| Build                                |   n |  Median |     Max | >300ms |
| ------------------------------------ | --: | ------: | ------: | -----: |
| Before (main `AIFooterComposer.vue`) |  10 | 166.3ms | 204.5ms |      0 |
| After (this PR)                      |  10 | 122.4ms | 331.5ms |      1 |

Raw after: 125.5, 109.8, 113.6, 103.0, 331.5, 219.8, 125.1, 119.8, 110.9, 161.3.
Raw before: 190.7, 169.1, 163.4, 137.5, 157.3, 156.0, 204.5, 182.0, 176.9, 156.6.

The median open cost drops ~44ms (~26%). The single 331.5ms after-sample came
at the start of a load spike and is consistent with the off-CPU host
contention documented above; the tail is not product-attributable on a shared
host. The 300ms assertion is unchanged; a reserved host/runner window remains
the CI lanes item for proving the tail.
