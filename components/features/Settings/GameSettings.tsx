import { useState } from 'react';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块 } from '@/models/prompts';
import type { 世界状态 } from '@/models/world';
import type { 剧情模式 } from '@/models/journey';
import { storyModes } from '@/data/journeyPresets';
import { saveSetting } from '@/services/dbService';
import { PERSPECTIVE_MODULE_IDS } from '@/utils/narrativeRuntimePolicy';

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  worldState: 世界状态;
  onWorldStateChange: (s: 世界状态) => void;
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

// 把 builtin module 的 enabled 同步成 v。若数组里还没有这条 builtin（异常存档），直接跳过。
function setModuleEnabled(modules: 提示词模块[], id: string, v: boolean): 提示词模块[] {
  return modules.map((m) => (m.id === id ? { ...m, enabled: v, updatedAt: Date.now() } : m));
}

// 三种内置文风互斥：选 activeId 启用，其余两条强制关闭；activeId=null 表示启用「文风-自定义」模块。
const WRITING_STYLE_IDS = [
  'builtin_writing_style',
  'builtin_writing_style_hsr',
  'builtin_writing_style_baimiao',
] as const;
type WritingStyleId = (typeof WRITING_STYLE_IDS)[number];
const CUSTOM_WRITING_STYLE_ID = 'builtin_writing_style_custom';

function setActiveWritingStyle(
  modules: 提示词模块[],
  activeId: WritingStyleId | null,
): 提示词模块[] {
  const now = Date.now();
  return modules.map((m) => {
    if (m.id === CUSTOM_WRITING_STYLE_ID) {
      const shouldBeOn = activeId === null;
      if (m.enabled === shouldBeOn) return m;
      return { ...m, enabled: shouldBeOn, updatedAt: now };
    }
    if (!(WRITING_STYLE_IDS as readonly string[]).includes(m.id)) return m;
    const shouldBeOn = m.id === activeId;
    if (m.enabled === shouldBeOn) return m;
    return { ...m, enabled: shouldBeOn, updatedAt: now };
  });
}

function getActiveWritingStyle(modules: 提示词模块[]): WritingStyleId | null {
  const hit = modules.find(
    (m) => (WRITING_STYLE_IDS as readonly string[]).includes(m.id) && m.enabled,
  );
  return (hit?.id as WritingStyleId | undefined) ?? null;
}

function setActivePerspective(
  modules: 提示词模块[],
  active: 'first' | 'second' | 'third',
): 提示词模块[] {
  const now = Date.now();
  const activeId = PERSPECTIVE_MODULE_IDS[active];
  const allIds = Object.values(PERSPECTIVE_MODULE_IDS) as string[];
  return modules.map((m) => {
    if (!allIds.includes(m.id)) return m;
    const shouldBeOn = m.id === activeId;
    if (m.enabled === shouldBeOn) return m;
    return { ...m, enabled: shouldBeOn, updatedAt: now };
  });
}

const WRITING_STYLE_OPTIONS: { id: WritingStyleId | 'none'; label: string; desc: string }[] = [
  { id: 'builtin_writing_style_hsr', label: '崩铁式', desc: '原作风 / 第三人称 / 角色口吻差异 / 星海宿命感' },
  { id: 'builtin_writing_style', label: '日记体', desc: '轻松随意 / 对白≥40% / 比喻可爱 / 动作代替「说」' },
  { id: 'builtin_writing_style_baimiao', label: '白描', desc: '汪曾祺式 / 动作+物件 / 不写情绪 / 短句留白' },
  { id: 'none', label: '自定义', desc: '启用提示词模块里的「文风-自定义」槽位' },
];

export function GameSettingsTab({ settings, onChange, worldState, onWorldStateChange }: Props) {
  const activeWritingStyle = getActiveWritingStyle(settings.promptModules);
  const [saveMessage, setSaveMessage] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSave = async () => {
    try {
      await Promise.all([
        saveSetting('gameSettings', settings),
        saveSetting('worldState', worldState),
      ]);
      setSaveMessage('游戏设定已保存。');
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
    } catch (err) {
      setSaveMessage(`保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Word count */}
      <Field label="◆ 最少字数">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={100}
            max={2000}
            step={50}
            value={settings.wordCountTarget}
            onChange={(e) => onChange({ ...settings, wordCountTarget: Number(e.target.value) })}
            className="flex-1 accent-[rgb(var(--tj-accent-primary))]"
          />
          <span
            className="min-w-14 text-right text-xs font-serif tracking-wider"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
          >
            {settings.wordCountTarget} 字
          </span>
        </div>
      </Field>

      {/* 默认文风（三选一 + 自定义槽） */}
      <Field label="◆ 默认文风">
        <div className="grid grid-cols-2 gap-2">
          {WRITING_STYLE_OPTIONS.map((opt) => {
            const active =
              opt.id === 'none'
                ? activeWritingStyle === null
                : activeWritingStyle === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() =>
                  onChange({
                    ...settings,
                    promptModules: setActiveWritingStyle(
                      settings.promptModules,
                      opt.id === 'none' ? null : opt.id,
                    ),
                  })
                }
                className="px-3 py-2 text-left transition-all hover:opacity-90"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.04))'
                    : 'rgba(var(--tj-bg-secondary), 0.45)',
                  boxShadow: active
                    ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                  clipPath: smallClip,
                }}
              >
                <div
                  className="font-serif text-sm tracking-wider"
                  style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgb(var(--tj-text-primary))' }}
                >
                  {opt.label}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>
        {activeWritingStyle === null && (
          <div className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            去「提示词模块」里的「文风-自定义」编辑你的文风槽位。
          </div>
        )}
      </Field>

      {/* Narrative person */}
      <Field label="◆ 叙述人称">
        <div className="flex gap-2">
          {(
            [
              { value: 'second' as const, label: '第二人称（你）' },
              { value: 'first' as const, label: '第一人称（我）' },
              { value: 'third' as const, label: '第三人称（他 / 她）' },
            ]
          ).map((opt) => {
            const active = settings.narrativePerson === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() =>
                  onChange({
                    ...settings,
                    narrativePerson: opt.value,
                    promptModules: setActivePerspective(settings.promptModules, opt.value),
                  })
                }
                className="flex-1 px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
                    : 'transparent',
                  color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.85)',
                  boxShadow: active
                    ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
                  clipPath: smallClip,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* 思维链输出语言（参考 Izumi，P2 可选） */}
      <Field label="◆ 思维链语言">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              { value: 'zh' as const, label: '中文' },
              { value: 'en' as const, label: 'English' },
              { value: 'ja' as const, label: '日本語' },
              { value: 'fr' as const, label: 'Français' },
              { value: 'ru' as const, label: 'Русский' },
              { value: 'de' as const, label: 'Deutsch' },
              { value: 'es' as const, label: 'Español' },
              { value: 'it' as const, label: 'Italiano' },
            ]
          ).map((opt) => {
            const active = (settings.cotLanguage ?? 'zh') === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onChange({ ...settings, cotLanguage: opt.value })}
                className="px-2 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-90"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
                    : 'transparent',
                  color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.85)',
                  boxShadow: active
                    ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
                  clipPath: smallClip,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-[color:rgba(var(--tj-text-secondary),0.6)]">
          仅影响主剧情思维链 &lt;think&gt; 思考段语言，正文仍按中文输出。默认中文。
        </p>
      </Field>

      {/* 剧情偏向 */}
      <Field label="◆ 剧情偏向（可中途切换）">
        <div className="grid grid-cols-2 gap-2">
          {storyModes.map((mode) => {
            const active = worldState.剧情模式 === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onWorldStateChange({ ...worldState, 剧情模式: mode.id as 剧情模式 })}
                className="px-3 py-2 text-left transition-all hover:opacity-90"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.04))'
                    : 'rgba(var(--tj-bg-secondary), 0.45)',
                  boxShadow: active
                    ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                  clipPath: smallClip,
                }}
              >
                <div
                  className="font-serif text-sm tracking-wider"
                  style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgb(var(--tj-text-primary))' }}
                >
                  {mode.name}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
                  {mode.description}
                </div>
              </button>
            );
          })}
        </div>
      </Field>

      {/* Toggles */}
      <ToggleRow
        label="Claude 专用模式"
        desc="用于 Claude 兼容中转的 Messages API。开启后，模型名像 Claude / Opus / Sonnet / Haiku 的 Claude 兼容请求会走 Claude 通道；Gemini、DeepSeek、OpenAI 兼容模型仍走各自通道。"
        checked={settings.enableClaudeMode}
        onChange={(v) => onChange({ ...settings, enableClaudeMode: v })}
      />
      <Field label="◆ DeepSeek 主剧情模式">
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'off' as const, label: '关闭', desc: '按普通 OpenAI 兼容续聊' },
            { value: 'standard' as const, label: '标准', desc: '直发并追加 DS 格式校验' },
            { value: 'lock_format' as const, label: '锁格式', desc: '尝试 prefix 锁定 <thinking>' },
          ]).map((opt) => {
            const active = (settings.deepSeekMainMode ?? 'off') === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...settings, deepSeekMainMode: opt.value })}
                className="px-3 py-2 text-left transition-all hover:opacity-90"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
                    : 'rgba(var(--tj-bg-secondary), 0.45)',
                  color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-primary), 0.9)',
                  boxShadow: active
                    ? '0 0 16px rgba(var(--tj-accent-primary), 0.18)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                  clipPath: smallClip,
                }}
              >
                <div className="text-xs font-serif font-bold tracking-wider">{opt.label}</div>
                <div className="mt-0.5 text-[10px] leading-snug opacity-75">{opt.desc}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
          仅当主 API 供应商或 Base URL 命中 DeepSeek 时生效；后台变量、智库、手机、剧情编织继续使用各自接口设置。
        </p>
      </Field>
      <ToggleRow
        label="缓存前缀诊断"
        desc="开启后，新回合的响应详情会显示请求与上一回合从哪里开始变化、公共前缀估算 tokens 和变化后较大的请求块。只用于排查缓存命中，默认关闭。"
        checked={settings.enableCacheDiagnostics ?? false}
        onChange={(v) => onChange({ ...settings, enableCacheDiagnostics: v })}
      />
      <ToggleRow
        label="叙述者人格"
        desc="AI 以特定角色身份回应，而非中立旁白（同步「提示词模块·叙述者人格」开关）"
        checked={settings.enableTavernKeeperPersona}
        onChange={(v) =>
          onChange({
            ...settings,
            enableTavernKeeperPersona: v,
            promptModules: setModuleEnabled(settings.promptModules, 'builtin_narrator_persona', v),
          })
        }
      />
      <ToggleRow
        label="心声输出"
        desc="开启后正文允许出现【心声】；关闭后正文只保留旁白与角色台词，不再要求输出心声段。"
        checked={settings.enableInnerVoice}
        onChange={(v) => onChange({ ...settings, enableInnerVoice: v })}
      />
      <ToggleRow
        label="行动选项功能"
        desc="开启后注入「行动选项规范」，要求 AI 输出 <行动选项> 标签；UI 中以可点选按钮显示。"
        checked={settings.enableActionOptions}
        onChange={(v) =>
          onChange({
            ...settings,
            enableActionOptions: v,
            promptModules: setModuleEnabled(settings.promptModules, 'builtin_action_options', v),
          })
        }
      />
      <ToggleRow
        label="防止抢话 / 角色边界"
        desc="禁止 AI 代写玩家言行、心理、神态；强制按双引号识别玩家原句；禁止正文内出现选项菜单。"
        checked={settings.enableNoControl}
        onChange={(v) =>
          onChange({
            ...settings,
            enableNoControl: v,
            enablePlayerSpeechExpansion: v ? false : settings.enablePlayerSpeechExpansion,
            promptModules: setModuleEnabled(
              setModuleEnabled(settings.promptModules, 'builtin_no_control', v),
              'builtin_player_speech_expansion',
              v ? false : settings.enablePlayerSpeechExpansion,
            ),
          })
        }
      />
      <ToggleRow
        label="抢话 / 适度代写玩家对白"
        desc="允许 AI 自由编排玩家输入的承接，必要时少量扩写对白或轻动作；不要求玩家话固定开场，也不允许代替玩家做关键决定、长篇独白或深层心理。"
        checked={settings.enablePlayerSpeechExpansion === true}
        onChange={(v) =>
          onChange({
            ...settings,
            enablePlayerSpeechExpansion: v,
            enableNoControl: v ? false : settings.enableNoControl,
            promptModules: setModuleEnabled(
              setModuleEnabled(settings.promptModules, 'builtin_player_speech_expansion', v),
              'builtin_no_control',
              v ? false : settings.enableNoControl,
            ),
          })
        }
      />
      <ToggleRow
        label="CoT 伪装历史消息注入"
        desc="开启后在「user:开始任务」之后注入一条伪装 assistant 历史消息，用于强化思考段输出习惯。"
        checked={settings.enableCotFakeHistory}
        onChange={(v) => onChange({ ...settings, enableCotFakeHistory: v })}
      />
      <ToggleRow
        label="标签修复"
        desc="开启后系统在解析前自动修复常见标签错误（重复开标签、缺失闭标签等）。"
        checked={settings.enableTagRepair}
        onChange={(v) => onChange({ ...settings, enableTagRepair: v })}
      />
      <ToggleRow
        label="生成失败自动重试"
        desc="API 报错或解析失败时直接自动重试；中间不进入错误确认弹窗。"
        checked={settings.autoRetryOnError}
        onChange={(v) => onChange({ ...settings, autoRetryOnError: v })}
      />
      {settings.autoRetryOnError && (
        <Field label="◆ 自动重试次数上限">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={settings.autoRetryCount}
              onChange={(e) => onChange({ ...settings, autoRetryCount: Number(e.target.value) })}
              className="flex-1 accent-[rgb(var(--tj-accent-primary))]"
            />
            <span
              className="min-w-14 text-right text-xs font-serif tracking-wider"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
            >
              {settings.autoRetryCount} 次
            </span>
          </div>
        </Field>
      )}
      <ToggleRow
        label="每回合结束自动存档"
        desc="默认开启。正文落地与后台队列收尾时都会写入最近自动存档，减少刷新后丢失进度。"
        checked={settings.enableAutoSaveEveryTurn}
        onChange={(v) => onChange({ ...settings, enableAutoSaveEveryTurn: v })}
      />
      <Field label="◆ 后台任务模式">
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: 'sequential' as const, label: '稳序', desc: '变量落库后按顺序处理后台任务，接口压力最低' },
            { value: 'parallel' as const, label: '并行', desc: '变量落库后同时启动新闻、忆庭入库、手机种子和正文插图' },
          ]).map((opt) => {
            const active = (settings.backgroundTaskMode ?? 'sequential') === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...settings, backgroundTaskMode: opt.value })}
                className="px-3 py-2 text-left transition-all hover:opacity-90"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
                    : 'rgba(var(--tj-bg-secondary), 0.45)',
                  color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-primary), 0.9)',
                  boxShadow: active
                    ? '0 0 16px rgba(var(--tj-accent-primary), 0.18)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                  clipPath: smallClip,
                }}
              >
                <div className="text-xs font-serif font-bold tracking-wider">{opt.label}</div>
                <div className="mt-0.5 text-[10px] leading-snug opacity-75">{opt.desc}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
          主剧情前的忆庭召回与智库召回始终会先完成；并行模式只影响主剧情和变量落库之后的后台收尾任务。
        </p>
      </Field>
      <ToggleRow
        label="记忆注入"
        desc="将之前的记忆注入 system prompt"
        checked={settings.enableMemoryInjection}
        onChange={(v) => onChange({ ...settings, enableMemoryInjection: v })}
      />
      <ToggleRow
        label="世界事件追踪"
        desc="记录世界事件变化"
        checked={settings.enableWorldEvents}
        onChange={(v) => onChange({ ...settings, enableWorldEvents: v })}
      />
      <ToggleRow
        label="开发者模式"
        desc="向 AI 注入开发者身份提示，AI 会把你的消息当作测试指令并尽量配合（同步「提示词模块·开发者模式」开关）"
        checked={settings.devMode}
        onChange={(v) =>
          onChange({
            ...settings,
            devMode: v,
            promptModules: setModuleEnabled(settings.promptModules, 'builtin_dev_mode', v),
          })
        }
      />

      {/* Custom prompt 已迁移到「提示词模块」tab，此处不再提供 */}
      <div className="sticky bottom-0 z-10 pt-3" style={{ background: 'linear-gradient(180deg, rgba(var(--tj-bg-primary),0), rgba(var(--tj-bg-primary),0.98) 30%)' }}>
        {saveMessage && (
          <div className="mb-2 text-right text-xs" style={{ color: saveMessage.startsWith('保存失败') ? 'rgba(255,180,180,0.92)' : 'rgba(165,230,170,0.92)' }}>
            {saveMessage}
          </div>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="relative w-full overflow-hidden py-3 font-serif text-sm font-bold tracking-[0.32em] transition-all hover:opacity-95"
          style={{
            color: 'rgb(var(--tj-on-accent))',
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(165, 230, 170, 0.96), rgba(105, 190, 130, 0.92))'
              : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.96), rgba(var(--tj-btn-primary-end), 0.84))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.72), 0 0 18px rgba(var(--tj-tech-cyan),0.14)',
            clipPath: smallClip,
          }}
        >
          {savedFlash ? '✓ 已 保 存' : '◆ 保存游戏设定'}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-serif tracking-[0.2em]"
        style={{ color: 'rgba(var(--tj-tech-cyan), 0.82)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.42)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.14)',
        clipPath:
          'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
      }}
    >
      <div className="min-w-0 mr-3">
        <div
          className="font-serif font-bold text-sm tracking-wider"
          style={{ color: 'rgb(var(--tj-text-primary))' }}
        >
          {label}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
          {desc}
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className="relative h-6 w-11 flex-shrink-0 transition-all"
        style={{
          background: checked
          ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
            : 'rgba(var(--tj-bg-secondary), 0.68)',
          boxShadow: checked
            ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath:
            'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        }}
      >
        <div
          className="absolute top-0.5 h-5 w-5 transition-transform"
          style={{
            left: checked ? 'calc(100% - 1.375rem)' : '0.125rem',
            background: checked ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
            clipPath:
              'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
          }}
        />
      </button>
    </div>
  );
}
