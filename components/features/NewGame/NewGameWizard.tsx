import { useEffect, useMemo, useState } from 'react';
import { PATH_STAGE_DEFS, 创建命途进度, type 命途阶段, type 命途进度 } from '@/models/path';
import type { 开局整理档案 } from '@/models/world';
import { type 命途ID, 剧情模式, type 阵营ID } from '@/models/journey';
import { abilityPresets, openingRegions, getOfficialOpeningPresetsByRegion, getOpeningScenarioBundle, getOpeningRegion, getWorkshopOpeningTemplate, getWorkshopOpeningTemplatesByRegion, factions, getFaction, getPath, getStartingScenario, getStoryMode, startingScenarios, storyModes, workshopOpeningTemplates } from '@/data/journeyPresets';
import { 创建战技记录, 生成战技槽位摘要, 归一化战技记录, type 战技记录 } from '@/models/skill';
import type { TravelerTemplateContext, TravelerTemplateDraft } from '@/hooks/useGame';
import { devLogError } from '@/utils/devLog';
import { type Step, type CanonicalTrailblazer, type OpeningScenario, type OpeningSource, type FreeOpeningPlanetSource, type OpeningSkillSlotKey, type OpeningPresetDraft, type FreeOpeningWorkshopDraft, type FreeOpeningCustomNpc, type OpeningPlayerPreset, STEPS, MAX_OPENING_PLAYER_PRESETS, STEP_META, DEFAULT_FREE_OPENING_WORKSHOP, cardClip, smallClip, openingPageBackground, openingPageOverlay, openingPanelBackground, openingGlowLine, openingPanelShadowStrong, formatFreeOpeningWorkshopDraft, mergeFreeOpeningPrompt, toOpeningSkillSlotKey, resolveOpeningSkillSlot, sameOpeningSkillSlot, resolveSelectedScenarioPreset, formatCustomAbilityEntry, splitOpeningSkillKeywords, sanitizeOpeningPresetDraft, splitBirthday } from './wizard/wizardData';
import { MiniStat, OpeningPresetControls, ProgressBar, OpeningLedger, StepRail } from './wizard/panels';
import { CharacterStep, PathStep, SkillCreationStep, OpeningAnchorStep, HistorianStep, OverviewStep } from './wizard/steps';

interface NewGameWizardProps {
  onStart: (draft: OpeningPresetDraft) => void | Promise<void>;
  onBack: () => void;
  onLoadOpeningPresets: () => Promise<OpeningPlayerPreset[]>;
  onSaveOpeningPresets: (presets: OpeningPlayerPreset[]) => Promise<OpeningPlayerPreset[]>;
  onParseOpeningArchive: (draft: OpeningPresetDraft) => Promise<开局整理档案 | null>;
  onGenerateTravelerTemplate?: (context: TravelerTemplateContext) => Promise<TravelerTemplateDraft>;
}

export function NewGameWizard({ onStart, onBack, onLoadOpeningPresets, onSaveOpeningPresets, onParseOpeningArchive, onGenerateTravelerTemplate }: NewGameWizardProps) {
  const [step, setStep] = useState<Step>('character');
  const [openingPresets, setOpeningPresets] = useState<OpeningPlayerPreset[]>([]);
  const [openingSource, setOpeningSource] = useState<OpeningSource>('official_preset');
  const [freeOpeningMainlineEnabled, setFreeOpeningMainlineEnabled] = useState(true);
  const [freeOpeningPlanetSource, setFreeOpeningPlanetSource] = useState<FreeOpeningPlanetSource>('existing');
  const [freeOpeningWorkshop, setFreeOpeningWorkshop] = useState<FreeOpeningWorkshopDraft>(DEFAULT_FREE_OPENING_WORKSHOP);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetStatus, setPresetStatus] = useState('');

  const [storyMode, setStoryMode] = useState<剧情模式>('normal');

  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState(20);
  const [birthday, setBirthday] = useState('');
  const [appearance, setAppearance] = useState('');
  const [personality, setPersonality] = useState('');
  const [background, setBackground] = useState('');

  const [pathId, setPathId] = useState<命途ID>('none');
  const [pathStage, setPathStage] = useState<命途阶段>(0);
  const [factionId, setFactionId] = useState<阵营ID>('none');
  const [customIdentity, setCustomIdentity] = useState('');
  const [selectedAbilityIds, setSelectedAbilityIds] = useState<string[]>([]);
  const [customAbilityNameDraft, setCustomAbilityNameDraft] = useState('');
  const [customAbilityEffectDraft, setCustomAbilityEffectDraft] = useState('');
  const [customAbilities, setCustomAbilities] = useState<string[]>([]);
  const [openingSkills, setOpeningSkills] = useState<战技记录[]>([]);
  const [openingSkillNameDraft, setOpeningSkillNameDraft] = useState('');
  const [openingSkillDescDraft, setOpeningSkillDescDraft] = useState('');
  const [openingSkillSourceDraft, setOpeningSkillSourceDraft] = useState('');
  const [openingSkillKeywordsDraft, setOpeningSkillKeywordsDraft] = useState('');
  const [openingSkillCostDraft, setOpeningSkillCostDraft] = useState('');
  const [openingSkillCooldownDraft, setOpeningSkillCooldownDraft] = useState('');
  const [openingSkillNoteDraft, setOpeningSkillNoteDraft] = useState('');
  const [openingSkillSlotKey, setOpeningSkillSlotKey] = useState<OpeningSkillSlotKey>('normal:1');

  const [startingScenarioId, setStartingScenarioId] = useState<string>(
    startingScenarios[0]?.id ?? '',
  );
  const [selectedWorkshopTemplateId, setSelectedWorkshopTemplateId] = useState(workshopOpeningTemplates[0]?.id ?? '');
  const [canonicalTrailblazer, setCanonicalTrailblazer] = useState<CanonicalTrailblazer>('stelle');
  const [customStartPrompt, setCustomStartPrompt] = useState('');
  const [startingGame, setStartingGame] = useState(false);
const [openingArchiveStatus, setOpeningArchiveStatus] = useState('');
  const birthdayParts = useMemo(() => splitBirthday(birthday), [birthday]);

  useEffect(() => {
    const rootElement = document.getElementById('root');
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyOverflowX = document.body.style.overflowX;
    const previousBodyOverflowY = document.body.style.overflowY;
    const previousBodyOverscroll = document.body.style.overscrollBehavior;
    const previousRootHeight = document.documentElement.style.height;
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousAppRootHeight = rootElement?.style.height ?? '';
    const previousAppRootOverflow = rootElement?.style.overflow ?? '';
    const previousBodyHeight = document.body.style.height;
    document.body.style.overflow = 'hidden';
    document.body.style.overflowX = 'hidden';
    document.body.style.overflowY = 'hidden';
    document.body.style.overscrollBehavior = 'auto';
    document.documentElement.style.height = '100%';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.height = '100%';
    if (rootElement) {
      rootElement.style.height = '100%';
      rootElement.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overflowX = previousBodyOverflowX;
      document.body.style.overflowY = previousBodyOverflowY;
      document.body.style.overscrollBehavior = previousBodyOverscroll;
      document.documentElement.style.height = previousRootHeight;
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.height = previousBodyHeight;
      if (rootElement) {
        rootElement.style.height = previousAppRootHeight;
        rootElement.style.overflow = previousAppRootOverflow;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    onLoadOpeningPresets()
      .then((presets) => {
        if (cancelled) return;
        setOpeningPresets(presets);
        if (presets.length > 0) {
          setSelectedPresetId(presets[0].id);
          setPresetNameDraft(presets[0].title);
        }
      })
      .catch((err: unknown) => {
        devLogError('save', '开局预设读取失败', err);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoadOpeningPresets]);

  const storyModeDef = useMemo(
    () => getStoryMode(storyMode) ?? storyModes[0],
    [storyMode],
  );
  const selectedPath = useMemo(() => getPath(pathId), [pathId]);
  const selectedPathStage = useMemo(
    () => PATH_STAGE_DEFS.find((item) => item.stage === pathStage) ?? PATH_STAGE_DEFS[0],
    [pathStage],
  );
  const openingSkillSlots = useMemo(
    () => 生成战技槽位摘要(
      pathId !== 'none'
        ? [{
            ...创建命途进度(pathId, true, '开局承载', `初始阶段：${selectedPathStage.name}`),
            阶段: pathStage,
          } satisfies 命途进度]
        : [],
      openingSkills,
    ),
    [openingSkills, pathId, pathStage, selectedPathStage.name],
  );
  const openingSelectedSlot = useMemo(
    () => resolveOpeningSkillSlot(openingSkillSlots, openingSkillSlotKey) ?? openingSkillSlots.at(0),
    [openingSkillSlotKey, openingSkillSlots],
  );

  const [prevOpeningSkillSlotKey, setPrevOpeningSkillSlotKey] = useState(openingSkillSlotKey);
  const [prevOpeningSkillSlots, setPrevOpeningSkillSlots] = useState(openingSkillSlots);
  if (prevOpeningSkillSlotKey !== openingSkillSlotKey || prevOpeningSkillSlots !== openingSkillSlots) {
    setPrevOpeningSkillSlotKey(openingSkillSlotKey);
    setPrevOpeningSkillSlots(openingSkillSlots);
    if (!resolveOpeningSkillSlot(openingSkillSlots, openingSkillSlotKey) && openingSkillSlots[0]) {
      setOpeningSkillSlotKey(toOpeningSkillSlotKey(openingSkillSlots[0]));
    }
  }
  const selectedFaction = useMemo(() => getFaction(factionId) ?? factions[0], [factionId]);
  const selectedScenario = useMemo<OpeningScenario | undefined>(
    () => getStartingScenario(startingScenarioId),
    [startingScenarioId],
  );
  const selectedScenarioPreset = useMemo(
    () => resolveSelectedScenarioPreset(startingScenarioId, selectedScenario),
    [selectedScenario, startingScenarioId],
  );
  const selectedScenarioBundle = useMemo(() => getOpeningScenarioBundle(startingScenarioId), [startingScenarioId]);
  const selectedRegionId =
    selectedScenarioBundle.region?.id
    ?? selectedScenarioPreset?.regionId
    ?? openingRegions.at(0)?.id
    ?? 'herta_space_station';
  const selectedOpeningRegion = getOpeningRegion(selectedRegionId) ?? openingRegions.at(0);
  const selectedOpeningDate = selectedScenarioPreset?.referenceDate ?? '琥珀纪 2157.03.07';
  const selectedOpeningTime = selectedScenarioPreset?.referenceTime ?? '06:40';
  const selectedOpeningLocation =
    selectedScenarioPreset?.defaultLocationHint
    ?? selectedScenarioBundle.chapter?.defaultLocationHint
    ?? selectedScenario?.name
    ?? '黑塔空间站';
  const selectedOpeningTitle =
    selectedScenarioPreset?.title
    ?? (selectedScenarioBundle.region && selectedScenarioBundle.chapter
      ? `${selectedScenarioBundle.region.name} · ${selectedScenarioBundle.chapter.name}`
      : selectedScenario?.name)
    ?? '未选择';

  const currentPresetDraft = useMemo<OpeningPresetDraft>(
    () => ({
      openingSource,
      freeOpeningMainlineEnabled,
      freeOpeningPlanetSource,
      freeOpeningWorkshop,
      storyMode,
      name,
      alias,
      gender,
      age,
      birthday,
      appearance,
      personality,
      background,
      pathId,
      pathStage,
      factionId,
      customIdentity,
      selectedAbilityIds,
      customAbilities,
      openingSkills,
      startingScenarioId,
      selectedWorkshopTemplateId,
      canonicalTrailblazer,
      customStartPrompt,
      parsedArchive: null,
    }),
    [
      alias,
      appearance,
      background,
      birthday,
      canonicalTrailblazer,
      customAbilities,
      customIdentity,
      customStartPrompt,
      factionId,
      gender,
      freeOpeningMainlineEnabled,
      freeOpeningPlanetSource,
      freeOpeningWorkshop,
      age,
      name,
      openingSource,
      pathId,
      pathStage,
      personality,
      selectedAbilityIds,
      selectedWorkshopTemplateId,
      startingScenarioId,
      storyMode,
      openingSkills,
    ],
  );

  const selectedAbilityNames = useMemo(
    () => [
      ...selectedAbilityIds
        .map((id) => abilityPresets.find((ability) => ability.id === id)?.name)
        .filter((text): text is string => Boolean(text)),
      ...customAbilities,
    ],
    [customAbilities, selectedAbilityIds],
  );
  const openingHighlights = selectedScenarioPreset?.openingPressure ?? selectedScenarioBundle.chapter?.openingPressure ?? selectedScenario?.openingHighlights ?? [];
  const effectiveFreeMainlineEnabled = openingSource === 'official_preset' || freeOpeningMainlineEnabled;
  const freeOpeningWorkshopText = useMemo(() => formatFreeOpeningWorkshopDraft(freeOpeningWorkshop, freeOpeningPlanetSource), [freeOpeningPlanetSource, freeOpeningWorkshop]);
  const effectiveCustomStartPrompt = useMemo(
    () => mergeFreeOpeningPrompt(customStartPrompt, openingSource !== 'official_preset' ? freeOpeningWorkshopText : ''),
    [customStartPrompt, freeOpeningWorkshopText, openingSource],
  );

  const selectOpeningSource = (source: OpeningSource) => {
    setOpeningSource(source);
    if (source === 'workshop') {
      const template =
        getWorkshopOpeningTemplate(selectedWorkshopTemplateId)
        ?? getWorkshopOpeningTemplatesByRegion(selectedRegionId).at(0)
        ?? workshopOpeningTemplates.at(0);
      if (!template) return;
      setSelectedWorkshopTemplateId(template.id);
      setStartingScenarioId(template.chapterId);
      if (!customStartPrompt.trim()) setCustomStartPrompt(template.playerEntryTemplate);
    }
  };

  const updateFreeOpeningWorkshop = (key: keyof FreeOpeningWorkshopDraft, value: string) => {
    setFreeOpeningWorkshop((prev) => ({ ...prev, [key]: value }));
  };

  const saveFreeOpeningCustomNpc = () => {
    const name = freeOpeningWorkshop.customNpcName.trim();
    const background = freeOpeningWorkshop.customNpcBackground.trim();
    const pathstrider = freeOpeningWorkshop.customNpcPathstrider.trim();
    const ability = freeOpeningWorkshop.customNpcAbility.trim();
    if (!name || !background) {
      window.alert('请至少填写自制 NPC 的名字和背景。');
      return;
    }
    const nextNpc: FreeOpeningCustomNpc = {
      id: `opening_npc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      background,
      pathstrider,
      ability,
    };
    setFreeOpeningWorkshop((prev) => ({
      ...prev,
      customNpcName: '',
      customNpcBackground: '',
      customNpcPathstrider: '',
      customNpcAbility: '',
      customNpcs: [...prev.customNpcs, nextNpc].slice(0, 12),
    }));
  };

  const removeFreeOpeningCustomNpc = (id: string) => {
    setFreeOpeningWorkshop((prev) => ({
      ...prev,
      customNpcs: prev.customNpcs.filter((npc) => npc.id !== id),
    }));
  };

  const selectOpeningRegion = (regionId: string) => {
    if (openingSource === 'workshop') {
      const template = getWorkshopOpeningTemplatesByRegion(regionId).at(0);
      if (template) {
        selectWorkshopTemplate(template.id);
        return;
      }
    }
    const officialPreset = getOfficialOpeningPresetsByRegion(regionId).at(0);
    if (officialPreset) {
      setStartingScenarioId(officialPreset.chapterId);
      return;
    }
    const scenario = startingScenarios.find((item) => getOpeningScenarioBundle(item.id).region?.id === regionId);
    if (scenario) setStartingScenarioId(scenario.id);
  };

  const selectWorkshopTemplate = (templateId: string) => {
    const template = getWorkshopOpeningTemplate(templateId);
    if (!template) return;
    setOpeningSource('workshop');
    setSelectedWorkshopTemplateId(template.id);
    setStartingScenarioId(template.chapterId);
    setCustomStartPrompt(template.playerEntryTemplate);
  };

  const toggleAbility = (id: string) => {
    setSelectedAbilityIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const addCustomAbility = () => {
    const name = customAbilityNameDraft.trim();
    const effect = customAbilityEffectDraft.trim();
    if (!name || !effect) {
      window.alert('请先填写自定义特质名称和效果。');
      return;
    }
    const nextText = formatCustomAbilityEntry(name, effect);
    setCustomAbilities((prev) => (prev.includes(nextText) ? prev : [...prev, nextText]));
    setCustomAbilityNameDraft('');
    setCustomAbilityEffectDraft('');
  };

  const removeCustomAbility = (text: string) => {
    setCustomAbilities((prev) => prev.filter((x) => x !== text));
  };

  const addOpeningSkill = () => {
    if (!openingSelectedSlot) {
      window.alert('请先选择一个战技槽位。');
      return;
    }
    const skillName = openingSkillNameDraft.trim();
    const skillDescription = openingSkillDescDraft.trim();
    if (!skillName || !skillDescription) {
      window.alert('请先填写开局战技名称和描述。');
      return;
    }
    const nextSkill = 归一化战技记录(
      创建战技记录({
        名称: skillName,
        类别: openingSelectedSlot.kind === 'normal' ? '普通' : '命途',
        槽位类型: openingSelectedSlot.kind,
        槽位序号: openingSelectedSlot.slotIndex,
        描述: skillDescription,
        来源: openingSkillSourceDraft.trim() || (openingSelectedSlot.kind === 'normal' ? '开局预设 · 普通槽' : '开局预设 · 命途槽'),
        关联命途: openingSelectedSlot.pathId,
        关联阶段: openingSelectedSlot.pathStage,
        关键词: splitOpeningSkillKeywords(openingSkillKeywordsDraft),
        消耗: openingSkillCostDraft.trim(),
        冷却: openingSkillCooldownDraft.trim(),
        备注: openingSkillNoteDraft.trim(),
      }),
    );
    setOpeningSkills((prev) => {
      const withoutSameSlot = prev.filter((skill) => !sameOpeningSkillSlot(skill, nextSkill));
      return [...withoutSameSlot, nextSkill].slice(0, 8);
    });
    setOpeningSkillNameDraft('');
    setOpeningSkillDescDraft('');
    setOpeningSkillSourceDraft('');
    setOpeningSkillKeywordsDraft('');
    setOpeningSkillCostDraft('');
    setOpeningSkillCooldownDraft('');
    setOpeningSkillNoteDraft('');
  };

  const removeOpeningSkill = (skillId: string) => {
    setOpeningSkills((prev) => prev.filter((skill) => skill.id !== skillId));
  };

  const toggleOpeningSkill = (skillId: string) => {
    setOpeningSkills((prev) =>
      prev.map((skill) =>
        skill.id === skillId
          ? 归一化战技记录({ ...skill, 已启用: skill.已启用 === false, 更新时间: Date.now() })
          : skill,
      ),
    );
  };

  const persistOpeningPresets = async (nextPresets: OpeningPlayerPreset[]) => {
    const normalized = await onSaveOpeningPresets(nextPresets);
    setOpeningPresets(normalized);
  };

  const applyOpeningPreset = (presetId: string) => {
    const preset = openingPresets.find((item) => item.id === presetId);
    if (!preset) return;
    const draft = sanitizeOpeningPresetDraft(preset.draft);
    setOpeningSource(draft.openingSource);
    setFreeOpeningMainlineEnabled(draft.freeOpeningMainlineEnabled);
    setFreeOpeningPlanetSource(draft.freeOpeningPlanetSource);
    setFreeOpeningWorkshop(draft.freeOpeningWorkshop);
    setStoryMode(draft.storyMode);
    setName(draft.name);
    setAlias(draft.alias);
    setGender(draft.gender);
    setAge(draft.age);
    setBirthday(draft.birthday);
    setAppearance(draft.appearance);
    setPersonality(draft.personality);
    setBackground(draft.background);
    setPathId(draft.pathId);
    setPathStage(draft.pathStage);
    setFactionId(draft.factionId);
    setCustomIdentity(draft.customIdentity);
    setSelectedAbilityIds(draft.selectedAbilityIds);
    setCustomAbilities(draft.customAbilities);
    setOpeningSkills(draft.openingSkills);
    setOpeningSkillNameDraft('');
    setOpeningSkillDescDraft('');
    setOpeningSkillSourceDraft('');
    setOpeningSkillKeywordsDraft('');
    setOpeningSkillCostDraft('');
    setOpeningSkillCooldownDraft('');
    setOpeningSkillNoteDraft('');
    setCustomAbilityNameDraft('');
    setCustomAbilityEffectDraft('');
    setStartingScenarioId(draft.startingScenarioId);
    setSelectedWorkshopTemplateId(draft.selectedWorkshopTemplateId);
    setCanonicalTrailblazer(draft.canonicalTrailblazer);
    setCustomStartPrompt(draft.customStartPrompt);
    setSelectedPresetId(preset.id);
    setPresetNameDraft(preset.title);
    setPresetStatus(`已套用预设：${preset.title}`);
  };

  const saveCurrentOpeningPreset = async () => {
    const title = (presetNameDraft.trim() || name.trim() || alias.trim() || '未命名开局预设').slice(0, 32);
    const existingBySelected = openingPresets.find((item) => item.id === selectedPresetId);
    const existingByTitle = openingPresets.find((item) => item.title === title);
    const id = existingBySelected?.id ?? existingByTitle?.id ?? `opening-${Date.now().toString(36)}`;
    const nextPreset: OpeningPlayerPreset = {
      id,
      title,
      updatedAt: Date.now(),
      draft: currentPresetDraft,
    };
    const nextPresets = [
      nextPreset,
      ...openingPresets.filter((item) => item.id !== id && item.title !== title),
    ].slice(0, MAX_OPENING_PLAYER_PRESETS);
    try {
      await persistOpeningPresets(nextPresets);
      setSelectedPresetId(id);
      setPresetNameDraft(title);
      setPresetStatus(`已保存预设：${title}`);
    } catch (err) {
      devLogError('save', '开局预设保存失败', err);
      setPresetStatus('保存失败，请稍后再试');
    }
  };

  const deleteSelectedOpeningPreset = async () => {
    if (!selectedPresetId) return;
    const target = openingPresets.find((item) => item.id === selectedPresetId);
    const nextPresets = openingPresets.filter((item) => item.id !== selectedPresetId);
    try {
      await persistOpeningPresets(nextPresets);
      setSelectedPresetId(nextPresets[0]?.id ?? '');
      setPresetNameDraft(nextPresets[0]?.title ?? '');
      setPresetStatus(target ? `已删除预设：${target.title}` : '已删除预设');
    } catch (err) {
      devLogError('save', '开局预设删除失败', err);
      setPresetStatus('删除失败，请稍后再试');
    }
  };

  const handlePathChange = (nextPathId: 命途ID) => {
    setPathId(nextPathId);
    if (nextPathId === 'none') setPathStage(0);
  };

  const handleStart = async () => {
    if (startingGame) return;
    setStartingGame(true);
    setOpeningArchiveStatus('');
    try {
      const draft: OpeningPresetDraft = { ...currentPresetDraft };
      if (draft.openingSource !== 'official_preset') {
        setOpeningArchiveStatus('正在整理开局档案...');
        try {
          const parsedArchive = await onParseOpeningArchive(draft);
          if (parsedArchive) {
            draft.parsedArchive = parsedArchive;
            setOpeningArchiveStatus('开局档案已整理。');
          }
        } catch (err) {
          devLogError('net', 'AI 开局整理失败，改用本地整理兜底', err);
          setOpeningArchiveStatus('开局整理失败，已改用本地兜底。');
        }
      }
      await onStart(draft);
    } finally {
      setStartingGame(false);
    }
  };

  const characterReady = name.trim().length > 0;

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goPrev = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const openWorkshopEntry = () => {
    window.alert('创意工坊后续会作为独立页面开放，可能需要登录后获取玩家内容。');
  };

  return (
    <div
      className="opening-terminal-shell opening-enter relative h-[100dvh] overflow-y-auto overflow-x-clip p-[18px] pb-[calc(var(--app-safe-bottom,0px)+18px)]"
style={{
  background: openingPageBackground,
}}
    >
      <style>{`
        @keyframes openingRain {
          from { transform: translateY(-22%); opacity: .1; }
          10% { opacity: .54; }
          to { transform: translateY(130vh); opacity: .18; }
        }
        @keyframes openingSweep {
          to { transform: translateY(calc(100vh + 220px)); }
        }
        @keyframes openingGridFlow {
          to { background-position: 0 44px, 44px 0; }
        }
        @keyframes openingLightDrift {
          to { transform: translate3d(7%, 2%, 0); }
        }
        @keyframes openingSpin {
          to { transform: rotate(360deg); }
        }
@keyframes openingDash {
  to { stroke-dashoffset: -440; }
}
@keyframes openingBootFade {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes openingBootFadeLeft {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes openingBootFadeRight {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}
.opening-terminal-shell.opening-enter .opening-stagger-header {
  animation: openingBootFade 0.38s ease-out both;
}
.opening-terminal-shell.opening-enter .opening-stagger-left {
  animation: openingBootFadeLeft 0.38s ease-out 0.12s both;
}
.opening-terminal-shell.opening-enter .opening-stagger-center {
  animation: openingBootFade 0.38s ease-out 0.22s both;
}
.opening-terminal-shell.opening-enter .opening-stagger-right {
  animation: openingBootFadeRight 0.38s ease-out 0.32s both;
}
.opening-terminal-shell .kaituo-btn-primary {
          background: linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.98), rgba(var(--tj-btn-primary-end), 0.88));
          color: rgb(var(--tj-bg-primary));
          box-shadow:
            inset 0 0 0 1px rgba(var(--tj-text-primary),0.38),
            0 0 22px rgba(var(--tj-btn-primary-start), 0.18);
        }
        .opening-terminal-shell .kaituo-btn-primary:hover {
          box-shadow:
            inset 0 0 0 1px rgba(var(--tj-text-primary),0.55),
            0 0 30px rgba(var(--tj-btn-primary-start), 0.28);
        }
        .opening-terminal-shell .kaituo-btn-primary:disabled {
          background: linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.42), rgba(var(--tj-btn-primary-end), 0.28));
          color: rgba(var(--tj-bg-primary), 0.58);
          box-shadow:
            inset 0 0 0 1px rgba(var(--tj-text-primary),0.18);
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-[-20%]"
        style={{
          background:
            'linear-gradient(115deg, transparent 0 36%, rgba(var(--tj-btn-primary-start), 0.10) 38%, transparent 42% 100%), linear-gradient(70deg, transparent 0 58%, rgba(var(--tj-btn-primary-end), 0.09) 60%, transparent 64% 100%)',
          transform: 'translate3d(-5%, 0, 0)',
          animation: 'openingLightDrift 9s ease-in-out infinite alternate',
        }}
      />

      <div className="pointer-events-none absolute inset-0 opacity-[0.52]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: openingPageOverlay,
            backgroundSize: '42px 42px',
            maskImage: 'linear-gradient(180deg, transparent, #000 10%, #000 82%, transparent)',
          }}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-x-[-12%] bottom-[-22%] hidden h-[46vh] opacity-[0.52] lg:block"
        style={{
          backgroundImage: openingPageOverlay,
          backgroundSize: '44px 44px',
          transform: 'perspective(560px) rotateX(62deg)',
          transformOrigin: 'bottom',
          animation: 'openingGridFlow 4.2s linear infinite',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.34]"
        style={{
          background:
            'repeating-linear-gradient(180deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 4px), linear-gradient(180deg, transparent, rgba(var(--tj-btn-primary-start), 0.06), transparent)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        className="pointer-events-none absolute left-0 right-0 top-[-140px] h-[120px]"
        style={{
          background:
            'linear-gradient(180deg, transparent, rgba(var(--tj-btn-primary-start), 0.16), rgba(var(--tj-btn-primary-end), 0.08), transparent)',
          animation: 'openingSweep 7s linear infinite',
        }}
      />
      <div className="pointer-events-none absolute right-[-16vw] top-[-18vw] hidden h-[52vw] min-h-[520px] w-[52vw] min-w-[520px] rounded-full border border-[rgba(var(--tj-btn-primary-start),0.16)] shadow-[inset_0_0_46px_rgba(var(--tj-btn-primary-start),0.05),_0_0_50px_rgba(var(--tj-btn-primary-start),0.08)] lg:block">
        <div className="absolute inset-[9%] rounded-full border border-dashed border-[rgba(var(--tj-btn-primary-end),0.18)]" />
        <div
          className="absolute inset-[22%] rounded-full border border-[rgba(var(--tj-btn-primary-start),0.13)]"
          style={{ animation: 'openingSpin 16s linear infinite' }}
        />
      </div>
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-[0.43]">
        {[
          ['4%', '-1s', 'AETHER-07\nANCHOR:LUOFU\nSYNC 92.4\nNPC_REF:6\nPATH: HUNT\nMEM SEED OK'],
          ['18%', '-5s', 'OPENING\nSOURCE:FREE\nCLOCK 06:40\nWORLD GATE\nZHIKU READY\nCOT ROUTE'],
          ['39%', '-8s', 'STATION\nMAP LOAD\nREGION ID\nQUEST SNAP\nVECTOR 31\nFRAME 04'],
          ['63%', '-3s', 'PROFILE\nTRAIL\nSKILL 03\nARCHIVE\nSAFETY OK\nLEDGER'],
          ['82%', '-7s', 'CANON\nNO RESET\nNO RETURN\nHERTA LOCK\nSOFT ANCHOR\nLIVE'],
        ].map(([left, delay, text]) => (
          <div
            key={left}
            className="absolute top-[-40vh] w-[72px] whitespace-pre-line font-mono text-[11px] leading-[1.75] text-[rgba(var(--tj-btn-primary-start),0.56)]"
            style={{
              left,
              textShadow: '0 0 10px rgba(var(--tj-btn-primary-start), 0.32)',
              animation: `openingRain 12s linear infinite ${delay}`,
            }}
          >
            {text}
          </div>
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 top-[14%] hidden h-px opacity-[0.55] lg:block"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-btn-primary-start), 0.16), transparent)' }}
      />

      <div className="opening-boot-scan pointer-events-none absolute inset-x-0 top-0 z-50 h-[2px]"
  style={{
    background: `linear-gradient(90deg, transparent, rgba(var(--tj-btn-primary-start), 0.7), rgba(var(--tj-btn-primary-end), 0.4), transparent)`,
    boxShadow: `0 0 12px rgba(var(--tj-btn-primary-start), 0.3), 0 2px 40px rgba(var(--tj-btn-primary-start), 0.15)`,
  }}
/>
<main className="relative z-10 mx-auto flex min-h-[calc(100dvh-36px)] w-full flex-col gap-[14px]">
        <header
          className="grid min-h-[78px] shrink-0 gap-4 px-[18px] py-[14px] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          style={{
            background:
              'linear-gradient(90deg, rgba(var(--tj-ui-panel), 0.90), rgba(var(--tj-panel-bg-start), 0.76)), linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.12), transparent 48%, rgba(var(--tj-btn-primary-end), 0.09))',
            boxShadow: openingPanelShadowStrong,
            backdropFilter: 'blur(5px)',
            clipPath: cardClip,
          }}
        >
          <div className="min-w-0">
            <button
              onClick={onBack}
              className="mb-2 w-fit text-[11px] tracking-[0.28em] transition-opacity hover:opacity-80"
              style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}
            >
              ← 返回
            </button>
            <div className="text-[11px] tracking-[0.38em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.58)' }}>
              KAI TUO TERMINAL / OPENING BRIEFING
            </div>
            <h1
              className="mt-1 font-serif text-2xl font-bold tracking-[0.12em] sm:text-3xl sm:tracking-[0.18em]"
              style={{
                color: 'rgba(var(--tj-text-primary),0.98)',
                textShadow: '0 0 18px rgba(var(--tj-btn-primary-end), 0.22)',
              }}
            >
              踏上旅途 · 星轨档案终端
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
              新版开局不再只是选择一段开场白，而是建立玩家、命途、介入方式与长期世界锚点。
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 md:w-[450px]">
            <MiniStat label="开局来源" value={openingSource === 'official_preset' ? '官方预设' : '自由开局'} />
            <MiniStat label="地区锚点" value={selectedOpeningRegion?.name ?? '未指定'} />
            <MiniStat label="档案状态" value={openingArchiveStatus || '待整理'} />
          </div>
        </header>

        <section className="grid items-start gap-[14px] lg:grid-cols-[258px_minmax(0,1fr)_334px]">
          <aside className="hidden lg:block">
            <StepRail step={step} onStepChange={setStep} />
          </aside>

          <div
            className="relative flex min-w-0 flex-col p-0"
            style={{
              background: openingPanelBackground,
              boxShadow: openingPanelShadowStrong,
              backdropFilter: 'blur(5px)',
              clipPath: cardClip,
            }}
          >
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 h-px"
              style={{ background: openingGlowLine }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.18]"
              style={{
                background:
                  'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.25), transparent 18% 82%, rgba(var(--tj-btn-primary-end), 0.18)), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 30%)',
              }}
            />
            <div className="relative flex min-h-full flex-col">
              <div className="border-b border-[rgba(var(--tj-btn-primary-end),0.16)] px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] tracking-[0.32em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.62)' }}>
                      STEP {String(STEPS.indexOf(step) + 1).padStart(2, '0')} / {STEP_META[step].title.toUpperCase()}
                    </div>
                    <h2 className="mt-1 font-serif text-2xl font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary),0.96)' }}>
                      {STEP_META[step].title}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                      {STEP_META[step].subtitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openWorkshopEntry}
                    className="shrink-0 px-3 py-2 text-[11px] font-bold tracking-[0.18em] transition-shadow hover:shadow-[0_0_16px_rgba(var(--tj-btn-primary-start),0.16)]"
                    style={{
                      color: 'rgba(var(--tj-text-secondary), 0.78)',
                      background: 'rgba(var(--tj-surface-strong), 0.46)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
                      clipPath: smallClip,
                    }}
                    title="后续作为独立页面开放"
                  >
                    创意工坊
                  </button>
                </div>
              </div>

              <div className="mb-4 min-w-0 overflow-x-auto kaituo-options-scroll px-4 lg:hidden">
                <ProgressBar step={step} />
              </div>

              <div
                className="px-4 pb-4 pt-4"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(var(--tj-ui-panel-strong), 0.20), rgba(var(--tj-bg-primary), 0.04))',
                }}
              >
                <div className="mb-4">
                  <OpeningPresetControls
                    presets={openingPresets}
                    selectedPresetId={selectedPresetId}
                    presetNameDraft={presetNameDraft}
                    status={presetStatus}
                    onPresetNameDraft={setPresetNameDraft}
                    onSelectPreset={setSelectedPresetId}
                    onApplyPreset={applyOpeningPreset}
                    onSavePreset={() => void saveCurrentOpeningPreset()}
                    onDeletePreset={() => void deleteSelectedOpeningPreset()}
                  />
                </div>
            {step === 'character' && (
              <CharacterStep
                name={name}
                onName={setName}
                alias={alias}
                onAlias={setAlias}
                gender={gender}
                onGender={setGender}
                age={age}
                onAge={setAge}
                birthday={birthday}
                birthdayMonth={birthdayParts.month}
                birthdayDay={birthdayParts.day}
                onBirthday={setBirthday}
                appearance={appearance}
                onAppearance={setAppearance}
                personality={personality}
                onPersonality={setPersonality}
                background={background}
                onBackground={setBackground}
                storyModeName={storyModeDef.name}
                templateOpeningContext={{
                  openingSourceLabel: openingSource === 'workshop' ? '创意工坊' : openingSource === 'free' ? '自由开局' : '官方预设',
                  openingRegionName: selectedOpeningRegion?.name,
                  openingChapterName: selectedScenarioPreset?.chapterName ?? selectedScenarioBundle.chapter?.name ?? selectedScenario?.name,
                  openingLocationHint: selectedOpeningLocation,
                  openingMainlineEnabled: effectiveFreeMainlineEnabled,
                  openingEntryText: effectiveCustomStartPrompt,
                }}
                onGenerateTemplate={onGenerateTravelerTemplate}
                onNext={goNext}
                onBack={goPrev}
                ready={characterReady}
              />
            )}

            {step === 'path' && (
              <PathStep
                pathId={pathId}
                pathStage={pathStage}
                onPath={handlePathChange}
                onPathStage={setPathStage}
                selectedAbilityIds={selectedAbilityIds}
                onToggleAbility={toggleAbility}
                customAbilities={customAbilities}
                customAbilityNameDraft={customAbilityNameDraft}
                customAbilityEffectDraft={customAbilityEffectDraft}
                onCustomAbilityNameDraft={setCustomAbilityNameDraft}
                onCustomAbilityEffectDraft={setCustomAbilityEffectDraft}
                onAddCustomAbility={addCustomAbility}
                onRemoveCustomAbility={removeCustomAbility}
                onNext={goNext}
                onBack={goPrev}
              />
            )}

            {step === 'skill' && (
              <SkillCreationStep
                openingSkills={openingSkills}
                openingSkillSlots={openingSkillSlots}
                selectedSlotKey={openingSkillSlotKey}
                selectedSlot={openingSelectedSlot}
                selectedPathId={pathId}
                selectedPathStage={pathStage}
                openingSkillNameDraft={openingSkillNameDraft}
                openingSkillDescDraft={openingSkillDescDraft}
                openingSkillSourceDraft={openingSkillSourceDraft}
                openingSkillKeywordsDraft={openingSkillKeywordsDraft}
                openingSkillCostDraft={openingSkillCostDraft}
                openingSkillCooldownDraft={openingSkillCooldownDraft}
                openingSkillNoteDraft={openingSkillNoteDraft}
                onSelectedSlotKey={setOpeningSkillSlotKey}
                onOpeningSkillNameDraft={setOpeningSkillNameDraft}
                onOpeningSkillDescDraft={setOpeningSkillDescDraft}
                onOpeningSkillSourceDraft={setOpeningSkillSourceDraft}
                onOpeningSkillKeywordsDraft={setOpeningSkillKeywordsDraft}
                onOpeningSkillCostDraft={setOpeningSkillCostDraft}
                onOpeningSkillCooldownDraft={setOpeningSkillCooldownDraft}
                onOpeningSkillNoteDraft={setOpeningSkillNoteDraft}
                onAddOpeningSkill={addOpeningSkill}
                onToggleOpeningSkill={toggleOpeningSkill}
                onRemoveOpeningSkill={removeOpeningSkill}
                onNext={goNext}
                onBack={goPrev}
              />
            )}

            {step === 'world' && (
              <OpeningAnchorStep
                storyMode={storyMode}
                onStoryMode={setStoryMode}
                startingScenarioId={startingScenarioId}
                onStartingScenarioId={setStartingScenarioId}
                selectedRegionId={selectedRegionId}
                onOpeningRegion={selectOpeningRegion}
                selectedWorkshopTemplateId={selectedWorkshopTemplateId}
                onSelectedWorkshopTemplateId={selectWorkshopTemplate}
                openingSource={openingSource}
                onOpeningSource={selectOpeningSource}
                freeOpeningMainlineEnabled={freeOpeningMainlineEnabled}
                onFreeOpeningMainlineEnabled={setFreeOpeningMainlineEnabled}
                freeOpeningPlanetSource={freeOpeningPlanetSource}
                onFreeOpeningPlanetSource={setFreeOpeningPlanetSource}
                freeOpeningWorkshop={freeOpeningWorkshop}
                onFreeOpeningWorkshop={updateFreeOpeningWorkshop}
                onSaveFreeOpeningCustomNpc={saveFreeOpeningCustomNpc}
                onRemoveFreeOpeningCustomNpc={removeFreeOpeningCustomNpc}
                customStartPrompt={customStartPrompt}
                onCustomStartPrompt={setCustomStartPrompt}
                onNext={goNext}
                onBack={goPrev}
              />
            )}

            {step === 'historian' && (
              <HistorianStep
                customIdentity={customIdentity}
                onCustomIdentity={setCustomIdentity}
                factionId={factionId}
                onFactionId={setFactionId}
                canonicalTrailblazer={canonicalTrailblazer}
                onCanonicalTrailblazer={setCanonicalTrailblazer}
                onNext={goNext}
                onBack={goPrev}
              />
            )}

            {step === 'overview' && (
              <OverviewStep
                name={name.trim() || '无名开拓者'}
                alias={alias}
                gender={gender}
                age={age}
                birthday={birthday}
                background={background}
                storyMode={storyMode}
                pathId={pathId}
                pathStage={pathStage}
                factionId={factionId}
                customIdentity={customIdentity}
                selectedScenario={selectedScenario}
                selectedOpeningTitle={selectedOpeningTitle}
                selectedOpeningRegionName={selectedOpeningRegion?.name ?? ''}
                openingSource={openingSource}
                freeOpeningMainlineEnabled={effectiveFreeMainlineEnabled}
                freeOpeningPlanetSource={freeOpeningPlanetSource}
                customStartPrompt={effectiveCustomStartPrompt}
                canonicalTrailblazer={canonicalTrailblazer}
                selectedAbilityNames={selectedAbilityNames}
                openingSkills={openingSkills}
                currentLocation={selectedOpeningLocation}
                onStart={() => void handleStart()}
                onBack={goPrev}
                starting={startingGame}
                openingArchiveStatus={openingArchiveStatus}
              />
            )}
            </div>
            </div>
          </div>

          <aside className="hidden lg:block">
            <OpeningLedger
              scenarioTitle={selectedOpeningTitle}
              storyMode={storyModeDef.name}
              path={selectedPath}
              pathStage={pathId !== 'none' ? selectedPathStage : undefined}
              faction={selectedFaction}
              currentDate={selectedOpeningDate}
              currentTime={selectedOpeningTime}
              currentLocation={selectedOpeningLocation}
              abilities={selectedAbilityNames}
              highlights={openingHighlights}
            />
          </aside>
        </section>
      </main>
    </div>
  );
}
