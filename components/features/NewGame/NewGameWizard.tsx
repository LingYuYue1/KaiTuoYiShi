import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { 角色数据结构 } from '@/models/character';
import { 创建命途进度 } from '@/models/path';
import type { 世界状态 } from '@/models/world';
import { 创建空世界状态 } from '@/models/world';
import type { 主题预设 } from '@/models/settings';
import type {
  命途ID,
  剧情模式,
  阵营ID,
} from '@/models/journey';
import {
  abilityPresets,
  factions,
  getFaction,
  getPath,
  getStartingScenario,
  getStoryMode,
  paths,
  startingScenarios,
  storyModes,
} from '@/data/journeyPresets';

interface NewGameWizardProps {
  onStart: (traveler: 角色数据结构, worldState: 世界状态) => void;
  onBack: () => void;
  currentTheme: 主题预设;
}

type Step = 'world' | 'character' | 'path' | 'historian' | 'overview';
type CanonicalTrailblazer = 'stelle' | 'caelus' | 'both';
type OpeningScenario = (typeof startingScenarios)[number];

const STEPS: Step[] = ['world', 'character', 'path', 'historian', 'overview'];

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  world: { title: '世界设定', subtitle: '先定故事底色与回合张力' },
  character: { title: '角色档案', subtitle: '写下主角的身份底稿' },
  path: { title: '命途与能力', subtitle: '决定你要踏上的道路' },
  historian: { title: '原著开局', subtitle: '固定黑塔空间站主线锚点' },
  overview: { title: '总览确认', subtitle: '确认后正式踏上旅途' },
};

const CANONICAL_TRAILBLAZERS: {
  id: CanonicalTrailblazer;
  title: string;
  subtitle: string;
  worldValue: 世界状态['原著主角'];
}[] = [
  { id: 'stelle', title: '星', subtitle: '女主角', worldValue: '星' },
  { id: 'caelus', title: '穹', subtitle: '男主角', worldValue: '穹' },
  { id: 'both', title: '小孩子才做选择', subtitle: '星与穹都存在', worldValue: '星穹双主角' },
];

const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
const smallClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';
const tightClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

export function NewGameWizard({ onStart, onBack }: NewGameWizardProps) {
  const [step, setStep] = useState<Step>('world');

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
  const [factionId, setFactionId] = useState<阵营ID>('none');
  const [customIdentity, setCustomIdentity] = useState('');
  const [selectedAbilityIds, setSelectedAbilityIds] = useState<string[]>([]);
  const [customAbilityDraft, setCustomAbilityDraft] = useState('');
  const [customAbilities, setCustomAbilities] = useState<string[]>([]);

  const [startingScenarioId, setStartingScenarioId] = useState<string>(
    startingScenarios[0]?.id ?? '',
  );
  const [canonicalTrailblazer, setCanonicalTrailblazer] = useState<CanonicalTrailblazer>('stelle');
  const [customStartPrompt, setCustomStartPrompt] = useState('');
  const birthdayParts = useMemo(() => splitBirthday(birthday), [birthday]);

  const storyModeDef = useMemo(
    () => getStoryMode(storyMode) ?? storyModes[0],
    [storyMode],
  );
  const selectedPath = useMemo(() => getPath(pathId), [pathId]);
  const selectedFaction = useMemo(() => getFaction(factionId) ?? factions[0], [factionId]);
  const selectedScenario = useMemo<OpeningScenario>(
    () => getStartingScenario(startingScenarioId) ?? startingScenarios[0],
    [startingScenarioId],
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

  const openingSummaryLines = useMemo(
    () =>
      buildOpeningSummary({
        scenario: selectedScenario,
        location: '黑塔空间站',
        storyMode: storyModeDef.name,
        path: selectedPath,
        faction: selectedFaction,
        customIdentity,
        customStartPrompt,
        canonicalTrailblazer: getCanonicalTrailblazer(canonicalTrailblazer)?.worldValue,
        abilities: selectedAbilityNames,
      }),
    [canonicalTrailblazer, customIdentity, customStartPrompt, selectedAbilityNames, selectedFaction, selectedPath, selectedScenario, storyModeDef.name],
  );

  const openingHighlights = selectedScenario?.openingHighlights ?? [];

  const toggleAbility = (id: string) => {
    setSelectedAbilityIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const addCustomAbility = () => {
    const trimmed = customAbilityDraft.trim();
    if (!trimmed) return;
    setCustomAbilities((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    setCustomAbilityDraft('');
  };

  const removeCustomAbility = (text: string) => {
    setCustomAbilities((prev) => prev.filter((x) => x !== text));
  };

  const handleStart = () => {
    const selectedPathDef = getPath(pathId);
    const selectedScenarioDef = selectedScenario;

    const abilityNames = selectedAbilityNames;

    const startingPaths =
      pathId && pathId !== 'none'
        ? [创建命途进度(pathId, true, selectedScenarioDef?.name ?? '', '开局承载')]
        : [];
    const finalIdentity = customIdentity.trim();
    const factionIdentity = selectedFaction.id === 'none' ? '' : selectedFaction.name;
    const displayIdentity = [factionIdentity, finalIdentity].filter(Boolean).join(' · ');
    const travelerBackground = background.trim();
    const canonicalName = getCanonicalTrailblazer(canonicalTrailblazer)?.worldValue;

    const traveler: 角色数据结构 = {
      姓名: name.trim() || '无名开拓者',
      别名: alias.trim(),
      性别: gender.trim(),
      年龄: age,
      生日: birthday.trim(),
      身高: '',
      身份: displayIdentity,
      外貌: appearance.trim(),
      性格: personality.trim(),
      背景: travelerBackground,
      专长知识: [],
      头像: '',
      图像档案: {},
      属性: {
        力量: 0,
        智慧: 0,
        敏捷: 0,
        体质: 0,
        运气: 0,
      },
      主命途: pathId,
      命途列表: startingPaths,
      能力: abilityNames,
      装备: {},
      背包: [],
      战技列表: [],
    };

    const worldState = 创建空世界状态();
    worldState.纪年法 = '琥珀纪年';
    worldState.开拓天数 = 1;
    worldState.当前日期 = '琥珀纪 2157.03.07';
    worldState.当前时间 = '06:40';
    worldState.当前地点 = '黑塔空间站';
    worldState.剧情模式 = storyMode;
    worldState.起航之地ID = 'heita_station_incident';
    worldState.原著主角 = canonicalName;
    worldState.自定义开局 = customStartPrompt.trim();
    worldState.全局事件 = openingSummaryLines;

    if (selectedPathDef) {
      worldState.全局事件 = [
        `命途倾向：${selectedPathDef.name}（${selectedPathDef.aeon}）`,
        ...worldState.全局事件,
      ];
    }

    if (selectedScenarioDef?.openingHighlights?.length) {
      worldState.全局事件.push(
        ...selectedScenarioDef.openingHighlights.map((text) => `场景要点：${text}`),
      );
    }

    onStart(traveler, worldState);
  };

  const stepReady: Record<Step, boolean> = {
    world: true,
    character: name.trim().length > 0,
    path: true,
    historian: true,
    overview: true,
  };

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goPrev = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  return (
    <div
      className="relative min-h-screen overflow-hidden px-4 py-8"
      style={{
        background:
          'radial-gradient(circle at top left, rgba(var(--tj-accent-primary), 0.08) 0, transparent 28%), radial-gradient(circle at top right, rgba(255, 255, 255, 0.04) 0, transparent 22%), linear-gradient(180deg, rgb(var(--tj-bg-primary)) 0%, rgb(var(--tj-bg-secondary)) 100%)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.07) 0 1px, transparent 1px 86px), repeating-linear-gradient(0deg, rgba(var(--tj-accent-primary), 0.05) 0 1px, transparent 1px 78px)',
          }}
        />
        <div
          className="absolute left-0 right-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.38), transparent)' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.2), transparent)' }}
        />
      </div>

      <div className="relative mx-auto grid w-full max-w-7xl gap-5 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <div className="hidden lg:block">
          <div className="sticky top-6">
              <OpeningLedger
                scenario={selectedScenario}
                storyMode={storyModeDef.name}
                path={selectedPath}
                faction={selectedFaction}
                currentDate="琥珀纪 2157.03.07"
              currentTime="06:40"
              currentLocation="黑塔空间站"
              abilities={selectedAbilityNames}
              highlights={selectedScenario?.openingHighlights ?? []}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <button
            onClick={onBack}
            className="w-fit text-xs font-serif tracking-[0.28em] transition-opacity hover:opacity-80"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.72)' }}
          >
            ← 返回
          </button>

          <div
            className="p-5 sm:p-6"
            style={{
              background:
                'linear-gradient(180deg, rgba(14, 14, 18, 0.94) 0%, rgba(11, 10, 14, 0.98) 100%)',
              boxShadow:
                'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.26), inset 0 0 18px rgba(var(--tj-accent-primary), 0.03), 0 18px 40px rgba(0, 0, 0, 0.46)',
              clipPath: cardClip,
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[11px] tracking-[0.38em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.56)' }}>
                  开拓档案 / STAR RAIL BRIEFING
                </div>
                <h1
                  className="mt-1 font-serif text-3xl font-bold tracking-[0.18em]"
                  style={{
                    background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  踏上旅途
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'rgba(214, 202, 170, 0.82)' }}>
                  踏上你旅途的第一步，你最终会奔向那里？
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:min-w-[260px]">
                <MiniStat label="剧情模式" value={storyModeDef.name} />
              </div>
            </div>

            <div className="mt-4">
              <ProgressBar step={step} />
            </div>

            <div className="mt-5 lg:hidden">
              <OpeningLedger
                scenario={selectedScenario}
                storyMode={storyModeDef.name}
                path={selectedPath}
                faction={selectedFaction}
                currentDate="琥珀纪 2157.03.07"
                currentTime="06:40"
                currentLocation="黑塔空间站"
                abilities={selectedAbilityNames}
                highlights={selectedScenario?.openingHighlights ?? []}
              />
            </div>

            <div className="mt-5">
            {step === 'world' && (
              <WorldStep
                storyMode={storyMode}
                onStoryMode={setStoryMode}
                onNext={goNext}
              />
            )}

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
                onNext={goNext}
                onBack={goPrev}
                ready={stepReady.character}
              />
            )}

            {step === 'path' && (
              <PathStep
                pathId={pathId}
                onPath={setPathId}
                selectedAbilityIds={selectedAbilityIds}
                onToggleAbility={toggleAbility}
                customAbilities={customAbilities}
                customAbilityDraft={customAbilityDraft}
                onCustomAbilityDraft={setCustomAbilityDraft}
                onAddCustomAbility={addCustomAbility}
                onRemoveCustomAbility={removeCustomAbility}
                onNext={goNext}
                onBack={goPrev}
                ready={stepReady.path}
              />
            )}

            {step === 'historian' && (
              <HistorianStep
                startingScenarioId={startingScenarioId}
                onStartingScenarioId={setStartingScenarioId}
                customStartPrompt={customStartPrompt}
                onCustomStartPrompt={setCustomStartPrompt}
                customIdentity={customIdentity}
                onCustomIdentity={setCustomIdentity}
                factionId={factionId}
                onFactionId={setFactionId}
                canonicalTrailblazer={canonicalTrailblazer}
                onCanonicalTrailblazer={setCanonicalTrailblazer}
                selectedScenario={selectedScenario}
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
                factionId={factionId}
                customIdentity={customIdentity}
                selectedScenario={selectedScenario}
                customStartPrompt={customStartPrompt}
                canonicalTrailblazer={canonicalTrailblazer}
                selectedAbilityNames={selectedAbilityNames}
                onStart={handleStart}
                onBack={goPrev}
              />
            )}
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-6">
            <div className="mb-3 text-[11px] tracking-[0.38em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.56)' }}>
              航行档案
            </div>
            <StepRail step={step} stepReady={stepReady} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="p-3 text-left"
      style={{
        background: 'rgba(10, 9, 11, 0.7)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] tracking-[0.26em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.65)' }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-medium" style={{ color: 'rgba(241, 234, 214, 0.94)' }}>
        {value}
      </div>
    </div>
  );
}

function ProgressBar({ step }: { step: Step }) {
  const currentIdx = STEPS.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-1">
      {STEPS.map((item, index) => {
        const active = item === step;
        const passed = index < currentIdx;
        const reached = active || passed;
        return (
          <div key={item} className="flex min-w-0 flex-1 items-center gap-1">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="flex h-8 w-8 items-center justify-center text-xs font-bold"
                style={{
                  background: reached
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-secondary), 0.95))'
                    : 'rgba(10, 9, 11, 0.7)',
                  color: reached ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.65)',
                  boxShadow: reached
                    ? '0 0 10px rgba(var(--tj-accent-primary), 0.24)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
                  clipPath: smallClip,
                }}
              >
                {passed ? '✓' : index + 1}
              </div>
              <div
                className="truncate text-[10px] tracking-[0.16em]"
                style={{ color: reached ? 'rgba(var(--tj-accent-primary), 0.78)' : 'rgba(var(--tj-text-secondary), 0.5)' }}
              >
                {STEP_META[item].title}
              </div>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className="mb-5 h-px w-5 shrink-0"
                style={{
                  background: passed
                    ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.65), rgba(var(--tj-accent-primary), 0.18))'
                    : 'rgba(var(--tj-accent-primary), 0.14)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OpeningLedger({
  scenario,
  storyMode,
  path,
  faction,
  currentDate,
  currentTime,
  currentLocation,
  abilities,
  highlights,
}: {
  scenario?: OpeningScenario;
  storyMode: string;
  path?: ReturnType<typeof getPath>;
  faction?: ReturnType<typeof getFaction>;
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  abilities: string[];
  highlights: string[];
}) {
  return (
    <div
      className="p-4"
      style={{
        background: 'linear-gradient(180deg, rgba(10, 10, 14, 0.96) 0%, rgba(8, 8, 11, 0.99) 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18), 0 10px 24px rgba(0, 0, 0, 0.24)',
        clipPath: cardClip,
      }}
    >
      <div
        className="mb-3 text-[11px] tracking-[0.34em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}
      >
        开局档案
      </div>
      <div className="space-y-2 text-sm" style={{ color: 'rgba(232, 223, 198, 0.92)' }}>
        <Line label="起点" value={scenario?.name ?? '未选择'} />
        <Line label="日期 / 时间" value={`${currentDate} · ${currentTime}`} />
        <Line label="地点" value={currentLocation} />
        <Line label="剧情模式" value={storyMode} />
        <Line label="命途" value={path ? `${path.name} · ${path.aeon}` : '无命途'} />
        <Line label="组织背景" value={faction?.name ?? '无固定组织'} />
        <Line label="能力" value={abilities.length ? abilities.join('、') : '暂未选择'} />
      </div>

      {highlights.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
            开局要点
          </div>
          <div className="space-y-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
            {highlights.map((text) => (
              <div
                key={text}
                className="p-2"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.5)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                  clipPath: smallClip,
                }}
              >
                {text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <div style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>{label}</div>
      <div className="break-words" style={{ color: 'rgba(241, 234, 214, 0.96)' }}>
        {value}
      </div>
    </div>
  );
}

function StepRail({
  step,
  stepReady,
}: {
  step: Step;
  stepReady: Record<Step, boolean>;
}) {
  const currentIdx = STEPS.indexOf(step);
  return (
    <div
      className="p-4"
      style={{
        background: 'rgba(16, 13, 22, 0.8)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-3 text-[11px] tracking-[0.34em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.7)' }}>
        步骤导航
      </div>
      <div className="space-y-2">
        {STEPS.map((item, index) => {
          const active = item === step;
          const done = index < currentIdx || stepReady[item];
          return (
            <div
              key={item}
              className="flex items-start gap-3 p-3"
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.12), rgba(var(--tj-accent-secondary), 0.04))'
                  : 'rgba(10, 9, 11, 0.55)',
                boxShadow: active
                  ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)'
                  : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                clipPath: smallClip,
              }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold"
                style={{
                  background: done
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.95), rgba(var(--tj-accent-secondary), 0.95))'
                    : 'rgba(24, 19, 31, 0.95)',
                  color: done ? '#1c1326' : 'rgba(var(--tj-text-secondary), 0.72)',
                  boxShadow: done
                    ? '0 0 12px rgba(var(--tj-accent-primary), 0.22)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                  clipPath: smallClip,
                }}
              >
                {done ? '✓' : index + 1}
              </div>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium"
                  style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(240, 234, 218, 0.92)' }}
                >
                  {STEP_META[item].title}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                  {STEP_META[item].subtitle}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  backLabel = '上一步',
  nextLabel = '下一步',
  ready = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  ready?: boolean;
}) {
  return (
    <div className="mt-6 flex gap-3">
      {onBack && (
        <button onClick={onBack} className="kaituo-btn kaituo-btn-secondary flex-1 px-4 py-3 text-sm">
          {backLabel}
        </button>
      )}
      <button
        onClick={onNext}
        disabled={!ready}
        className="kaituo-btn kaituo-btn-primary group flex-1 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span
          className="pointer-events-none absolute inset-0 -translate-x-full transition-transform duration-700 ease-out group-hover:translate-x-full"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-text-primary), 0.45), transparent)' }}
        />
        <span className="relative tracking-[0.2em] font-bold">{nextLabel}</span>
      </button>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <div
        className="mb-2 text-[11px] tracking-[0.32em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.62)' }}
      >
        {subtitle}
      </div>
      <h3
        className="font-serif text-2xl font-bold tracking-[0.18em]"
        style={{
          background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 45%, rgb(var(--tj-accent-secondary)) 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {title}
      </h3>
    </div>
  );
}

function WorldStep({
  storyMode,
  onStoryMode,
  onNext,
}: {
  storyMode: 剧情模式;
  onStoryMode: (mode: 剧情模式) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <SectionTitle title="世界设定" subtitle="决定故事张力与叙述基调" />

      <div>
          <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
            剧情模式
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {storyModes.map((item) => {
              const active = storyMode === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onStoryMode(item.id)}
                  className="w-full p-4 text-left transition-transform hover:-translate-y-0.5"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.10), rgba(var(--tj-accent-secondary), 0.04))'
                      : 'rgba(10, 9, 11, 0.58)',
                    boxShadow: active
                      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.5), 0 0 14px rgba(var(--tj-accent-primary), 0.12)'
                      : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                    clipPath: tightClip,
                  }}
                >
                  <div
                    className="font-serif text-base font-bold tracking-[0.14em]"
                    style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(240, 234, 218, 0.92)' }}
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
      </div>

      <StepNav onNext={onNext} nextLabel="继续：填写角色" />
    </div>
  );
}

function CharacterStep({
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
  onNext: () => void;
  onBack: () => void;
  ready: boolean;
}) {
  return (
    <div>
      <SectionTitle title="角色档案" subtitle="把主角写得更像一位真正会走进故事的人" />

      <div className="grid gap-5 lg:grid-cols-1">
        <div className="space-y-4">
          <div
            className="p-4"
            style={{
              background: 'rgba(10, 9, 11, 0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
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
                <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
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
              background: 'rgba(10, 9, 11, 0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
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
                这里写的是角色自己的经历，不是开局系统摘要；切入剧情的具体方式仍在「原著开局」页填写。
              </p>
            </div>
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} ready={ready} nextLabel="继续：命途与能力" />
    </div>
  );
}

function PathStep({
  pathId,
  onPath,
  selectedAbilityIds,
  onToggleAbility,
  customAbilities,
  customAbilityDraft,
  onCustomAbilityDraft,
  onAddCustomAbility,
  onRemoveCustomAbility,
  onNext,
  onBack,
  ready,
}: {
  pathId: 命途ID;
  onPath: (id: 命途ID) => void;
  selectedAbilityIds: string[];
  onToggleAbility: (id: string) => void;
  customAbilities: string[];
  customAbilityDraft: string;
  onCustomAbilityDraft: (v: string) => void;
  onAddCustomAbility: () => void;
  onRemoveCustomAbility: (text: string) => void;
  onNext: () => void;
  onBack: () => void;
  ready: boolean;
}) {
  const selectedPath = getPath(pathId);

  return (
    <div>
      <SectionTitle title="命途与能力" subtitle="让角色在故事里拥有更清晰的轨迹" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="space-y-5">
          <div>
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
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
                        ? 'linear-gradient(160deg, rgba(var(--tj-accent-primary), 0.13), rgba(var(--tj-accent-secondary), 0.05))'
                        : 'rgba(10, 9, 11, 0.58)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.5), 0 0 14px rgba(var(--tj-accent-primary), 0.12)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                      clipPath: tightClip,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-3xl" style={{ color: active ? 'rgba(var(--tj-accent-primary),0.96)' : 'rgba(var(--tj-accent-primary),0.56)' }}>
                          {item.emblem}
                        </div>
                        <div
                          className="mt-1 font-serif text-base font-bold tracking-[0.14em]"
                          style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(240, 234, 218, 0.92)' }}
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
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                  clipPath: smallClip,
                }}
              >
                <div style={{ color: 'rgba(var(--tj-accent-primary), 0.82)' }}>
                  {selectedPath.name} · {selectedPath.aeon}
                </div>
                <div className="mt-1">{selectedPath.description}</div>
              </div>
            )}
          </div>

        </div>

        <div className="space-y-5">
          <div
            className="p-4"
            style={{
              background: 'rgba(10, 9, 11, 0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
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
                        ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.10), rgba(var(--tj-accent-secondary), 0.04))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45), 0 0 12px rgba(var(--tj-accent-primary), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                      clipPath: tightClip,
                    }}
                  >
                    <div
                      className="font-serif text-base font-bold tracking-[0.14em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(240, 234, 218, 0.92)' }}
                    >
                      <span style={{ color: 'rgba(var(--tj-accent-primary), 0.76)' }}>{active ? '✓ ' : '◆ '}</span>
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
              <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
                自定义特质
              </div>
              <div className="flex gap-2">
                <input
                  value={customAbilityDraft}
                  onChange={(e) => onCustomAbilityDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onAddCustomAbility();
                    }
                  }}
                  placeholder="输入一条自定义开局特质，例如：奇物研究助手、以太通讯熟手"
                  className="kaituo-input flex-1 px-3 py-2 text-sm"
                  style={{ clipPath: smallClip }}
                />
                <button
                  onClick={onAddCustomAbility}
                  className="px-3 text-base"
                  style={{
                    background: 'rgba(var(--tj-accent-primary), 0.16)',
                    color: 'rgba(var(--tj-accent-primary), 0.95)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
                    clipPath: smallClip,
                  }}
                >
                  +
                </button>
              </div>

              {customAbilities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customAbilities.map((item) => (
                    <button
                      key={item}
                      onClick={() => onRemoveCustomAbility(item)}
                      className="px-3 py-1 text-xs tracking-[0.18em]"
                      style={{
                        background: 'rgba(var(--tj-accent-primary), 0.12)',
                        color: 'rgba(var(--tj-accent-primary), 0.96)',
                        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
                        clipPath: smallClip,
                      }}
                    >
                      {item} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            className="p-4 text-xs leading-relaxed"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.52)',
              color: 'rgba(var(--tj-text-secondary), 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
              clipPath: smallClip,
            }}
          >
            命途和能力会直接影响首回合正文里的措辞、可用行动与人物反应。这里写得越清楚，后面越不容易失真。
            <br />
            开局特质最多选择 2 个，自定义特质不计入上限。
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} ready={ready} nextLabel="继续：原著开局" />
    </div>
  );
}

function HistorianStep({
  startingScenarioId,
  onStartingScenarioId,
  customStartPrompt,
  onCustomStartPrompt,
  customIdentity,
  onCustomIdentity,
  factionId,
  onFactionId,
  canonicalTrailblazer,
  onCanonicalTrailblazer,
  selectedScenario,
  onNext,
  onBack,
}: {
  startingScenarioId: string;
  onStartingScenarioId: (id: string) => void;
  customStartPrompt: string;
  onCustomStartPrompt: (v: string) => void;
  customIdentity: string;
  onCustomIdentity: (v: string) => void;
  factionId: 阵营ID;
  onFactionId: (id: 阵营ID) => void;
  canonicalTrailblazer: CanonicalTrailblazer;
  onCanonicalTrailblazer: (v: CanonicalTrailblazer) => void;
  selectedScenario?: OpeningScenario;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <SectionTitle title="原著开局" subtitle="故事固定从星/穹苏醒前的黑塔空间站开始" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div
          className="p-4"
          style={{
            background: 'rgba(10, 9, 11, 0.58)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
            clipPath: cardClip,
          }}
        >
          <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
            固定锚点
          </div>
          <div className="space-y-3">
            {startingScenarios.map((item) => {
              const active = startingScenarioId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onStartingScenarioId(item.id)}
                  className="w-full p-4 text-left transition-transform hover:-translate-y-0.5"
                  style={{
                    background: active
                      ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.10), rgba(var(--tj-accent-secondary), 0.04))'
                      : 'rgba(var(--tj-bg-primary), 0.52)',
                    boxShadow: active
                      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.46), 0 0 14px rgba(var(--tj-accent-primary), 0.1)'
                      : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                    clipPath: tightClip,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div
                        className="font-serif text-base font-bold tracking-[0.14em]"
                        style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(240, 234, 218, 0.92)' }}
                      >
                        {item.name}
                      </div>
                      <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                        {item.description}
                      </div>
                    </div>
                    <div className="text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary), 0.72)' }}>
                      原著主线
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedScenario?.openingHighlights?.length ? (
            <div className="mt-4">
              <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
                开局要点
              </div>
              <div className="space-y-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}>
                {selectedScenario.openingHighlights.map((item) => (
                  <div
                    key={item}
                    className="p-2"
                    style={{
                      background: 'rgba(var(--tj-bg-primary), 0.5)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                      clipPath: smallClip,
                    }}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div
            className="p-4 text-sm leading-relaxed"
            style={{
              background: 'rgba(10, 9, 11, 0.58)',
              color: 'rgba(214, 202, 170, 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
              clipPath: cardClip,
            }}
          >
            开局地点不再分支。玩家会从原著主线即将启动的黑塔空间站切入，唯一可塑造的是你的身份、命途、性格与进入危机的方式。
            这样可以让智库剧情、新闻推进和正文沉浸都围绕同一个主线锚点工作。
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(10, 9, 11, 0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
              组织背景
            </div>
            <div className="grid gap-2">
              {factions.map((item) => {
                const active = factionId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onFactionId(item.id)}
                    className="p-3 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.10), rgba(var(--tj-accent-secondary), 0.04))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.42), 0 0 12px rgba(var(--tj-accent-primary), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <div
                      className="font-serif text-sm font-bold tracking-[0.12em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(240, 234, 218, 0.92)' }}
                    >
                      <span style={{ color: 'rgba(var(--tj-accent-primary), 0.76)' }}>{active ? '✓ ' : '◆ '}</span>
                      {item.name}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                      {item.description}
                    </div>
                    {active ? (
                      <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-accent-primary), 0.78)' }}>
                        {item.openingHint}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(10, 9, 11, 0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
              自定义身份
            </div>
            <input
              value={customIdentity}
              onChange={(e) => onCustomIdentity(e.target.value)}
              placeholder="例如：空间站临时协助员、公司外勤、流浪的命途行者"
              className="kaituo-input w-full px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            />
            <p className="mt-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
              可留空。这里只用于描述你在开局时被他人如何理解，不会开启额外路线系统。
            </p>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(10, 9, 11, 0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
              原著主角
            </div>
            <div className="grid gap-2">
              {CANONICAL_TRAILBLAZERS.map((item) => {
                const active = canonicalTrailblazer === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onCanonicalTrailblazer(item.id)}
                    className="p-3 text-left transition-transform hover:-translate-y-0.5"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.10), rgba(var(--tj-accent-secondary), 0.04))'
                        : 'rgba(var(--tj-bg-primary), 0.52)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.42), 0 0 12px rgba(var(--tj-accent-primary), 0.1)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <div
                      className="font-serif text-base font-bold tracking-[0.12em]"
                      style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(240, 234, 218, 0.92)' }}
                    >
                      {item.title}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
                      {item.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="p-4"
            style={{
              background: 'rgba(10, 9, 11, 0.58)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
              切入说明
            </div>
            <textarea
              value={customStartPrompt}
              onChange={(e) => onCustomStartPrompt(e.target.value)}
              placeholder="可选。写下你怎样进入这段原著开局，例如：巡海游侠在宇宙中收到空间站求援信号后赶来；或在黑塔空间站外执行委托时意外卷入事件。"
              rows={8}
              className="kaituo-input w-full resize-none px-3 py-2 text-sm"
              style={{ clipPath: smallClip }}
            />
            <p className="mt-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
              这段内容会作为首回合背景注入，不会单独显示在界面上，但会被正文和记忆系统读取。
            </p>
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="继续：总览确认" />
    </div>
  );
}

function OverviewStep({
  name,
  alias,
  gender,
  age,
  birthday,
  background,
  storyMode,
  pathId,
  factionId,
  customIdentity,
  selectedScenario,
  customStartPrompt,
  canonicalTrailblazer,
  selectedAbilityNames,
  onStart,
  onBack,
}: {
  name: string;
  alias: string;
  gender: string;
  age: number;
  birthday: string;
  background: string;
  storyMode: 剧情模式;
  pathId: 命途ID;
  factionId: 阵营ID;
  customIdentity: string;
  selectedScenario?: OpeningScenario;
  customStartPrompt: string;
  canonicalTrailblazer: CanonicalTrailblazer;
  selectedAbilityNames: string[];
  onStart: () => void;
  onBack: () => void;
}) {
  const mode = getStoryMode(storyMode) ?? storyModes[0];
  const path = getPath(pathId);
  const faction = getFaction(factionId) ?? factions[0];

  return (
    <div>
      <SectionTitle title="总览确认" subtitle="最后检查一遍开局是否完整" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(290px,0.85fr)]">
        <div
          className="p-4"
          style={{
            background: 'rgba(10, 9, 11, 0.58)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
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
            <OverviewRow label="开局锚点" value={selectedScenario?.name ?? '黑塔空间站 · 星之苏醒'} />
            <OverviewRow label="当前地点" value="黑塔空间站" />
            <OverviewRow label="原著主角" value={getCanonicalTrailblazer(canonicalTrailblazer)?.worldValue ?? '星'} />
            <OverviewRow label="命途" value={path ? `${path.name} · ${path.aeon}` : '无命途'} />
            <OverviewRow label="组织背景" value={faction.name} />
            <OverviewRow label="身份" value={customIdentity.trim() || '未填写'} />
          </div>

          <div className="mt-4 grid gap-3">
            <div
              className="p-3"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.54)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                clipPath: smallClip,
              }}
            >
              <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
                切入说明
              </div>
              <div className="text-sm leading-relaxed" style={{ color: 'rgba(241, 234, 214, 0.92)' }}>
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
                      background: 'rgba(var(--tj-accent-primary), 0.12)',
                      color: 'rgba(var(--tj-accent-primary), 0.95)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24)',
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

        </div>

        <div className="space-y-4">
          <div
            className="p-4"
            style={{
              background: 'linear-gradient(180deg, rgba(29, 24, 40, 0.95) 0%, rgba(16, 13, 22, 0.98) 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-3 text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
              最终提醒
            </div>
            <div className="space-y-2 text-sm leading-relaxed" style={{ color: 'rgba(214, 202, 170, 0.86)' }}>
              <p>开局会把这些内容写入角色、世界状态和首回合提示词。</p>
              <p>换句话说，你现在确认的不只是外观和选择，而是整段旅程的第一页。</p>
              <p style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>开局内容已固定为原著主线锚点，可以直接开始。</p>
            </div>
          </div>

          <div
            className="p-4 text-sm leading-relaxed"
            style={{
              background: 'rgba(10, 9, 11, 0.58)',
              color: 'rgba(214, 202, 170, 0.84)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
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
        ready={true}
        backLabel="返回修改"
        nextLabel="踏上旅途"
      />
    </div>
  );
}

function LabelField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function OverviewLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.72)' }}>
      {children}
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 text-sm">
      <div style={{ color: 'rgba(var(--tj-accent-primary), 0.68)' }}>{label}</div>
      <div className="break-words" style={{ color: 'rgba(241, 234, 214, 0.96)' }}>
        {value}
      </div>
    </div>
  );
}

function buildOpeningSummary({
  scenario,
  location,
  storyMode,
  path,
  faction,
  customIdentity,
  canonicalTrailblazer,
  customStartPrompt,
  abilities,
}: {
  scenario?: OpeningScenario;
  location?: string;
  storyMode: string;
  path?: ReturnType<typeof getPath>;
  faction?: ReturnType<typeof getFaction>;
  customIdentity?: string;
  canonicalTrailblazer?: 世界状态['原著主角'];
  customStartPrompt?: string;
  abilities: string[];
}): string[] {
  const lines: string[] = [];
  lines.push(`起点：${scenario?.name ?? '未选择'}`);
  if (scenario?.description) lines.push(`场景：${scenario.description}`);
  lines.push(`底色：${storyMode}`);
  lines.push(`日期：琥珀纪 2157.03.07`);
  lines.push(`时间：06:40`);
  lines.push(`地点：${location ?? scenario?.name ?? '黑塔空间站'}`);
  lines.push(`原著主角：${canonicalTrailblazer ?? '星'}`);
  if (path) {
    lines.push(`命途：${path.name} · ${path.aeon}`);
  } else {
    lines.push('命途：无命途');
  }
  if (faction) {
    lines.push(`组织背景：${faction.name}`);
    if (faction.openingHint) lines.push(`组织提示：${faction.openingHint}`);
  }
  if (customIdentity?.trim()) lines.push(`身份：${customIdentity.trim()}`);
  if (customStartPrompt?.trim()) lines.push(`切入说明：${customStartPrompt.trim()}`);
  lines.push(`能力：${abilities.length ? abilities.join('、') : '暂未选择'}`);
  if (scenario?.openingHighlights?.length) {
    for (const item of scenario.openingHighlights) {
      lines.push(`场景要点：${item}`);
    }
  }
  return lines;
}

function getCanonicalTrailblazer(id: CanonicalTrailblazer) {
  return CANONICAL_TRAILBLAZERS.find((item) => item.id === id) ?? CANONICAL_TRAILBLAZERS[0];
}

function splitBirthday(value: string): { month: string; day: string } {
  const trimmed = value.trim();
  if (!trimmed) return { month: '', day: '' };
  const match = trimmed.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (match) return { month: match[1], day: match[2] };
  const monthOnly = trimmed.match(/(\d{1,2})\s*月/);
  if (monthOnly) return { month: monthOnly[1], day: '' };
  const dayOnly = trimmed.match(/(\d{1,2})\s*日/);
  if (dayOnly) return { month: '', day: dayOnly[1] };
  const dotted = trimmed.match(/(?:\d{2,4}[./-])?(\d{1,2})[./-](\d{1,2})/);
  if (dotted) return { month: dotted[1], day: dotted[2] };
  return { month: '', day: '' };
}

function mergeBirthday(month: string, day: string): string {
  const m = month.replace(/[^\d]/g, '').slice(0, 2);
  const d = day.replace(/[^\d]/g, '').slice(0, 2);
  if (!m && !d) return '';
  if (m && d) return `${m}月${d}日`;
  if (m) return `${m}月`;
  return `${d}日`;
}

function splitLines(value: string): string[] {
  return value
    .split(/\n|；|;/g)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
}
