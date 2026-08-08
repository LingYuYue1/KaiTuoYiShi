/**
 * commitTurn —— 唯一晋升点（ideal_design §1/§6，片 5a-2 D2-A/D5）。
 *
 * 输入：checkpoint 基值（newest.baseCheckpointId 指向的 saves 记录，经现有
 *   loadSave + delta 还原链路读取）+ newest 记录（字段级覆盖集）。
 * 处理：checkpoint 值 = 基值 + record.story 逐字段整体覆盖 → 新增一条
 *   auto trace 节点（saveGame 正路负责 autoIncrement、delta 编码与 rotation，
 *   saveSummaries/saveNodeDeltas 联动）→ 清空NewestStory记录 写回 newestStory store。
 * 输出：无返回值（checkpoint id 由清空记录带回）。
 *
 * B2 候选状态契约：本文件只认 ctx / d / newest，不回读 state；唯一例外是
 * pendingOpeningTrigger + Device/Content（gameSettings/apiSettings/theme）直通——
 * 非候选状态，不属回合产出，取当前值以保持剥离前行为。
 *
 * L1 边界：本文件是 checkpoint 表写入的唯一合法出口（no-restricted-imports
 * 禁 stage*.ts 与 sendWorkflow.ts import saveGame；手动存档/导入走 saveLoadWorkflow
 * 不受限）。checkpoint 表四 store = saves / saveSummaries / saveAssets /
 * saveNodeDeltas（settings / newestStory 非 checkpoint 表）。
 */
import { 迁移存档运行态键, type API设置, type 存档数据, type 游戏设置, type 主题预设 } from '@/models/settings';
import type { UseGameStateReturn } from '@/hooks/useGameState';
import { loadSave, saveGame, saveNewestStory } from '@/services/dbService';
import { 创建空NewestStory记录, 清空NewestStory记录, type NewestStory记录, type NewestStory字段集 } from '@/models/newestStory';
import { compactChatHistoryForLongSession } from '@/utils/longSessionRetention';
import { buildSaveGameSettingsSnapshot, commitActiveSaveTreeMeta, buildSavePayload } from './saveLoadWorkflow';
import { attachSaveTreeMeta, buildNextSaveTreeMeta } from '@/utils/saveTree';
import { devLog, devLogError } from '@/utils/devLog';
import type { TurnContext, TurnDeltas } from './turnTypes';

type SaveWithTree = 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 };

type Story覆盖字段 = Pick<
  存档数据,
  | 'turnCount'
  | 'chatHistory'
  | '记忆'
  | '忆庭'
  | '智库'
  | '手机'
  | '世界'
  | '旅人'
  | 'NPC'
  | '相册'
  | '新闻'
  | '剧情'
  | '剧情编织'
  | 'variableBatches'
  | 'queueTasks'
>;

/**
 * newest.story → buildSavePayload overrides 形状。两者字段集一致（报告 a 表 15 列），
 * 未写字段缺省 = 与 checkpoint 一致；undefined 由 buildSavePayload 的 ?? state 兜底。
 */
function 取Story覆盖字段(story: Partial<NewestStory字段集>): Partial<Story覆盖字段> {
  return {
    turnCount: story.turnCount,
    chatHistory: story.chatHistory,
    记忆: story.记忆,
    忆庭: story.忆庭,
    智库: story.智库,
    手机: story.手机,
    世界: story.世界,
    旅人: story.旅人,
    NPC: story.NPC,
    相册: story.相册,
    新闻: story.新闻,
    剧情: story.剧情,
    剧情编织: story.剧情编织,
    variableBatches: story.variableBatches,
    queueTasks: story.queueTasks,
  };
}

/** 基值存在时的组装：基值 + 覆盖集逐字段整体覆盖（未写字段 = 基值），新增 auto 树节点。 */
function 组装Checkpoint值(base: 存档数据, state: UseGameStateReturn, newest: NewestStory记录): 存档数据 {
  const baseWithTree = base as SaveWithTree;
  const timestamp = Date.now();
  const payload = {
    ...base,
    ...newest.story,
    id: 0,
    type: 'auto' as const,
    timestamp,
    gameSettings: buildSaveGameSettingsSnapshot(state.gameSettings),
    apiSettings: state.apiSettings,
    theme: state.currentTheme,
    chatHistory: compactChatHistoryForLongSession(newest.story.chatHistory ?? base.chatHistory),
  } as 存档数据;
  // 分叉头物化：newest.headNodeId 非空且不等于基节点自身 nodeId（防迁移回填/已物化后重复）
  // 时，晋升节点采用该 head id，使分叉叶子身份真实落地。
  const baseNodeId = baseWithTree.saveTree?.nodeId ?? null;
  const forkHeadNodeId = newest.headNodeId && newest.headNodeId !== baseNodeId ? newest.headNodeId : undefined;
  return attachSaveTreeMeta(payload, buildNextSaveTreeMeta({
    previous: baseWithTree,
    type: 'auto',
    timestamp,
    ...(forkHeadNodeId ? { nodeId: forkHeadNodeId } : {}),
  }));
}

/** 基值缺失（新局/升级首回合）时的兜底组装：走现有 buildSavePayload（state + 覆盖集），与剥离前行为一致。 */
function 组装Checkpoint值从状态(state: UseGameStateReturn, newest: NewestStory记录): 存档数据 {
  // 片 5d-2：headNodeId 穿透给 buildSavePayload（内部再对父节点 id 去重），
  // 使分叉自非 auto 节点（如手动节点）时晋升的 auto 节点同样物化分叉头身份。
  return buildSavePayload(state, 'auto', 取Story覆盖字段(newest.story), newest.headNodeId ?? undefined);
}

/** 新局边界：新增 auto 树根节点，并让 newest 从该初始 checkpoint 开始。 */
export async function 初始化新局checkpoint(
  fields: NewestStory字段集,
  device: { gameSettings: 游戏设置; apiSettings: API设置; theme: 主题预设 },
): Promise<{ checkpointId: number }> {
  try {
    const timestamp = Date.now();
    const payload = attachSaveTreeMeta({
      id: 0,
      type: 'auto' as const,
      timestamp,
      ...fields,
      gameSettings: buildSaveGameSettingsSnapshot(device.gameSettings),
      apiSettings: device.apiSettings,
      theme: device.theme,
    }, buildNextSaveTreeMeta({
      previous: null,
      type: 'auto',
      timestamp,
    }));

    const checkpointId = await saveGame(payload);
    devLog('save', 'new-game-checkpoint-written', { checkpointId, nodeId: (payload as SaveWithTree).saveTree?.nodeId ?? null });
    await saveNewestStory(清空NewestStory记录(创建空NewestStory记录(), checkpointId));
    devLog('save', 'new-game-newest-cleared', { checkpointId });
    commitActiveSaveTreeMeta(payload);
    return { checkpointId };
  } catch (error) {
    devLogError('save', 'new-game-checkpoint-failed', error);
    throw error;
  }
}

/**
 * commitTurn：把 newest 槽工作区晋升为一条新的 auto trace checkpoint，然后清空 newest。
 * 每回合必写（D2-A：与 enableAutoSaveEveryTurn 开关无关，开关只控「是否保留可见 auto 存档」）。
 */
export async function commitTurn(
  ctx: TurnContext,
  d: TurnDeltas,
  newest: NewestStory记录,
): Promise<void> {
  const { state, assertWorkflowActive } = ctx;
  assertWorkflowActive();
  const baseSave = newest.baseCheckpointId ? await loadSave(newest.baseCheckpointId) : null;
  assertWorkflowActive();
  const baseIsUsable = baseSave !== null && baseSave.type === 'auto';
  const payload = baseIsUsable
    ? 组装Checkpoint值(baseSave, state, newest)
    : 组装Checkpoint值从状态(state, newest);

  // D3：三个顶层字段 —— 两运行态键取 d 回落 newest 值（再回落 gameSettings 残留，由迁移函数兜底）；
  // pendingOpeningTrigger 从 state（B2 例外，报告中注明）。
  const 残留运行态键 = 迁移存档运行态键(payload);
  payload.macroGlobalVars =
    d.macroGlobalVarsAfterTurn ?? newest.story.macroGlobalVars ?? 残留运行态键.macroGlobalVars;
  payload.worldbookTriggerStates =
    d.worldbookTriggerStatesAfterTurn ?? newest.story.worldbookTriggerStates ?? 残留运行态键.worldbookTriggerStates;
  payload.pendingOpeningTrigger = state.pendingOpeningTrigger ?? null;

  const checkpointId = await saveGame(payload);

  // D2-A：清空 newest，base 指向新 checkpoint。
  // 注意：saveGame + saveNewestStory 之间不加 abort 守卫——二者是原子对，
  // 一旦开始必须双双完成（否则会出现「节点已封版但 newest 未清空」的半提交态，
  // 续跑会二次封版同内容节点，违反 L2）。
  await saveNewestStory(清空NewestStory记录(newest, checkpointId));
  assertWorkflowActive();

  // saveTree 元信息联动：后续手动/自动存档以此 checkpoint 为树上前驱。
  commitActiveSaveTreeMeta(payload);
}
