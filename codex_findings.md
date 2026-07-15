# Codex Performance and Memory Findings

## Scope

This report analyzes the supplied React Profiler, Chrome Performance, screenshot, and heap snapshot artifacts for the KaiTuoYiShi interface. It focuses on measured UI rendering and runtime memory behavior; it does not cover AI latency, prompt construction, save I/O, or network performance except where those directly affect rendering.

Artifacts analyzed:

- `analytics_forgrok/profiling-data.07-14-2026.21-20-58.json`
- `analytics_forgrok/Trace-20260714T211318.json.gz`
- `analytics_forgrok/Screenshot 2026-07-14 at 21.16.36.png`
- `analytics_forgrok/Heap-20260714T212715.heapsnapshot`

## Executive Summary

The primary interaction bottleneck is React reconciliation, not layout or paint. Ordinary root-level state changes and some local chat state changes repeatedly reconcile an approximately 1,700-fiber game tree. Severe commits take 169–202 ms and directly correspond to 180–188 ms click handlers in the Chrome trace.

The main application-controlled memory cost is album imagery stored as base64 `dataUrl` strings in runtime state. Four large images account for approximately 10.64 MB of JavaScript string self memory before decoded pixel surfaces and browser-side backing storage are considered.

The heap snapshot does not prove an application DOM leak. Although it contains 6,870 detached DOM nodes, their shortest strong retention path runs through a DevTools console handle to an old document. A controlled comparison capture is required before changing component cleanup logic in response to this number.

## React Profiler Results

### Commit distribution

| Metric | Result |
| --- | ---: |
| Commit count | 56 |
| Total commit time | 3,824.0 ms |
| Mean commit time | 68.29 ms |
| Median commit time | 18.65 ms |
| Minimum | 0.3 ms |
| Maximum | 201.8 ms |
| Commits over 16 ms | 31 |
| Commits over 50 ms | 18 |
| Commits over 100 ms | 18 |
| Commits rendering over 1,000 fibers | 26 |

The 18 commits over 100 ms consumed 3,427.9 ms, or approximately 89.6% of all React commit time. They form a clear slow cluster between 169 and 201.8 ms rather than a gradual tail.

The 26 commits involving more than 1,000 fibers consumed approximately 3,590 ms, or 94% of all commit time. This establishes tree-wide invalidation as the dominant React cost.

### Representative fan-out

A representative `ChatList` update rendered 1,670 fibers in 177.6 ms. A representative `App` update rendered 1,729 fibers in 201.8 ms. Both traversed essentially the same historical chat subtree:

| Component | Instances rendered in the commit |
| --- | ---: |
| `NarrationLine` | 516 |
| `AvatarTile` | 296 |
| `DialogueBubble` | 295 |
| `ToolButton` | 280 |
| `TurnItem` | 80 |
| `TurnBadge` | 40 |
| `BodyBlock` | 40 |
| `AiTurnCard` | 40 |

No single message component is catastrophically slow. The total is produced by hundreds of individually small renders repeated across the entire visible history.

Across slow commits, the largest cumulative component self-time came from:

| Component | Cumulative slow-commit self-time | Slow-commit render count |
| --- | ---: | ---: |
| `DialogueBubble` | 700.5 ms | 7,670 |
| `AvatarTile` | 602.3 ms | 7,696 |
| `NarrationLine` | 419.9 ms | 13,416 |
| `BodyBlock` | 398.0 ms | 1,040 |
| `AiTurnCard` | 372.8 ms | 1,040 |
| `ToolButton` | 331.8 ms | 7,280 |

### Trigger patterns

Among commits over 16 ms, recorded updaters included 24 `App` commits, three `ChatList` commits, two `PhoneModal` commits, one `AiTurnCard` commit, and one commit without an updater label.

For the 18 commits over 100 ms, prop-change descriptions were dominated by callback identities:

| Prop | Change descriptions |
| --- | ---: |
| `onClick` | 5,193 |
| `onEditBody` | 1,815 |
| `onRegenerateNarrativeImage` | 1,815 |
| `onRetry` | 75 |
| `onCancel` | 75 |

This is consistent with fresh inline handlers and actions that depend on a fresh top-level state facade.

## Chrome Performance Results

The trace contains approximately 4.27 million events over a roughly 52-second window. It was recorded against the Vite development server with DevTools and React profiling active, so absolute totals include substantial instrumentation overhead.

### Main renderer thread

| Event | Count | Total duration | Maximum | Over 50 ms |
| --- | ---: | ---: | ---: | ---: |
| `RunTask` | 39,684 | 13,684 ms | 206.3 ms | 24 |
| `FunctionCall` | 23,698 | 4,082 ms | 188.1 ms | 21 |
| `EventDispatch` | 12,042 | 3,197 ms | 188.4 ms | 16 |
| `RunMicrotasks` | 279 | 2,827 ms | 188.1 ms | 16 |
| `Paint` | 27,221 | 1,648 ms | 11.3 ms | 0 |
| `UpdateLayoutTree` | 7,109 | 926 ms | 39.2 ms | 0 |
| `PrePaint` | 10,237 | 578 ms | 24.6 ms | 0 |
| `Layout` | 170 | 231 ms | 69.4 ms | 2 |
| `MinorGC` | 27 | 151 ms | 9.2 ms | 0 |
| `MajorGC` | 6 | 92 ms | 24.2 ms | 0 |

These categories are nested trace events and must not be added together as independent CPU totals.

The longest interaction chain is:

```text
MouseUp
  -> EventDispatch(click)
  -> FunctionCall in react-dom_client.js
  -> React render/reconciliation
```

The severe click handlers consistently take approximately 180–188 ms. This aligns with the React Profiler's 169–202 ms commit cluster.

### Interpretation

1. JavaScript and React reconciliation are the primary sources of visible stalls.
2. Layout has two meaningful spikes but is not the repeated 200 ms problem.
3. Paint is frequent and cumulative, but no individual paint exceeds a frame budget.
4. Garbage collection is measurable but not the principal interaction bottleneck.
5. CSS and paint optimization should be reassessed after React invalidation is reduced.

## Source-Level Causes

### 1. Scroll state shares a render boundary with full chat history

`components/features/Chat/ChatList.tsx` owns `nearBottom` and `renderLimit`, then maps up to 80 messages in the same component. A transition of `nearBottom` therefore re-executes the full historical message render path.

The profiler confirms three `ChatList`-initiated slow commits. One took 177.6 ms and rendered 1,670 fibers even though the meaningful state change was local scroll UI state.

### 2. Historical turns have no memo boundary

`components/features/Chat/TurnItem.tsx` exports a normal function component. `AiTurnCard`, `BodyBlock`, dialogue, narration, avatar, and tool components are likewise unprotected from parent rerenders.

Stable message IDs do not help unless a memo boundary exists and all relevant shared props retain stable identity.

### 3. App callbacks and element props are recreated

`App.tsx` creates `onEditBody` inline and constructs new `topBar`, `leftPanel`, `rightPanel`, and `chatArea` React elements on every render. Several additional handlers are also inline.

This makes a future shallow memo boundary ineffective unless callback and element identities are stabilized or the component tree is split at a lower subscription boundary.

### 4. Actions depend on the full state facade

`hooks/useGameState.ts` returns a new object containing every state value and setter. `hooks/useGame.ts` creates a fresh `actions` object and several callbacks depend on the complete `state` object.

Even an unrelated local `App` update invokes these hooks again, producing a fresh state facade. Actions such as `handleRegenerateNarrativeImage` then change identity because their dependency includes that facade.

### 5. Per-message neighbor discovery repeats work

`ChatList` scans backward while rendering assistant messages to find `previousUserInput` and fallback path metadata. With an 80-message window this is bounded, but it repeats on every invalidated render and contributes avoidable work.

The metadata can be produced with a single forward pass whenever the message array or render window changes.

### 6. Development capture amplifies timings

`index.tsx` mounts the app under `React.StrictMode`, and the capture was made against Vite with React DevTools profiling enabled. The trace also contains large volumes of debugger and console instrumentation events.

The source-level invalidation is real, but production absolute timings should be established separately before setting final performance budgets.

## Heap Snapshot Results

### High-level allocation

| Node type | Count | Self memory |
| --- | ---: | ---: |
| Native | 504,400 | 61.85 MB |
| String | 189,959 | 37.32 MB |
| Object | 231,450 | 7.81 MB |
| Array | 57,086 | 7.62 MB |
| Code | 66,021 | 6.91 MB |

Snapshot total self memory is approximately 123.78 MB across 1,174,707 nodes and 4,891,627 edges.

### Base64 album imagery

Four large `data:image/*` strings are retained through `album.assets[n].dataUrl`:

| Format | Dimensions | String self memory |
| --- | ---: | ---: |
| PNG | 1024 × 1536 | 3.70 MB |
| PNG | 1254 × 1254 | 2.80 MB |
| PNG | 1536 × 1024 | 2.79 MB |
| JPEG | 1686 × 2528 | 1.35 MB |

Total direct string self memory is approximately 10.64 MB. If all four images are decoded into 32-bit pixel buffers simultaneously, their theoretical uncompressed pixel size is approximately 34 MiB, excluding compositor copies, thumbnails, and GPU surfaces.

The current persistence layer already strips embedded image payloads from the main save record and stores them separately. However, `restoreSaveAssetPayloadFromRecords` restores full data URLs into the runtime album state. The runtime hydration and URL-resolution seam is therefore the appropriate place for a Blob-backed design.

### Development-only and capture overhead

`system / ExternalStringData` accounts for approximately 30.4 MB. Retainer paths for several of the largest allocations lead to Vite-loaded module source, including:

- `data/builtinPresets/shuangrenchenghang.json?import`
- `react-dom_client.js`
- `components/features/GameSystems/album/workspaces.tsx`
- `components/features/GameSystems/ZhikuPanel.tsx`
- `hooks/useGame/sendWorkflow.ts`

This memory should not be treated as equivalent production application state. Some external string backing also belongs to image `src` values, so the full category is mixed.

### Fiber nodes

The snapshot contains approximately 16,072 `FiberNode` objects with 2.31 MB of self memory. This is consistent with a large mounted development tree, alternate fibers, Strict Mode, and profiling metadata. Fiber count demonstrates tree size but does not independently prove retained obsolete trees.

### Detached DOM

The snapshot reports 6,870 detached nodes with approximately 0.78 MB of self memory:

| Node | Count |
| --- | ---: |
| `<div>` | 3,514 |
| `<span>` | 1,376 |
| `<p>` | 826 |
| `<button>` | 386 |
| `<img>` | 338 |
| Text | 357 |

The strongest caution is provenance: the shortest strong path for the detached document begins at a DevTools console global handle and proceeds through a retained body/document. Consequently, this capture cannot distinguish an application listener leak from an old document retained by inspection tooling.

No detached-DOM fix should be implemented solely from this snapshot.

## Corrected Priority Order

### P0: Reduce React invalidation

1. Stabilize `App` callbacks, beginning with `onEditBody` and image regeneration.
2. Stop action callbacks from depending on the complete `state` facade; use narrow dependencies or a current-state ref where behavior requires current values.
3. Add memo boundaries around the historical chat subtree and `TurnItem`.
4. Ensure shared props passed to memoized turns remain stable unless their actual domain value changes.
5. Split scroll controls and `nearBottom` state from the rendered message history.

Expected result: scroll state and unrelated shell state should render only the owning control/subtree, not 80 historical messages.

### P0: Stop retaining image payloads as runtime strings

1. Store image bytes as `Blob` values in IndexedDB's asset records.
2. Keep asset IDs and metadata in React state rather than full data URLs.
3. Resolve a short-lived object URL only for assets currently displayed.
4. Cache object URLs with explicit ownership or reference counting.
5. Revoke URLs when assets are deleted and when their final consumer unmounts.
6. Convert a Blob to base64 only at API boundaries that explicitly require base64.
7. Preserve migration support for existing string-backed asset records.

Object URL lifecycle must be handled carefully: revoking a URL while another visible component still uses it will break the image.

### P1: Reduce work inside the bounded history window

1. Precompute previous-user and path-fallback metadata in one pass.
2. Memoize parsed bodies and character lookup maps using stable domain inputs.
3. Consider a smaller viewport-based render window or virtualization once memoization is verified.
4. Generate display thumbnails for large album assets rather than decoding full-resolution images for small avatars/cards.

### P2: Paint and visual effects

After P0 changes, recapture and then evaluate:

- animated shadows and filters;
- backdrop blur;
- clip paths on repeated message elements;
- smooth scrolling during streaming;
- offscreen content with `content-visibility`;
- compositor layer count and image rasterization.

The current trace does not justify prioritizing these above React work.

## Corrections to `grok_interface_optimization.md`

The existing report correctly identifies React tree-wide commits and callback churn as the CPU priority. The following claims need qualification:

1. Trace categories such as `RunTask`, `FunctionCall`, and `EventDispatch` are nested. Summing them as independent CPU time double-counts the same work.
2. The renderer-main `RunTask` total measured directly from complete events is approximately 13.68 seconds, not 27.9 seconds.
3. The trace supports “React DOM event work” but does not expose enough function metadata to attribute every long handler to a specifically named internal function.
4. Detached chat-shaped DOM does not prove an application leak when an old document is retained by DevTools console state.
5. A single heap snapshot establishes retained state, not memory growth. Leak claims require controlled comparison snapshots.
6. `FiberNode` count measures current/development tree cost but is not itself proof of stale fibers.

## Verification Plan

### CPU regression capture

Use the same saved game and repeat the same interaction sequence after each optimization batch. Record both development and production-mode captures.

Targets after the first React batch:

| Metric | Current | Initial target |
| --- | ---: | ---: |
| Severe React commit | 169–202 ms | Below 50 ms |
| Fibers rendered for scroll-button state | ~1,670 | Only the scroll control subtree |
| Fibers rendered for unrelated shell state | ~1,729 | Only the owning shell subtree |
| Longest input task | 206 ms | Below 50 ms |
| Historical `TurnItem` renders on unrelated updates | 80 | 0 |

### Memory comparison capture

1. Reload the application with DevTools console cleared.
2. Avoid selecting or logging DOM nodes.
3. Force garbage collection and take a baseline heap snapshot.
4. Open and close the relevant panels and scroll through history repeatedly.
5. Return to the baseline UI state.
6. Force garbage collection again and take a second snapshot.
7. Compare retained detached documents, nodes, fibers, listeners, and asset payloads.
8. Repeat after the Blob-backed asset change with the same album.

Success criteria:

- no monotonic growth in detached document trees after repeated open/close cycles;
- album base64 strings absent from long-lived React state;
- object URLs revoked after final use;
- visible images remain stable during navigation and rerenders;
- production heap is evaluated separately from Vite module-source overhead.

## Conclusion

The evidence supports a focused first sprint: isolate React update boundaries and move image bytes out of long-lived string state. Those changes address the measured causes directly. Detached DOM cleanup and broad CSS simplification should wait for controlled follow-up captures so that capture-tool artifacts are not mistaken for product defects.
