import { useState } from 'react';
import type { STRegexScript } from '@/models/stTypes';
import type { TavernRegexDryRunResult, TavernRegexScriptSafety } from '@/contracts/ai';
import {
  DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE,
  getPresetRegexFindText,
  getPresetRegexKindLabel,
  getPresetRegexReplaceText,
  getPresetRegexTitle,
} from '@/utils/tavernPresetParsing';
import { countRegexScripts } from '@/utils/tavernPresetPanel';
import { smallClip } from './settingsShared';

interface V2RegexPanelProps {
  scripts: STRegexScript[];
  safety: TavernRegexScriptSafety[];
  onDryRun: (script: STRegexScript, sampleText: string) => TavernRegexDryRunResult;
}

export function V2RegexPanel({ scripts, safety, onDryRun }: V2RegexPanelProps) {
  const [selectedRegexIndex, setSelectedRegexIndex] = useState(0);
  const [regexDryRunSample, setRegexDryRunSample] = useState(DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE);
  const counts = countRegexScripts(safety);
  const effectiveRegexIndex = scripts.length > 0 ? Math.min(selectedRegexIndex, scripts.length - 1) : 0;
  const selectedRegexScript = scripts.at(effectiveRegexIndex);
  const selectedRegexSafety = selectedRegexScript ? safety[effectiveRegexIndex] : null;
  const selectedRegexDryRun = selectedRegexScript ? onDryRun(selectedRegexScript, regexDryRunSample) : null;
  return (
    <div
      data-tavern-regex-panel="true"
      className="px-3 py-2"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bg-primary), 0.26), rgba(var(--tj-ui-nsfw), 0.045))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-serif text-sm tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-nsfw), 0.88)' }}>
            预设正则脚本
          </span>
          <span className="px-2 py-0.5 text-xs" style={{
            color: 'rgba(var(--tj-text-secondary), 0.66)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
            clipPath: smallClip,
          }}>
            仅审查 / 干跑
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
          <span>总数 {scripts.length}</span>
          <span>未禁用 {counts.enabledRegexScriptCount}</span>
          <span style={{ color: counts.riskyRegexScriptCount > 0 ? 'rgba(var(--tj-ui-nsfw), 0.86)' : 'rgba(var(--tj-text-secondary), 0.6)' }}>
            高风险 {counts.riskyRegexScriptCount}
          </span>
          <span style={{ color: counts.blockedRegexScriptCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.6)' }}>
            阻断 {counts.blockedRegexScriptCount}
          </span>
        </div>
      </div>
      {scripts.length === 0 ? (
        <div
          className="grid gap-2 px-3 py-4 text-sm leading-6"
          style={{
            background: 'rgba(var(--tj-bg-primary), 0.22)',
            color: 'rgba(var(--tj-text-secondary), 0.66)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
            clipPath: smallClip,
          }}
        >
          <div className="font-serif tracking-[0.1em]" style={{ color: 'rgba(var(--tj-text-primary), 0.76)' }}>
            当前预设没有附带 regex_scripts
          </div>
          <div>
            如果导入的 ST 预设包含正则脚本，这里会显示脚本列表、风险类型、协议标签检查和干跑预览。主剧情只会执行安全输出清理类正则。
          </div>
        </div>
      ) : (
      <div
        className="grid min-h-[360px] gap-3 overflow-hidden lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]"
      >
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
              regex_scripts 会被保留并分析风险；安全输出清理类会在主剧情后处理执行，高风险脚本仍不会改写正文输出。
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {scripts.map((script, index) => {
                const currentSafety = safety[index];
                const active = effectiveRegexIndex === index;
                const title = getPresetRegexTitle(script, index);
                const findPreview = getPresetRegexFindText(script).replace(/\s+/g, ' ').trim();
                return (
                  <button
                    key={`${title}_${index}`}
                    type="button"
                    onClick={() => setSelectedRegexIndex(index)}
                    className="grid gap-2 px-3 py-2 text-left text-xs transition-all"
                    style={{
                      background: active ? 'rgba(var(--tj-ui-nsfw), 0.1)' : 'rgba(var(--tj-bg-primary), 0.18)',
                      color: currentSafety.disabled ? 'rgba(var(--tj-text-secondary), 0.45)' : 'rgba(var(--tj-text-primary), 0.78)',
                      boxShadow: `inset 0 0 0 1px ${active ? 'rgba(var(--tj-ui-nsfw), 0.28)' : 'rgba(var(--tj-accent-primary), 0.1)'}`,
                      clipPath: smallClip,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate font-serif text-sm tracking-[0.06em]" title={title}>
                        {title}
                      </span>
                      <span style={{ color: currentSafety.disabled ? 'rgba(var(--tj-text-secondary), 0.52)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
                        {currentSafety.disabled ? '禁用' : '未禁用'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-1.5 py-0.5" style={{
                        color: currentSafety.kind === 'blocked' ? 'rgba(var(--tj-danger), 0.92)' : currentSafety.risky ? 'rgba(var(--tj-ui-nsfw), 0.9)' : 'rgba(var(--tj-accent-primary), 0.82)',
                        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.16)',
                        clipPath: smallClip,
                      }}>
                        {getPresetRegexKindLabel(currentSafety.kind)}
                      </span>
                      {currentSafety.blocksProtocolTags && (
                        <span className="px-1.5 py-0.5" style={{
                          color: 'rgba(var(--tj-danger), 0.9)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.22)',
                          clipPath: smallClip,
                        }}>
                          协议标签风险
                        </span>
                      )}
                    </div>
                    <div className="truncate font-mono" title={findPreview || 'find_regex 为空'} style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                      {findPreview || 'find_regex 为空'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            {selectedRegexScript && selectedRegexSafety && selectedRegexDryRun ? (
              <>
                <div className="grid gap-2 md:grid-cols-4">
                  {[
                    ['类型', getPresetRegexKindLabel(selectedRegexSafety.kind)],
                    ['状态', selectedRegexSafety.disabled ? '禁用' : '未禁用'],
                    ['风险', selectedRegexSafety.risky ? '高' : '低'],
                    ['命中', `${selectedRegexDryRun.matches}`],
                  ].map(([label, value]) => (
                    <div key={label} className="px-2 py-1.5 text-xs" style={{
                      background: 'rgba(var(--tj-bg-primary), 0.26)',
                      color: 'rgba(var(--tj-text-primary), 0.74)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                      clipPath: smallClip,
                    }}>
                      <div style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>{label}</div>
                      <div className="mt-1 truncate">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="grid min-h-0 flex-1 gap-2 overflow-hidden xl:grid-cols-2">
                  <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                    <div className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>脚本内容</div>
                    <div className="grid gap-2 overflow-y-auto pr-1">
                      <div>
                        <div className="mb-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.54)' }}>find_regex</div>
                        <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                          background: 'rgba(var(--tj-bg-primary), 0.36)',
                          color: 'rgba(var(--tj-text-primary), 0.76)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                          clipPath: smallClip,
                        }}>{getPresetRegexFindText(selectedRegexScript) || '空'}</pre>
                      </div>
                      <div>
                        <div className="mb-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.54)' }}>replace_string</div>
                        <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                          background: 'rgba(var(--tj-bg-primary), 0.36)',
                          color: 'rgba(var(--tj-text-primary), 0.76)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                          clipPath: smallClip,
                        }}>{getPresetRegexReplaceText(selectedRegexScript) || '空'}</pre>
                      </div>
                      <div className="text-xs leading-5" style={{ color: selectedRegexSafety.risky ? 'rgba(var(--tj-ui-nsfw), 0.82)' : 'rgba(var(--tj-text-secondary), 0.64)' }}>
                        {selectedRegexSafety.reason}
                      </div>
                      {selectedRegexDryRun.warnings.length > 0 && (
                        <div className="grid gap-1 text-xs leading-5" style={{ color: 'rgba(var(--tj-danger), 0.84)' }}>
                          {selectedRegexDryRun.warnings.map((warning) => (
                            <div key={warning}>- {warning}</div>
                          ))}
                        </div>
                      )}
                      {selectedRegexDryRun.error && (
                        <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-danger), 0.84)' }}>
                          正则错误：{selectedRegexDryRun.error}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>干跑预览</span>
                      <button
                        type="button"
                        onClick={() => setRegexDryRunSample(DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE)}
                        className="px-2 py-1 text-xs"
                        style={{
                          color: 'rgba(var(--tj-text-secondary), 0.65)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                          clipPath: smallClip,
                        }}
                      >
                        重置样例
                      </button>
                    </div>
                    <textarea
                      value={regexDryRunSample}
                      onChange={(e) => setRegexDryRunSample(e.target.value)}
                      className="min-h-[120px] resize-y px-3 py-2 font-mono text-xs leading-5"
                      style={{
                        background: 'rgba(var(--tj-bg-primary), 0.38)',
                        color: 'rgba(var(--tj-text-primary), 0.76)',
                        border: '1px solid rgba(var(--tj-accent-primary), 0.12)',
                        borderRadius: '2px',
                        outline: 'none',
                      }}
                    />
                    <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                      background: selectedRegexDryRun.ok ? 'rgba(var(--tj-accent-primary), 0.055)' : 'rgba(var(--tj-ui-nsfw), 0.06)',
                      color: 'rgba(var(--tj-text-primary), 0.78)',
                      boxShadow: `inset 0 0 0 1px ${selectedRegexDryRun.ok ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-ui-nsfw), 0.18)'}`,
                      clipPath: smallClip,
                    }}>
                      {selectedRegexDryRun.after}
                    </pre>
                  </div>
                </div>
                <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.56)' }}>
              当前仅展示替换结果和风险判断，不会写入预设；真实运行只放开安全输出清理类正则。
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>
                从左侧选择一个正则脚本查看详情。
              </div>
            )}
          </div>
      </div>
      )}
    </div>
  );
}
