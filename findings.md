# Findings: Player-Reported Bugs & UX Issues

## Uncommitted-change review resolution (2026-07-18)

The three former P2 notes were rechecked against the authoritative source and are resolved:

1. `openSettings`, the ordinary API-settings route, and `handleCloseSettings` all clear `settingsReturnView`; an abandoned new-game detour cannot affect a later Settings visit.
2. `handleAbort` awaits the active `CommandHandle.cancelAndWait()` terminal result before the UI restores the draft.
3. `InputArea` routes send, reroll, and abort promises through `ignoreHandledAction`; the command boundary records expected failures, while handled event promises cannot reach the global `unhandledrejection` reporter.

**Branch:** `refactor/ikernel`  
**Date:** 2026-07-17  
**Scope:** Code-backed investigation of reported defects after the iKernel / runtime-authority refactor. This document **acknowledges every reported item**, maps each to concrete code paths, and ranks likely root causes. It is an investigation report, not an implementation plan.


Raw prompt
```
问题：
    - 点击重试按钮故障：老消息会仍然在界面上，新消息在老消息下面/开拓进行中 的文字在回复完成后仍然存在。    
    - 新消息发送后消息框不会清空；          
    - 在消息发送过程中，似乎“注入智库/历史消息”的辅助AI被略过了；           
        - 内置智库现在什么东西都没有——应该默认有基础的内容——可能与这个问题有关，需要pick历史的修复。                              
        - 与此同时，自动审查                
    - 无论API（此处使用Gemini，正常看见回复了）是否正确响应，都会“重试n次”。
    - API的配置和“存档”绑定                 
    - Album部分的“生成提示词”按钮不可用；   
        requireIndependentApiConfig.ts:29 Uncaught (in promise) Error: 文生图词组转化器独立 API 配置不完整：provider、baseUrl、apiKey、model
        at requireIndependentApiConfig (requireIndependentApiConfig.ts:29:11)
        at buildImagePromptTokenizerConfig (imagePromptTokenizer.ts:26:8)
        at methods.<computed> [as buildImagePromptTokenizerConfig] (BrowserKernelServices.ts:39:58)
        at applyTokenizerIfAvailable (AlbumWorkspace.tsx?t=1784220252343:805:61)
        at async buildPromptForTarget (AlbumWorkspace.tsx?t=1784220252343:844:24)
        at async Object.handleBuildPrompt [as onBuildPrompt] (AlbumWorkspace.tsx?t=1784220252343:901:19)
        （可能是该问题：“一键应用”并没有应用到文生图API中）
    - 生成的“手机背景”似乎并不能在手机的“背景”菜单中被看见，选择和应用
    - （游戏内）存档的读取功能不会完全重新加载聊天内容，使得某些「点击重试按钮故障」类似故障不能通过这种方式解决；似乎必须要一个Shift+F5才能好。
    优化：
    - 丢弃物品的丢弃后文案&提示可以有一个“撤回”；
    - 所有过度解释的文案；
    - 自定义剧情的“章节标题”切片逻辑表述不清。
    Also acknolwedge these issues.
    Create an elaborate, detailed `findings.md`.
```

---

## Executive summary

Most of the “chat feels broken after send/retry/load” symptoms share one architectural theme:

> **React UI state and kernel session runtime are no longer a single writer.**  
> Streaming, history truncation, API/settings, and 智库 hydration each live in different stores, and several success/failure paths only update one of them.

| # | Report | Verdict | Severity |
|---|--------|---------|----------|
| 1 | Retry: old message stays; new under it; “开拓进行中” sticks | **Confirmed design gap + incomplete cleanup** | P0 |
| 2 | Input box not cleared after send | **Confirmed on error / late-throw paths** | P0 |
| 3 | 智库 / 历史辅助 AI skipped; builtin 智库 empty; auto-review | **Confirmed multi-cause; empty 智库 is high-likelihood** | P0 |
| 4 | Always “重试 n 次” even when Gemini returns text | **Confirmed: protocol-strict auto-retry + UI failCount** | P0 |
| 5 | API config bound to save | **Confirmed by design in kernel session** | P1 |
| 6 | Album “生成提示词” throws incomplete tokenizer API | **Confirmed; 一键套用 does not cover tokenizer** | P1 |
| 7 | Generated phone wallpaper not visible in phone 背景 menu | **Confirmed product/data seam gap** | P1 |
| 8 | Load save does not fully reset chat UI (need Shift+F5) | **Confirmed incomplete UI/session reset** | P0 |
| UX | Discard undo; verbose copy; unclear chapter-title slicing | **Acknowledged product polish** | P2 |

---

## System context (why these bugs cluster)

### Architecture after iKernel

```
InputArea / ChatList / Phone / Album
        │
        ▼
   hooks/useGame.ts          ← React projection + streaming store
        │  kernel commands
        ▼
   NativeKernel / BrowserTurnEngine
        │
        ▼
   sendWorkflow / rerollTurn / resetSession
        │
        ▼
   RuntimeGameState (chatHistory, 智库, apiSettings, gameSettings, …)
```

### Architecture verdict: command kernel skeleton, but not yet a rigorous application kernel

The current `IKernel` has useful machinery worth preserving: commands enter through a unified dispatcher, revisions/CAS guard formal commits, and running commands have an explicit cancellation lifecycle. That does not make the overall boundary architecturally sound.

At present it is better described as a **persistent runtime orchestrator with a kernel-shaped API** than a mature kernel with strict ownership and dependency boundaries:

- React and the SessionRepository both write the complete runtime graph; `session.checkpoint` reconciles them by whole-graph replacement rather than by domain commands.
- `RuntimeGameState` mixes story state with device preferences such as API configuration and theme.
- Session projections can write those preferences back into React, so rollback/rejected paths can mutate configuration unrelated to the failed story command.
- `IKernel` exposes command execution, saves, preferences, and a broad service locator instead of one focused application boundary.
- Hooks reach the kernel composition root and internal runtime/workflow types directly, leaving the adaptation layer unable to enforce isolation.
- The process-frame protocol is too weak to express important intermediate state, so React-side stores and patches still fill gaps outside the formal command model.

This is not merely a naming or aesthetic objection. The API configuration rollback described in Issue 5, runtime/UI dual authority, and incomplete process projection are observable consequences of the same boundary failure. A breaking redesign of runtime ownership, execution-context injection, projection semantics, and the public `IKernel` surface is warranted; incremental live overlays cannot make the current model rigorous.

Key files:

| Layer | Path |
|-------|------|
| UI send / reroll / load | `hooks/useGame.ts` |
| Input local state | `components/features/Chat/InputArea.tsx` |
| Stream store | `utils/streamingMessageStore.ts` |
| Chat list + streaming leaf | `components/features/Chat/ChatList.tsx`, `MessageRenderers.tsx` |
| Reroll domain | `src/kernel/application/rerollTurn.ts`, `domain/turn/findTurnBaseSnapshot.ts` |
| Turn execution | `src/kernel/adapters/browser/BrowserTurnEngine.ts`, `workflows/sendWorkflow.ts` |
| Protocol / retry | `src/kernel/protocol/mainResponse.ts`, `getMainProtocolIssues` in `sendWorkflow.ts` |
| 智库 merge | `data/zhikuPreset.ts`, `hooks/useGameState.ts` |
| API apply-all | `components/features/Settings/ApiSettings.tsx` |
| Tokenizer gate | `services/ai/imagePromptTokenizer.ts`, `requireIndependentApiConfig.ts` |
| Phone wallpapers | `components/features/Phone/PhoneModal.tsx` |
| Inventory discard | `components/features/GameSystems/InventoryPanel.tsx` |
| Custom plot import UI | `components/features/GameSystems/PlotPanel.tsx` |

---

## Issue 1 — Retry button: old message remains; new message below; “开拓进行中” persists

### Acknowledgement

**Acknowledged.** This is the most user-visible regression in the send/reroll loop. The expected behavior is: one in-place replacement of the latest assistant turn (or a temporary single streaming bubble), never “old reply + streaming reply + sticky pathfinding banner.”

### Observed behavior (as reported)

1. Click 重试 / reroll.
2. Previous assistant bubble stays on screen.
3. A new stream / reply appears **below** it.
4. After the model finishes, the “开拓进行中…..” indicator can remain.

### Evidence in code

#### A. Reroll correctly truncates **kernel** history, but UI only updates on commit

`findTurnBaseSnapshot` rebuilds runtime with history cut **before** the last user+assistant pair:

```25:43:src/kernel/domain/turn/findTurnBaseSnapshot.ts
  const chatHistory = snapshot.state.runtime.chatHistory.slice(0, assistantIndex - 1);
  const runtime = cloneRuntimeGameState({
    ...snapshot.state.runtime,
    // … preTurn domain restore …
    chatHistory,
    turnCount: preTurn.turnCount,
  });
```

`rerollTurn` advances from that base, then **only commits** the final runtime:

```43:78:src/kernel/application/rerollTurn.ts
  for await (const frame of dependencies.turns.advance(...)) {
    if (frame.type === 'progress') {
      yield { type: 'progress', …, delta: { kind: 'narrative', text: frame.text } };
      continue;
    }
    runtime = frame.state;
  }
  // …
  yield await commitCommand(envelope, dependencies.sessions, { runtime });
```

Meanwhile `handleReroll` in `hooks/useGame.ts`:

- On **progress**: only `setStreamingMessage(delta.text)` — **does not** remove the previous assistant from `chatHistory`.
- On **committed**: `applySessionView` replaces history.

So for the entire stream duration, `ChatList` renders:

1. Full previous history (including the message being rerolled), **and**
2. A separate streaming `TurnItem` when `streamingMessage` is non-empty:

```235:250:components/features/Chat/ChatList.tsx
      {streamingMessage && (
        <TurnItem
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingMessage,
            isStreaming: true,
          }}
          isStreaming
          …
        />
      )}
```

That matches “old message still on screen, new message below.”

#### B. “开拓进行中” is hard-wired into every streaming preview

```604:617:components/features/Chat/MessageRenderers.tsx
export function StreamingPreview({ content, … }) {
  const { bodyStarted, bodyText } = useMemo(() => extractStreamingBody(content), [content]);
  return (
    <div className="space-y-2">
      <PathfindingIndicator />   {/* always rendered while streaming leaf exists */}
      {bodyStarted && bodyText && ( … BodyBlock … )}
    </div>
  );
}
```

As long as `streamingMessage` is non-empty, the pathfinding banner is shown — even after body text is complete.

#### C. Streaming clear is incomplete on failure paths

Success path in `handleReroll` / `handleSend` clears stream:

```308:309:hooks/useGame.ts
      setStreamingMessage('');
      s.setWorkflowStatus('');
```

But the **catch** branches set workflow hint/status only — they do **not** clear `streamingMessage`:

```311:318:hooks/useGame.ts
    } catch (error) {
      s.setWorkflowStatus('');
      s.setWorkflowHint(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      // loading cleared; streaming NOT cleared here
```

`sendWorkflow`’s `finally` does call `setStreamingMessage('')`, but only when `isCurrentWorkflow()` is still true. Abort / replaced controller / rejected frames can leave the external stream store dirty. After iKernel, UI and workflow both write the same store (`setStreamingMessage` in `sendWorkflow` **and** in `useGame`), which makes last-writer races more likely.

#### D. Dual writers of streaming state

| Writer | When |
|--------|------|
| `sendWorkflow` via `streamMessageSetter` | Inside turn engine draft |
| `useGame` `showProgress` | Kernel progress frames |

Both call `setStreamingMessage`. A late progress flush after UI clear can re-stick the banner.

### Root-cause ranking

1. **P0 structural:** Reroll does not project a truncated history to React until commit → dual bubbles.
2. **P0 cleanup:** Error / race paths leave `streamingMessage` non-empty → sticky “开拓进行中”.
3. **P1 UX:** Indicator always shown for any streaming content, even when body is finished.

### Fix direction (not implemented here)

- Do not optimistically truncate or hide history in React. On reroll start, the kernel should emit a command-scoped projection containing the pre-turn runtime; the UI renders that projection and never guesses domain state.
- Remove `sendWorkflow` as a direct writer of the global streaming store. Keep one progress path only: kernel progress frame → projection store → streaming leaf.
- Make projection terminal handling clear the transient progress exactly once for committed, rejected, cancelled, and replaced commands; do not scatter competing `setStreamingMessage('')` calls across workflow and UI layers.
- `PathfindingIndicator` should derive from an explicit streaming phase, not merely from a non-empty text string.

---

## Issue 2 — Message box not cleared after send

### Acknowledgement

**Acknowledged.** Input should clear as soon as a send is accepted (or at least when the turn successfully starts), not only after a fully successful round-trip.

### Evidence

`InputArea` only clears **after** `onSend` resolves:

```68:75:components/features/Chat/InputArea.tsx
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    lastSubmittedRef.current = trimmed;
    await onSend(trimmed);
    setInput('');
    inputRef.current?.focus();
  }, [input, loading, onSend]);
```

`handleSend` in `useGame` **throws** on rejected terminal frames and on several guard errors. Any throw skips `setInput('')`.

That couples tightly with Issue 4: if Gemini returns readable narrative text but protocol validation fails / auto-retry eventually fails / settlement rejects, the user **sees** a reply (stream preview or partial history) while the input still holds the old text.

Additionally:

- Abort path **intentionally** restores `lastSubmittedRef` (good for cancel).
- `recoveryDraft` can re-fill input after a browser-interrupted workflow (`App.tsx` + `InputArea` effect). That is correct for recovery, but if a recovery journal is left around incorrectly, it can look like “send didn’t clear.”

### Root-cause ranking

1. Clear-on-success-only in `InputArea` (should clear-on-accept).
2. `handleSend` throws after user-visible stream activity.
3. Secondary: recovery draft / abort restore.

### Fix direction

- Clear input immediately when send is accepted (`setLoading(true)` / command enqueued), keep draft in `lastSubmittedRef` for abort/recovery.
- Or clear in `onSend`’s `try` before awaiting, not after.

---

## Issue 3 — 智库 / 历史辅助 AI skipped; builtin 智库 empty; 自动审查

### Acknowledgement

**Acknowledged as a cluster.** Three related symptoms:

1. Auxiliary recall models (智库 / 忆庭 / “历史消息” style injection) appear skipped during send.
2. Builtin 智库 content looks empty in-game.
3. “自动审查” (review / diagnostics surface) does not show useful recall / review data for the turn — **hypothesis only**; the current evidence does not establish that it is caused by (1)(2).

### Evidence

#### A. Builtin 智库 is real on disk, but runtime can still be empty

Bundled presets exist under `public/zhiku-presets/` and are listed in `data/zhikuPreset.ts` (`bundledZhikuPresets`, `loadAllBundledZhikuPresets`).

**Root-cause confirmation:** this is not a removal of the default source data. The current registry still names 14 bundled JSON files containing **114 registered builtin entries**. `loadBundledZhikuPreset` also throws on a failed fetch, so a genuine asset-load failure takes the visible “启动初始化失败” path rather than silently producing an empty library.

The regression is in the iKernel migration's save/session seam:

- Before commit `dbadd8f` (`refactor(kernel): make runtime the single async authority`), the deleted `hooks/useGame/saveLoadWorkflow.ts` loaded bundled presets and ran `mergeBundledZhikuSystem(await loadAllBundledZhikuPresets(), save.智库, migrationAt)` before updating UI state.
- The replacement `hooks/useGame.ts` now calls `saveToRuntime(save, ...)`, which assigns `智库: save.智库!` directly, then `session.reset` projects that raw saved value back into React.

Therefore the high-confidence cause is **a refactor regression that bypasses runtime hydration**, especially for saves containing the intentionally persisted builtin metadata shells. A transient fetch failure remains possible, but it is not the explanation supported by the checked-in source or the historical load path.

The dev-only `DEV 刷新内置智库` action is corroborating evidence: it loads the same bundled catalog, merges it with the current React value, updates the visible panel, and persists the preference shell. Seeing entries immediately after clicking it is therefore expected. It is a diagnostic workaround only: it does not hydrate an existing kernel session, so a later `session.reset` / load can overwrite the visible entries with the raw save value again.

On app mount, `useGameState` merges them into React state:

```313:322:hooks/useGameState.ts
      const preset = await loadAllBundledZhikuPresets();
      const savedZhiku = await getPreference<智库系统>('zhikuSystem');
      …
      const mergedZhiku = mergeBundledZhikuSystem(preset, savedZhiku, migrationAt);
      set智库(mergedZhiku);
      await setPreference('zhikuSystem', buildPersistedZhikuSystem(mergedZhiku));
```

Important subtlety in persistence:

```260:274:data/zhikuPreset.ts
export function buildPersistedZhikuSystem(system: 智库系统 | undefined): 智库系统 {
  // builtin entries are stripped to metadata shells (摘要/原文 emptied)
  // full content is re-hydrated from bundled JSON on next loadAllBundled…
}
```

That is fine for **preferences**, but game **saves** store `runtime.智库` via `runtimeToSave`. If a session is created **before** async merge completes, or a save captured an empty/shell 智库, load will project emptiness into the kernel:

```543:568:hooks/useGame.ts
function saveToRuntime(save: 存档数据, …): RuntimeGameState {
  return cloneRuntimeGameState({
    …
    智库: save.智库!,
    …
  });
}
```

And every `applySessionView` overwrites React 智库 from kernel:

```470:490:hooks/useGame.ts
function applySessionView(state, view) {
  …
  state.set智库(runtime.智库);
  …
}
```

So: **startup merge fills UI → session.create/load with empty/shell 智库 → UI wiped empty again.** This matches “内置智库现在什么东西都没有” and confirms the iKernel load-path regression above. The remedy is hydration at the session boundary, not a React-side re-merge after every projection.

#### B. Send-time 智库 / 忆庭 gates

In `sendWorkflow`:

```1677:1715:src/kernel/workflows/sendWorkflow.ts
    const yitingRecallEnabled = yitingEnabled && !isOpeningSystemTrigger && (…忆庭召回最早触发回合 ?? 10) < state.turnCount;
    const zhikuRecallEnabled = !isOpeningSystemTrigger && !!(state.gameSettings.智库系统?.enabled && state.智库 && worldbookCtx.recentUserInput);
    const [yitingPreview, zhikuPreview] = await Promise.all([
      yitingRecallEnabled && state.忆庭 && recallQuery ? retrieveYitingContextWithModel(…) : Promise.resolve(null),
      zhikuRecallEnabled ? retrieveZhikuContextWithModel(state.智库, …) : Promise.resolve(null),
    ]);
```

Skip conditions:

| Gate | Effect |
|------|--------|
| Opening system trigger | Both skipped |
| `智库系统.enabled === false` | 智库 skipped |
| Empty `state.智库` / no entries | Model call may run but injects nothing useful |
| `recentUserInput` empty | 智库 disabled for turn |
| 忆庭 before default turn 10 | 忆庭 skipped (user may call this “历史消息”) |
| Independent API incomplete | `requireIndependentApiConfig('智库召回' / '忆庭召回')` throws — can fail or force fallback depending on call site |

Default 智库 settings: **enabled: true**, but **api is empty** (`创建空智库API覆盖`). Model-backed recall therefore depends on user filling 智库 API (or 一键套用 — see Issue 6 partial coverage). Keyword-only path exists in `systemPromptBuilder` via `retrieveZhikuContext` when override is not used; send path prefers model recall and passes `zhikuPreview?.injection ?? ''` as override — empty injection **suppresses** the fallback keyword inject when `zhikuRecallEnabled` is true:

```1822:1823:src/kernel/workflows/sendWorkflow.ts
          storyRecallInjection || (yitingRecallEnabled ? '' : undefined),
          zhikuRecallEnabled ? (zhikuPreview?.injection ?? '') : undefined,
```

If model recall returns no entries, override is `''`, and `systemPromptBuilder` treats override as authoritative:

```202:206:src/kernel/workflows/systemPromptBuilder.ts
  if (zhikuInjectionOverride !== undefined) {
    if (zhikuInjectionOverride.trim()) parts.push(zhikuInjectionOverride.trim());
  } else if (settings.智库系统?.enabled && zhiku && …) {
    // keyword fallback only when override is undefined
```

**Empty model result + defined empty override = no 智库 in prompt at all.** That is a real “辅助 AI 被略过” mechanism even when the feature is “on.”

#### C. “自动审查”

There is no separate automatic background “审查 AI” on every turn in the main path. Related surfaces:

- **AI 审查实验室** (`AIReviewLabModal`) — manual, reads recent turns / debugContext; first version “不会主动调用 AI.”
- **本地审查** in prompt / ST settings — structure scan only.
- Turn **debugContext** fields (`zhikuRecallPreview`, `yiting…`, protocol issues) populate review lab.

The review lab may look empty when recall/debug data is absent, but that causal link still needs a dedicated trace; do not treat it as confirmed.

### Root-cause ranking

1. **P0:** Session/save overwrites React-merged 智库 with empty/shell runtime data (iKernel single-runtime authority without re-merge).
2. **P0:** Empty-string injection override disables keyword fallback.
3. **P1:** Independent 智库/忆庭 API not applied / incomplete → model recall fails or never configured.
4. **P1:** 忆庭 earliest-turn gate (default 10).
5. **Hypothesis:** Review lab is passive and may surface empty debugContext; not yet proven to be caused by the recall failure.

### Required fix

- Restore the old hydration semantics as a single `hydrateRuntimeZhiku` boundary used before **both** `session.create` and `session.reset`: merge the bundled catalog with only the save's custom entries/runtime unlock overrides.
- Do not patch React after load. The kernel runtime must already contain the hydrated value before it is projected.
- Model the bundled catalog separately from save-owned custom entries and unlock deltas; do not persist builtin source content as ordinary runtime data.
- Retire or rewrite the stale `scripts/save-isolation-regression.mjs` assertion that reads the deleted `hooks/useGame/saveLoadWorkflow.ts`; it currently documents the right behavior but cannot guard the current implementation.
- Use an explicit recall-result type (`not-run` / `no-match` / `injection`) instead of an empty-string override; only the intended states may fall back to keyword retrieval.

Relevant scripts: `scripts/zhiku-*-regression.mjs`.

---

## Issue 4 — “重试 n 次” even when API (Gemini) returns a visible reply

### Acknowledgement

**Acknowledged.** Users correctly interpret on-screen narrative text as success; the app may still classify the turn as protocol failure and auto-retry.

### Evidence

#### A. Auto-retry is on by default

```1134:1135:models/settings.ts
    autoRetryOnError: true,
    autoRetryCount: 2,
```

Configured attempts:

```1978:1981:src/kernel/workflows/sendWorkflow.ts
    const configuredMaxAttempts = state.gameSettings.autoRetryOnError
      ? Math.max(1, state.gameSettings.autoRetryCount) + 1
      : 1;
    const maxAttempts = (deepSeekMainActive || deps.rerollContext) ? Math.max(2, configuredMaxAttempts) : configuredMaxAttempts;
```

So default is **3** main attempts (2 retries + first). Reroll forces at least 2.

#### B. Visible text ≠ protocol success

After each attempt, success requires:

1. Non-empty body (`isEmptyResponse` / blank checks).
2. **Strict closed tags** for thinking / 正文 / 短期记忆 / 动态世界 / 变量草稿 via `getMainProtocolIssues`:

```91:114:src/kernel/workflows/sendWorkflow.ts
function getMainProtocolIssues(parsed, rawText, requireStepThinking) {
  if (!hasClosedProtocolTag(raw, ['thinking']) || !parsed.thinking.trim()) …
  if (!hasClosedProtocolTag(raw, ['正文']) || !parsed.body.trim()) …
  if (!hasClosedProtocolTag(raw, ['短期记忆'])) …
  if (!hasClosedProtocolTag(raw, ['动态世界'])) …
  if (!hasClosedProtocolTag(raw, ['变量草稿'])) …
}
```

`parseResponse` itself throws on text outside canonical tags (`Response contains text outside canonical protocol tags`). Gemini often:

- Streams readable `<正文>` early (user sees story),
- Omits or leaves unclosed auxiliary tags,
- Adds prose outside tags,
- Puts “thinking” without Step chain when DeepSeek mode is on.

Then the workflow **retries** even though the user already saw a full-looking stream. UI surfaces:

```2147:2151:src/kernel/workflows/sendWorkflow.ts
            pushQueueTask(state, 'main_story', 'pending', {
              detail: `主剧情输出协议不完整，正在重试：${protocolIssues.join('；')}`,
              failCount: attempt,
              retrying: true,
```

And `InputArea` shows `失败 {workflowFailCount} 次，正在重试`.

#### C. Reroll similarity can force another attempt

If similarity ≥ 0.86 to previous body, another attempt is forced with a rewrite guard — again “retry” despite a valid-looking first stream.

#### D. Fail count on hard failure can look inflated

On total failure, queue task failCount is set from settings, not actual attempts:

```2724:2727:src/kernel/workflows/sendWorkflow.ts
      pushQueueTask(state, 'main_story', 'failed', {
        detail,
        failCount: state.gameSettings.autoRetryOnError ? Math.max(1, state.gameSettings.autoRetryCount) : 1,
      });
```

### Root-cause ranking

1. **P0 product/engine:** Strict multi-tag closed protocol + auto-retry defaults clash with Gemini-style partial/omitted tags.
2. **P1 UX:** Stream preview shows body before validation; user has no “this attempt was rejected” marker on the bubble itself.
3. **P1:** failCount semantics (settings max vs actual).

### Fix direction

- Do not weaken tags by provider. Define one provider-neutral minimum commit protocol instead.
- Fields that affect state settlement remain mandatory; genuinely auxiliary fields may be parsed into an explicit degraded state or repaired in a background task, never silently discarded.
- Do not count a similarity rewrite or soft repair as a user-facing “failure retry.” Render one in-place attempt bubble and show the specific protocol state inline.
- Provider adapters may normalize transport syntax into the canonical contract, but the acceptance policy must stay uniform.

---

## Issue 5 — API configuration is bound to the save / session

### Acknowledgement

**Acknowledged, with an important distinction.** New manual/auto game saves now omit device API settings, but `apiSettings` and `gameSettings` remain fields of `RuntimeGameState` and are persisted in the formal kernel Session. The kernel directly reads those Session fields when selecting request configuration.

### Evidence

```585:606:hooks/useGame.ts
function snapshotRuntimeState(state) {
  return cloneRuntimeGameState({
    …
    apiSettings: state.apiSettings,
    gameSettings: state.gameSettings,
    …
  });
}
```

```609:635:hooks/useGame.ts
function runtimeToSave(runtime, type) {
  return {
    …
    queueTasks: runtime.queueTasks.slice(),
  };
}
```

`runtimeToSave` no longer writes API/settings/theme, and `stripDevicePreferencesFromSave` defensively deletes legacy copies. Therefore “ordinary game-save files currently contain API keys” is no longer accurate. The remaining problem is the durable kernel Session and its projection/rollback semantics.

```562:582:hooks/useGame.ts
function applySessionView(state, view) {
  …
  state.setApiSettings(runtime.apiSettings);
  state.setGameSettings(runtime.gameSettings);
  …
}
```

`handleContinue` and `handleLoadSave` intentionally preserve and re-apply live preferences after restoring a Session/story save. Every formal command also checkpoints the current React runtime first. These overlays express the desired device/story split, but only as timing-dependent patches while the underlying Session model still mixes both planes.

### Confirmed hidden rollback scenario

1. A turn starts with the old API configuration captured in the committed Session runtime.
2. While that request is ongoing, applying a new API Profile writes the new configuration to React state and device preference, but it cannot change the already-running command snapshot.
3. Cancelling the request enters the rejected recovery path, which restores the last committed Session projection.
4. `applySessionView` then writes the old Session `apiSettings` and `gameSettings` over the current React state without any visible configuration-change event.
5. The next pre-command checkpoint can commit that silently restored old configuration back into the kernel Session, while device preference may still contain the new configuration.

This leaves device preference, React state, and kernel Session with potentially different API versions. Which configuration wins depends on command, cancellation, restoration, and checkpoint timing.

### Product implication

- Cancelling or rejecting an unrelated story request can silently revert the visible/in-memory API selection.
- A kernel entry point that does not perform the React checkpoint overlay may call an old Session endpoint/model.
- API keys and endpoints remain inside durable Session CAS records and formal Session export packages even though normal game saves strip them.
- The UI does not reveal when a Session projection has overwritten a newer live configuration.

#### D. New-profile onboarding is blocked by the same coupling

**Confirmed.** A new game/profile cannot become a valid fresh start when its creation path depends on an API configuration inherited from a profile/save instead of a device-level configuration registry.

`NewGameWizard` finishes constructing the opening archive, world state, and initial NPC records, then calls `onStart`:

```1090:1090:components/features/NewGame/NewGameWizard.tsx
await onStart(traveler, worldState, initialNpcRecords);
```

The parent checks the active API only at that final boundary and throws:

```840:843:App.tsx
const handleStartGame = async (...) => {
  if (!getActiveApiConfig()) throw new Error('请先选择有效的主 API 接口。');
  // ... create session
}
```

This is a dead end, not onboarding: the player has already completed the wizard, receives an uncaught promise error, and is neither sent to API settings nor given a way to create/select a device-level API configuration. If API settings are carried by an existing profile/save, a truly new profile starts with none and therefore cannot be created.

### Required product boundary

- **Unbind API configuration from saves/profiles.** Store API configs and the active-config selection in device preferences only; never require a game profile to already contain an API config.
- **Preflight before entering the wizard** (or make API setup its first explicit step). When no valid active main API exists, route directly to Settings → API with a return intent to New Game after a valid config is saved.
- Keep `handleStartGame` as a final invariant check, but it must be unreachable in normal UI flow; it should not be the first user-facing configuration prompt.

### Verdict

**Poorly separated by design in the current kernel model.** The normal save boundary has been corrected, but the runtime/Session boundary has not. Continue/load overlays reveal the intended device/story split while simultaneously demonstrating that the type and authority model still violates it.

### Fix direction

- Split device preferences from story runtime: `apiSettings`, theme, and device-level feature switches must not be members of `RuntimeGameState` or a normal save.
- Keep story choices in the save, with an explicit migration that strips embedded API credentials and other device-only fields.
- Remove API/device preferences from Session projection, CAS snapshots, rollback, and Session export—not only from normal game saves.
- Capture an immutable live execution configuration when each command begins; completing or rejecting that command must never write configuration back to the global preference authority.
- A preference overlay during load is only a compatibility bridge; remove the possibility that later checkpointing can re-mix the two planes.
- If reproducible export packs need API metadata, make that an explicit opt-in export format without secrets by default.

---

## Issue 6 — Album “生成提示词” unusable; incomplete tokenizer API; 一键应用 gap

### Acknowledgement

**Acknowledged.** Stack trace matches code exactly.

### Evidence

Error:

```text
requireIndependentApiConfig.ts:29 Uncaught (in promise) Error:
文生图词组转化器独立 API 配置不完整：provider、baseUrl、apiKey、model
```

```13:30:services/ai/requireIndependentApiConfig.ts
export function requireIndependentApiConfig(feature, config, defaults) {
  …
  if (!provider || !baseUrl || !apiKey || !model) {
    throw new Error(`${feature}独立 API 配置不完整：${missing.join('、')}`);
  }
```

```23:32:services/ai/imagePromptTokenizer.ts
export function buildImagePromptTokenizerConfig(settings) {
  if (!settings.文生图系统.enablePromptTokenizer) return null;
  return {
    ...requireIndependentApiConfig('文生图词组转化器', settings.文生图系统.词组转化器API, …),
```

Album path:

```877:910:components/features/GameSystems/AlbumWorkspace.tsx
  const applyTokenizerIfAvailable = async (…) => {
    const tokenizerConfig = await services.imageTokenizer.buildImagePromptTokenizerConfig(gameSettings);
    if (!tokenizerConfig) throw new Error('文生图词组转化器独立 API 未完整配置');
    …
```

#### “一键套用到其他 API” does **not** include 文生图词组转化器

```644:674:components/features/Settings/ApiSettings.tsx
  const handleApplyAuxModel = async () => {
    const auxApiPatch = { provider, baseUrl, apiKey, model };
    const nextGameSettings = {
      …
      variableApi: { … },
      新闻系统: { api: … },
      手机系统: { api: … },
      智库系统: { api: … },
      剧情编织系统: { api: … },
      记忆系统: { 记忆总结API, 忆庭召回API, 忆庭精炼API },
      // ❌ no 文生图系统.词组转化器API
      // ❌ no 文生图普通/场景/NSFW 接口
    };
```

By contrast, **API 方案 profile apply** (`applyApiProfile`) **does** write `词组转化器API` (and image endpoints). So:

- Users who use **一键套用** fix text aux models but **not** image tokenizer → Album button throws.
- Users who use **方案导入/切换** may be fine.

Also: if `enablePromptTokenizer` is true with empty API, build throws; Album does not soft-fallback to local `buildSceneImagePrompt` only.

### Root-cause ranking

1. **P1:** Default settings enable the tokenizer while its required API is empty — an invalid default state.
2. **P1:** 一键套用 omits the tokenizer's text-model API.
3. **P1:** Album treats tokenizer failure as a hard error instead of respecting an explicit disabled/unconfigured state.
4. **P2:** Copy does not explain that tokenizer is a separate independent API.

### Fix direction

- Default `enablePromptTokenizer` to `false`, or reject enabling it until provider, base URL, key, and model are complete. Do not represent “enabled but invalid” as a normal settings state.
- Include the tokenizer in the text-API “一键套用” action; do not overwrite normal/scene/NSFW image-generation endpoints, whose provider contract may differ.
- When tokenizer use is intentionally disabled, keep the local prompt and continue; an explicitly enabled but invalid configuration should be prevented at settings validation time.

---

## Issue 7 — Generated “手机背景” not visible / selectable in phone 背景 menu

### Acknowledgement

**Acknowledged.** Album generation and phone wallpaper picker are **not the same catalog.**

### Evidence

Phone 背景 UI only lists **built-in** wallpapers:

```1688:1728:components/features/Phone/PhoneModal.tsx
          <div className="grid …">
            {BUILTIN_PHONE_WALLPAPERS.map((wallpaper) => {
              …
              <PhoneSmallButton label="设为桌面" onClick={() => onSetHome(wallpaper.src)} />
              <PhoneSmallButton label="设为短讯" onClick={() => onSetChat(wallpaper.src)} />
```

Applied wallpapers are stored as references on `phone.wallpapers.home|chat`, resolved through the album helper:

```879:881:components/features/Phone/PhoneModal.tsx
  const homeWallpaper = 解析相册资源引用(album, phone.wallpapers?.home) || DEFAULT_PHONE_HOME_WALLPAPER;
```

Album can **generate** assets tagged/slotted as `phone_wallpaper` / “手机背景” into the album library (`album/foundation.ts`, `workspaces.tsx`). Copy even says players later choose whether to hang images onto phone background — but the phone 背景 app **never enumerates album assets** of that slot. There is no bridge UI:

- “从相册选择壁纸”
- or auto-register generated phone images into `BUILTIN`-style picker rows
- or write `phone.wallpapers.home` when generation completes

So generation succeeds into **相册成品库**, while the phone menu only shows **内置壁纸** + whatever is already set via direct `onSetHome(src)`.

### Root-cause ranking

1. **P1 product seam:** missing album → phone wallpaper browser/apply path.
2. **P2:** possible reference format mismatch if something writes album IDs the resolver does not accept (secondary; primary issue is “not listed”).

---

## Issue 8 — Loading a save does not fully reload chat; need Shift+F5

### Acknowledgement

**Acknowledged.** In-game load is not a full client remount; sticky UI/kernel residue explains why hard refresh “fixes” retry/stream ghosts.

### Evidence

`handleLoadSave`:

```257:265:hooks/useGame.ts
  const handleLoadSave = async (id) => {
    const save = await kernel.saves.loadSave(id);
    const runtime = saveToRuntime(save, stateRef.current.worldbooks);
    await replaceSessionRuntime(kernel, runtime);  // session.reset + applySessionView
    stateRef.current.setView('game');
  };
```

What load **does** reset via `applySessionView`: chatHistory, domain systems, api/game settings from save, turnCount, etc.

What load **does not** clearly reset:

| Residue | Why it survives |
|---------|-----------------|
| `streamingMessage` external store | Not cleared in `handleLoadSave` |
| `loading` / `workflowHint` / `workflowStatus` / `liveRecall*` | Not cleared in load path |
| `interruptedWorkflow` / recovery draft | Not cleared on load |
| `activeCommandRef` | Load does not cancel in-flight command (only `handleGoHome` cancels) |
| Local `InputArea` input state | Component-local; may keep text across load if not unmounted |
| Memoized chat leaves | Should follow new `messages` props; OK if history updates — **unless** stream leaf still mounted |
| 智库 / worldbooks preference plane | Worldbooks taken from live React, 智库 from save (see Issue 3/5) |

Hard refresh (Shift+F5) remounts the app: empty stream store, re-merge 智库 from disk, no active command, clean InputArea — which is why players learn to force-reload.

This also means Issue 1 ghosts **cannot** be healed by load-save alone.

### Fix direction

On load, use one ordered session-transition operation:

1. Cancel and await any active command.
2. Reset kernel session and projection from the hydrated save runtime.
3. Clear the single transient projection state and delete the persisted recovery journal.
4. Send an explicit input-reset signal to `InputArea`; do not remount it with `key={saveId}` as a substitute for lifecycle correctness.
5. Hydrate builtin 智库 at the session boundary before projection (Issue 3), not by a React-side follow-up merge.

---

## Issue 9 — JSON tool responses are rejected by the main-story protocol parser

### Acknowledgement

**Confirmed.** Battle-skill AI generation can fail with:

```text
Response contains text outside canonical protocol tags
```

This is not a Gemini-specific configuration error and is **not** the Issue 4 main-story retry loop.

### Evidence

`skillGenerator` explicitly directs the model to return one JSON object and nothing else, then calls the shared `sendChatMessage` helper:

```services/ai/skillGenerator.ts
// “只输出一个 JSON 对象，不要 Markdown，不要解释，不要额外标签。”
const result = await sendChatMessage(config, { streaming: false, ... });
```

But `sendChatMessage` unconditionally applies `parseResponse(fullText)`, the parser intended for the main narrative's `<正文>`, `<thinking>`, and related canonical tags:

```services/ai/text/index.ts
const parsed = parseResponse(fullText);
```

For correct JSON such as `{ "名称": "先别眨眼" }`, `parseResponse` sees non-tag text and throws before `skillGenerator` reaches its own `parseJsonWithRepair` step. `SkillPanel` catches and displays that exact error.

### Root cause

The text API abstraction conflates two incompatible response contracts:

| Caller type | Required response contract |
|-------------|----------------------------|
| Main narrative turn | Canonical tagged protocol, then protocol validation/retry |
| Battle skill / structured tool | Raw text, then caller-owned JSON parsing/repair |

Gemini is likely exposing the flaw because it follows the battle-skill JSON instruction. Any provider that returns valid JSON will hit the same shared-parser rejection.

### Required fix

- Split the completion boundary into a raw-text request for tools and a canonical-story request for narrative turns.
- Keep `parseResponse` and Issue 4's protocol retry exclusively in the canonical-story path.
- Make `skillGenerator` pass raw text straight to `parseJsonWithRepair`.
- Audit other non-story `sendChatMessage` callers for the same contract collision.
- Repair `scripts/skill-system-regression.mjs`: it currently reads a deleted pre-iKernel module and fails before it can protect this path.

---

## UX optimizations (acknowledged, lower severity)

### U0 — Global error popup and diagnostic inbox

**Expected fix.** Errors currently surface inconsistently: many event handlers throw into the console or leave an uncaught rejected promise, while individual panels maintain isolated error state. The missing-main-API onboarding failure is one concrete example.

Add a single app-level error reporter with a top-right, non-blocking popup plus a clickable recent-error list. Each record should include a user-safe message, feature/command name, timestamp, and a diagnostic ID; raw requests, API keys, and provider secrets must never be rendered. The reporter should receive kernel rejected frames, action-handler failures, and unhandled UI promises.

This is observability, not recovery: reporting an error must not swallow it, pretend the command committed, or keep a failed workflow alive. Where an actionable route exists (for example, missing main API), the popup should include the direct repair action (`前往 API 设置`) and return intent.

### U1 — Discard item: add “撤回”

**Acknowledged.**

Current flow in `InventoryPanel`:

```129:139:components/features/GameSystems/InventoryPanel.tsx
  const handleDrop = (itemId, count?) => {
    if (!confirm(…)) return;
    onTravelerChange((prev) => {
      const res = 丢弃物品(prev, itemId, count);
      showFlash(res.message);  // flash only ~2.4s, no undo
      return res.ok ? res.traveler : prev;
    });
  };
```

No snapshot of removed stack, no toast action, no kernel command for undo. A short-lived “撤回” should keep a domain-level discard receipt and restore it through `restoreDiscardedItem`, not by the UI directly pushing an array element into `背包`.

### U2 — Over-explanatory copy

**Acknowledged as a product-wide polish item.** Examples of dense helper text:

- Settings toggles with multi-sentence `desc` (e.g. auto-retry, CoT fake history, autosave in `GameSettings.tsx`).
- Album workspace intros explaining the full pipeline on every panel.
- Phone wallpaper sidebar: “选择后会写入手机存档，玩家自定义优先于默认壁纸”.
- Plot paste buffer chrome (`PASTE IMPORT BUFFER`, dual English/Chinese labels).

Not a functional bug; recommend a copy pass: one-line helper by default, “详细说明” expanders for power users.

### U3 — Custom plot “章节标题” slicing logic is unclear

**Acknowledged.**

UI says:

```834:834:components/features/GameSystems/PlotPanel.tsx
placeholder="把 TXT 正文粘贴在这里。系统会先按章节标题切分，识别不到章节时会按长度自动切片。"
```

Actual recognition rules live in `models/storyWeaving.ts` (`章节标题层级规则`, `识别章节标题行`, `规范化章节标题文本`):

- Matches 第X章/卷/回, English Chapter/Volume, 序章/楔子/番外, etc.
- Strips decorative prefixes aggressively.
- Falls back to length chunking when no headings match.
- Groups chapters into segments via `chaptersPerSegment`.

Players cannot see **which lines were treated as titles**, **where fallback slices happened**, or **what a “good” TXT looks like**. The placeholder is accurate but incomplete.

Suggested UX: post-import preview list of detected titles + segment boundaries + “未识别标题，已按 N 字切片” banner.

---

## Cross-cutting diagnosis (iKernel regression lens)

The branch history (`refactor/ikernel` commits: phase 0–5, “runtime the single async authority”) moved authority into kernel sessions. Several player issues are **integration seams** left half-migrated:

```
                    ┌──────────────────────┐
   Preferences      │ apiSettings, theme,  │  IndexedDB preferences
   (device)         │ partial gameSettings │  useGameState mount
                    └──────────┬───────────┘
                               │ sometimes overwritten by
                               ▼
                    ┌──────────────────────┐
   Session runtime  │ chatHistory, 智库,   │  kernel CAS commits
   (story)          │ apiSettings copy, …  │  saves
                    └──────────┬───────────┘
                               │ progress frames only update
                               ▼
                    ┌──────────────────────┐
   Ephemeral UI     │ streamingMessage,    │  NOT in saves
                    │ input, workflowHint  │  NOT fully cleared on load/retry
                    └──────────────────────┘
```

**Highest leverage fixes (suggested order):**

1. **Ephemeral UI reset helper** used by send start / reroll start / load / abort / finally.  
2. **Optimistic history truncation** on reroll.  
3. **Re-merge bundled 智库** (and preference API overlay) on session create/load.  
4. **Protocol retry policy** tuned for Gemini; clearer user-facing attempt state.  
5. **一键套用** include 文生图词组转化器 (+ image endpoints).  
6. **Album → phone wallpaper** apply browser.  
7. Discard undo + copy/plot slicing clarity.

---

## Suggested verification matrix (for whoever implements)

| Scenario | Expect |
|----------|--------|
| Send happy path (Gemini full tags) | Input clears; one assistant bubble; no sticky 开拓进行中; failCount 0 |
| Send with missing `</短期记忆>` | At most N auto-retries; UI explains protocol issue; input cleared or restored consistently |
| Reroll mid-stream | Old assistant hidden/removed immediately; single stream bubble; banner clears on commit/fail |
| Reroll fail | History restored to pre-reroll; stream cleared |
| Load save after dirty stream | History matches save; stream empty; input empty; 智库 non-empty builtins present |
| Fresh install 智库 panel | Bundled character/location/term entries visible without manual import |
| 一键套用 aux API | Tokenizer + 智库 + 忆庭 + variable all populated; Album 生成提示词 works |
| Generate phone wallpaper | Appears in phone 背景 list and can set 桌面/短讯 |
| Discard item | Toast with 撤回 restores stack |

Regression scripts to extend/align:

- `scripts/queue-task-retry-regression.mjs`
- `scripts/background-stream-regression.mjs`
- `scripts/zhiku-*-regression.mjs`
- `scripts/settings-save-regression.mjs`
- `scripts/save-isolation-regression.mjs`
- Album / phone scripts as applicable

---

## Appendix — Report checklist (acknowledgement ledger)

| User report (verbatim theme) | Status in this doc |
|------------------------------|--------------------|
| 点击重试：老消息仍在；新消息在下；开拓进行中残留 | Issue 1 — confirmed |
| 新消息发送后消息框不清空 | Issue 2 — confirmed |
| 发送过程略过注入智库/历史消息辅助 AI | Issue 3 — confirmed mechanisms |
| 内置智库空；可能需 pick 历史修复 | Issue 3 — confirmed; re-merge gap |
| 自动审查 (alongside above) | Issue 3C — passive/empty diagnostics |
| 无论 API 是否正确响应都“重试 n 次” | Issue 4 — confirmed protocol auto-retry |
| API 配置和存档绑定 | Issue 5 — confirmed session design |
| Album 生成提示词不可用 + stack trace | Issue 6 — confirmed |
| 一键应用未应用到文生图 API | Issue 6 — confirmed for 一键套用 |
| 手机背景生成后背景菜单不可见/不可选 | Issue 7 — confirmed seam |
| 读档不完全重载聊天；需 Shift+F5 | Issue 8 — confirmed |
| 丢弃物品可撤回 | U1 — acknowledged |
| 去掉过度解释文案 | U2 — acknowledged |
| 自定义剧情章节标题切片表述不清 | U3 — acknowledged |

---

*End of findings. No code was changed for this document.*
