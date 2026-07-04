import { useEffect, useMemo, useState } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 命途ID } from '@/models/journey';
import type { 命途进度, 命途阶段 } from '@/models/path';
import type { API设置 } from '@/models/settings';
import { PATH_STAGE_DEFS } from '@/models/path';
import { getPath } from '@/data/journeyPresets';
import { generateSkillDraft } from '@/services/ai/skillGenerator';
import {
  NORMAL_SKILL_SLOT_COUNT,
  创建战技记录,
  生成战技槽位摘要,
  计算命途战技槽位数,
  归一化战技记录,
  type 战技记录,
  type 战技槽位摘要,
} from '@/models/skill';

interface SkillPanelProps {
  traveler: 角色数据结构;
  onTravelerChange: React.Dispatch<React.SetStateAction<角色数据结构>>;
  apiSettings: API设置;
}

type SlotKey = `normal:${number}` | `path:${命途ID}:${number}`;

interface SkillDraft {
  名称: string;
  描述: string;
  来源: string;
  关键词: string;
  消耗: string;
  冷却: string;
  备注: string;
}

const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

const emptyDraft: SkillDraft = {
  名称: '',
  描述: '',
  来源: '',
  关键词: '',
  消耗: '',
  冷却: '',
  备注: '',
};

export function SkillPanel({ traveler, onTravelerChange, apiSettings }: SkillPanelProps) {
  const pathRecords = traveler.命途列表 ?? [];
  const skillRecords = useMemo(
    () => (traveler.战技列表 ?? []).map(归一化战技记录).filter(isVisibleSkillRecord),
    [traveler.战技列表],
  );
  const slotSummary = useMemo(
    () => 生成战技槽位摘要(pathRecords, skillRecords),
    [pathRecords, skillRecords],
  );
  const normalSlots = slotSummary.filter((slot) => slot.kind === 'normal');
  const pathSlots = slotSummary.filter((slot) => slot.kind === 'path');

  const defaultPath = pathRecords.find((p) => p.是否主命途) ?? pathRecords[0] ?? null;
  const [selectedPathId, setSelectedPathId] = useState<命途ID | ''>(defaultPath?.id ?? '');
  const [selectedSlotKey, setSelectedSlotKey] = useState<SlotKey>('normal:1');
  const [draft, setDraft] = useState<SkillDraft>(emptyDraft);
  const [generationHint, setGenerationHint] = useState('');
  const [generatingSkill, setGeneratingSkill] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);

  const selectedPath = pathRecords.find((path) => path.id === selectedPathId) ?? defaultPath ?? null;
  const selectedSlot = resolveSlot(slotSummary, selectedSlotKey);
  const selectedSkill = selectedSlot?.occupiedSkillId
    ? skillRecords.find((skill) => skill.id === selectedSlot.occupiedSkillId)
    : undefined;

  useEffect(() => {
    if (!selectedPathId && defaultPath) setSelectedPathId(defaultPath.id);
  }, [defaultPath, selectedPathId]);

  useEffect(() => {
    setDraft(selectedSkill ? draftFromSkill(selectedSkill) : emptyDraft);
  }, [selectedSkill?.id, selectedSlotKey]);

  const filledNormal = normalSlots.filter((slot) => slot.occupiedSkillId).length;
  const filledPath = pathSlots.filter((slot) => slot.occupiedSkillId).length;
  const enabledSkills = skillRecords.filter((skill) => skill.已启用 !== false).length;
  const normalSkillRecords = skillRecords
    .filter((skill) => skill.槽位类型 === 'normal' && skill.槽位序号 <= NORMAL_SKILL_SLOT_COUNT)
    .sort((a, b) => sortSkill(a, b));
  const pathSkillRecords = skillRecords
    .filter((skill) => skill.槽位类型 === 'path')
    .sort((a, b) => sortSkill(a, b));
  const activeApiConfig = useMemo(() => {
    if (apiSettings.activeConfigId) {
      return apiSettings.configs.find((item) => item.id === apiSettings.activeConfigId) ?? apiSettings.configs[0] ?? null;
    }
    return apiSettings.configs[0] ?? null;
  }, [apiSettings.activeConfigId, apiSettings.configs]);

  const saveSkill = () => {
    if (!selectedSlot) return;
    const name = draft.名称.trim();
    const description = draft.描述.trim();
    if (!name || !description) {
      window.alert('请先填写战技名称和描述。');
      return;
    }

    const nextSkill = selectedSkill
      ? {
          ...selectedSkill,
          名称: name,
          描述: description,
          来源: draft.来源.trim() || selectedSkill.来源,
          关键词: splitKeywords(draft.关键词),
          消耗: draft.消耗.trim(),
          冷却: draft.冷却.trim(),
          备注: draft.备注.trim(),
          更新时间: Date.now(),
        }
      : 创建战技记录({
          名称: name,
          类别: selectedSlot.kind === 'normal' ? '普通' : '命途',
          槽位类型: selectedSlot.kind,
          槽位序号: selectedSlot.slotIndex,
          描述: description,
          来源: draft.来源.trim() || (selectedSlot.kind === 'normal' ? '普通战技自制' : '命途战技自定义'),
          关联命途: selectedSlot.pathId,
          关联阶段: selectedSlot.pathStage,
          关键词: splitKeywords(draft.关键词),
          消耗: draft.消耗,
          冷却: draft.冷却,
          备注: draft.备注,
        });

    upsertSkill(nextSkill);
  };

  const generateDraftWithAI = async () => {
    if (!selectedSlot) return;
    if (!activeApiConfig) {
      setGenerationMessage({ kind: 'error', text: '请先在设置中配置主剧情 API，再生成战技草稿。' });
      return;
    }
    setGeneratingSkill(true);
    setGenerationMessage({ kind: 'info', text: '正在根据当前槽位生成小说化战技草稿……' });
    try {
      const generated = await generateSkillDraft(activeApiConfig, {
        traveler,
        slotKind: selectedSlot.kind,
        slotIndex: selectedSlot.slotIndex,
        pathId: selectedSlot.pathId,
        pathStage: selectedSlot.pathStage,
        existingSkillNames: skillRecords.map((skill) => skill.名称),
        userHint: generationHint,
        currentDraft: {
          名称: draft.名称,
          描述: draft.描述,
          来源: draft.来源,
          关键词: splitKeywords(draft.关键词),
          消耗: draft.消耗,
          冷却: draft.冷却,
          备注: draft.备注,
        },
      });
      setDraft({
        名称: generated.名称,
        描述: generated.描述,
        来源: generated.来源 || (selectedSlot.kind === 'normal' ? 'AI 普通战技草稿' : 'AI 命途战技草稿'),
        关键词: generated.关键词.join('、'),
        消耗: generated.消耗,
        冷却: generated.冷却,
        备注: generated.备注,
      });
      setGenerationMessage({ kind: 'info', text: '已生成草稿。你可以继续修改，确认后再写入槽位。' });
    } catch (error) {
      setGenerationMessage({ kind: 'error', text: `生成失败：${error instanceof Error ? error.message : '未知错误'}` });
    } finally {
      setGeneratingSkill(false);
    }
  };

  const upsertSkill = (nextSkill: 战技记录) => {
    onTravelerChange((prev) => {
      const oldSkills = prev.战技列表 ?? [];
      const withoutSameSlot = oldSkills.filter(
        (skill) => skill.id !== nextSkill.id && !sameSlot(skill, nextSkill),
      );
      return {
        ...prev,
        战技列表: [...withoutSameSlot, nextSkill],
      };
    });
  };

  const deleteSkill = (skillId: string) => {
    if (!window.confirm('确认移除此战技？槽位会恢复为空。')) return;
    onTravelerChange((prev) => ({
      ...prev,
      战技列表: (prev.战技列表 ?? []).filter((skill) => skill.id !== skillId),
    }));
  };

  const toggleSkill = (skillId: string) => {
    onTravelerChange((prev) => ({
      ...prev,
      战技列表: (prev.战技列表 ?? []).map((skill) =>
        skill.id === skillId ? { ...skill, 已启用: skill.已启用 === false, 更新时间: Date.now() } : skill,
      ),
    }));
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overflow-x-hidden md:flex-row md:gap-4 md:overflow-hidden">
      <aside className="flex min-w-0 shrink-0 flex-col gap-3 md:min-h-0 md:w-[270px]">
        <section className="hidden px-4 py-4 md:block" style={panelStyle()}>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2" style={{ background: 'rgb(var(--tj-tech-cyan))', boxShadow: '0 0 12px rgba(var(--tj-tech-cyan), 0.8)' }} />
            <span className="font-serif text-[12px] tracking-[0.3em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.86)' }}>
              COMBAT ARTS
            </span>
          </div>
          <div
            className="mt-2 font-serif text-[22px] font-bold tracking-[0.22em]"
            style={{
              background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 52%, rgb(var(--tj-tech-cyan)) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            战技工坊
          </div>
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
            普通战技保留 1 个自制槽位；命途战技由玩家按已解锁槽位自行构建，供主剧情描写战斗方式、招式名与命途风格。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Metric label="普通" value={`${filledNormal}/${NORMAL_SKILL_SLOT_COUNT}`} />
            <Metric label="命途" value={`${filledPath}/${pathSlots.length}`} />
            <Metric label="启用" value={`${enabledSkills}`} />
            <Metric label="命途数" value={`${pathRecords.length}`} />
          </div>
        </section>

        <section className="min-w-0 overflow-hidden md:min-h-0 md:flex-1" style={panelStyle('rgba(var(--tj-bg-primary),0.76)')}>
          <div className="hidden px-4 py-3 md:block" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary),0.14)' }}>
            <SectionTitle title="槽位" />
          </div>
          <div className="kaituo-options-scroll max-h-full min-w-0 space-y-3 overflow-visible px-3 py-3 md:block md:space-y-3 md:overflow-y-auto md:overflow-x-hidden md:pr-2 md:pb-10">
            <SlotGroup
              title="普通战技"
              slots={normalSlots}
              selectedSlotKey={selectedSlotKey}
              onSelect={(slot) => setSelectedSlotKey(`normal:${slot.slotIndex}`)}
            />

            <div className="min-w-0 md:min-w-0">
              <div className="mb-1.5 flex items-center justify-between gap-2 md:mb-2">
                <span className="font-serif text-[11px] tracking-[0.12em] md:text-[12px] md:tracking-[0.22em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.82)' }}>
                  命途战技
                </span>
                {selectedPath && (
                  <span className="max-w-[52vw] truncate text-[10px] md:max-w-none md:text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.75)' }}>
                    {getPath(selectedPath.id)?.name ?? selectedPath.id} · {计算命途战技槽位数(selectedPath.阶段)} 槽
                  </span>
                )}
              </div>
              {pathRecords.length > 0 ? (
                <>
                  <div className="mb-2 flex gap-1.5 overflow-x-auto overflow-y-hidden pb-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
                    {pathRecords.map((path) => {
                      const def = getPath(path.id);
                      const stage = PATH_STAGE_DEFS.find((item) => item.stage === path.阶段);
                      const active = selectedPath?.id === path.id;
                      return (
                        <button
                          key={path.id}
                          type="button"
                          className="w-[92px] shrink-0 truncate px-2 py-1.5 text-left text-[11px] md:w-auto md:text-[12px]"
                          onClick={() => {
                            setSelectedPathId(path.id);
                            setSelectedSlotKey(`path:${path.id}:1`);
                          }}
                          style={{
                            color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary),0.78)',
                            background: active ? 'rgba(var(--tj-accent-primary),0.12)' : 'rgba(var(--tj-tech-cyan), 0.045)',
                            boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.42)' : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.16)',
                            clipPath: smallClip,
                          }}
                        >
                          <span className="block truncate">{def?.name ?? path.id}</span>
                          <span className="mt-0.5 block truncate text-[9px] md:text-[10px]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.72)' }}>
                            {stage?.name ?? '未知'} · {计算命途战技槽位数(path.阶段)} 槽
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="pb-1 md:pb-6">
                    <SlotGroup
                      title=""
                      slots={selectedPath ? pathSlots.filter((slot) => slot.pathId === selectedPath.id) : []}
                      selectedSlotKey={selectedSlotKey}
                      onSelect={(slot) => setSelectedSlotKey(`path:${slot.pathId as 命途ID}:${slot.slotIndex}`)}
                    />
                  </div>
                </>
              ) : (
                <EmptyNotice text="尚未踏上任何命途。当前只能配置 1 个普通自制战技。" />
              )}
            </div>
          </div>
        </section>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-visible md:overflow-hidden">
        <section className="px-3 py-3 md:px-4 md:py-4" style={panelStyle('linear-gradient(135deg, rgba(var(--tj-bubble),0.88), rgba(var(--tj-surface-strong),0.66))')}>
          <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4">
            <div className="min-w-0">
              <SectionTitle title={selectedSlot ? slotTitle(selectedSlot) : '选择槽位'} />
              {selectedSlot && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <ModePill active={selectedSlot.kind === 'normal'} label="普通自制" />
                  <ModePill active={selectedSlot.kind === 'path'} label="命途自创" />
                  {selectedSlot.kind === 'path' && selectedPath && (
                    <ModePill active label={`${PATH_STAGE_DEFS.find((item) => item.stage === selectedPath.阶段)?.name ?? '未知'} · ${计算命途战技槽位数(selectedPath.阶段)} 槽`} tone="cyan" />
                  )}
                </div>
              )}
              <div className="mt-1.5 text-[11px] leading-relaxed md:mt-2 md:text-[13px]" style={{ color: 'rgba(var(--tj-text-secondary),0.84)' }}>
                {selectedSlot
                  ? selectedSlot.kind === 'normal'
                    ? '普通战技现在只有 1 个自制槽位，可以自由编辑名称、描述与表现方式。'
                    : '命途战技按每条命途独立解锁，玩家可以自由编辑名称、描述与表现方式。'
                  : '先在左侧选择一个槽位。'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedSkill && (
                <>
                  <button className="panel-btn" onClick={() => toggleSkill(selectedSkill.id)}>
                    {selectedSkill.已启用 === false ? '启用' : '停用'}
                  </button>
                  <button className="panel-btn danger" onClick={() => deleteSkill(selectedSkill.id)}>移除</button>
                </>
              )}
              <button className="panel-btn" disabled={!selectedSlot || generatingSkill} onClick={generateDraftWithAI}>
                {generatingSkill ? '生成中…' : 'AI 生成'}
              </button>
              <button className="panel-btn strong" disabled={!selectedSlot || generatingSkill} onClick={saveSkill}>
                {selectedSkill ? '保存战技' : '写入槽位'}
              </button>
            </div>
          </div>
          {generationMessage && (
            <div
              className="mt-3 px-3 py-2 text-[12px] leading-relaxed"
              style={{
                color: generationMessage.kind === 'error' ? 'rgba(255, 135, 135, 0.95)' : 'rgba(var(--tj-text-secondary),0.88)',
                background: generationMessage.kind === 'error' ? 'rgba(160, 40, 40, 0.12)' : 'rgba(var(--tj-tech-cyan), 0.055)',
                boxShadow: generationMessage.kind === 'error' ? 'inset 0 0 0 1px rgba(255, 135, 135, 0.24)' : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.18)',
                clipPath: smallClip,
              }}
            >
              {generationMessage.text}
            </div>
          )}
        </section>

        <div className="grid min-h-0 flex-1 gap-3 overflow-visible md:overflow-hidden xl:grid-cols-[1fr_0.95fr]">
          <section className="kaituo-options-scroll min-h-[340px] max-h-[440px] overflow-y-auto overscroll-contain px-3 py-3 md:min-h-0 md:max-h-none md:overflow-y-auto md:px-4 md:py-4 md:pr-2" style={panelStyle('rgba(var(--tj-bg-secondary),0.55)')}>
            {selectedSlot ? (
              <>
                <SectionTitle title={selectedSlot.kind === 'normal' ? '创造普通战技' : '创造命途战技'} />
                <ModeNotice
                  title={selectedSlot.kind === 'normal' ? '普通自制' : '命途自创'}
                  text={selectedSlot.kind === 'normal'
                    ? '普通战技可以自由命名与描述。建议写清出手方式、限制、风格和适合场景，正文会把它当作旅人的通用战斗能力。'
                    : '命途战技可以自由命名与描述。建议把命途特质、出手方式、限制与代价写清楚，正文会优先引用这些信息。'}
                  tone={selectedSlot.kind === 'normal' ? 'gold' : 'cyan'}
                />
                <Field label="生成提示词">
                  <textarea
                    value={generationHint}
                    onChange={(e) => setGenerationHint(e.target.value)}
                    rows={3}
                    placeholder="可写灵感方向，例如：想要更像三月七会吐槽的技能名、带一点记忆命途的凝滞感、武器是长刀、不要太中二。这里只影响 AI 生成，不会保存进战技。"
                    className="kaituo-input w-full px-2.5 py-1.5 text-[12px] leading-relaxed md:px-3 md:py-2 md:text-sm"
                    style={{ clipPath: smallClip }}
                  />
                </Field>
                <SkillEditor draft={draft} onChange={setDraft} selectedSlot={selectedSlot} selectedPath={selectedPath} />
              </>
            ) : (
              <EmptyNotice text="先选择普通槽位或命途槽位创建战技。" />
            )}
          </section>

          <section className="kaituo-options-scroll min-h-0 overflow-visible px-3 py-3 md:overflow-y-auto md:px-4 md:py-4 md:pr-2" style={panelStyle('rgba(var(--tj-accent-primary),0.035)')}>
            <SectionTitle title="已登记战技" />
            <div className="mt-3 space-y-3">
              {normalSkillRecords.length || pathSkillRecords.length ? (
                <>
                  <SkillRecordGroup title="普通自制" count={normalSkillRecords.length}>
                    {normalSkillRecords.map((skill) => (
                      <SkillRecordCard
                        key={skill.id}
                        skill={skill}
                        pathRecords={pathRecords}
                        selected={selectedSkill?.id === skill.id}
                        onSelect={() => {
                          setSelectedSlotKey(`normal:${skill.槽位序号}`);
                        }}
                      />
                    ))}
                  </SkillRecordGroup>
                  <SkillRecordGroup title="命途自创" count={pathSkillRecords.length} tone="cyan">
                    {pathSkillRecords.map((skill) => (
                    <SkillRecordCard
                      key={skill.id}
                      skill={skill}
                      pathRecords={pathRecords}
                      selected={selectedSkill?.id === skill.id}
                      onSelect={() => {
                        setSelectedSlotKey(skill.槽位类型 === 'normal'
                          ? `normal:${skill.槽位序号}`
                          : `path:${skill.关联命途 ?? 'none'}:${skill.槽位序号}`);
                      }}
                    />
                    ))}
                  </SkillRecordGroup>
                </>
              ) : (
                <EmptyNotice text="当前还没有登记战技。先选择普通槽位，或在解锁命途槽位后创造命途战技。" />
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function SkillEditor({
  draft,
  onChange,
  selectedSlot,
  selectedPath,
}: {
  draft: SkillDraft;
  onChange: (next: SkillDraft) => void;
  selectedSlot?: 战技槽位摘要;
  selectedPath?: 命途进度 | null;
}) {
  const pathDef = selectedPath ? getPath(selectedPath.id) : undefined;
  const stage = selectedPath ? PATH_STAGE_DEFS.find((item) => item.stage === selectedPath.阶段) : undefined;
  return (
    <div className="mt-3 space-y-3">
      {selectedSlot?.kind === 'path' && (
        <div className="grid grid-cols-2 gap-2">
          <InfoTile label="关联命途" value={pathDef?.name ?? selectedSlot.pathId ?? '未选择'} />
          <InfoTile label="阶段" value={stage?.name ?? '未知'} />
        </div>
      )}
      <Field label="名称">
        <input
          value={draft.名称}
          onChange={(e) => onChange({ ...draft, 名称: e.target.value })}
          placeholder={selectedSlot?.kind === 'path' ? '例如：逐星断弦' : '例如：折光步'}
          className="kaituo-input w-full px-2.5 py-1.5 text-[12px] md:px-3 md:py-2 md:text-sm"
          style={{ clipPath: smallClip }}
        />
      </Field>
      <Field label="描述">
        <textarea
          value={draft.描述}
          onChange={(e) => onChange({ ...draft, 描述: e.target.value })}
          rows={5}
          placeholder="写清楚这招如何出手、适合什么场景、会在正文中呈现出怎样的战斗风格。"
          className="kaituo-input w-full px-2.5 py-1.5 text-[12px] leading-relaxed md:px-3 md:py-2 md:text-sm"
          style={{ clipPath: smallClip }}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="来源">
          <input
            value={draft.来源}
            onChange={(e) => onChange({ ...draft, 来源: e.target.value })}
            placeholder="普通自制 / 巡猎自创 / 光锥启发"
            className="kaituo-input w-full px-2.5 py-1.5 text-[12px] md:px-3 md:py-2 md:text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>
        <Field label="关键词">
          <input
            value={draft.关键词}
            onChange={(e) => onChange({ ...draft, 关键词: e.target.value })}
            placeholder="突进、牵制、制造破绽、短暂脱力"
            className="kaituo-input w-full px-2.5 py-1.5 text-[12px] md:px-3 md:py-2 md:text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>
        <Field label="消耗">
          <input
            value={draft.消耗}
            onChange={(e) => onChange({ ...draft, 消耗: e.target.value })}
            placeholder="轻微负担 / 命途共鸣 / 每场一次"
            className="kaituo-input w-full px-2.5 py-1.5 text-[12px] md:px-3 md:py-2 md:text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>
        <Field label="冷却">
          <input
            value={draft.冷却}
            onChange={(e) => onChange({ ...draft, 冷却: e.target.value })}
            placeholder="无 / 短暂间隔 / 每场一次"
            className="kaituo-input w-full px-2.5 py-1.5 text-[12px] md:px-3 md:py-2 md:text-sm"
            style={{ clipPath: smallClip }}
          />
        </Field>
      </div>
      <Field label="备注">
        <textarea
          value={draft.备注}
          onChange={(e) => onChange({ ...draft, 备注: e.target.value })}
          rows={3}
          placeholder="可记录限制、演出风格、和伙伴配合方式。"
          className="kaituo-input w-full px-2.5 py-1.5 text-[12px] leading-relaxed md:px-3 md:py-2 md:text-sm"
          style={{ clipPath: smallClip }}
        />
      </Field>
    </div>
  );
}

function ModePill({
  label,
  active,
  tone = 'gold',
}: {
  label: string;
  active?: boolean;
  tone?: 'gold' | 'cyan';
}) {
  const isCyan = tone === 'cyan';
  return (
    <span
      className="px-1.5 py-0.5 font-serif text-[10px] tracking-[0.08em] md:px-2 md:text-[11px] md:tracking-[0.18em]"
      style={{
        color: active ? (isCyan ? 'rgb(var(--tj-tech-cyan))' : 'rgb(var(--tj-text-primary))') : 'rgba(var(--tj-text-secondary),0.72)',
        background: active
          ? isCyan
            ? 'rgba(var(--tj-tech-cyan), 0.12)'
            : 'rgba(var(--tj-accent-primary),0.12)'
          : 'rgba(var(--tj-accent-primary),0.04)',
        boxShadow: active
          ? isCyan
            ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.35)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.35)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
        clipPath: smallClip,
      }}
    >
      {label}
    </span>
  );
}

function ModeNotice({
  title,
  text,
  tone = 'gold',
}: {
  title: string;
  text: string;
  tone?: 'gold' | 'cyan';
}) {
  const isCyan = tone === 'cyan';
  return (
    <div
      className="kaituo-options-scroll mt-2 min-h-[104px] max-h-[132px] overflow-y-auto overscroll-contain px-2.5 py-2 text-[11px] leading-relaxed md:min-h-0 md:max-h-none md:overflow-visible md:px-3 md:py-3 md:text-[12px]"
      style={{
        color: isCyan ? 'rgba(204,240,240,0.82)' : 'rgba(var(--tj-text-secondary),0.82)',
        background: isCyan ? 'rgba(var(--tj-tech-cyan), 0.045)' : 'rgba(var(--tj-accent-primary),0.045)',
        boxShadow: isCyan
          ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.16)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-1 font-serif text-[10px] tracking-[0.12em] md:text-[11px] md:tracking-[0.22em]" style={{ color: isCyan ? 'rgb(var(--tj-tech-cyan))' : 'rgb(var(--tj-accent-primary))' }}>
        {title}
      </div>
      {text}
    </div>
  );
}

function SkillRecordGroup({
  title,
  count,
  tone = 'gold',
  children,
}: {
  title: string;
  count: number;
  tone?: 'gold' | 'cyan';
  children: React.ReactNode;
}) {
  const isCyan = tone === 'cyan';
  return (
    <div
      className="px-2.5 py-2.5 md:px-3 md:py-3"
      style={{
        background: isCyan ? 'rgba(var(--tj-tech-cyan), 0.03)' : 'rgba(var(--tj-accent-primary),0.03)',
        boxShadow: isCyan
          ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.14)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-serif text-[11px] tracking-[0.12em] md:text-[12px] md:tracking-[0.22em]" style={{ color: isCyan ? 'rgb(var(--tj-tech-cyan))' : 'rgb(var(--tj-accent-primary))' }}>
          {title}
        </span>
        <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
          {count} 条
        </span>
      </div>
      <div className="space-y-2 md:space-y-3">{children}</div>
    </div>
  );
}

function SlotGroup({
  title,
  slots,
  selectedSlotKey,
  onSelect,
}: {
  title: string;
  slots: 战技槽位摘要[];
  selectedSlotKey: SlotKey;
  onSelect: (slot: 战技槽位摘要) => void;
}) {
  return (
    <div className="min-w-0 md:min-w-0">
      {title && (
        <div className="mb-1.5 font-serif text-[11px] tracking-[0.12em] md:mb-2 md:text-[12px] md:tracking-[0.22em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.82)' }}>
          {title}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-1 md:block md:space-y-1.5 md:overflow-visible md:pb-0">
        {slots.map((slot) => {
          const key = slot.kind === 'normal'
            ? `normal:${slot.slotIndex}`
            : `path:${slot.pathId as 命途ID}:${slot.slotIndex}`;
          const active = selectedSlotKey === key;
          return (
            <button
              key={slot.id}
              type="button"
              className="w-[112px] shrink-0 px-2 py-2 text-left transition-all md:w-full md:px-3"
              onClick={() => onSelect(slot)}
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.13), rgba(var(--tj-tech-cyan), 0.06))'
                  : 'rgba(var(--tj-bg-primary),0.45)',
                boxShadow: active
                  ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.48), inset 3px 0 0 rgba(var(--tj-accent-primary),0.82)'
                  : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.14)',
                clipPath: smallClip,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-[11px] tracking-[0.08em] md:text-[13px] md:tracking-[0.16em]" style={{ color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary),0.82)' }}>
                  {slot.kind === 'normal' ? `普通槽 ${slot.slotIndex}` : `槽位 ${slot.slotIndex}`}
                </span>
                <span className="text-[10px] md:text-[11px]" style={{ color: slot.occupiedSkillId ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary),0.72)' }}>
                  {slot.occupiedSkillId ? (slot.occupiedSkillEnabled === false ? '停用' : '已填') : '空位'}
                </span>
              </div>
              <div className="mt-1 truncate text-[10px] md:text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary),0.76)' }}>
                {slot.occupiedSkillName ?? '等待写入战技'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SkillRecordCard({
  skill,
  pathRecords,
  selected,
  onSelect,
}: {
  skill: 战技记录;
  pathRecords: 命途进度[];
  selected: boolean;
  onSelect: () => void;
}) {
  const path = skill.关联命途 ? pathRecords.find((item) => item.id === skill.关联命途) : undefined;
  const pathDef = skill.关联命途 ? getPath(skill.关联命途) : undefined;
  const stage = path ? PATH_STAGE_DEFS.find((item) => item.stage === path.阶段) : undefined;
  return (
    <button
      type="button"
      className="w-full px-2.5 py-2.5 text-left transition-all md:px-3 md:py-3"
      onClick={onSelect}
      style={{
        background: selected
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.13), rgba(var(--tj-tech-cyan), 0.06))'
          : skill.已启用 === false
            ? 'rgba(var(--tj-text-secondary),0.04)'
            : 'rgba(var(--tj-bg-primary),0.46)',
        boxShadow: selected
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.48)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-[12px] font-bold tracking-[0.08em] md:text-[14px] md:tracking-[0.16em]" style={{ color: skill.已启用 === false ? 'rgba(var(--tj-text-secondary),0.75)' : 'rgb(var(--tj-text-primary))' }}>
            {skill.名称}
          </div>
          <div className="mt-1 text-[10px] md:text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary),0.76)' }}>
            {skill.类别} · {skill.槽位类型 === 'normal' ? `普通槽 ${skill.槽位序号}` : `${pathDef?.name ?? skill.关联命途} 槽 ${skill.槽位序号}`}
            {stage ? ` · ${stage.name}` : ''}
          </div>
        </div>
        <span className="shrink-0 px-1.5 py-0.5 text-[10px] md:px-2 md:text-[11px]" style={{ color: skill.已启用 === false ? 'rgba(var(--tj-text-secondary),0.75)' : 'rgb(var(--tj-tech-cyan))' }}>
          {skill.已启用 === false ? 'OFF' : 'ON'}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed md:mt-2 md:text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary),0.8)' }}>
        {skill.描述}
      </p>
      {skill.关键词?.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {skill.关键词.slice(0, 4).map((keyword) => (
            <span key={keyword} className="px-1.5 py-0.5 text-[10px] md:px-2 md:text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)', background: 'rgba(var(--tj-accent-primary),0.08)', clipPath: smallClip }}>
              {keyword}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2" style={{ background: 'rgba(var(--tj-accent-primary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)', clipPath: smallClip }}>
      <div className="text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>{label}</div>
      <div className="mt-0.5 font-serif text-[17px] font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>{value}</div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-4 w-[3px]" style={{ background: 'rgb(var(--tj-accent-primary))' }} />
      <span className="font-serif text-[12px] font-bold tracking-[0.14em] md:text-[13px] md:tracking-[0.24em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{title}</span>
      <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.32), transparent)' }} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 font-serif text-[11px] tracking-[0.1em] md:mb-1.5 md:text-[12px] md:tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.76)' }}>
        {label}
      </div>
      {children}
    </label>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2.5 py-1.5 md:px-3 md:py-2" style={{ background: 'rgba(var(--tj-tech-cyan), 0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.18)', clipPath: smallClip }}>
      <div className="text-[10px] md:text-[12px]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.72)' }}>{label}</div>
      <div className="mt-0.5 truncate font-serif text-[12px] md:text-[14px]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{value}</div>
    </div>
  );
}

function EmptyNotice({ text }: { text: string }) {
  return (
    <div className="px-2.5 py-2.5 text-[11px] leading-relaxed md:px-3 md:py-3 md:text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary),0.78)', background: 'rgba(var(--tj-text-secondary),0.055)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-secondary),0.18)', clipPath: smallClip }}>
      {text}
    </div>
  );
}

function panelStyle(background = 'linear-gradient(180deg, rgba(var(--tj-bg-secondary),0.96), rgba(var(--tj-bg-primary),0.98))') {
  return {
    background,
    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.62), 0 14px 32px rgba(var(--tj-shadow),0.1)',
    clipPath: cardClip,
  };
}

function resolveSlot(slots: 战技槽位摘要[], key: SlotKey): 战技槽位摘要 | undefined {
  const [kind, pathOrIndex, maybeIndex] = key.split(':');
  if (kind === 'normal') {
    return slots.find((slot) => slot.kind === 'normal' && slot.slotIndex === Number(pathOrIndex));
  }
  return slots.find((slot) => slot.kind === 'path' && slot.pathId === pathOrIndex && slot.slotIndex === Number(maybeIndex));
}

function draftFromSkill(skill: 战技记录): SkillDraft {
  return {
    名称: skill.名称,
    描述: skill.描述,
    来源: skill.来源,
    关键词: skill.关键词?.join('、') ?? '',
    消耗: skill.消耗 ?? '',
    冷却: skill.冷却 ?? '',
    备注: skill.备注 ?? '',
  };
}

function splitKeywords(value: string): string[] {
  return value
    .split(/[,，、\s/|]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isVisibleSkillRecord(skill: 战技记录): boolean {
  return skill.槽位类型 !== 'normal' || (skill.槽位序号 >= 1 && skill.槽位序号 <= NORMAL_SKILL_SLOT_COUNT);
}

function sameSlot(a: 战技记录, b: 战技记录): boolean {
  if (a.id === b.id) return false;
  if (a.槽位类型 !== b.槽位类型) return false;
  if (a.槽位序号 !== b.槽位序号) return false;
  if (a.槽位类型 === 'normal') return true;
  return a.关联命途 === b.关联命途;
}

function sortSkill(a: 战技记录, b: 战技记录): number {
  if (a.槽位类型 !== b.槽位类型) return a.槽位类型 === 'normal' ? -1 : 1;
  if (a.关联命途 !== b.关联命途) return String(a.关联命途 ?? '').localeCompare(String(b.关联命途 ?? ''));
  return a.槽位序号 - b.槽位序号;
}

function slotTitle(slot: 战技槽位摘要): string {
  if (slot.kind === 'normal') return `普通战技槽 ${slot.slotIndex}`;
  const pathDef = slot.pathId ? getPath(slot.pathId) : undefined;
  return `${pathDef?.name ?? slot.pathId ?? '命途'}战技槽 ${slot.slotIndex}`;
}
