// G1.3.1.2 dueEventScanner：排期扫描（确定性，依赖已终态满足才分批领取）。
// - 候选 = 自身已到期（dueAt<=now）+ scheduled/blocked + 未领取（无 eventResolutionKey）；
// - child 只有在所有 dependency 已处于允许终态时才进入 due；依赖同批到期不算满足
//   （parent 与 child 同批到期时本次只领取 parent，parent 结算提交后下一 revision 才可领取 child）；
// - 缺失依赖 -> child blocked（不当作 satisfied）；
// - cycle 使用 Tarjan 强连通分量精确识别环成员；环外祖先/后继不得列入 cycles，但可因依赖未满足保持 blocked；
// - cycle/blocked 节点不得同时出现在 due IDs；同 revision 重扫去重与稳定排序保留。
import type { GameTime, StoryRuntimeState, WorldEventInstance } from '../../models/storyRuntime';
import { compareGameTime } from './gameClockReducer';

export type DueScanResult = { ok: true; state: StoryRuntimeState; dueInstanceIds: string[]; cycles: string[] } | { ok: false; code: string; message: string };

const TERMINAL = new Set(['resolved', 'cancelled', 'superseded', 'missed', 'archived']);
const RESOLUTION_OK = new Set(['resolved', 'cancelled', 'superseded', 'missed', 'archived']);

/** Tarjan 强连通分量：返回所有 size>1 的 SCC 成员（真实环成员）与 self-loop 成员。 */
function tarjanStronglyConnected(nodes: WorldEventInstance[]): Set<string> {
  const graph = new Map<string, string[]>();
  // 只保留 nodes 内的边。
  for (const node of nodes) {
    graph.set(node.eventInstanceId, node.dependencyIds.filter((d) => nodes.some((n) => n.eventInstanceId === d)));
  }
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycleMembers = new Set<string>();
  const strongConnect = (v: string): void => {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (w === v) {
        // self-loop（dependencyIds 包含自己）本身就是环成员。
        cycleMembers.add(v);
        continue;
      }
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, lowlink.get(w) ?? 0));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, indices.get(w) ?? 0));
      }
    }
    if ((lowlink.get(v) ?? 0) === (indices.get(v) ?? 0)) {
      const component: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w !== undefined) {
          onStack.delete(w);
          component.push(w);
        }
      } while (w !== undefined && w !== v);
      // size>1 的 SCC 才是真实环。
      if (component.length > 1) {
        for (const member of component) cycleMembers.add(member);
      }
    }
  };
  for (const node of nodes) {
    if (!indices.has(node.eventInstanceId)) strongConnect(node.eventInstanceId);
  }
  return cycleMembers;
}

/**
 * 对自身已到期且未领取的实例按"依赖已终态满足"分批领取（拓扑稳定）。
 * 返回可结算 due IDs（resolution_pending + eventResolutionKey）、真实环成员（blocked）与
 * 依赖未满足/缺失的 blocked 集合。
 */
export function scanDueEvents(state: StoryRuntimeState, now: GameTime): DueScanResult {
  const byId = new Map(state.worldEvents.map((w) => [w.eventInstanceId, w]));
  // 候选：自身已到期 + scheduled/blocked + 未领取。
  const candidate = state.worldEvents
    .filter((w) => (w.status === 'scheduled' || w.status === 'blocked')
      && w.dueAt !== undefined && compareGameTime(w.dueAt, now) <= 0
      && w.eventResolutionKey === undefined)
    .sort((a, b) => a.eventInstanceId < b.eventInstanceId ? -1 : a.eventInstanceId > b.eventInstanceId ? 1 : 0);
  const candidateIds = new Set(candidate.map((w) => w.eventInstanceId));

  // 真实环成员：candidate 子图的强连通分量（size>1）。
  const cycleMembers = tarjanStronglyConnected(candidate);

  // 依赖满足检查：所有 dependency 必须已处于终态（RESOLUTION_OK）；同批到期不算满足；缺失 -> blocked。
  const blockedMissing = new Set<string>();
  const blockedUnmet = new Set<string>();
  const due: WorldEventInstance[] = [];
  for (const instance of candidate) {
    if (cycleMembers.has(instance.eventInstanceId)) continue; // 环成员不领取
    let satisfied = true;
    for (const dep of instance.dependencyIds) {
      const depInstance = byId.get(dep);
      if (!depInstance) { blockedMissing.add(instance.eventInstanceId); satisfied = false; break; }
      if (!RESOLUTION_OK.has(depInstance.status)) { blockedUnmet.add(instance.eventInstanceId); satisfied = false; break; }
    }
    if (satisfied) due.push(instance);
  }

  const dueInstanceIds = due.map((w) => w.eventInstanceId);
  const next = state.worldEvents.map((w) => {
    if (cycleMembers.has(w.eventInstanceId)) return { ...w, status: 'blocked' as const };
    if (blockedMissing.has(w.eventInstanceId) || blockedUnmet.has(w.eventInstanceId)) return { ...w, status: 'blocked' as const };
    if (dueInstanceIds.includes(w.eventInstanceId)) {
      return { ...w, status: 'resolution_pending' as const, eventResolutionKey: 'due:' + state.runtimeRevision + ':' + w.eventInstanceId };
    }
    return w;
  });
  return { ok: true, state: { ...state, worldEvents: next }, dueInstanceIds, cycles: [...cycleMembers] };
}
