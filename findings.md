# Consolidated Findings

**Sources:** test_findings.md and regression-findings.md
**Method:** Static source, history, and call-chain review. No build, dev server, package installation, or test command was run.


----

Before everything:
Currently, for this Kernel and UI part, we have equal to ZERO logging feature for debugging.
Add loging feature to kernel, and add logging feature exposed to UI.

UI -> Kernel Logger -> Log Target
Kernel Component -> Kernel Logger -> Log Target

Better: make a simple yet powerful logging component yourself.
Currently, as the Kernel runs in the browser too, log them to console.

----

## P0 — Compatibility and authoritative state

### Legacy saves, packages, preferences, and content need migration

- Existing main-era saves are listed but rejected by the portable-save reader because required schema fields are absent; Continue ignores these saves.
- Save-package version 2 is rejected before conversion because the package reader requires version 3. Portable DTO schema version 1 is a separate inner contract; the two displayed versions are not expected to match.
- Startup reads only new preference planes. Legacy game settings, theme, worldbooks, story weaving, and Zhiku state are not migrated, so they can appear to reset; api settings survive only because their key remained.
- V1 Tavern libraries, selection, world-info/order fields, and sampling data cannot enter the V2-only store because both the converter and the old flat-settings migration path are absent.

**Required direction:** Migrate legacy packages and saves before strict validation, migrate flat preferences before first-run default writes, and enable Continue for successfully migrated saves.

### Settings can partially commit and React incorrectly leads the kernel

- Settings persistence writes device planes and then separately replaces session policy. A busy session can reject the latter after the device writes complete.
- Several callers optimistically update React and fire-and-forget persistence, with neither rollback nor unified failure reporting.
- React holds local settings/theme/content copies but does not follow a device projection. Startup checks and kernel execution can therefore disagree.
- The streaming switch changes only React state, so the next turn can still use the previous execution policy.

**Required direction:** Remove the two-plane bridge. Establish device and session projection followers; React may hold editable drafts but only confirmed kernel projections may be authoritative display state. Route streaming through the execution-policy capability.

## P0 — Command lifecycle, concurrency, and cancellation

### Opening turns and projection initialization fail independently

- After terminal rejection, the opening-turn effect clears its sent ref but leaves its pending trigger. Projection resynchronization sends the same opening text again, causing the observed generating/waiting loop.
- The later active-command error from restarting is a separate mutual-exclusion failure and cannot identify the original rejection cause.
- Session connection subscribes before projection initialization. The first command event can fail with Kernel projection is not initialized, leaving the projection stale.

**Required direction:** Terminally consume or resolve the opening trigger, initialize projections before events can arrive, and add restart confirmation plus an intentional busy-session policy.

### Long work blocks short user work

- Album/image generation and durable-job execution occupy the same exclusive session command slot as saves, refreshes, and restores.
- DEV Zhiku refresh has a reproducible failure sequence because job draining and UI commands are not uniformly scheduled.
- Restore built-in plot and refresh controls expose the same contention with inconsistent error presentation; Plot also uses a browser alert.

**Required direction:** Separate long-running job ownership from short transactions, define permitted concurrency, and explicitly interrupt prior work when a newer User intent supersedes it.

### Cancellation is not a reliable kernel guarantee

- A running job blocks job cancellation behind the same session lock.
- Durable-job aborts become retry/failed rather than cancelled.
- Kernel cancellation does not normalize leaf AbortError values to the public cancelled terminal state.
- Phone generation does not pass its abort signal into the request/retry chain.

**Required direction:** Make the job runner an addressable command owner, permit direct cancellation of that owner, persist cancelled, normalize aborts at the kernel boundary, and place abort gates before every commit.

## P1 — User-facing flow and boundary issues

### Opening, home, settings, and Zhiku

- There is no direct copy-main-model-to-auxiliary-models interaction; save feedback clears too quickly and causes UI jitter.
- Applying an opening preset overwrites populated drafts without confirmation. AI opening generation has neither cancellation nor a lock-existing-fields/fill-the-rest merge policy.
- Free-opening creation no longer has its local fallback when an archive API is missing or fails.
- Error/trace UI is visible whenever an error arrives; gate it behind extra features or dev mode.
- The home Settings route can reach an ErrorBoundary, while the API-required settings route mounts the same modal. The failure is confirmed, but source-only evidence cannot yet attribute a root cause.
- Context inspection exposes a raw missing-session error instead of saying that a save must be loaded first.
- The home Zhiku manager uses an empty pre-session projection, so it cannot preview bundled content.

### UI composition boundary is inverted

Presentation modules directly resolve the application composition root. Caching prevents repeated kernel creation, but the service-locator dependency scatters lifecycle, failure, and test-injection semantics.

**Required direction:** Resolve the composition root once in bootstrap/provider code; give UI modules scene-specific presentation clients, projections, and intent callbacks.

## P1 — Regressed or removed main-era behavior

### Tavern and prompt behavior

- Selected Tavern sampling parameters are stored but no longer affect narrative requests.
- The Tavern role-postprocess selector is removed.
- Tag repair is always on; the former debugging/compatibility control is removed.

### Turn and recovery behavior

- Reroll no longer supplies previous-response/nonce context, disconnecting anti-repeat prompting and similarity protection.
- Reroll immediately sends a new request rather than restoring the original input for editing first.
- Variable Manager remains visible but is read-only; its former field and JSON recovery edits are gone.

### Auxiliary behavior

- Automatic phone seeds lack their deterministic fallback when calibration is unavailable or emits none.
- The visible effect of 如我所书 cannot be classified from the current report alone; add separate source regression contracts for content saving, retrieval selection, and prompt construction.

## Confirmed non-regressions

- Main turn and most story mutations use typed session capabilities, command events, and the session projection store; no direct presentation-layer IndexedDB/session-repository access was found in scope.
- Turn rollback, autosave, and safe Tavern output cleanup remain.
- Removed placeholder system panels, unreachable path debug UI, and deprecated narrative-image preference had no production behavior to preserve.
- Auxiliary text routes intentionally require independent API profiles; image prompt tokenization remains a text route rather than an image-generation route.

## Recommended order

1. Add save/package and preference migrations before strict reads or default writes.
2. Make kernel projections the sole authority for displayed device and session state.
3. Repair projection startup, opening-trigger failure handling, cancellation, and concurrency/preemption policy.
4. Replace direct composition-root imports with a provider/presentation-client seam.
5. Restore or explicitly retire the remaining P1 controls and degraded fallbacks, with targeted regression contracts.

## Detailed evidence and causal paths

### Save compatibility: two independent format gates

The outer .ktysave package is rejected by services/savePackage.ts when packageVersion is not exactly 3. There is no version-2 upgrade branch between decompression and save conversion.

The inner story DTO is separately rejected by the portable-save reader when portableSchemaVersion is missing or not 1. Main-era save records do not contain this field and also include device fields such as gameSettings that current portable validation does not accept. The import failure saying version 3 versus 2 and the load failure saying version 1 versus undefined therefore describe different layers, not inconsistent requirements.

The current restore path reaches catalog.loadSave before session restoration, so validation failure is directly surfaced to the UI. Startup only checks the new kernel session, which is why legacy records do not enable Continue. The former migration gate and portable migration code were deleted during the cutover; there is no current import or migration action.

### Preference migration and first-run overwrite risk

Main startup hydrated theme, api settings, game settings, story weaving, Zhiku, and saved worldbooks from existing keys. Current device loading queries api settings, execution policy, appearance preferences, content library, and save policy, then supplies defaults for absent planes.

The browser preference adapter still has access to legacy records, but no migration or fallback reads gameSettings, theme, worldbooks, storyWeavingSystem, or zhikuSystem. Current startup treats an absent content library as first-run state and writes bundled worldbooks. This makes missing migration destructive in appearance: the new defaults are then the only visible data.

The same missing flat-settings migration prevents the former V1-to-V2 Tavern converter from running. Current split/compose settings and runtime resolution only retain V2 entries, while the visible importer accepts V2 JSON only. User therefore has no in-app recovery path for stored V1 presets, active selection, world-info, ordering, or sampling configuration.

### Why settings can lie about completion

The current settings bridge writes execution, appearance, content, and save device preference planes first, in parallel. It then independently opens the session and replaces story policy. These operations have no shared command ID, event stream, cancellation protocol, compare-and-swap, rollback, or transaction boundary.

NativeKernel allows only one active command per session. A turn, image generation, background task, or concurrent settings action can therefore reject policy replacement after device preferences committed. SettingsModal, StarMapPanel, and AlbumWorkspace have call sites that discard this promise, so the UI can render the new value even when the kernel did not accept the complete intended change.

The device use cases already expose subscription, but the UI does not consume it through a follower store. ApiSettings actions can update React before writing the kernel. The pre-opening API check reads that React copy while onboarding reads the preference store, allowing two parts of the product to disagree during a failed or pending write.

### Opening turn failure is a feedback loop, not merely a restart conflict

The automatic turn-zero effect resends the opening text after any terminal rejection because it clears openingTriggerSentRef without consuming pendingOpeningTrigger. A rejection changes the projection through resync and back to stable state, which re-runs the effect because state and actions are dependencies. The result is a repeatable generating/waiting loop.

The original terminal rejection was not preserved in the reported record. A model/protocol failure or a job-command conflict can trigger the loop, but the later Session already has an active command message after clicking restart cannot be used to infer that first cause. Restart itself lacks confirmation and can be rejected by the kernel mutual-exclusion guard.

### Why Zhiku refresh follows a strange fixed sequence

Session reads and ordinary command completion both schedule job draining. The drain runs as a job-command and occupies the same activeSessionCommands slot as regular UI commands. Zhiku refresh first reads revision and then starts through a deferred handle, so it deterministically collides with this schedule: the observed first failure, second apparent success, and later failures are not random behavior.

Independently, connectSession commits its subscription without initializing the SessionProjectionStore. The first command event reaches an uninitialized projection, throws, and is only logged by HotEventStream. That event is not applied, adding stale UI state to the first refresh attempt.

### Why long API work blocks unrelated user actions

Album generation performs the complete image API wait inside an exclusive kernel command. Narrative image regeneration enters the durable queue, but job claim, start, and execution still occupy the same session slot. This is why save failure, plot restore failure, and Zhiku refresh conflicts surface while image/background work is active.

The current design has neither a separate read/generation lane nor a uniform policy for user-directed interruption. The visible errors differ by race point: the UI active-command guard shows Another kernel command is running, while the kernel lock shows Session already has an active command. Both are manifestations of the same serial model.

### Why cancellation has no consistent public meaning

An ordinary job.cancel command must acquire the session lock already held by a running job.execute command, so it cannot call cancelJob at the required time. Even if an abort later arrives, executeDurableJob catches AbortError as a generic error and records retry or failed instead of cancelled.

NativeKernel.cancelAndWait aborts and waits for generator exit, but it does not require every leaf use case to return the same cancelled terminal result. A direct AbortError is wrapped by CommandRunner as unknown. BrowserPhoneReplyGenerator checks its signal before and after generation but does not pass it into generatePhoneReply, chatCompletionNonStream, or withRetries; the request and retry loop can finish before interruption is observed.

### Presentation behavior requiring separate remediation

The error reporter is mounted unconditionally in index.tsx and displays whenever it receives an error. Extra features currently contain no diagnostic-display gate.

The home Settings failure is confirmed as an ErrorBoundary event, but it occurs before a game session exists. The previously suggested story-chapter explanation cannot be correct because that throw only exists in the game branch. Ordinary home Settings and API-required Settings ultimately mount the same SettingsModal API page; current source evidence only distinguishes settingsReturnView. The first raw exception or diagnostic ID is required to establish cause.

Context inspection unconditionally opens local-session through getContextSnapshot. In the home/no-save state this session does not exist, and ContextInspectorTab displays the internal exception rather than a load-a-save prerequisite.

Home Zhiku is initialized from the empty pre-session projection. Bundled runtime Zhiku is hydrated only at the session boundary, so the home manager has no independent preview source. Plot restore additionally combines inline error state and window.alert, unlike the other panels.

### Kernel boundary and asynchronous-model debt

There are 26 App, hooks, and components modules that directly import getAppRoot. The cached root means this is not duplicate kernel construction, but it makes presentation code a service-locator caller. Capability discovery, lifecycle ownership, failure semantics, and replacement/testing boundaries are consequently scattered across each call site rather than defined at one presentation seam.

The stated IKernel contract says React should acquire capabilities through a single app-kernel provider seam, but no such provider/client seam currently exists. The composition root should be resolved once by bootstrap/provider code; UI should receive only scene-level clients, read-only projections, and intent callbacks.

The public session contract also references models and services AI input/output types directly. TurnExecutionState duplicates the story graph into mutable legacy-shaped fields before rebuilding StoryState. NativeKernel centralizes command switching, session exclusion, durable-task scheduling, and execution dispatch. This is an application facade plus compatibility adaptation, rather than an independently evolvable domain/application core; adding a long-running command requires changing the central dispatcher.

Not all user-visible asynchronous work uses CommandHandle semantics. Battle-skill draft generation and album character-anchor, prompt, and scene resolution return bare promises. They do not directly commit Session state, but they still use API capacity and lack command IDs, event streams, cancellation guarantees, and lifecycle ownership.

### Main-era feature losses: detailed mechanisms

Main reroll captured the prior assistant response and a nonce, passed them as rerollContext into generation, and used them for both prompt discouragement and similarity retry. The current reroll passes only the original player text through the generic pipeline; the guard remains but receives no context, so it is inert.

Main reroll also removed the latest user/assistant pair, restored pre-turn state, and returned the original input to InputArea for editing. Current reroll immediately begins generation and returns no editable text. Aborting can restore text only after a request has already started.

Main Variable Manager received setters and offered both field edits and JSON draft saving. The current panel declares itself a projection and renders read-only values even though the Settings entry point remains visible.

Main synchronized the selected Tavern preset sampling values into active API configuration. Current selection updates only V2 preset and character identifiers; narrative generation uses captured API configuration directly. Sampling can therefore be configured/imported yet has no request effect.

Main exposed enableTagRepair and passed it to parsing. Current parsing is invoked without an option and defaults repair to enabled. Main also exposed Tavern role postprocessing; current message-chain construction returns merged messages with no mode and the settings selector is gone.

Main created a low-frequency deterministic fallback phone seed when automatic seeds were enabled. Current seed creation depends entirely on variable-model facts, with no fallback producer or manual create command.

### Findings intentionally not elevated to a confirmed defect

The 如我所书 manager can save and read content-library data, but the claimed missing visible effect depends on downstream context injection. No reproducible input, expected injected content, or captured request was provided. It should receive regression contracts at three points: content persistence, retrieval selection, and request construction; until then, it should not be described as a confirmed injection failure.

The deleted SystemPanels placeholder had no production consumer, PathDebugView was unreachable even on main, and the narrative-image preference was explicitly deprecated with no UI or execution consumer. These are stale removals, not functional regressions.


Codex casually traced the main findings into the current source. The report is broadly credible; the strongest root causes are architectural, not isolated UI mistakes.

### Highest-confidence root causes

- **Save compatibility is blocked by strict readers with no migration seam.**  
  `readPortableSave()` rejects anything whose `portableSchemaVersion` is not the current value and also rejects legacy device fields outright ([portableSave.ts](/Users/earmercarey/KaiTuoYiShi/src/kernel/application/portableSave.ts:36)).  
  The package reader independently requires the exact current `packageVersion` ([savePackage.ts](/Users/earmercarey/KaiTuoYiShi/services/savePackage.ts:306)).  
  So the “version 2 vs version 3” and “undefined vs version 1” errors are two separate format gates, not contradictory errors. The missing piece is an ingress migration layer before strict validation.

- **Preference loss comes from replacing the old flat store with new planes without a first-run migration.**  
  The current runtime composes settings from the new device/session structures (`resolveCommandSettings()`), while legacy fields such as `gameSettings`, theme, worldbooks, story weaving, and Zhiku are not visibly translated before defaults are written. This explains why data can look reset even when old IndexedDB records still exist.

- **Settings can report success before the kernel has accepted the complete change.**  
  Device preferences and session story policy are separate writes, while `NativeKernel` permits only one active command per session ([NativeKernel.ts](/Users/earmercarey/KaiTuoYiShi/src/kernel/NativeKernel.ts:93)).  
  Therefore a device-plane write can succeed and the later session-policy replacement can be rejected. Optimistic React updates then make the UI display a state the kernel never committed.

- **Opening-turn looping is a feedback loop caused by trigger ownership.**  
  The state explicitly persists `pendingOpeningTrigger` ([turnExecutionState.ts](/Users/earmercarey/KaiTuoYiShi/src/kernel/application/turn/turnExecutionState.ts:43)), but the failure path appears to clear the “already sent” guard without consuming or resolving the pending trigger. Projection resync then looks like a fresh opening request. The later “active command” error is a consequence of the retry, not the original failure cause.

- **Concurrency problems all reduce to one exclusive session command slot.**  
  `activeSessionCommands` treats turns, image generation, durable jobs, refreshes, saves, and restores as the same kind of mutually exclusive operation ([NativeKernel.ts](/Users/earmercarey/KaiTuoYiShi/src/kernel/NativeKernel.ts:98)).  
  That is why unrelated short actions fail during long image/AI work. The different error messages are just different rejection points around the same serialization model.

- **Cancellation is only implemented at the outer command boundary.**  
  `NativeKernel.cancel()` aborts the controller ([NativeKernel.ts](/Users/earmercarey/KaiTuoYiShi/src/kernel/NativeKernel.ts:306)), but cancellation still has to compete with the active session command. Also, the phone adapter only checks the signal before and after the request; it does not pass the signal into the request/retry chain ([BrowserPhoneReplyGenerator.ts](/Users/earmercarey/KaiTuoYiShi/src/kernel/adapters/browser/BrowserPhoneReplyGenerator.ts:10)).  
  This explains cancellation arriving late, becoming generic failure, or being persisted as retry/failed instead of cancelled.

### Strong P1 causes

- **Reroll protection is wired but receives incomplete context.**  
  The prompt builder supports `rerollContext`, including nonce and previous response ([buildTurnPromptPlan.ts](/Users/earmercarey/KaiTuoYiShi/src/kernel/application/turn/stages/buildTurnPromptPlan.ts:135)), but the current reroll path is not supplying the old response context consistently. The guard therefore exists but can be inert.

- **Streaming is a split-brain setting.**  
  Narrative generation reads `state.gameSettings.enableStreaming` ([turnExecutionState.ts](/Users/earmercarey/KaiTuoYiShi/src/kernel/application/turn/turnExecutionState.ts:53)), while the UI can change its own React copy independently. That makes the visible toggle and the next kernel execution policy diverge.

- **Phone seed fallback disappeared at the producer boundary.**  
  Variable calibration decides whether automatic phone seeds are enabled, but there is no clear deterministic fallback producer when model facts are absent. The failure is therefore upstream of phone rendering, not in the phone UI.

- **The composition boundary is genuinely inverted.**  
  There are only four direct `getAppRoot` references in the current source, but they are strategically placed in adapters/preferences and composition-facing code. The deeper issue is that UI-facing code still reaches the composition root directly instead of consuming a provider-owned presentation seam. This scatters lifecycle and failure semantics even if root caching prevents duplicate kernels.

### Observability finding

The “zero logging” statement is slightly overstated: there are a few raw `console.error` calls in `CommandRunner`, autosave, and turn workflow code. But there is no coherent kernel logger, command ID/session correlation, structured event payload, or UI-visible log target. In practice, the system is effectively unobservable. This is likely why several findings can identify symptoms and call-chain races but not the original rejection reason.

### Findings Codex would downgrade for now

- **Home Settings ErrorBoundary:** confirmed symptom, root cause not proven from current source alone.
- **如我所书 visible effect:** insufficient evidence; persistence, retrieval selection, and prompt construction need separate checks.
- **Removed placeholder panels / deprecated narrative-image preference:** appear intentional removals, not regressions.
- **Tavern sampling / role postprocess / tag-repair:** likely real behavior losses, but they are compatibility regressions rather than kernel corruption.

Overall, the report’s central diagnosis is sound: the cutover introduced a new kernel authority model, but migration, projection-following, command ownership, cancellation semantics, and observability were not completed as one coherent boundary. That incompleteness is the common root cause behind most P0/P1 symptoms, nya~