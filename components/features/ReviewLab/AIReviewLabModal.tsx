import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

type ReviewMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  gameTime?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cachedTokens?: number;
    source?: string;
    provider?: string;
    model?: string;
  };
  responseDurationSec?: number;
  parsedResponse?: {
    thinking?: string;
    body?: string;
    memory?: string;
    worldEvents?: string[];
    actionOptions?: string[];
    variableDraft?: string;
    storyPlan?: string;
    rawText?: string;
  };
  debugContext?: {
    systemPrompt?: string;
    messages?: Array<{ role: string; content: string }>;
    recallSummary?: string;
    recallPreview?: string;
    recallFullContent?: string;
    zhikuRecallPreview?: string;
    zhikuRecallInjection?: string;
    stV2Used?: boolean;
    deepSeekProtocolIssues?: string[];
    mainRequestMode?: string;
    rerollSimilarity?: number;
    rerollSimilarityRetried?: boolean;
  };
};

type RiskLevel = 'ok' | 'warn' | 'danger';

type RiskItem = {
  id: string;
  label: string;
  level: RiskLevel;
  detail: string;
};

type FlowStep = {
  id: string;
  label: string;
  status: RiskLevel;
  summary: string;
};

interface AIReviewLabModalProps {
  messages: ReviewMessage[];
  loading?: boolean;
  onClose: () => void;
}

const surfaceClip = 'polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)';
const smallClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

export function AIReviewLabModal({ messages, loading = false, onClose }: AIReviewLabModalProps) {
  const [activeStepId, setActiveStepId] = useState('context');
  const report = useMemo(() => buildReviewReport(messages), [messages]);
  const activeStep = report.steps.find((step) => step.id === activeStepId);
  if (!activeStep) throw new Error(`Unknown AI review step: ${activeStepId}`);

  return (
    <Modal onClose={onClose} title="AI 审查实验室" className="max-w-[min(1320px,96vw)]">
      <div className="relative overflow-hidden rounded-[2rem] p-[1px]" style={{ background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.55), rgba(var(--tj-accent-secondary),0.24), rgba(var(--tj-border),0.32))' }}>
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: 'radial-gradient(circle at 18% 12%, rgba(var(--tj-accent-primary),0.22), transparent 32%), radial-gradient(circle at 82% 4%, rgba(var(--tj-accent-secondary),0.18), transparent 34%), linear-gradient(120deg, transparent 0 44%, rgba(var(--tj-accent-primary),0.08) 45% 46%, transparent 47%)' }} />
        <div className="relative space-y-4 p-3 md:p-5" style={{ background: 'linear-gradient(180deg, rgba(var(--tj-bg-primary),0.92), rgba(var(--tj-bg-secondary),0.86))', clipPath: surfaceClip }}>
          <header className="grid gap-3 lg:grid-cols-[1.35fr_0.95fr_0.8fr]">
            <HeroCard report={report} loading={loading} />
            <MetricGrid report={report} />
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <BadgeCard label="模式" value="只读复盘" tone="cyan" detail="不写存档 / 不拦截主流程" />
              <BadgeCard label="来源" value={report.latestAssistant ? '最近回合' : '暂无回合'} tone={report.latestAssistant ? 'green' : 'amber'} detail={report.latestAssistant?.gameTime || formatTime(report.latestAssistant?.timestamp)} />
              <BadgeCard label="酒馆 V2" value={report.debugContext?.stV2Used ? '已使用' : '未启用'} tone={report.debugContext?.stV2Used ? 'cyan' : 'slate'} detail="启用时严格构建，不切换到其他消息链" />
            </div>
          </header>

          <div className="grid min-h-[520px] gap-4 xl:grid-cols-[250px_minmax(0,1fr)_300px]">
            <aside className="space-y-2">
              <div className="font-serif text-xs tracking-[0.34em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>REVIEW FLOW</div>
              {report.steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStepId(step.id)}
                  className="group flex w-full items-center gap-3 px-3 py-3 text-left transition-all"
                  style={{
                    clipPath: smallClip,
                    background: activeStepId === step.id ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.22), rgba(var(--tj-accent-secondary),0.06))' : 'rgba(var(--tj-bubble),0.34)',
                    boxShadow: activeStepId === step.id ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.56), 0 0 22px rgba(var(--tj-accent-primary),0.12)' : 'inset 0 0 0 1px rgba(var(--tj-border),0.58)',
                  }}
                >
                  <StatusOrb level={step.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-sm font-semibold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{step.label}</span>
                    <span className="mt-0.5 block truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>{step.summary}</span>
                  </span>
                </button>
              ))}
            </aside>

            <main className="min-w-0 overflow-hidden rounded-3xl border border-[rgba(var(--tj-accent-primary),0.18)]" style={{ background: 'linear-gradient(180deg, rgba(var(--tj-surface),0.62), rgba(var(--tj-bg-primary),0.48))' }}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(var(--tj-border),0.55)] px-4 py-3">
                <div>
                  <div className="font-serif text-lg font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{activeStep.label}</div>
                  <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.75)' }}>{activeStep.summary}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyStep(report, activeStep.id)}
                  className="px-3 py-2 text-xs font-semibold tracking-[0.18em] transition-all"
                  style={{ clipPath: smallClip, color: 'rgb(var(--tj-text-primary))', background: 'rgba(var(--tj-accent-primary),0.12)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.32)' }}
                >
                  复制本栏
                </button>
              </div>
              <StepDetail report={report} stepId={activeStep.id} />
            </main>

            <aside className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-serif text-xs tracking-[0.34em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>RISK RADAR</div>
                <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.76)' }}>{report.risks.length} 项</span>
              </div>
              <div className="space-y-2">
                {report.risks.map((risk) => <RiskCard key={risk.id} risk={risk} />)}
              </div>
            </aside>
          </div>

          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {report.writePreview.map((item) => (
              <div key={item.label} className="min-h-[104px] p-3" style={{ clipPath: smallClip, background: 'rgba(var(--tj-bubble),0.34)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{item.label}</span>
                  <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ color: 'rgba(var(--tj-accent-primary),0.94)', background: 'rgba(var(--tj-accent-primary),0.1)' }}>只读</span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary),0.8)' }}>{item.value || '本轮暂无内容'}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </Modal>
  );
}

function HeroCard({ report, loading }: { report: ReviewReport; loading: boolean }) {
  const verdictText = report.overallLevel === 'danger' ? '高风险' : report.overallLevel === 'warn' ? '需要关注' : '状态稳定';
  const verdictDetail = report.latestAssistant ? '最近一轮主剧情只读复盘' : '暂无可复盘的 AI 回复';
  return (
    <div className="relative overflow-hidden p-5" style={{ clipPath: surfaceClip, background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.2), rgba(var(--tj-bg-secondary),0.52) 52%, rgba(var(--tj-accent-secondary),0.14))', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)' }}>
      <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full blur-3xl" style={{ background: 'rgba(var(--tj-accent-primary),0.2)' }} />
      <div className="relative">
        <div className="text-[11px] font-semibold tracking-[0.42em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>AKIVILI REVIEW DECK</div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="font-serif text-3xl font-black tracking-[0.2em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{verdictText}</div>
          {loading && <span className="mb-1 rounded-full px-2 py-1 text-[10px]" style={{ color: 'rgb(var(--tj-text-primary))', background: 'rgba(var(--tj-amber-soft),0.18)' }}>生成中</span>}
        </div>
        <p className="mt-3 max-w-xl text-sm leading-6" style={{ color: 'rgba(var(--tj-text-secondary),0.86)' }}>{verdictDetail}。此页面不会写入存档、memoryDB 或云端，只帮助你看清本轮 AI 链路。</p>
      </div>
    </div>
  );
}

function MetricGrid({ report }: { report: ReviewReport }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <MetricCard label="输入 Token" value={formatNumber(report.inputTokens)} />
      <MetricCard label="输出 Token" value={formatNumber(report.outputTokens)} />
      <MetricCard label="上下文消息" value={`${report.contextMessageCount}`} />
      <MetricCard label="解析字段" value={`${report.parsedFieldCount}`} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3" style={{ clipPath: smallClip, background: 'rgba(var(--tj-bubble),0.36)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.56)' }}>
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.74)' }}>{label}</div>
      <div className="mt-1 font-mono text-xl font-black" style={{ color: 'rgb(var(--tj-text-primary))' }}>{value}</div>
    </div>
  );
}

function BadgeCard({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone: 'cyan' | 'green' | 'amber' | 'slate' }) {
  const color = tone === 'amber' ? 'var(--tj-amber-soft)' : tone === 'green' ? 'var(--tj-ui-success)' : tone === 'slate' ? 'var(--tj-text-secondary)' : 'var(--tj-accent-primary)';
  return (
    <div className="p-3" style={{ clipPath: smallClip, background: 'rgba(var(--tj-bubble),0.36)', boxShadow: `inset 0 0 0 1px rgba(${color},0.3)` }}>
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>{label}</div>
      <div className="mt-1 font-serif text-sm font-bold tracking-[0.18em]" style={{ color: `rgb(${color})` }}>{value}</div>
      {detail && <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>{detail}</div>}
    </div>
  );
}

function StepDetail({ report, stepId }: { report: ReviewReport; stepId: string }) {
  if (!report.latestAssistant) {
    return <EmptyState />;
  }
  if (stepId === 'input') {
    return <TextPanel title="上一条玩家输入" text={report.latestUserInput || '未找到上一条玩家输入。'} />;
  }
  if (stepId === 'context') {
    return (
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <TextPanel title="System Prompt" text={report.debugContext?.systemPrompt || '没有记录 systemPrompt。'} compact />
        <TextPanel title="API Messages" text={formatMessages(report.debugContext?.messages ?? []) || '没有记录 API messages。'} compact />
        <TextPanel title="记忆 / 智库注入" text={report.recallText || '本轮没有记录记忆或智库注入。'} compact />
        <TextPanel title="请求诊断" text={report.requestDiagnostics || '暂无额外诊断。'} compact />
      </div>
    );
  }
  if (stepId === 'raw') {
    return <TextPanel title="AI 原始返回" text={report.rawText || report.latestAssistant.content || '没有原始返回。'} />;
  }
  if (stepId === 'parsed') {
    return (
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <TextPanel title="正文" text={report.parsed?.body || '未解析到正文。'} compact />
        <TextPanel title="行动选项" text={(report.parsed?.actionOptions ?? []).map((option, index) => `${index + 1}. ${option}`).join('\n') || '未解析到行动选项。'} compact />
        <TextPanel title="短期记忆" text={report.parsed?.memory || '未解析到短期记忆。'} compact />
        <TextPanel title="动态世界" text={(report.parsed?.worldEvents ?? []).join('\n') || '未解析到动态世界。'} compact />
      </div>
    );
  }
  if (stepId === 'write') {
    return (
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        {report.writePreview.map((item) => <TextPanel key={item.label} title={`${item.label} · 只读模拟`} text={item.value || '本轮暂无内容。'} compact />)}
      </div>
    );
  }
  return (
    <div className="space-y-3 p-4">
      {report.risks.map((risk) => <RiskCard key={risk.id} risk={risk} />)}
    </div>
  );
}

function TextPanel({ title, text, compact = false }: { title: string; text: string; compact?: boolean }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[rgba(var(--tj-border),0.55)] bg-[rgba(var(--tj-bg-primary),0.36)]">
      <div className="flex items-center justify-between gap-2 border-b border-[rgba(var(--tj-border),0.46)] px-3 py-2">
        <h3 className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{title}</h3>
        <span className="font-mono text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary),0.68)' }}>{text.length} 字</span>
      </div>
      <pre className={`whitespace-pre-wrap break-words p-3 font-mono text-[12px] leading-5 ${compact ? 'max-h-[260px]' : 'max-h-[520px]'} overflow-auto`} style={{ color: 'rgba(var(--tj-text-primary),0.86)' }}>{text}</pre>
    </section>
  );
}

function RiskCard({ risk }: { risk: RiskItem }) {
  const levelColor = risk.level === 'danger' ? 'var(--tj-danger)' : risk.level === 'warn' ? 'var(--tj-amber-soft)' : 'var(--tj-ui-success)';
  const levelText = risk.level === 'danger' ? '高风险' : risk.level === 'warn' ? '注意' : '通过';
  return (
    <div className="p-3" style={{ clipPath: smallClip, background: `linear-gradient(90deg, rgba(${levelColor},0.12), rgba(var(--tj-bubble),0.34))`, boxShadow: `inset 0 0 0 1px rgba(${levelColor},0.32)` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{risk.label}</div>
        <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ color: `rgb(${levelColor})`, background: `rgba(${levelColor},0.12)` }}>{levelText}</span>
      </div>
      <p className="mt-2 text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>{risk.detail}</p>
    </div>
  );
}

function StatusOrb({ level }: { level: RiskLevel }) {
  const color = level === 'danger' ? 'var(--tj-danger)' : level === 'warn' ? 'var(--tj-amber-soft)' : 'var(--tj-ui-success)';
  return <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `rgb(${color})`, boxShadow: `0 0 16px rgba(${color},0.58)` }} />;
}

function EmptyState() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
      <div className="font-serif text-2xl font-black tracking-[0.22em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>暂无可复盘回合</div>
      <p className="mt-3 max-w-md text-sm leading-6" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>先进行一轮主剧情 AI 回复，再回来打开审查实验室。第一版只读取最近回合，不会主动调用 AI。</p>
    </div>
  );
}

type ReviewReport = ReturnType<typeof buildReviewReport>;

function buildReviewReport(messages: ReviewMessage[]) {
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant') ?? null;
  const latestUserInput = latestAssistant
    ? [...messages].reverse().find((message) => message.role === 'user' && message.timestamp <= latestAssistant.timestamp)?.content ?? ''
    : '';
  const parsed = latestAssistant?.parsedResponse;
  const debugContext = latestAssistant?.debugContext;
  const rawText = parsed?.rawText || latestAssistant?.content || '';
  const bodyText = parsed?.body || latestAssistant?.content || '';
  const contextText = `${debugContext?.systemPrompt ?? ''}\n${(debugContext?.messages ?? []).map((message) => message.content).join('\n')}`;
  const estimatedInputTokens = latestAssistant?.tokenUsage?.inputTokens ?? latestAssistant?.inputTokens ?? estimateTokens(contextText);
  const estimatedOutputTokens = latestAssistant?.tokenUsage?.outputTokens ?? latestAssistant?.outputTokens ?? estimateTokens(rawText);
  const risks = buildRisks({ latestAssistant, parsed, rawText, bodyText, contextText, estimatedInputTokens, debugContext });
  const overallLevel: RiskLevel = risks.some((risk) => risk.level === 'danger') ? 'danger' : risks.some((risk) => risk.level === 'warn') ? 'warn' : 'ok';
  const parsedFieldCount = parsed ? [parsed.body, parsed.memory, parsed.variableDraft, parsed.storyPlan, ...(parsed.worldEvents ?? []), ...(parsed.actionOptions ?? [])].filter((value) => String(value ?? '').trim()).length : 0;
  const recallText = [debugContext?.recallSummary, debugContext?.recallPreview, debugContext?.recallFullContent, debugContext?.zhikuRecallPreview, debugContext?.zhikuRecallInjection].filter(Boolean).join('\n\n');
  const requestDiagnostics = [
    debugContext?.mainRequestMode ? `请求模式：${debugContext.mainRequestMode}` : '',
    `酒馆 V2：${debugContext?.stV2Used ? '已使用' : '未启用'}`,
    debugContext?.rerollSimilarity !== undefined ? `重 roll 相似度：${debugContext.rerollSimilarity}` : '',
    debugContext?.deepSeekProtocolIssues?.length ? `DeepSeek 协议提示：${debugContext.deepSeekProtocolIssues.join(' / ')}` : '',
  ].filter(Boolean).join('\n');
  const writePreview = [
    { label: '正文', value: parsed?.body || latestAssistant?.content || '' },
    { label: '行动选项', value: (parsed?.actionOptions ?? []).join('\n') },
    { label: '短期记忆', value: parsed?.memory || '' },
    { label: '动态世界', value: (parsed?.worldEvents ?? []).join('\n') },
    { label: '变量草稿', value: parsed?.variableDraft || '' },
    { label: '剧情规划', value: parsed?.storyPlan || '' },
  ];
  const steps: FlowStep[] = [
    { id: 'input', label: '输入', status: latestUserInput ? 'ok' : 'warn', summary: latestUserInput ? truncate(latestUserInput, 26) : '未找到玩家输入' },
    { id: 'context', label: '上下文', status: estimatedInputTokens > 32000 ? 'warn' : 'ok', summary: `${formatNumber(estimatedInputTokens)} token · ${debugContext?.messages?.length ?? 0} messages` },
    { id: 'raw', label: 'AI 原文', status: rawText.trim() ? 'ok' : 'danger', summary: rawText.trim() ? `${rawText.length} 字` : '空返回' },
    { id: 'parsed', label: '解析', status: parsedFieldCount > 0 ? 'ok' : 'warn', summary: `${parsedFieldCount} 个字段` },
    { id: 'write', label: '写入预览', status: 'ok', summary: '只读模拟，不写入' },
    { id: 'risks', label: '风险报告', status: overallLevel, summary: `${risks.filter((risk) => risk.level !== 'ok').length} 个需关注` },
  ];
  return {
    latestAssistant,
    latestUserInput,
    parsed,
    debugContext,
    rawText,
    recallText,
    requestDiagnostics,
    inputTokens: estimatedInputTokens,
    outputTokens: estimatedOutputTokens,
    contextMessageCount: debugContext?.messages?.length ?? 0,
    parsedFieldCount,
    risks,
    overallLevel,
    steps,
    writePreview,
  };
}

function buildRisks({ latestAssistant, parsed, rawText, bodyText, contextText, estimatedInputTokens, debugContext }: {
  latestAssistant: ReviewMessage | null;
  parsed: ReviewMessage['parsedResponse'] | undefined;
  rawText: string;
  bodyText: string;
  contextText: string;
  estimatedInputTokens: number;
  debugContext: ReviewMessage['debugContext'] | undefined;
}): RiskItem[] {
  if (!latestAssistant) {
    return [{ id: 'empty', label: '无复盘对象', level: 'warn', detail: '当前聊天记录里还没有 assistant 回复。' }];
  }
  return [
    {
      id: 'body',
      label: '正文可用性',
      level: bodyText.trim().length < 20 ? 'warn' : 'ok',
      detail: bodyText.trim().length < 20 ? '正文过短或为空，需要检查是否空回。' : '正文存在，长度看起来正常。',
    },
    {
      id: 'options',
      label: '行动选项',
      level: !parsed?.actionOptions?.length ? 'warn' : parsed.actionOptions.some((option) => !option.trim()) ? 'warn' : 'ok',
      detail: !parsed?.actionOptions?.length ? '没有解析到行动选项。' : `解析到 ${parsed.actionOptions.length} 个行动选项。`,
    },
    {
      id: 'st-noise',
      label: 'ST 表层残留',
      level: hasStSurfaceNoise(rawText) || hasStSurfaceNoise(bodyText) ? 'warn' : 'ok',
      detail: hasStSurfaceNoise(rawText) || hasStSurfaceNoise(bodyText) ? '检测到疑似 ST 标题、HTML 注释或辅助标签残留。' : '没有发现常见 ST 表层噪声。',
    },
    {
      id: 'token',
      label: 'Token 体量',
      level: estimatedInputTokens > 48000 ? 'danger' : estimatedInputTokens > 32000 ? 'warn' : 'ok',
      detail: `输入约 ${formatNumber(estimatedInputTokens)} token。超过 32k 会提示关注，超过 48k 视为高风险。`,
    },
    {
      id: 'tavern',
      label: '酒馆叠加',
      level: 'ok',
      detail: debugContext?.stV2Used ? 'Tavern V2 已作为额外 messages 叠加。' : '本轮没有启用 Tavern V2。',
    },
    {
      id: 'writes',
      label: '写入草稿',
      level: suspiciousDraft(parsed?.memory) || suspiciousDraft(parsed?.variableDraft) || suspiciousDraft((parsed?.worldEvents ?? []).join('\n')) ? 'warn' : 'ok',
      detail: '本项只检查短期记忆、变量草稿和动态世界里是否出现元注释或异常长内容。',
    },
    {
      id: 'context-repeat',
      label: '上下文重复',
      level: contextText.includes('st_import_') || countOccurrences(contextText, '当前天气') > 3 ? 'warn' : 'ok',
      detail: contextText.includes('st_import_') ? '上下文里出现 legacy st_import_ 痕迹。' : '未发现明显旧 ST 模块或天气重复注入痕迹。',
    },
  ];
}

function hasStSurfaceNoise(text: string) {
  return /(^|\n)\s*#{1,4}\s*正文\b|<!--|<\/?(?:math|Q|WF|Prism|options|current_event|progress|details|danmu|tucao|htmlcontent)\b/i.test(text);
}

function suspiciousDraft(text = '') {
  const trimmed = text.trim();
  return /<!--|<\/?(?:math|Q|WF|Prism|options|current_event|progress|details)\b/i.test(trimmed) || trimmed.length > 3000;
}

function estimateTokens(text: string) {
  if (!text.trim()) return 0;
  return Math.ceil(text.length / 2.2);
}

function countOccurrences(text: string, keyword: string) {
  if (!keyword) return 0;
  return text.split(keyword).length - 1;
}

function formatNumber(value = 0) {
  return Math.round(value).toLocaleString('zh-CN');
}

function truncate(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
}

function formatTime(timestamp?: number) {
  if (!timestamp) return '未记录时间';
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function formatMessages(messages: Array<{ role: string; content: string }>) {
  return messages.map((message, index) => `#${index + 1} ${message.role}\n${message.content}`).join('\n\n---\n\n');
}

function copyStep(report: ReviewReport, stepId: string) {
  const textMap: Record<string, string> = {
    input: report.latestUserInput,
    context: `System Prompt\n${report.debugContext?.systemPrompt ?? ''}\n\nAPI Messages\n${formatMessages(report.debugContext?.messages ?? [])}`,
    raw: report.rawText,
    parsed: JSON.stringify(report.parsed ?? {}, null, 2),
    write: report.writePreview.map((item) => `${item.label}\n${item.value}`).join('\n\n---\n\n'),
    risks: report.risks.map((risk) => `[${risk.level}] ${risk.label}: ${risk.detail}`).join('\n'),
  };
  void navigator.clipboard?.writeText(textMap[stepId] ?? '');
}
