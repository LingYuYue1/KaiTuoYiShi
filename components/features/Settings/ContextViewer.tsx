import { useMemo, useState } from "react";
import type {
  ContextSnapshot,
  ContextSnapshotKind,
} from "@/hooks/useGame/contextSnapshot";
import { formatTokenCount } from "@/utils/tokenEstimate";

interface Props {
  getSnapshot: (kind?: ContextSnapshotKind) => ContextSnapshot;
  onRefresh: () => void;
  devMode: boolean;
}

type ViewMode = "all" | "single";

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

export function ContextViewerTab({ getSnapshot, onRefresh, devMode }: Props) {
  const [snapshotKind, setSnapshotKind] = useState<ContextSnapshotKind>("main");
  const snapshot = getSnapshot(snapshotKind);
  const [mode, setMode] = useState<ViewMode>("all");
  const [selectedId, setSelectedId] = useState(snapshot.sections[0]?.id ?? "");
  const [copyHint, setCopyHint] = useState("");

  const uploadSections = useMemo(
    () => snapshot.sections.filter((section) => section.upload !== false && !section.diagnostic),
    [snapshot.sections],
  );
  const visibleSections = useMemo(
    () => (devMode ? snapshot.sections : uploadSections),
    [devMode, snapshot.sections, uploadSections],
  );

  const selected = useMemo(
    () =>
      visibleSections.find((section) => section.id === selectedId) ??
      visibleSections[0],
    [selectedId, visibleSections],
  );
  const content = mode === "all" ? formatSections(visibleSections) : (selected?.content ?? "");
  const shownTokens =
    mode === "all"
      ? devMode
        ? snapshot.estimatedTokens
        : snapshot.uploadEstimatedTokens
      : (selected?.estimatedTokens ?? 0);
  const shownTokenLabel =
    mode === "all" && devMode
      ? "当前显示"
      : selected?.diagnostic || selected?.upload === false
        ? "诊断参考"
        : "估算上传";

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
              真实上传 Tokens：{formatTokenCount(snapshot.uploadEstimatedTokens)}
            </span>
            {devMode && snapshot.diagnosticEstimatedTokens > 0 ? (
              <span>
                诊断参考 Tokens：
                {formatTokenCount(snapshot.diagnosticEstimatedTokens)}
              </span>
            ) : null}
            <span>区块：{visibleSections.length} 项</span>
            {devMode ? <span className="text-amber-200/80">开发者诊断已开启</span> : null}
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
                const nextSnapshot = getSnapshot(tab.key);
                const nextSections = devMode
                  ? nextSnapshot.sections
                  : nextSnapshot.sections.filter((section) => section.upload !== false && !section.diagnostic);
                setSnapshotKind(tab.key);
                setMode("all");
                setSelectedId(nextSections[0]?.id ?? "");
              }}
            >
              {tab.label}
            </button>
          ))}
          <button
            className={buttonClass(mode === "all")}
            onClick={() => setMode("all")}
          >
            {devMode ? "全部内容" : "全部请求内容"}
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
        {devMode
          ? "当前已开启开发者模式，列表会同时显示真实请求与本地诊断参考；诊断参考不会发送给模型。"
          : "这里只显示会进入 AI 请求的内容；本地测试、分析和诊断参考仅在开发者模式下可见。"}
        {snapshot.sourceInput ? (
          <span className="ml-2">
            参考输入：{snapshot.sourceInput.slice(0, 80)}
          </span>
        ) : null}
        {copyHint ? (
          <span className="ml-3 text-emerald-300">{copyHint}</span>
        ) : null}
      </div>

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
            <span>{visibleSections.length} 项</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[rgb(var(--tj-bg-secondary))] text-[rgb(var(--tj-accent-primary))]/80">
                <tr>
                  <th className="w-10 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2 text-center">#</th>
                  <th className="w-24 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2">类目</th>
                  <th className="border-b border-[rgb(var(--tj-accent-primary))]/15 p-2">项目</th>
                  <th className="w-24 border-b border-[rgb(var(--tj-accent-primary))]/15 p-2 text-right">Token</th>
                </tr>
              </thead>
              <tbody>
                {visibleSections.map((section) => {
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
                      <td className="p-2 text-center text-[rgb(var(--tj-text-secondary))]/70">{section.order}</td>
                      <td className="p-2 text-[rgb(var(--tj-text-secondary))]/75">{section.category}</td>
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
                ? devMode
                  ? "全部内容（含诊断）"
                  : "实际请求内容"
                : (selected?.title ?? "单项内容")}
            </span>
            <span>{shownTokenLabel} {formatTokenCount(shownTokens)} Tokens</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <pre className="whitespace-pre-wrap break-words text-xs leading-6 text-[rgb(var(--tj-text-primary))]">
              {content || "当前没有会发送给此 AI 的请求内容"}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSections(sections: ContextSnapshot["sections"]): string {
  return sections
    .map((section) => `【${section.category}｜${section.title}】\n${section.content}`)
    .join("\n\n---\n\n");
}

function buttonClass(active: boolean): string {
  return [
    "px-3 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45",
    active
      ? "border border-[rgb(var(--tj-accent-primary))]/80 bg-[rgb(var(--tj-accent-primary))]/15 text-[rgb(var(--tj-accent-primary))]"
      : "border border-[rgb(var(--tj-accent-primary))]/50 bg-black/20 text-[rgb(var(--tj-accent-secondary))] hover:border-[rgb(var(--tj-accent-primary))]/65 hover:text-[rgb(var(--tj-accent-primary))]",
  ].join(" ");
}
