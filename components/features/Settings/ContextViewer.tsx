import { useMemo, useState } from "react";
import { Copy, Play, Square } from "lucide-react";
import type {
  ContextSnapshot,
  ContextSnapshotKind,
} from "@/hooks/useGame/contextSnapshot";
import {
  formatZhikuStage6Report,
  ZHIKU_STAGE6_FIXTURES,
  type ZhikuStage6GroupKind,
  type ZhikuStage6HumanReview,
  type ZhikuStage6Report,
  type ZhikuStage6Selection,
} from "@/services/zhikuStage6Runner";
import { formatTokenCount } from "@/utils/tokenEstimate";

interface Props {
  getSnapshot: (kind?: ContextSnapshotKind) => ContextSnapshot;
  onRefresh: () => void;
  stage6Config: { provider: string; model: string } | null;
  stage6Report: ZhikuStage6Report | null;
  stage6Running: boolean;
  stage6Error: string;
  onRunZhikuStage6: (selection?: ZhikuStage6Selection) => void;
  onCancelZhikuStage6: () => void;
  onUpdateZhikuStage6Review: (fixtureId: string, review: ZhikuStage6HumanReview) => void;
}

type ViewMode = "all" | "single";
type ZhikuDiagnosticView = "preview" | "actual" | "ab";

const cardClip =
  "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)";

const SNAPSHOT_TABS: Array<{ key: ContextSnapshotKind; label: string }> = [
  { key: "main", label: "主剧情" },
  { key: "variable", label: "变量模型" },
  { key: "phone", label: "手机系统" },
  { key: "news", label: "星际周报" },
  { key: "yiting", label: "忆庭召回" },
  { key: "zhiku", label: "智库召回" },
];

export function ContextViewerTab({
  getSnapshot,
  onRefresh,
  stage6Config,
  stage6Report,
  stage6Running,
  stage6Error,
  onRunZhikuStage6,
  onCancelZhikuStage6,
  onUpdateZhikuStage6Review,
}: Props) {
  const [snapshotKind, setSnapshotKind] = useState<ContextSnapshotKind>("main");
  const snapshot = getSnapshot(snapshotKind);
  const [mode, setMode] = useState<ViewMode>("all");
  const [selectedId, setSelectedId] = useState(snapshot.sections[0]?.id ?? "");
  const [copyHint, setCopyHint] = useState("");
  const [zhikuDiagnosticView, setZhikuDiagnosticView] =
    useState<ZhikuDiagnosticView>("preview");
  const [stage6FixtureId, setStage6FixtureId] = useState(ZHIKU_STAGE6_FIXTURES[0]?.id ?? "");
  const [stage6Group, setStage6Group] = useState<ZhikuStage6GroupKind>(ZHIKU_STAGE6_FIXTURES[0]?.groups[0] ?? "with-v3");
  const [stage6ReviewDrafts, setStage6ReviewDrafts] = useState<Record<string, ZhikuStage6HumanReview>>({});

  const selected = useMemo(
    () =>
      snapshot.sections.find((section) => section.id === selectedId) ??
      snapshot.sections[0],
    [selectedId, snapshot.sections],
  );
  const content =
    mode === "all" ? snapshot.fullText : (selected?.content ?? "");
  const shownTokens =
    mode === "all"
      ? snapshot.estimatedTokens
      : (selected?.estimatedTokens ?? 0);
  const stage6ReportText = useMemo(
    () => (stage6Report ? formatZhikuStage6Report(stage6Report) : ""),
    [stage6Report],
  );
  const stage6Completed = stage6Report?.summary.completedMainRequests ?? 0;
  const stage6Failed = stage6Report?.summary.failedMainRequests ?? 0;
  const stage6Cancelled = stage6Report?.summary.cancelledMainRequests ?? 0;
  const stage6Processed = stage6Completed + stage6Failed + stage6Cancelled;
  const stage6Planned = stage6Report?.summary.plannedMainRequests ?? 18;
  const stage6Progress =
    stage6Planned > 0
      ? Math.min(100, (stage6Processed / stage6Planned) * 100)
      : 0;
  const selectedStage6Definition = ZHIKU_STAGE6_FIXTURES.find((fixture) => fixture.id === stage6FixtureId) ?? ZHIKU_STAGE6_FIXTURES[0];
  const selectedStage6Fixture = stage6Report?.fixtures.find((fixture) => fixture.id === selectedStage6Definition?.id);
  const stage6Groups = selectedStage6Fixture?.groups ?? [];
  const stage6WithV3 = stage6Groups.find((group) => group.group === "with-v3") ?? stage6Groups.find((group) => group.group === "native");
  const stage6WithoutV3 = stage6Groups.find((group) => group.group === "without-v3") ?? stage6Groups.find((group) => group.group === "tavern-v2");
  const stage6ReviewDraft = stage6ReviewDrafts[selectedStage6Fixture?.id ?? stage6FixtureId] ?? selectedStage6Fixture?.humanReview ?? {};

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopyHint(`${label}已复制`);
    window.setTimeout(() => setCopyHint(""), 1600);
  };

  return (
    <div className="flex h-full min-h-[620px] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg font-bold tracking-[0.24em] text-[rgb(var(--tj-accent-primary))]">
            {snapshot.title}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--tj-text-secondary))]/80">
            <span>顺序与类目一览</span>
            <span>
              真实上传 Tokens：
              {formatTokenCount(snapshot.uploadEstimatedTokens)}
            </span>
            {snapshot.diagnosticEstimatedTokens > 0 ? (
              <span>
                诊断参考 Tokens：
                {formatTokenCount(snapshot.diagnosticEstimatedTokens)}
              </span>
            ) : null}
            <span>区块：{snapshot.sections.length} 项</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={buttonClass(false)} onClick={onRefresh}>
            刷新
          </button>
          <button
            className={buttonClass(false)}
            onClick={() =>
              void copyText(content, mode === "all" ? "全部上下文" : "当前区块")
            }
          >
            复制
          </button>
          {SNAPSHOT_TABS.map((tab) => (
            <button
              key={tab.key}
              className={buttonClass(snapshotKind === tab.key)}
              onClick={() => {
                setSnapshotKind(tab.key);
                setMode("all");
                if (tab.key === "zhiku") setZhikuDiagnosticView("preview");
                setSelectedId(getSnapshot(tab.key).sections[0]?.id ?? "");
              }}
            >
              {tab.label}
            </button>
          ))}
          {snapshotKind === "zhiku" ? (
            <div className="flex items-center gap-1 border border-[rgb(var(--tj-accent-primary))]/25 bg-black/15 p-1">
              {(
                [
                  ["preview", "本回合预演"],
                  ["actual", "上一回合实发"],
                  ["ab", "A/B 预检"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={buttonClass(zhikuDiagnosticView === key)}
                  onClick={() => {
                    setZhikuDiagnosticView(key);
                    setMode("single");
                    const targetId =
                      key === "preview"
                        ? "zhiku_trace_preview"
                        : key === "actual"
                          ? "zhiku_trace_actual"
                          : "zhiku_stage6_ab_preflight";
                    setSelectedId(targetId);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <button
            className={buttonClass(mode === "all")}
            onClick={() => setMode("all")}
          >
            全部内容
          </button>
          <button
            className={buttonClass(mode === "single")}
            onClick={() => setMode("single")}
          >
            单项查看
          </button>
        </div>
      </div>

      <div
        className="px-4 py-3 text-xs leading-6 text-[rgb(var(--tj-text-secondary))]/80"
        style={{
          border: "1px solid rgba(var(--tj-accent-primary),0.22)",
          background: "rgba(0,0,0,0.22)",
          clipPath: cardClip,
        }}
      >
        <span className="text-[rgb(var(--tj-accent-primary))]">说明：</span>
        上下文内容为本地预览计数，不会自行调用 API。真实上传 Tokens
        只统计会进入请求的区块；诊断参考不会发送给模型。只有阶段六面板中的运行按钮会发起真实模型请求，真实计费以模型服务商为准。
        {snapshot.sourceInput ? (
          <span className="ml-2">
            参考输入：{snapshot.sourceInput.slice(0, 80)}
          </span>
        ) : null}
        {copyHint ? (
          <span className="ml-3 text-emerald-300">{copyHint}</span>
        ) : null}
      </div>

      {snapshotKind === "zhiku" && zhikuDiagnosticView === "ab" ? (
        <div
          className="space-y-3 px-4 py-3 text-xs text-[rgb(var(--tj-text-secondary))]"
          style={{
            border: "1px solid rgba(var(--tj-accent-primary),0.28)",
            background: "rgba(0,0,0,0.28)",
            clipPath: cardClip,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-serif text-sm font-bold text-[rgb(var(--tj-accent-primary))]">
                阶段六真实模型 A/B
              </div>
              <div className="mt-1 text-[rgb(var(--tj-text-secondary))]/75">
                当前配置：
                {stage6Config
                  ? `${stage6Config.provider} / ${stage6Config.model}`
                  : "未找到可用的主 API 配置"}
                <span className="ml-3">
                  10 个固定场景，18 次主模型请求，智库 AI 补充另计
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <label className="text-[rgb(var(--tj-text-secondary))]/80" htmlFor="zhiku-stage6-fixture-select">
                  复测场景
                </label>
                <select
                  id="zhiku-stage6-fixture-select"
                  data-testid="zhiku-stage6-fixture-select"
                  value={stage6FixtureId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setStage6FixtureId(nextId);
                    const nextFixture = ZHIKU_STAGE6_FIXTURES.find((fixture) => fixture.id === nextId);
                    setStage6Group(nextFixture?.groups[0] ?? "with-v3");
                  }}
                  className="max-w-full border border-[rgb(var(--tj-accent-primary))]/35 bg-black/35 px-2 py-1.5 text-[rgb(var(--tj-text-primary))]"
                >
                  {ZHIKU_STAGE6_FIXTURES.map((fixture) => (
                    <option key={fixture.id} value={fixture.id}>{fixture.title}</option>
                  ))}
                </select>
                <select
                  aria-label="阶段六复测组"
                  data-testid="zhiku-stage6-group-select"
                  value={stage6Group}
                  onChange={(event) => setStage6Group(event.target.value as ZhikuStage6GroupKind)}
                  className="border border-[rgb(var(--tj-accent-primary))]/35 bg-black/35 px-2 py-1.5 text-[rgb(var(--tj-text-primary))]"
                >
                  {(selectedStage6Definition?.groups ?? []).map((group) => (
                    <option key={group} value={group}>{formatStage6Group(group)}</option>
                  ))}
                </select>
                <button
                  data-testid="zhiku-stage6-rerun-group"
                  className={buttonClass(false)}
                  disabled={stage6Running || !stage6Config || !selectedStage6Definition}
                  onClick={() => selectedStage6Definition && onRunZhikuStage6({ fixtureId: selectedStage6Definition.id, group: stage6Group })}
                  title="只复测当前场景和组，并合并回原报告"
                >
                  <span className="inline-flex items-center gap-1.5"><Play size={13} aria-hidden="true" />单组复测</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                data-testid="zhiku-stage6-run"
                className={buttonClass(false)}
                disabled={stage6Running || !stage6Config}
                onClick={() => onRunZhikuStage6()}
                title="使用当前主 API 配置运行阶段六真实 A/B"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Play size={13} aria-hidden="true" />
                  {stage6Running ? "运行中" : "运行真实 A/B"}
                </span>
              </button>
              <button
                className={buttonClass(false)}
                disabled={!stage6Running}
                onClick={onCancelZhikuStage6}
                title="完成当前取消信号处理后停止剩余请求"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Square size={12} aria-hidden="true" />
                  取消
                </span>
              </button>
              <button
                className={buttonClass(false)}
                disabled={!stage6ReportText}
                onClick={() => void copyText(stage6ReportText, "阶段六报告")}
                title="复制阶段六脱敏报告"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Copy size={13} aria-hidden="true" />
                  复制报告
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[rgb(var(--tj-text-secondary))]/75">
            <span>
              状态：{formatStage6Status(stage6Report?.status, stage6Running)}
            </span>
            <span>
              进度：{stage6Processed}/{stage6Planned}
            </span>
            <span>完成：{stage6Completed}</span>
            <span>失败：{stage6Failed}</span>
            <span>取消：{stage6Cancelled}</span>
            {stage6Report ? (
              <span>
                截断：{stage6Report.summary.truncatedMainRequests ?? 0}
              </span>
            ) : null}
            {stage6Report ? (
              <span>
                硬断言失败：{stage6Report.summary.hardAssertionsFailed}
              </span>
            ) : null}
            {stage6Report ? (
              <span>
                隔离：
                {stage6Report.summary.isolationPreserved
                  ? "一致"
                  : stage6Running
                    ? "运行后确认"
                    : "不一致"}
              </span>
            ) : null}
          </div>
          <div
            className="h-1.5 overflow-hidden bg-black/45"
            aria-label={`阶段六进度 ${stage6Processed}/${stage6Planned}`}
          >
            <div
              className="h-full bg-[rgb(var(--tj-accent-primary))]/80 transition-[width] duration-300"
              style={{ width: `${stage6Progress}%` }}
            />
          </div>
          {stage6Error ? (
            <div className="border border-red-400/30 bg-red-950/25 px-3 py-2 text-red-200">
              {stage6Error}
            </div>
          ) : null}
          {selectedStage6Fixture ? (
            <div className="space-y-3 border border-white/10 bg-black/20 p-3" data-testid="zhiku-stage6-ab-comparison">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-serif text-sm font-bold text-[rgb(var(--tj-accent-primary))]">
                  {selectedStage6Fixture.title}：A/B 并排复核
                </div>
                <div className="text-[rgb(var(--tj-text-secondary))]/70">原始响应与生产解析结果分开显示</div>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {[
                  ["with-v3", stage6WithV3?.group === "native" ? "普通模式" : "A｜启用 V3 智库", stage6WithV3],
                  ["without-v3", stage6WithoutV3?.group === "tavern-v2" ? "Tavern V2" : "B｜不注入 V3", stage6WithoutV3],
                ].map(([key, label, group]) => {
                  const result = group as typeof stage6WithV3;
                  return (
                    <div key={String(key)} className="min-w-0 border border-[rgb(var(--tj-accent-primary))]/20 bg-black/25 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-[rgb(var(--tj-accent-primary))]">{String(label)}</span>
                        <span className="text-[rgb(var(--tj-text-secondary))]/70">{result ? `${result.status}｜finish=${result.finishReason ?? "未返回"}` : "尚未有结果"}</span>
                      </div>
                      {result ? (
                        <>
                          <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-2">
                            <div className="min-w-0">
                              <div className="mb-1 text-[11px] text-[rgb(var(--tj-text-secondary))]/70">原始供应商响应</div>
                              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border border-white/10 bg-black/30 p-2 text-[11px] leading-5 text-[rgb(var(--tj-text-primary))]/80">{result.output || "（空）"}</pre>
                            </div>
                            <div className="min-w-0">
                              <div className="mb-1 text-[11px] text-[rgb(var(--tj-text-secondary))]/70">玩家最终可见 / 解析正文</div>
                              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border border-white/10 bg-black/30 p-2 text-[11px] leading-5 text-[rgb(var(--tj-text-primary))]/90">{result.production?.body || "（解析正文为空）"}</pre>
                              {result.production?.actionOptions.length ? <div className="mt-2 text-[11px] text-[rgb(var(--tj-accent-primary))]/85">行动选项：{result.production.actionOptions.join("；")}</div> : null}
                              {result.production?.appliedTavernScripts.length ? <div className="mt-1 text-[11px] text-emerald-300/80">Tavern 清理：{result.production.appliedTavernScripts.join("、")}</div> : null}
                            </div>
                          </div>
                          {result.observations.length ? <div className="mt-2 text-[11px] leading-5 text-amber-200/80">观察：{result.observations.join("；")}</div> : null}
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-white/10 pt-3">
                <div className="mb-2 text-xs font-bold text-[rgb(var(--tj-accent-primary))]">人工评分（本地记录，不调用第二个 AI）</div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="flex items-center gap-2 text-xs">A 组评分
                    <input type="number" min="1" max="5" step="1" value={stage6ReviewDraft.withV3Score ?? ""} onChange={(event) => setStage6ReviewDrafts((current) => ({ ...current, [selectedStage6Fixture.id]: { ...stage6ReviewDraft, withV3Score: event.target.value ? Number(event.target.value) : undefined } }))} className="w-16 border border-white/15 bg-black/30 px-2 py-1 text-[rgb(var(--tj-text-primary))]" />
                  </label>
                  <label className="flex items-center gap-2 text-xs">B 组评分
                    <input type="number" min="1" max="5" step="1" value={stage6ReviewDraft.withoutV3Score ?? ""} onChange={(event) => setStage6ReviewDrafts((current) => ({ ...current, [selectedStage6Fixture.id]: { ...stage6ReviewDraft, withoutV3Score: event.target.value ? Number(event.target.value) : undefined } }))} className="w-16 border border-white/15 bg-black/30 px-2 py-1 text-[rgb(var(--tj-text-primary))]" />
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <textarea value={stage6ReviewDraft.withV3Note ?? ""} onChange={(event) => setStage6ReviewDrafts((current) => ({ ...current, [selectedStage6Fixture.id]: { ...stage6ReviewDraft, withV3Note: event.target.value } }))} placeholder="A 组人工观察" className="min-h-16 border border-white/15 bg-black/30 p-2 text-xs text-[rgb(var(--tj-text-primary))] placeholder:text-[rgb(var(--tj-text-secondary))]/50" />
                  <textarea value={stage6ReviewDraft.withoutV3Note ?? ""} onChange={(event) => setStage6ReviewDrafts((current) => ({ ...current, [selectedStage6Fixture.id]: { ...stage6ReviewDraft, withoutV3Note: event.target.value } }))} placeholder="B 组人工观察" className="min-h-16 border border-white/15 bg-black/30 p-2 text-xs text-[rgb(var(--tj-text-primary))] placeholder:text-[rgb(var(--tj-text-secondary))]/50" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={stage6ReviewDraft.verdict ?? "unrated"} onChange={(event) => setStage6ReviewDrafts((current) => ({ ...current, [selectedStage6Fixture.id]: { ...stage6ReviewDraft, verdict: event.target.value as ZhikuStage6HumanReview["verdict"] } }))} className="border border-white/15 bg-black/30 px-2 py-1.5 text-xs text-[rgb(var(--tj-text-primary))]">
                    <option value="unrated">未判定</option>
                    <option value="with-v3">A 组更好</option>
                    <option value="without-v3">B 组更好</option>
                    <option value="tie">大致相当</option>
                  </select>
                  <button className={buttonClass(false)} disabled={!stage6Report} onClick={() => onUpdateZhikuStage6Review(selectedStage6Fixture.id, stage6ReviewDraft)}>保存人工评分</button>
                </div>
              </div>
            </div>
          ) : null}
          <pre
            data-testid="zhiku-stage6-report"
            className="max-h-52 overflow-auto whitespace-pre-wrap break-words border border-white/10 bg-black/25 p-3 leading-5 text-[rgb(var(--tj-text-primary))]/85"
          >
            {stage6ReportText ||
              "尚未运行。完成后，脱敏报告会保存在本机 IndexedDB，并在这里显示。"}
          </pre>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div
          className="flex min-h-[260px] max-h-[340px] flex-col overflow-hidden xl:min-h-0 xl:max-h-none"
          style={{
            border: "1px solid rgba(var(--tj-accent-primary),0.2)",
            background: "rgba(0,0,0,0.28)",
            clipPath: cardClip,
          }}
        >
          <div className="flex items-center justify-between border-b border-[rgb(var(--tj-accent-primary))]/15 px-4 py-3 text-xs text-[rgb(var(--tj-text-secondary))]/75">
            <span>上下文顺序</span>
            <span>{snapshot.sections.length} 项</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[rgb(var(--tj-bg-secondary))] text-[rgb(var(--tj-accent-primary))]/80">
                <tr>
                  <th className="w-10 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2 text-center">
                    #
                  </th>
                  <th className="w-24 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2">
                    类目
                  </th>
                  <th className="border-b border-[rgb(var(--tj-accent-primary))]/15 p-2">
                    项目
                  </th>
                  <th className="w-24 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2 text-right">
                    Token
                  </th>
                </tr>
              </thead>
              <tbody>
                {snapshot.sections.map((section) => {
                  const active = section.id === selected?.id;
                  return (
                    <tr
                      key={section.id}
                      className={`cursor-pointer border-b border-white/5 ${active ? "bg-[rgb(var(--tj-accent-primary))]/12" : "hover:bg-white/5"}`}
                      onClick={() => {
                        setSelectedId(section.id);
                        setMode("single");
                      }}
                    >
                      <td className="p-2 text-center text-[rgb(var(--tj-text-secondary))]/70">
                        {section.order}
                      </td>
                      <td className="p-2 text-[rgb(var(--tj-text-secondary))]/75">
                        {section.category}
                      </td>
                      <td
                        className="max-w-[170px] truncate p-2 text-[rgb(var(--tj-accent-primary))]"
                        title={section.title}
                      >
                        {section.title}
                      </td>
                      <td className="p-2 text-right text-[rgb(var(--tj-text-secondary))]/70">
                        {formatTokenCount(section.estimatedTokens)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div
          className="flex min-h-[420px] flex-col overflow-hidden xl:min-h-0"
          style={{
            border: "1px solid rgba(var(--tj-accent-primary),0.2)",
            background: "rgba(0,0,0,0.28)",
            clipPath: cardClip,
          }}
        >
          <div className="flex items-center justify-between border-b border-[rgb(var(--tj-accent-primary))]/15 px-4 py-3 text-xs text-[rgb(var(--tj-text-secondary))]/75">
            <span>
              {mode === "all"
                ? "全部上下文内容"
                : (selected?.title ?? "单项内容")}
            </span>
            <span>估算上传 {formatTokenCount(shownTokens)} Tokens</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-[rgb(var(--tj-text-primary))]">
              {content || "暂无上下文内容"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function buttonClass(active: boolean): string {
  return [
    "px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    active
      ? "border border-[rgb(var(--tj-accent-primary))]/80 bg-[rgb(var(--tj-accent-primary))]/15 text-[rgb(var(--tj-accent-primary))]"
      : "border border-[rgb(var(--tj-accent-primary))]/50 bg-black/20 text-[rgb(var(--tj-accent-secondary))] hover:border-[rgb(var(--tj-accent-primary))]/65 hover:text-[rgb(var(--tj-accent-primary))]",
  ].join(" ");
}

function formatStage6Status(
  status: ZhikuStage6Report["status"] | undefined,
  running: boolean,
): string {
  if (running) return "运行中";
  switch (status) {
    case "completed":
      return "已完成";
    case "partial":
      return "部分完成";
    case "cancelled":
      return "已取消";
    case "failed":
      return "失败";
    case "running":
      return "上次运行中断";
    default:
      return "未运行";
  }
}

function formatStage6Group(group: ZhikuStage6GroupKind): string {
  switch (group) {
    case "with-v3": return "A｜启用 V3";
    case "without-v3": return "B｜不注入 V3";
    case "native": return "普通模式";
    case "tavern-v2": return "Tavern V2";
    default: return group;
  }
}
