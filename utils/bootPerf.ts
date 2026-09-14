// ─────────────────────────────────────────────────────────────────────────────
// TEMP：boot 预置链路粗粒度性能探针（测量完成后整文件删除）。
//
// 目的：回答「各项占多少、首页何时可交互」，不是给每个函数计时。
// 产物：
//   1. DevTools Performance 时间线：`bootPerf:*` mark。
//   2. devLog(`[ui] boot-perf-stage` / `boot-perf-summary`)。
//   3. console 里一条可复制的 `[boot-perf] SUMMARY {...}` JSON。
//
// 它记录：各阶段耗时、长任务、React 提交次数与耗时、以及预置文件的
// resource timing（transferSize>0 = 真走网络；=0 = 命中缓存）。
// ─────────────────────────────────────────────────────────────────────────────
import { devLog } from '@/utils/devLog';

interface StageRecord { name: string; ms: number }
interface LongTaskRecord { name: string; ms: number; at: number }
interface CommitRecord { phase: string; ms: number }

const stages: StageRecord[] = [];
const longTasks: LongTaskRecord[] = [];
const commits: CommitRecord[] = [];
const accumulated = new Map<string, number>();
let startedAt = 0;
let summarized = false;

export function bootPerfStart(): void {
  startedAt = performance.now();
  performance.mark('bootPerf:start');
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push({
          name: entry.name || 'longtask',
          ms: Math.round(entry.duration),
          at: Math.round(entry.startTime),
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  } catch {
    // 不支持 longtask 的浏览器跳过。
  }
}

export function bootPerfStage(name: string, ms: number): void {
  const rounded = Math.round(ms);
  stages.push({ name, ms: rounded });
  performance.mark(`bootPerf:${name}`);
  devLog('ui', 'boot-perf-stage', { name, ms: rounded });
}

export function bootPerfCommit(phase: string, ms: number): void {
  commits.push({ phase, ms });
}

/** 逐文件累加同一名字的耗时（例如 canon 的 fetch+parse 与 normalize）。 */
export function bootPerfAccumulate(name: string, ms: number): void {
  accumulated.set(name, (accumulated.get(name) ?? 0) + ms);
}

export function bootPerfSummary(extra: Record<string, unknown>): void {
  if (summarized) return;
  summarized = true;

  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
  const presetResources = resources.filter((r) => /story-weaving-canon|zhiku-presets/u.test(r.name));
  const net = {
    allResources: resources.length,
    jsonFiles: resources.filter((r) => r.name.includes('.json')).length,
    files: presetResources.length,
    totalDurationMs: Math.round(presetResources.reduce((sum, r) => sum + r.duration, 0)),
    transferBytes: presetResources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
    encodedBytes: presetResources.reduce((sum, r) => sum + (r.encodedBodySize || 0), 0),
    decodedBytes: presetResources.reduce((sum, r) => sum + (r.decodedBodySize || 0), 0),
    // files 为 0 时用于排查为什么没匹配到（例如 URL 形态不同）。
    ...(presetResources.length === 0 ? { sample: resources.slice(0, 8).map((r) => r.name) } : {}),
  };

  const summary = {
    ...extra,
    wallToReadyMs: Math.round(performance.now() - startedAt),
    stages,
    accumulated: Object.fromEntries([...accumulated].map(([key, ms]) => [key, Math.round(ms)])),
    net,
    longTasks,
    commits: {
      count: commits.length,
      totalMs: Math.round(commits.reduce((sum, c) => sum + c.ms, 0)),
      maxMs: Math.round(commits.reduce((max, c) => Math.max(max, c.ms), 0)),
    },
  };

  performance.mark('bootPerf:ready');
  devLog('ui', 'boot-perf-summary', summary);
  try {
    // 单独一条纯 JSON，方便整段复制回传。
    console.info(`[boot-perf] SUMMARY ${JSON.stringify(summary)}`);
  } catch {
    // ignore
  }
}
