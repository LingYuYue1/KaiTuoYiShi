import { useState } from 'react';
import { PATH_STAGE_DEFS, type 命途阶段 } from '@/models/path';
import type { 命途ID, 剧情模式, 阵营ID } from '@/models/journey';
import { abilityPresets, openingRegions, getOfficialOpeningPresetsByRegion, openingChapterAnchors, getFreeOpeningGuide, getOpeningRegion, getWorkshopOpeningTemplate, getWorkshopOpeningTemplatesByRegion, factions, getFaction, getPath, getStoryMode, paths, storyModes } from '@/data/journeyPresets';
import { NORMAL_SKILL_SLOT_COUNT, type 战技记录, type 战技槽位摘要 } from '@/models/skill';
import type { TravelerTemplateContext, TravelerTemplateDraft } from '@/contracts/ai';
import type { OpeningScenario, OpeningChapterAnchor, OpeningDisplayScenario, OpeningSkillSlotKey } from './wizardData';
import type { CanonicalTrailblazer, FreeOpeningPlanetSource, FreeOpeningWorkshopDraft, OpeningSource } from '@/models/opening';
import { CANONICAL_TRAILBLAZERS, FREE_OPENING_PLANET_SOURCE_OPTIONS, cardClip, smallClip, tightClip, openingCardBackground, openingActiveCardBackground, openingCardBorder, openingCyanBorder, getFreeOpeningPlanetSourceOption, getOpeningRegionDisplayName, getOpeningDisplaySummary, getOpeningDisplayHighlights, getOpeningOfficialChapterName, getOpeningOfficialChapterPhase, getOpeningChapterBadge, getOpeningPriorStoryState, selectOpeningScenario, openingSkillSlotTitle, openingSkillRecordSlotLabel, getCanonicalTrailblazer, splitCustomAbilityEntry, mergeBirthday } from './wizardData';
import { OpeningSkillSlotGroup, StepNav, SectionTitle, LabelField, OverviewLabel, OverviewRow } from './panels';

export function StoryModeSelector({
  storyMode,
  onStoryMode,
}: {
  storyMode: 剧情模式;
  onStoryMode: (mode: 剧情模式) => void;
}) {
  return (
    <section
      className="p-[13px]"
      style={{
        background: openingCardBackground,
        boxShadow: openingCardBorder,
        clipPath: smallClip,
      }}
    >
      <div className="mb-3">
        <div className="text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
          剧情偏向
        </div>
        <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
          决定开场与后续主剧情的关系发展方向，不锁定具体角色或事件。
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {storyModes.map((item) => {
          const active = storyMode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onStoryMode(item.id)}
              className="w-full p-4 text-left transition-transform hover:-translate-y-0.5"
              style={{
                background: active ? openingActiveCardBackground : 'rgba(var(--tj-panel-bg-end),0.58)',
                boxShadow: active ? openingCyanBorder : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                clipPath: tightClip,
              }}
            >
              <div
                className="font-serif text-base font-bold tracking-[0.14em]"
                style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
              >
                {item.name}
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                {item.description}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CharacterStep({
  name,
  onName,
  alias,
  onAlias,
  gender,
  onGender,
  age,
  onAge,
  birthday,
  birthdayMonth,
  birthdayDay,
  onBirthday,
  appearance,
  onAppearance,
  personality,
  onPersonality,
  background,
  onBackground,
  storyModeName,
  templateOpeningContext,
  onGenerateTemplate,
  onNext,
  onBack,
  ready,
}: {
  name: string;
  onName: (v: string) => void;
  alias: string;
  onAlias: (v: string) => void;
  gender: string;
  onGender: (v: string) => void;
  age: number;
  onAge: (v: number) => void;
  birthday: string;
  birthdayMonth: string;
  birthdayDay: string;
  onBirthday: (v: string) => void;
  appearance: string;
  onAppearance: (v: string) => void;
  personality: string;
  onPersonality: (v: string) => void;
  background: string;
  onBackground: (v: string) => void;
  storyModeName: string;
  templateOpeningContext?: Pick<
    TravelerTemplateContext,
    'openingSourceLabel' | 'openingRegionName' | 'openingChapterName' | 'openingLocationHint' | 'openingMainlineEnabled' | 'openingEntryText'
  >;
  onGenerateTemplate?: (context: TravelerTemplateContext) => Promise<TravelerTemplateDraft>;
  onNext: () => void;
  onBack: () => void;
  ready: boolean;
}) {
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState('');
  const [templatePrompt, setTemplatePrompt] = useState('');

  const handleGenerateTemplate = async () => {
    if (!onGenerateTemplate || templateLoading) return;
    setTemplateError('');
    setTemplateLoading(true);
    try {
      const draft = await onGenerateTemplate({
        storyModeName,
        ...templateOpeningContext,
        existingName: name,
        existingAlias: alias,
        existingGender: gender,
        existingAge: age,
        existingBirthday: birthday,
        userPrompt: templatePrompt,
      });
      onName(draft.name);
      onAlias(draft.alias);
      onGender(draft.gender);
      onAge(draft.age);
      onBirthday(draft.birthday);
      onAppearance(draft.appearance);
      onPersonality(draft.personality);
      onBackground(draft.background);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : '模板生成失败，请稍后再试。');
    } finally {
      setTemplateLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <SectionTitle title="角色档案" subtitle="把主角写得更像一位真正会走进故事的人" compact />
        {onGenerateTemplate ? (
          <div className="flex w-full flex-col gap-1 sm:max-w-xl sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <input
                value={templatePrompt}
                onChange={(event) => setTemplatePrompt(event.target.value)}
                disabled={templateLoading}
                placeholder="可填生成偏好，例如：公司调查员、冷静强势、会一点虚数奇术"
                className="min-w-0 flex-1 px-3 py-2 text-xs outline-none disabled:cursor-wait disabled:opacity-60"
                style={{
                  background: 'rgba(var(--tj-panel-bg-end),0.52)',
                  color: 'rgba(var(--tj-text-primary),0.92)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                  clipPath: smallClip,
                }}
              />
              <button
                type="button"
                onClick={() => void handleGenerateTemplate()}
                disabled={templateLoading}
                className="kaituo-btn kaituo-btn-secondary shrink-0 px-4 py-2.5 text-xs disabled:cursor-wait disabled:opacity-60"
              >
                <span className="tracking-[0.18em]">{templateLoading ? '生成中...' : '随机生成模板'}</span>
              </button>
            </div>
            <span className="text-[10px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
              可填偏好；该功能走主 API 模型
            </span>
          </div>
        ) : null}
      </div>

      {templateError ? (
        <div
          className="mb-4 px-3 py-2 text-xs leading-relaxed"
          style={{
            background: 'rgba(var(--tj-danger),0.12)',
            color: 'rgba(var(--tj-danger),0.92)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.24)',
            clipPath: smallClip,
          }}
        >
          {templateError}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-1">
        <div className="space-y-4">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <LabelField label="姓名">
                <input
                  value={name}
                  onChange={(e) => onName(e.target.value)}
                  placeholder="例如：流云"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="别名 / 外号">
                <input
                  value={alias}
                  onChange={(e) => onAlias(e.target.value)}
                  placeholder="可留空"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="性别">
                <input
                  value={gender}
                  onChange={(e) => onGender(e.target.value)}
                  placeholder="例如：男 / 女 / 其他"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="年龄">
                <input
                  type="number"
                  value={age}
                  onChange={(e) => onAge(Number(e.target.value) || 0)}
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <div>
                <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                  生日
                </div>
                <div className="grid grid-cols-[1fr_1fr] gap-2">
                  <input
                    value={birthdayMonth}
                    onChange={(e) => onBirthday(mergeBirthday(e.target.value, birthdayDay))}
                    placeholder="月"
                    className="kaituo-input w-full px-3 py-2 text-sm"
                    style={{ clipPath: smallClip }}
                  />
                  <input
                    value={birthdayDay}
                    onChange={(e) => onBirthday(mergeBirthday(birthdayMonth, e.target.value))}
                    placeholder="日"
                    className="kaituo-input w-full px-3 py-2 text-sm"
                    style={{ clipPath: smallClip }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
              <LabelField label="外貌">
                <textarea
                  value={appearance}
                  onChange={(e) => onAppearance(e.target.value)}
                  rows={4}
                  placeholder="例如：黑发蓝眼、刘海遮住一只眼睛、身形清瘦但挺拔、左耳有耳钉、常穿深色外套"
                  className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
            </LabelField>
            <div className="mt-4">
              <LabelField label="性格">
                <textarea
                  value={personality}
                  onChange={(e) => onPersonality(e.target.value)}
                  rows={4}
                  placeholder="例如：冷静、嘴硬心软、警惕但愿意信任同伴"
                  className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
            </div>
            <div className="mt-4">
              <LabelField label="背景故事">
                <textarea
                  value={background}
                  onChange={(e) => onBackground(e.target.value)}
                  rows={6}
                  placeholder="可选。写下你的出身、过去经历、为何来到黑塔空间站、与命途或某个组织的关系。这里会显示在旅人档案中，也会被主剧情读取。"
                  className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                这里写的是角色自己的经历，不是开局系统摘要；切入剧情的具体方式仍在「介入方式」页填写。
              </p>
            </div>
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} ready={ready} nextLabel="继续：命途与能力" />
    </div>
  );
}

export function PathStep({
  pathId,
  pathStage,
  onPath,
  onPathStage,
  selectedAbilityIds,
  onToggleAbility,
  customAbilities,
  customAbilityNameDraft,
  customAbilityEffectDraft,
  onCustomAbilityNameDraft,
  onCustomAbilityEffectDraft,
  onAddCustomAbility,
  onRemoveCustomAbility,
  onNext,
  onBack,
}: {
  pathId: 命途ID;
  pathStage: 命途阶段;
  onPath: (id: 命途ID) => void;
  onPathStage: (stage: 命途阶段) => void;
  selectedAbilityIds: string[];
  onToggleAbility: (id: string) => void;
  customAbilities: string[];
  customAbilityNameDraft: string;
  customAbilityEffectDraft: string;
  onCustomAbilityNameDraft: (v: string) => void;
  onCustomAbilityEffectDraft: (v: string) => void;
  onAddCustomAbility: () => void;
  onRemoveCustomAbility: (text: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const selectedPath = getPath(pathId);
  const selectedStage = PATH_STAGE_DEFS.find((item) => item.stage === pathStage) ?? PATH_STAGE_DEFS[0];

  return (
    <div>
      <SectionTitle title="命途与能力" subtitle="让角色在故事里拥有更清晰的轨迹" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <div>
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              命途选择
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {paths.map((item) => {
                const active = pathId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onPath(item.id)}
                    className="p-4 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active
                        ? 'linear-gradient(160deg, rgba(var(--tj-btn-primary-start), 0.13), rgba(var(--tj-btn-primary-end), 0.05))'
                        : 'rgba(var(--tj-panel-bg-end),0.58)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.5), 0 0 14px rgba(var(--tj-btn-primary-start), 0.12)'
                        : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                      clipPath: tightClip,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="flex h-[30px] w-[30px] items-center justify-center text-[22px] leading-none"
                          style={{ color: active ? 'rgba(var(--tj-btn-primary-start),0.96)' : 'rgba(var(--tj-btn-primary-start),0.58)' }}
                        >
                          {item.emblem}
                        </div>
                        <div
                          className="mt-2 font-serif text-base font-bold tracking-[0.14em]"
                          style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                        >
                          {item.name}
                        </div>
                      </div>
                      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                        {item.aeon}
                      </div>
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                      {item.blurb}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPath && (
              <div
                className="mt-3 p-3 text-xs leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.52)',
                  color: 'rgba(var(--tj-text-secondary), 0.84)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                  clipPath: smallClip,
                }}
              >
                <div style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}>
                  {selectedPath.name} · {selectedPath.aeon}
                </div>
                <div className="mt-1">{selectedPath.description}</div>
              </div>
            )}
          </div>

          <div>
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              初始阶段
            </div>
            {selectedPath ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {PATH_STAGE_DEFS.map((item) => {
                  const active = pathStage === item.stage;
                  return (
                    <button
                      key={item.stage}
                      onClick={() => onPathStage(item.stage)}
                      className="p-4 text-left transition-transform hover:-translate-y-0.5"
                      style={{
                        background: active
                          ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.12), rgba(var(--tj-btn-primary-end), 0.04))'
                          : 'rgba(var(--tj-panel-bg-end),0.58)',
                        boxShadow: active
                          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.46), 0 0 12px rgba(var(--tj-btn-primary-start), 0.1)'
                          : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.13)',
                        clipPath: tightClip,
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div
                            className="font-serif text-base font-bold tracking-[0.14em]"
                            style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                          >
                            {item.name}
                          </div>
                          <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.72)' }}>
                            {item.title}
                          </div>
                        </div>
                        <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                          STAGE {item.stage}
                        </div>
                      </div>
                      <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                        {item.blurb}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div
                className="p-3 text-xs leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.52)',
                  color: 'rgba(var(--tj-text-secondary), 0.72)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                  clipPath: smallClip,
                }}
              >
                未选择命途时无需选择阶段。
              </div>
            )}

            {selectedPath && (
              <div
                className="mt-3 p-3 text-xs leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.52)',
                  color: 'rgba(var(--tj-text-secondary), 0.84)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                  clipPath: smallClip,
                }}
              >
                当前开局将以「{selectedStage.name} · {selectedStage.title}」写入旅人命途档案。高阶段会明显改变首回合叙事强度与周围人物反应。
              </div>
            )}
          </div>

        </div>

        <div className="space-y-5">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              开局特质
            </div>
            <div className="grid grid-cols-1 gap-3">
              {abilityPresets.map((item) => {
                const active = selectedAbilityIds.includes(item.id);
                const disabled = !active && selectedAbilityIds.length >= 2;
                return (
                  <button
                    key={item.id}
                    onClick={() => onToggleAbility(item.id)}
                    disabled={disabled}
                    className="p-4 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.10), rgba(var(--tj-btn-primary-end), 0.04))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.45), 0 0 12px rgba(var(--tj-btn-primary-start), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                      clipPath: tightClip,
                    }}
                  >
                    <div
                      className="font-serif text-base font-bold tracking-[0.14em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                    >
                      <span style={{ color: 'rgba(var(--tj-btn-primary-start), 0.76)' }}>{active ? '✓ ' : '◆ '}</span>
                      {item.name}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                      {item.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                自定义特质
              </div>
              <div className="grid gap-2">
                <input
                  value={customAbilityNameDraft}
                  onChange={(e) => onCustomAbilityNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('custom-ability-effect-input')?.focus();
                    }
                  }}
                  placeholder="输入特质名称，例如：奇物研究助手"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
                <div className="flex gap-2">
                  <input
                    id="custom-ability-effect-input"
                    value={customAbilityEffectDraft}
                    onChange={(e) => onCustomAbilityEffectDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onAddCustomAbility();
                      }
                    }}
                    placeholder="输入效果说明，例如：更熟悉奇物辨认与装置检修"
                    className="kaituo-input flex-1 px-3 py-2 text-sm"
                    style={{ clipPath: smallClip }}
                  />
                  <button
                    type="button"
                    onClick={onAddCustomAbility}
                    className="px-3 text-base"
                    style={{
                      background: 'rgba(var(--tj-btn-primary-start), 0.16)',
                      color: 'rgba(var(--tj-btn-primary-start), 0.95)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.32)',
                      clipPath: smallClip,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {customAbilities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customAbilities.map((item) => {
                    const parsed = splitCustomAbilityEntry(item);
                    return (
                      <button
                        key={item}
                        onClick={() => onRemoveCustomAbility(item)}
                        className="max-w-full px-3 py-2 text-left text-xs tracking-[0.12em]"
                        style={{
                          background: 'rgba(var(--tj-btn-primary-start), 0.12)',
                          color: 'rgba(var(--tj-btn-primary-start), 0.96)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.28)',
                          clipPath: smallClip,
                        }}
                        title="点击删除"
                      >
                        <span className="block font-semibold">{parsed.name} ×</span>
                        {parsed.effect ? (
                          <span className="mt-1 block max-w-[280px] truncate text-[10px] tracking-[0.06em] opacity-80">
                            {parsed.effect}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          <div
            className="p-4 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.52)',
              color: 'rgba(var(--tj-text-secondary), 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
              clipPath: smallClip,
            }}
          >
            命途和能力会直接影响首回合正文里的措辞、可用行动与人物反应。这里写得越清楚，后面越不容易失真。
            <br />
            开局特质最多选择 2 个，自定义特质不计入上限。
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="继续：战技创作" />
    </div>
  );
}

export function SkillCreationStep({
  openingSkills,
  openingSkillSlots,
  selectedSlotKey,
  selectedSlot,
  selectedPathId,
  selectedPathStage,
  openingSkillNameDraft,
  openingSkillDescDraft,
  openingSkillSourceDraft,
  openingSkillKeywordsDraft,
  openingSkillCostDraft,
  openingSkillCooldownDraft,
  openingSkillNoteDraft,
  onSelectedSlotKey,
  onOpeningSkillNameDraft,
  onOpeningSkillDescDraft,
  onOpeningSkillSourceDraft,
  onOpeningSkillKeywordsDraft,
  onOpeningSkillCostDraft,
  onOpeningSkillCooldownDraft,
  onOpeningSkillNoteDraft,
  onAddOpeningSkill,
  onToggleOpeningSkill,
  onRemoveOpeningSkill,
  onNext,
  onBack,
}: {
  openingSkills: 战技记录[];
  openingSkillSlots: 战技槽位摘要[];
  selectedSlotKey: OpeningSkillSlotKey;
  selectedSlot?: 战技槽位摘要;
  selectedPathId: 命途ID;
  selectedPathStage: 命途阶段;
  openingSkillNameDraft: string;
  openingSkillDescDraft: string;
  openingSkillSourceDraft: string;
  openingSkillKeywordsDraft: string;
  openingSkillCostDraft: string;
  openingSkillCooldownDraft: string;
  openingSkillNoteDraft: string;
  onSelectedSlotKey: (key: OpeningSkillSlotKey) => void;
  onOpeningSkillNameDraft: (v: string) => void;
  onOpeningSkillDescDraft: (v: string) => void;
  onOpeningSkillSourceDraft: (v: string) => void;
  onOpeningSkillKeywordsDraft: (v: string) => void;
  onOpeningSkillCostDraft: (v: string) => void;
  onOpeningSkillCooldownDraft: (v: string) => void;
  onOpeningSkillNoteDraft: (v: string) => void;
  onAddOpeningSkill: () => void;
  onToggleOpeningSkill: (skillId: string) => void;
  onRemoveOpeningSkill: (skillId: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const normalSlots = openingSkillSlots.filter((slot) => slot.kind === 'normal');
  const pathSlots = openingSkillSlots.filter((slot) => slot.kind === 'path');
  const selectedPath = selectedPathId !== 'none' ? getPath(selectedPathId) : undefined;
  const selectedStage = PATH_STAGE_DEFS.find((item) => item.stage === selectedPathStage) ?? PATH_STAGE_DEFS[0];
  const selectedSlotTitle = selectedSlot ? openingSkillSlotTitle(selectedSlot) : '未选择槽位';

  return (
    <div>
      <SectionTitle title="战技创作" subtitle="提前写好正文可调用的能力表现" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div
          className="p-4"
          style={{
            background: 'rgba(var(--tj-panel-bg-end),0.58)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
            clipPath: cardClip,
          }}
        >
          <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
            新建战技
          </div>
          <div className="mb-4 grid gap-3">
            <div
              className="p-3 text-xs leading-relaxed"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.52)',
                color: 'rgba(var(--tj-text-secondary), 0.84)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                clipPath: smallClip,
              }}
            >
              <div className="text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                当前装备槽位
              </div>
              <div className="mt-1 font-serif text-base font-bold tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                {selectedSlotTitle}
              </div>
              <div className="mt-1">
                普通战技固定 {NORMAL_SKILL_SLOT_COUNT} 槽；命途战技跟随前一步等阶开放。当前命途：
                {selectedPath ? `${selectedPath.name} · ${selectedStage.name}（${pathSlots.length} 槽）` : '未选择命途'}。
              </div>
            </div>

            <OpeningSkillSlotGroup
              title="普通战技槽"
              slots={normalSlots}
              selectedSlotKey={selectedSlotKey}
              onSelect={onSelectedSlotKey}
            />
            <OpeningSkillSlotGroup
              title="命途战技槽"
              slots={pathSlots}
              selectedSlotKey={selectedSlotKey}
              onSelect={onSelectedSlotKey}
              emptyText="前一步选择命途后，这里会出现对应等阶的命途槽位。"
            />
          </div>
          <div className="grid gap-3">
            <LabelField label="战技名称">
              <input
                value={openingSkillNameDraft}
                onChange={(e) => onOpeningSkillNameDraft(e.target.value)}
                placeholder="例如：星核呼吸、虚数折跃、云骑步法"
                className="kaituo-input w-full px-3 py-2 text-sm"
                style={{ clipPath: smallClip }}
              />
            </LabelField>
            <div className="grid gap-3 md:grid-cols-2">
              <LabelField label="来源">
                <input
                  value={openingSkillSourceDraft}
                  onChange={(e) => onOpeningSkillSourceDraft(e.target.value)}
                  placeholder={selectedSlot?.kind === 'path' ? '命途战技自定义' : '普通战技自制'}
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="关键词">
                <input
                  value={openingSkillKeywordsDraft}
                  onChange={(e) => onOpeningSkillKeywordsDraft(e.target.value)}
                  placeholder="追击、护盾、位移、治疗"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="消耗">
                <input
                  value={openingSkillCostDraft}
                  onChange={(e) => onOpeningSkillCostDraft(e.target.value)}
                  placeholder="体力负担 / 命途共鸣 / 材料消耗"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
              <LabelField label="冷却">
                <input
                  value={openingSkillCooldownDraft}
                  onChange={(e) => onOpeningSkillCooldownDraft(e.target.value)}
                  placeholder="无 / 短暂间隔 / 每场一次"
                  className="kaituo-input w-full px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
              </LabelField>
            </div>
            <LabelField label="表现与限制">
              <textarea
                value={openingSkillDescDraft}
                onChange={(e) => onOpeningSkillDescDraft(e.target.value)}
                rows={6}
                placeholder="写下它在正文里的表现、代价、限制和适合出现的场景。比如：短时间提高反应速度，但会消耗体力；不能连续使用。"
                className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                style={{ clipPath: smallClip }}
              />
            </LabelField>
            <LabelField label="备注">
              <textarea
                value={openingSkillNoteDraft}
                onChange={(e) => onOpeningSkillNoteDraft(e.target.value)}
                rows={3}
                placeholder="可记录演出风格、和伙伴配合方式、禁止滥用的边界。"
                className="kaituo-input w-full resize-none px-3 py-2 text-sm"
                style={{ clipPath: smallClip }}
              />
            </LabelField>
            <button
              type="button"
              onClick={onAddOpeningSkill}
              className="kaituo-btn kaituo-btn-primary px-4 py-3 text-sm"
            >
              <span className="tracking-[0.2em] font-bold">添加战技</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              已登记战技
            </div>
            {openingSkills.length > 0 ? (
              <div className="space-y-3">
                {openingSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="p-3 text-sm leading-relaxed"
                    style={{
                      background: openingCardBackground,
                      color: 'rgba(var(--tj-text-secondary), 0.84)',
                      boxShadow: openingCardBorder,
                      clipPath: smallClip,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                          {openingSkillRecordSlotLabel(skill)}
                        </div>
                        <div className="mt-1 font-serif text-base font-bold tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                          {skill.名称}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span
                            className="px-2 py-0.5 text-[10px] tracking-[0.12em]"
                            style={{
                              background: skill.已启用 === false ? 'rgba(var(--tj-text-secondary), 0.12)' : 'rgba(var(--tj-btn-primary-start), 0.12)',
                              color: skill.已启用 === false ? 'rgba(var(--tj-text-secondary), 0.78)' : 'rgba(var(--tj-btn-primary-start), 0.92)',
                              clipPath: smallClip,
                            }}
                          >
                            {skill.已启用 === false ? '已停用' : '已启用'}
                          </span>
                          {skill.来源 ? (
                            <span
                              className="px-2 py-0.5 text-[10px]"
                              style={{
                                background: 'rgba(var(--tj-bg-primary), 0.46)',
                                color: 'rgba(var(--tj-text-secondary), 0.82)',
                                clipPath: smallClip,
                              }}
                            >
                              {skill.来源}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 text-xs leading-relaxed">{skill.描述}</div>
                        {skill.关键词?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {skill.关键词.slice(0, 5).map((keyword) => (
                              <span
                                key={keyword}
                                className="px-2 py-0.5 text-[10px]"
                                style={{
                                  background: 'rgba(var(--tj-btn-primary-start), 0.08)',
                                  color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))',
                                  clipPath: smallClip,
                                }}
                              >
                                {keyword}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {(skill.消耗 || skill.冷却 || skill.备注) && (
                          <div
                            className="mt-2 grid gap-1.5 text-[11px]"
                            style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}
                          >
                            {skill.消耗 ? <div>消耗：{skill.消耗}</div> : null}
                            {skill.冷却 ? <div>冷却：{skill.冷却}</div> : null}
                            {skill.备注 ? <div>备注：{skill.备注}</div> : null}
                          </div>
                        )}
                      </div>
                      <div className="grid shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => onToggleOpeningSkill(skill.id)}
                          className="px-2 py-1 text-[11px]"
                          style={{
                            background: skill.已启用 === false ? 'rgba(var(--tj-btn-primary-start), 0.12)' : 'rgba(var(--tj-text-secondary), 0.10)',
                            color: skill.已启用 === false ? 'rgba(var(--tj-btn-primary-start), 0.96)' : 'rgba(var(--tj-text-secondary), 0.82)',
                            clipPath: smallClip,
                          }}
                        >
                          {skill.已启用 === false ? '启用' : '停用'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveOpeningSkill(skill.id)}
                          className="px-2 py-1 text-[11px]"
                          style={{
                            background: 'rgba(var(--tj-btn-primary-start), 0.12)',
                            color: 'rgba(var(--tj-btn-primary-start), 0.96)',
                            clipPath: smallClip,
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="p-4 text-sm leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.5)',
                  color: 'rgba(var(--tj-text-secondary), 0.72)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                  clipPath: smallClip,
                }}
              >
                暂未登记战技。可以留空进入开局，也可以先写 1 到 3 个最常用的能力，让正文更稳定地调用它们。
              </div>
            )}
          </div>

          <div
            className="p-4 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.52)',
              color: 'rgba(var(--tj-text-secondary), 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
              clipPath: smallClip,
            }}
          >
            战技会保存进开局预设，并随旅人档案进入游戏。建议写清楚“能做到什么”和“不能随便做到什么”，这样正文不会把能力写飞。
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="继续：其他选项" />
    </div>
  );
}

export function OpeningAnchorStep({
  storyMode,
  onStoryMode,
  startingScenarioId,
  onStartingScenarioId,
  selectedRegionId,
  onOpeningRegion,
  selectedWorkshopTemplateId,
  onSelectedWorkshopTemplateId,
  openingSource,
  onOpeningSource,
  freeOpeningMainlineEnabled,
  onFreeOpeningMainlineEnabled,
  freeOpeningPlanetSource,
  onFreeOpeningPlanetSource,
  freeOpeningWorkshop,
  onFreeOpeningWorkshop,
  onSaveFreeOpeningCustomNpc,
  onRemoveFreeOpeningCustomNpc,
  customStartPrompt,
  onCustomStartPrompt,
  onNext,
  onBack,
}: {
  storyMode: 剧情模式;
  onStoryMode: (mode: 剧情模式) => void;
  startingScenarioId: string;
  onStartingScenarioId: (id: string) => void;
  selectedRegionId: string;
  onOpeningRegion: (regionId: string) => void;
  selectedWorkshopTemplateId: string;
  onSelectedWorkshopTemplateId: (id: string) => void;
  openingSource: OpeningSource;
  onOpeningSource: (source: OpeningSource) => void;
  freeOpeningMainlineEnabled: boolean;
  onFreeOpeningMainlineEnabled: (enabled: boolean) => void;
  freeOpeningPlanetSource: FreeOpeningPlanetSource;
  onFreeOpeningPlanetSource: (source: FreeOpeningPlanetSource) => void;
  freeOpeningWorkshop: FreeOpeningWorkshopDraft;
  onFreeOpeningWorkshop: (key: keyof FreeOpeningWorkshopDraft, value: string) => void;
  onSaveFreeOpeningCustomNpc: () => void;
  onRemoveFreeOpeningCustomNpc: (id: string) => void;
  customStartPrompt: string;
  onCustomStartPrompt: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const selectedRegion = getOpeningRegion(selectedRegionId) ?? openingRegions.at(0);
  const freeGuide = getFreeOpeningGuide(selectedRegionId);
  const filteredOfficialPresets = getOfficialOpeningPresetsByRegion(selectedRegionId);
  const filteredChapters = openingChapterAnchors.filter((item) => item.regionId === selectedRegionId);
  const filteredWorkshopTemplates = getWorkshopOpeningTemplatesByRegion(selectedRegionId);
  const selectedTemplate = selectedWorkshopTemplateId ? getWorkshopOpeningTemplate(selectedWorkshopTemplateId) : undefined;
  const effectiveMainlineEnabled = openingSource === 'official_preset' || freeOpeningMainlineEnabled;
  const visibleScenarios: OpeningDisplayScenario[] =
    openingSource === 'workshop'
      ? Array.from(
          new Map(
            filteredWorkshopTemplates
              .map((template) => {
                const chapter = openingChapterAnchors.find((item) => item.id === template.chapterId);
                return chapter ? [chapter.id, chapter] as const : null;
              })
              .filter((item): item is readonly [string, OpeningChapterAnchor] => Boolean(item)),
          ).values(),
        )
      : openingSource === 'official_preset'
        ? filteredOfficialPresets.map((preset) => ({
            id: preset.chapterId,
            regionId: preset.regionId,
            name: preset.chapterName,
            summary: preset.summary,
            officialChapterName: openingChapterAnchors.find((item) => item.id === preset.chapterId)?.officialChapterName,
            officialChapterPhase: openingChapterAnchors.find((item) => item.id === preset.chapterId)?.officialChapterPhase,
            priorStoryState: openingChapterAnchors.find((item) => item.id === preset.chapterId)?.priorStoryState,
            referenceDate: preset.referenceDate,
            referenceTime: preset.referenceTime,
            defaultLocationHint: preset.defaultLocationHint,
            keyNpcs: preset.keyNpcs,
            loreKeywords: preset.loreKeywords,
            openingPressure: preset.openingPressure,
          }))
        : filteredChapters;

  return (
    <div className="space-y-4">
      <StoryModeSelector storyMode={storyMode} onStoryMode={onStoryMode} />

      <div className="grid gap-3 md:grid-cols-2">
        {[
          { id: 'official_preset' as OpeningSource, title: '官方预设', text: '稳定章节背景，适合快速进入某个主线节点。' },
          { id: 'free' as OpeningSource, title: '自由开局', text: '选择地区与主线进度后，自由书写真实起点和介入方式。' },
        ].map((item) => {
          const active = openingSource === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpeningSource(item.id)}
              className="min-h-[110px] p-[13px] text-left transition-shadow"
              style={{
                background: active
                  ? openingActiveCardBackground
                  : openingCardBackground,
                boxShadow: active
                  ? openingCyanBorder
                  : openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                {item.title}
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>{item.text}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-[14px] xl:grid-cols-[270px_minmax(0,1fr)]">
        <div
          className="min-h-0 p-[13px]"
          style={{
            background: openingCardBackground,
            boxShadow: openingCardBorder,
            clipPath: smallClip,
          }}
        >
          <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
            {openingSource === 'official_preset' ? '地区' : '已有地点'}
          </div>
          <div className="space-y-2">
            {openingRegions.map((region) => {
              const active = selectedRegionId === region.id;
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => onOpeningRegion(region.id)}
                  className="w-full p-[13px] text-left transition-shadow"
                  style={{
                    background: active
                      ? openingCardBackground
                      : openingCardBackground,
                    boxShadow: active
                      ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.48), inset 3px 0 0 rgba(var(--tj-btn-primary-start), 0.55)'
                      : openingCardBorder,
                    clipPath: smallClip,
                  }}
                >
                  <div className="text-sm font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                    {getOpeningRegionDisplayName(region.name)}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                    {region.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {openingSource !== 'official_preset' ? (
            <div
              className="order-1 p-[13px]"
              style={{
                background: openingCardBackground,
                boxShadow: openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                    主线状态
                  </div>
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                    启用主线时保留原作进度坐标；关闭后改由开局工作台和剧情编织推进。
                  </div>
                </div>
                <span
                  className="px-2 py-1 text-[11px]"
                  style={{
                    color: 'rgba(var(--tj-btn-primary-start), 0.88)',
                    background: 'rgba(var(--tj-btn-primary-start), 0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                    clipPath: smallClip,
                  }}
                >
                  原创起点
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { enabled: true, label: '启用主线' },
                  { enabled: false, label: '关闭主线' },
                ].map((item) => {
                  const active = freeOpeningMainlineEnabled === item.enabled;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => onFreeOpeningMainlineEnabled(item.enabled)}
                      className="px-3 py-2 text-xs font-bold transition-shadow"
                      style={{
                        color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary), 0.76)',
                        background: active ? openingActiveCardBackground : 'rgba(var(--tj-bg-primary), 0.35)',
                        boxShadow: active ? openingCyanBorder : openingCardBorder,
                        clipPath: smallClip,
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.92)' }}>
                关闭主线后，原作主线不会自动注入正文。若后续需要罗浮、匹诺康尼等原作剧情，请在剧情编织中手动启用你想注入的主线内容。
              </div>
              {freeOpeningMainlineEnabled ? (
                <div
                  className="mt-3 p-3 text-xs leading-relaxed"
                  style={{
                    background: 'rgba(var(--tj-bg-primary), 0.48)',
                    color: 'rgba(var(--tj-text-secondary), 0.78)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
                    clipPath: smallClip,
                  }}
                >
                  开启后从左侧选择地点，然后选择主线锚点。主线锚点只负责原作进度坐标，不覆盖你的真实起始地点与自定义切入。
                </div>
              ) : null}
            </div>
          ) : null}

          {openingSource !== 'official_preset' ? (
            <div
              className="order-3 p-[13px]"
              style={{
                background: openingCardBackground,
                boxShadow: openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                开局工作台
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                {freeOpeningPlanetSource === 'custom'
                  ? '自创地点会在这里写入原创舞台、NPC、势力、规则与切入信息。'
                  : '已有地点只需要选择左侧地点、填写起始地点，并按需补充自制 NPC。'}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {FREE_OPENING_PLANET_SOURCE_OPTIONS.map((item) => {
                  const active = freeOpeningPlanetSource === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onFreeOpeningPlanetSource(item.id)}
                      className="p-2.5 text-left transition-shadow"
                      style={{
                        background: active ? openingActiveCardBackground : 'rgba(var(--tj-bg-primary), 0.35)',
                        boxShadow: active
                          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 18px rgba(var(--tj-btn-primary-start), 0.08)'
                          : openingCardBorder,
                        clipPath: smallClip,
                      }}
                    >
                      <div className="text-xs font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                        {item.title}
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
                        {item.text}
                      </div>
                    </button>
                  );
                })}
              </div>
              {freeOpeningPlanetSource === 'existing' ? (
                <div
                  className="mt-3 p-3 text-xs leading-relaxed"
                  style={{
                    background: 'rgba(var(--tj-bg-primary), 0.48)',
                    color: 'rgba(var(--tj-text-secondary), 0.78)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
                    clipPath: smallClip,
                  }}
                >
                  当前已有地点：{getOpeningRegionDisplayName(selectedRegion?.name)}。需要切换时，请在左侧选择黑塔空间站、雅利洛-VI、仙舟罗浮或匹诺康尼。
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 xl:grid-cols-2">
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="自创地点 / 星球"
                    value={freeOpeningWorkshop.planet}
                    placeholder="例如：遥远边境星球 / 企业殖民世界 / 自建行星"
                    onChange={(value) => onFreeOpeningWorkshop('planet', value)}
                  />
                ) : null}
                <FreeOpeningWorkshopField
                  label="起始地点"
                  value={freeOpeningWorkshop.location}
                  placeholder={freeOpeningPlanetSource === 'existing' ? '例如：主控舱段 / 下层区诊所 / 星槎海中枢 / 白日梦酒店大堂' : '例如：城邦下城区、太空港、研究站、荒原营地'}
                  onChange={(value) => onFreeOpeningWorkshop('location', value)}
                />
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="地点简介"
                    value={freeOpeningWorkshop.planetIntro}
                    placeholder="一句到三句写清地点环境、文明、冲突或资源。"
                    onChange={(value) => onFreeOpeningWorkshop('planetIntro', value)}
                  />
                ) : null}
                <div className="xl:col-span-2">
                  <FreeOpeningNpcEditor
                    workshop={freeOpeningWorkshop}
                    onWorkshopChange={onFreeOpeningWorkshop}
                    onSave={onSaveFreeOpeningCustomNpc}
                    onRemove={onRemoveFreeOpeningCustomNpc}
                  />
                </div>
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="当前目标"
                    value={freeOpeningWorkshop.currentGoal}
                    placeholder="例如：找人、调查事故、护送、避难、谈判、潜入"
                    onChange={(value) => onFreeOpeningWorkshop('currentGoal', value)}
                  />
                ) : null}
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="局部冲突"
                    value={freeOpeningWorkshop.localConflict}
                    placeholder="例如：封锁、失踪、资源争夺、组织谈判、旧债未清"
                    onChange={(value) => onFreeOpeningWorkshop('localConflict', value)}
                  />
                ) : null}
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="组织/势力"
                    value={freeOpeningWorkshop.factions}
                    placeholder="例如：商会、公司分部、地方武装、科研组、地下帮派"
                    onChange={(value) => onFreeOpeningWorkshop('factions', value)}
                  />
                ) : null}
                {freeOpeningPlanetSource === 'custom' ? (
                  <FreeOpeningWorkshopField
                    label="世界规则"
                    value={freeOpeningWorkshop.worldRules}
                    placeholder="例如：这里有什么禁忌、技术限制、社会规则、特殊现象。"
                    onChange={(value) => onFreeOpeningWorkshop('worldRules', value)}
                  />
                ) : null}
                <div className="xl:col-span-2">
                  {freeOpeningPlanetSource === 'custom' ? (
                    <FreeOpeningWorkshopField
                      label="氛围 / 语气"
                      value={freeOpeningWorkshop.tone}
                      placeholder="例如：压迫、克制、冷硬、悬疑、日常、紧张、荒凉。"
                      onChange={(value) => onFreeOpeningWorkshop('tone', value)}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div
            className="order-2 p-0"
            style={{
              background: 'transparent',
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                  {openingSource === 'official_preset' ? '章节锚点' : effectiveMainlineEnabled ? '主线进度' : '主线已关闭'}
                </div>
                {openingSource !== 'official_preset' ? (
                  <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
                    {effectiveMainlineEnabled
                      ? '这里只决定原作世界推进到哪里，不限制你的起始地点、原创事件和真实开局设定。'
                      : '当前不从原作主线入手；请在开局工作台写清原创地点、NPC 与设定。'}
                  </div>
                ) : null}
              </div>
              <div className="shrink-0 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.66)' }}>
                {getOpeningRegionDisplayName(selectedRegion?.name)}
              </div>
            </div>
            {!effectiveMainlineEnabled ? (
              <div
                className="p-3 text-xs leading-relaxed"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.5)',
                  color: 'rgba(var(--tj-text-secondary), 0.78)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.18)',
                  clipPath: smallClip,
                }}
              >
                主线坐标已关闭。原作主线不会自动注入正文；后续若需要某段主线剧情，请进入剧情编织，手动启用对应章节或主线片段。
              </div>
            ) : (
            <div className={openingSource === 'official_preset' ? 'grid gap-3 lg:grid-cols-2' : 'space-y-2'}>
              {visibleScenarios.map((item) => {
                const active = startingScenarioId === item.id;
                const highlights = getOpeningDisplayHighlights(item).slice(0, openingSource === 'official_preset' ? 4 : 3);
                const commonButtonProps = {
                  type: 'button' as const,
                  onClick: () => selectOpeningScenario(
                    item,
                    openingSource,
                    filteredWorkshopTemplates,
                    onStartingScenarioId,
                    onSelectedWorkshopTemplateId,
                  ),
                };
                if (openingSource !== 'official_preset') {
                  return (
                    <button
                      key={item.id}
                      {...commonButtonProps}
                      className="w-full p-[13px] text-left transition-shadow"
                      style={{
                        background: active ? openingActiveCardBackground : openingCardBackground,
                        boxShadow: active
                          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), inset 4px 0 0 rgba(var(--tj-btn-primary-start), 0.54), 0 0 18px rgba(var(--tj-btn-primary-start), 0.08)'
                          : openingCardBorder,
                        clipPath: smallClip,
                      }}
                    >
                      <div className="grid gap-3 md:grid-cols-[172px_minmax(0,1fr)]">
                        <div>
                          <div className="text-[11px] leading-relaxed" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}>
                            {getOpeningOfficialChapterName(item)}
                          </div>
                          <div className="mt-1 text-xs font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                            {getOpeningOfficialChapterPhase(item) || '主线坐标'}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                              {item.name}
                            </div>
                            <span
                              className="px-2 py-1 text-[11px]"
                              style={{
                                color: 'rgba(var(--tj-btn-primary-end), 0.9)',
                                background: 'rgba(var(--tj-btn-primary-end), 0.08)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.18)',
                                clipPath: smallClip,
                              }}
                            >
                              原作世界坐标
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.8)' }}>
                            {getOpeningDisplaySummary(item)}
                          </div>
                          <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                            前置处理：{getOpeningPriorStoryState(item)}
                          </div>
                          {highlights.length ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {highlights.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-2 py-1 text-[11px]"
                                  style={{
                                    color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))',
                                    background: 'rgba(var(--tj-btn-primary-start), 0.06)',
                                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                                    clipPath: smallClip,
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={item.id}
                    {...commonButtonProps}
                    className="min-h-[158px] p-[14px] text-left transition-shadow"
                    style={{
                      background: active
                        ? openingCardBackground
                        : openingCardBackground,
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 20px rgba(var(--tj-btn-primary-start), 0.09)'
                        : openingCardBorder,
                      clipPath: tightClip,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="font-serif text-base font-bold tracking-[0.14em]"
                        style={{ color: 'rgb(var(--tj-text-primary))' }}
                      >
                        {item.name}
                      </div>
                      <div
                        className="max-w-[46%] px-2 py-1 text-right text-[11px] leading-snug"
                        style={{
                          color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))',
                          background: 'rgba(var(--tj-btn-primary-start), 0.08)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                          clipPath: smallClip,
                        }}
                      >
                        {getOpeningChapterBadge(item)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                      {getOpeningDisplaySummary(item)}
                    </div>
                    <div
                      className="mt-3 text-[11px] leading-relaxed"
                      style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
                    >
                      前置处理：{getOpeningPriorStoryState(item)}
                    </div>
                    {highlights.length ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {highlights.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-[11px]"
                            style={{
                              color: 'rgba(var(--tj-btn-primary-end), 0.92)',
                              background: 'rgba(var(--tj-btn-primary-end), 0.08)',
                              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.18)',
                              clipPath: smallClip,
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
              {visibleScenarios.length === 0 ? (
                <div
                  className="p-3 text-xs leading-relaxed"
                  style={{
                  background: 'rgba(var(--tj-bg-primary), 0.5)',
                  color: 'rgba(var(--tj-text-secondary), 0.72)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
                    clipPath: smallClip,
                  }}
                >
                  当前地区暂未配置可用锚点，后续可通过自由开局或创意工坊补充。
                </div>
              ) : null}
            </div>
            )}
          </div>

          <div className="order-4 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <div
              className="p-[13px] text-sm leading-relaxed"
              style={{
                background: openingCardBackground,
                color: 'rgba(var(--tj-text-secondary), 0.84)',
                boxShadow: openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                我的开局设定
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                会影响开局走向。你可以写接入点、当前剧情正在发生什么、你和谁有什么关系；这段话会发送给 AI，并联动写入开局档案和伙伴关系。例如写“和螺丝咕姆很熟”，伙伴关系也可能被整理进档案。
              </div>
              <textarea
                value={customStartPrompt}
                onChange={(event) => onCustomStartPrompt(event.target.value)}
                placeholder={
                  openingSource === 'official_preset'
                    ? '官方预设可留空。若想改变介入方式，也可以写下你希望如何进入当前章节。'
                    : selectedTemplate?.playerEntryTemplate ?? freeGuide?.sampleTexts.at(0) ?? '例如：开局地点是公司封锁的边缘实验站。我是受人委托追查奇物失控的外来旅人，当前正在等待接头人。'
                }
                className="mt-3 min-h-[152px] w-full resize-none px-3 py-3 text-sm leading-relaxed outline-none"
                style={{
                  color: 'rgb(var(--tj-text-primary))',
                  background: 'rgba(var(--tj-panel-bg-end),0.55)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                  clipPath: smallClip,
                }}
              />
            </div>

            <div
              className="p-[13px]"
              style={{
                background: openingCardBackground,
                boxShadow: openingCardBorder,
                clipPath: smallClip,
              }}
            >
              <div className="font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                写作引导
              </div>
              <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                点击后可追加到介入草稿。自由开局下可直接写原创地点、原创事件和原创组织。
              </div>
              {openingSource !== 'official_preset' && freeGuide?.overview ? (
                <div
                  className="mt-3 px-3 py-2 text-xs leading-relaxed"
                  style={{
                    color: 'rgba(var(--tj-text-secondary), 0.82)',
                    background: 'rgba(var(--tj-btn-primary-start), 0.05)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                    clipPath: smallClip,
                  }}
                >
                  当前地区：{selectedRegion?.name ?? '未指定'}。自由开局引导：{freeGuide.overview}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2">
                {[
                  ...((openingSource !== 'official_preset' && freeGuide) ? [...freeGuide.identityHints, ...freeGuide.entryAngles] : []),
                  '开局地点是原著之外的一处临时据点。',
                  '这里发生了一件尚未公开的支线事件。',
                  '我和某个原创组织存在临时合作或旧账。',
                  '我与某位角色已相识，但关系仍需正文确认。',
                  '我想从日常互动开始，而不是直接进入大战。',
                  '章节锚点只是背景，我有自己的调查目标。',
                  '高层角色不会无条件信任我，需要合理契机。',
                ].slice(0, 4).map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => onCustomStartPrompt(customStartPrompt.trim() ? `${customStartPrompt.trim()}\n${hint}` : hint)}
                    className="p-2.5 text-left text-xs leading-relaxed transition-transform hover:-translate-y-0.5"
                    style={{
                      color: 'rgba(var(--tj-text-primary), 0.84)',
                      background: 'rgba(var(--tj-btn-primary-start), 0.06)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                      clipPath: smallClip,
                    }}
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="继续：整理确认" />
    </div>
  );
}

export function FreeOpeningWorkshopField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[11px] font-bold tracking-[0.08em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}>
        {label}
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-[76px] w-full resize-y px-3 py-2 text-xs leading-relaxed outline-none"
        style={{
          color: 'rgb(var(--tj-text-primary))',
          background: 'rgba(var(--tj-panel-bg-end),0.55)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
          clipPath: smallClip,
        }}
      />
    </label>
  );
}

export function FreeOpeningNpcEditor({
  workshop,
  onWorkshopChange,
  onSave,
  onRemove,
}: {
  workshop: FreeOpeningWorkshopDraft;
  onWorkshopChange: (key: keyof FreeOpeningWorkshopDraft, value: string) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
}) {
  const hasDraft = Boolean(
    workshop.customNpcName.trim()
    || workshop.customNpcBackground.trim()
    || workshop.customNpcPathstrider.trim()
    || workshop.customNpcAbility.trim(),
  );

  return (
    <div
      className="p-3"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.42)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold tracking-[0.12em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))' }}>
            补充自制 NPC
          </div>
          <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
            写完后保存为独立 NPC 条目，可继续添加多个自制角色。
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!hasDraft}
          className="px-3 py-2 text-xs font-bold transition-shadow disabled:cursor-not-allowed disabled:opacity-45"
          style={{
            color: 'rgb(var(--tj-text-primary))',
            background: hasDraft ? openingActiveCardBackground : 'rgba(var(--tj-bg-primary), 0.42)',
            boxShadow: hasDraft ? openingCyanBorder : openingCardBorder,
            clipPath: smallClip,
          }}
        >
          保存 NPC
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <LabelField label="名字">
          <input
            value={workshop.customNpcName}
            onChange={(event) => onWorkshopChange('customNpcName', event.target.value)}
            placeholder="例如：接头人、守卫队长、医生、研究员"
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </LabelField>
        <LabelField label="是否为命途行者">
          <input
            value={workshop.customNpcPathstrider}
            onChange={(event) => onWorkshopChange('customNpcPathstrider', event.target.value)}
            placeholder="例如：是 / 不是 / 仅有部分命途共鸣 / 未知"
            className="kaituo-input w-full px-3 py-2 text-sm"
            style={{ clipPath: smallClip }}
          />
        </LabelField>
        <LabelField label="背景">
          <textarea
            value={workshop.customNpcBackground}
            onChange={(event) => onWorkshopChange('customNpcBackground', event.target.value)}
            placeholder="写清这个 NPC 的来历、处境、立场和与地点的关系。"
            className="kaituo-input min-h-[86px] w-full resize-y px-3 py-2 text-sm leading-relaxed"
            style={{ clipPath: smallClip }}
          />
        </LabelField>
        <LabelField label="能力">
          <textarea
            value={workshop.customNpcAbility}
            onChange={(event) => onWorkshopChange('customNpcAbility', event.target.value)}
            placeholder="写清这个 NPC 的战斗、技术、情报或特殊能力。"
            className="kaituo-input min-h-[86px] w-full resize-y px-3 py-2 text-sm leading-relaxed"
            style={{ clipPath: smallClip }}
          />
        </LabelField>
      </div>

      <div className="mt-3">
        <div className="mb-2 text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.74)' }}>
          已保存 NPC
        </div>
        {workshop.customNpcs.length ? (
          <div className="grid gap-2">
            {workshop.customNpcs.map((npc) => (
              <div
                key={npc.id}
                className="p-3 text-xs leading-relaxed"
                style={{
                  background: openingCardBackground,
                  color: 'rgba(var(--tj-text-secondary), 0.82)',
                  boxShadow: openingCardBorder,
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                      {npc.name || '未命名 NPC'}
                    </div>
                    <div className="mt-1">
                      {npc.background || '未填写背景'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {npc.pathstrider ? (
                        <span className="px-2 py-1" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))', background: 'rgba(var(--tj-btn-primary-start), 0.06)', clipPath: smallClip }}>
                          命途：{npc.pathstrider}
                        </span>
                      ) : null}
                      {npc.ability ? (
                        <span className="px-2 py-1" style={{ color: 'rgba(var(--tj-btn-primary-end), 0.86)', background: 'rgba(var(--tj-btn-primary-end), 0.08)', clipPath: smallClip }}>
                          能力：{npc.ability}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(npc.id)}
                    className="shrink-0 px-2 py-1 text-[11px]"
                    style={{
                      color: 'rgba(var(--tj-text-secondary), 0.82)',
                      background: 'rgba(var(--tj-bg-primary), 0.45)',
                      boxShadow: openingCardBorder,
                      clipPath: smallClip,
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="p-3 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.42)',
              color: 'rgba(var(--tj-text-secondary), 0.68)',
              boxShadow: openingCardBorder,
              clipPath: smallClip,
            }}
          >
            暂未保存自制 NPC。可以留空，也可以添加一个或多个只属于本开局的原创角色。
          </div>
        )}
      </div>
    </div>
  );
}

export function HistorianStep({
  customIdentity,
  onCustomIdentity,
  factionId,
  onFactionId,
  canonicalTrailblazer,
  onCanonicalTrailblazer,
  onNext,
  onBack,
}: {
  customIdentity: string;
  onCustomIdentity: (v: string) => void;
  factionId: 阵营ID;
  onFactionId: (id: 阵营ID) => void;
  canonicalTrailblazer: CanonicalTrailblazer;
  onCanonicalTrailblazer: (v: CanonicalTrailblazer) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <SectionTitle title="其他选项" subtitle="这些设定会影响世界默认认知，但不决定你怎样切入主线" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <div className="space-y-5">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              原著主角选择
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {CANONICAL_TRAILBLAZERS.map((item) => {
                const active = canonicalTrailblazer === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onCanonicalTrailblazer(item.id)}
                    className="min-h-[118px] p-4 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.12), rgba(var(--tj-btn-primary-end), 0.05))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.46), 0 0 14px rgba(var(--tj-btn-primary-start), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                      clipPath: tightClip,
                    }}
                  >
                    <div
                      className="font-serif text-base font-bold tracking-[0.14em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                    >
                      {item.title}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                      {item.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
              这里只决定原著主角在世界中的默认存在方式。玩家自己的切入方式仍在下一页「开局锚点」里书写。
            </p>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              组织背景
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {factions.map((item) => {
                const active = factionId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onFactionId(item.id)}
                    className="p-4 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.10), rgba(var(--tj-btn-primary-end), 0.04))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 12px rgba(var(--tj-btn-primary-start), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <div
                      className="font-serif text-sm font-bold tracking-[0.12em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
                    >
                      <span style={{ color: 'rgba(var(--tj-btn-primary-start), 0.76)' }}>{active ? '✓ ' : '◆ '}</span>
                      {item.name}
                    </div>
                    <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                      {item.description}
                    </div>
                    {active && item.openingHint ? (
                      <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.84), rgba(var(--tj-btn-primary-end),0.78))' }}>
                        {item.openingHint}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              自定义身份
            </div>
            <input
              value={customIdentity}
              onChange={(e) => onCustomIdentity(e.target.value)}
              placeholder="例如：空间站临时协助员、公司外勤、流浪的命途行者"
              className="kaituo-input w-full px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            />
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
              可留空。这里描述你在开局时被他人如何理解，具体怎样进入事件仍由开局锚点页的介入草稿决定。
            </p>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              游戏模式
            </div>
            <div
              className="p-4 text-sm leading-relaxed"
              style={{
                background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.08), rgba(var(--tj-btn-primary-end), 0.035))',
                color: 'rgba(var(--tj-text-secondary), 0.86)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                clipPath: smallClip,
              }}
            >
              <div className="font-serif text-base font-bold tracking-[0.14em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                原创旅人模式
              </div>
              <div className="mt-2 text-xs leading-relaxed">
                当前版本固定使用原创旅人模式。后续这里会预留「扮演原著主角」等模式入口，现在先不改变存档结构。
              </div>
              <div className="mt-3 inline-flex px-2 py-1 text-[11px] tracking-[0.16em]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))', background: 'rgba(var(--tj-btn-primary-start), 0.08)', clipPath: smallClip }}>
                预留功能
              </div>
            </div>
          </div>

          <div
            className="p-4 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.52)',
              color: 'rgba(var(--tj-text-secondary), 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
              clipPath: smallClip,
            }}
          >
            其他选项会影响世界默认认知，但不会替代开局锚点。下一页仍需要选择开局来源、地区章节，并填写玩家如何介入当前故事。
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="继续：开局锚点" />
    </div>
  );
}

export function OverviewStep({
  name,
  alias,
  gender,
  age,
  birthday,
  background,
  storyMode,
  pathId,
  pathStage,
  factionId,
  customIdentity,
  selectedScenario,
  selectedOpeningTitle,
  selectedOpeningRegionName,
  openingSource,
  freeOpeningMainlineEnabled,
  freeOpeningPlanetSource,
  customStartPrompt,
  canonicalTrailblazer,
  selectedAbilityNames,
  openingSkills,
  currentLocation,
  onStart,
  onBack,
  starting,
  openingArchiveStatus,
}: {
  name: string;
  alias: string;
  gender: string;
  age: number;
  birthday: string;
  background: string;
  storyMode: 剧情模式;
  pathId: 命途ID;
  pathStage: 命途阶段;
  factionId: 阵营ID;
  customIdentity: string;
  selectedScenario?: OpeningScenario;
  selectedOpeningTitle: string;
  selectedOpeningRegionName: string;
  openingSource: OpeningSource;
  freeOpeningMainlineEnabled: boolean;
  freeOpeningPlanetSource: FreeOpeningPlanetSource;
  customStartPrompt: string;
  canonicalTrailblazer: CanonicalTrailblazer;
  selectedAbilityNames: string[];
  openingSkills: 战技记录[];
  currentLocation: string;
  onStart: () => void;
  onBack: () => void;
  starting?: boolean;
  openingArchiveStatus?: string;
}) {
  const mode = getStoryMode(storyMode) ?? storyModes[0];
  const path = getPath(pathId);
  const selectedStage = PATH_STAGE_DEFS.find((item) => item.stage === pathStage) ?? PATH_STAGE_DEFS[0];
  const faction = getFaction(factionId) ?? factions[0];

  return (
    <div>
      <SectionTitle title="总览确认" subtitle="最后检查一遍开局是否完整" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(290px,0.85fr)]">
        <div
          className="p-4"
          style={{
            background: 'rgba(var(--tj-panel-bg-end),0.58)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
            clipPath: cardClip,
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <OverviewRow label="姓名" value={name} />
            <OverviewRow label="别名" value={alias || '未填写'} />
            <OverviewRow label="性别" value={gender || '未填写'} />
            <OverviewRow label="年龄" value={`${age}`} />
            <OverviewRow label="生日" value={birthday || '未填写'} />
            <OverviewRow label="背景故事" value={background.trim() || '未填写'} />
            <OverviewRow label="剧情模式" value={mode.name} />
            <OverviewRow label="开局来源" value={openingSource === 'official_preset' ? '官方预设' : openingSource === 'workshop' ? '创意工坊' : '自由开局'} />
            {openingSource !== 'official_preset' ? (
              <OverviewRow label="主线坐标" value={freeOpeningMainlineEnabled ? '启用' : '关闭，需在剧情编织手动启用主线'} />
            ) : null}
            {openingSource !== 'official_preset' ? (
              <OverviewRow label="地点来源" value={getFreeOpeningPlanetSourceOption(freeOpeningPlanetSource).title} />
            ) : null}
            <OverviewRow label="地区" value={selectedOpeningRegionName || '未指定'} />
            <OverviewRow label="开局锚点" value={selectedOpeningTitle || selectedScenario?.name || '未选择'} />
            <OverviewRow label="当前地点" value={currentLocation || '未指定'} />
            <OverviewRow label="原著主角" value={getCanonicalTrailblazer(canonicalTrailblazer).worldValue ?? '未指定'} />
            <OverviewRow label="命途" value={path ? `${path.name} · ${path.aeon}` : '无命途'} />
            <OverviewRow label="命途阶段" value={path ? `${selectedStage.name} · ${selectedStage.title}` : '未选择'} />
            <OverviewRow label="组织背景" value={faction.name} />
            <OverviewRow label="身份" value={customIdentity.trim() || '未填写'} />
          </div>

          <div className="mt-4 grid gap-3">
            <div
              className="p-3"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.54)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
                clipPath: smallClip,
              }}
            >
              <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
                切入说明
              </div>
              <div className="text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary),0.92)' }}>
                {customStartPrompt.trim() || '未填写'}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <OverviewLabel>能力</OverviewLabel>
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {selectedAbilityNames.length > 0 ? (
                selectedAbilityNames.map((item) => (
                  <span
                    key={item}
                    className="px-3 py-1"
                    style={{
                      background: 'rgba(var(--tj-btn-primary-start), 0.12)',
                      color: 'rgba(var(--tj-btn-primary-start), 0.95)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.24)',
                      clipPath: smallClip,
                    }}
                  >
                    {item}
                  </span>
                ))
              ) : (
                <span style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>暂未选择能力</span>
              )}
            </div>
          </div>

          <div className="mt-4">
            <OverviewLabel>开局战技</OverviewLabel>
            <div className="mt-2 grid gap-2 text-sm">
              {openingSkills.length > 0 ? (
                openingSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className="p-3"
                    style={{
                      background: 'rgba(var(--tj-bg-primary), 0.52)',
                      color: 'rgba(var(--tj-text-secondary), 0.88)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
                      clipPath: smallClip,
                    }}
                  >
                    <div className="font-medium" style={{ color: 'rgba(var(--tj-text-primary),0.95)' }}>
                      {skill.名称}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed">{skill.描述}</div>
                  </div>
                ))
              ) : (
                <span style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>暂未登记战技</span>
              )}
            </div>
          </div>

        </div>

        <div className="space-y-4">
          <div
            className="p-4"
            style={{
              background: 'linear-gradient(180deg, rgba(var(--tj-panel-bg-start), 0.95) 0%, rgba(var(--tj-panel-bg-end), 0.98) 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}>
              最终提醒
            </div>
            <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.86)' }}>
              <p>开局会把这些内容写入角色、世界状态和首回合提示词。</p>
              <p>换句话说，你现在确认的不只是外观和选择，而是整段旅程的第一页。</p>
              <p style={{ color: 'rgba(var(--tj-btn-primary-start), 0.9)' }}>开局档案会作为长期锚点写入世界状态，可以直接开始。</p>
            </div>
          </div>

          <div
            className="p-4 text-sm leading-relaxed"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.58)',
              color: 'rgba(var(--tj-text-secondary),0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
              clipPath: cardClip,
            }}
          >
            这一步确认后，后面的正文不再只是“开始游戏”，而是带着你的设定正式进入第一回合。
          </div>
        </div>
      </div>

      <StepNav
        onBack={onBack}
        onNext={onStart}
        ready={!starting}
        backLabel="返回修改"
        nextLabel={starting ? '整理开局中...' : '踏上旅途'}
      />
      {openingArchiveStatus ? (
        <div className="mt-3 text-center text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
          {openingArchiveStatus}
        </div>
      ) : null}
    </div>
  );
}
