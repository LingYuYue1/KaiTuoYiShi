// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getDefaultOpeningScenarioId,
  getFreeOpeningGuide,
  getOfficialOpeningPreset,
  getOfficialOpeningPresetsByRegion,
  getOpeningScenarioBundle,
  isKnownOpeningScenarioId,
  openingRegions,
  resolveOfficialOpeningPreset,
  startingScenarios,
  workshopOpeningTemplates,
} from '@/data/journeyPresets';
import type { 官方开局预设 } from '@/models/journey';
import { deriveOpeningDraftContext } from '@/models/opening';
import { 根据官方开局预设创建开局档案 } from '@/models/world';
import { ScenarioAnchorCard } from '@/components/features/NewGame/wizard/frame';
import {
  buildOfficialPresetCards,
  buildOpeningScenarioCards,
  buildWorkshopTemplateCards,
  getActiveOpeningCardId,
  normalizeOpeningPresets,
  sanitizeOpeningPresetDraft,
  selectOpeningScenario,
  upsertOpeningPlayerPreset,
} from '@/components/features/NewGame/wizard/wizardData';

const AMPHOREUS_PRESET_IDS = [
  'official_amphoreus_falling_wood',
  'official_amphoreus_refugee',
  'official_amphoreus_golden_thread',
  'official_amphoreus_styx',
  'official_amphoreus_loop',
];

const PLANARCADIA_PRESET_IDS = [
  'official_planarcadia_welcome',
  'official_planarcadia_pigeon_river',
  'official_planarcadia_academy',
  'official_planarcadia_ink_residue',
];

const NEW_STARTING_SCENARIO_IDS = [
  'amphoreus_falling_wood',
  'amphoreus_refugee',
  'amphoreus_golden_thread',
  'amphoreus_styx',
  'amphoreus_loop',
  'planarcadia_welcome',
  'planarcadia_pigeon_river',
  'planarcadia_academy',
  'planarcadia_ink_residue',
];

function requirePreset(id: string): 官方开局预设 {
  const preset = getOfficialOpeningPreset(id);
  if (!preset) throw new Error(`缺少官方开局预设：${id}`);
  return preset;
}

function draftFor(startingScenarioId: string) {
  return sanitizeOpeningPresetDraft({ openingSource: 'official_preset', startingScenarioId });
}

describe('新地区官方开局接入', () => {
  it('地区表与自由开局引导都包含翁法罗斯和二相乐园', () => {
    const regionIds = openingRegions.map((region) => region.id);
    expect(regionIds).toEqual(expect.arrayContaining(['amphoreus', 'planarcadia']));
    expect(getFreeOpeningGuide('amphoreus')).toBeDefined();
    expect(getFreeOpeningGuide('planarcadia')).toBeDefined();
  });

  it('官方预设卡片流按地区收齐翁法罗斯五个预设', () => {
    expect(getOfficialOpeningPresetsByRegion('amphoreus').map((preset) => preset.id)).toEqual(AMPHOREUS_PRESET_IDS);
    const cards = buildOpeningScenarioCards('official_preset', 'amphoreus');
    expect(cards.map((card) => card.id)).toEqual(AMPHOREUS_PRESET_IDS);
    expect(cards.every((card) => card.kind === 'official_preset')).toBe(true);
  });

  it('官方预设卡片流按地区收齐二相乐园四个预设', () => {
    expect(getOfficialOpeningPresetsByRegion('planarcadia').map((preset) => preset.id)).toEqual(PLANARCADIA_PRESET_IDS);
    const cards = buildOpeningScenarioCards('official_preset', 'planarcadia');
    expect(cards.map((card) => card.id)).toEqual(PLANARCADIA_PRESET_IDS);
    expect(cards.every((card) => card.kind === 'official_preset')).toBe(true);
  });

  it('新起始场景供自由/工坊主线进度使用', () => {
    expect(startingScenarios.map((scenario) => scenario.id)).toEqual(expect.arrayContaining(NEW_STARTING_SCENARIO_IDS));
  });

  it('自由开局卡片流也按地区收齐新章节锚点', () => {
    expect(buildOpeningScenarioCards('free', 'amphoreus').map((card) => card.id)).toEqual([
      'amphoreus_falling_wood',
      'amphoreus_gate_throne',
      'amphoreus_sleeping_flowers',
      'amphoreus_sun_hurt',
    ]);
    expect(buildOpeningScenarioCards('free', 'planarcadia').map((card) => card.id)).toEqual([
      'planarcadia_welcome',
      'planarcadia_pigeon_river',
      'planarcadia_academy',
      'planarcadia_ink_residue',
    ]);
  });

  it('每个新预设都能按稳定 ID 解析到自己的地区与章节', () => {
    for (const id of [...AMPHOREUS_PRESET_IDS, ...PLANARCADIA_PRESET_IDS]) {
      const preset = requirePreset(id);
      const bundle = getOpeningScenarioBundle(preset.id);
      expect(bundle.preset?.id).toBe(preset.id);
      expect(bundle.chapter?.id).toBe(preset.chapterId);
      expect(bundle.region?.id).toBe(preset.regionId);
    }
  });
});

describe('预设生成的开局配置', () => {
  it('每个新预设生成自己的结构化开局配置，而不是同章节的其他预设', () => {
    for (const id of [...AMPHOREUS_PRESET_IDS, ...PLANARCADIA_PRESET_IDS]) {
      const preset = requirePreset(id);
      const context = deriveOpeningDraftContext(draftFor(preset.id));
      expect(context.scenarioPreset?.id).toBe(preset.id);
      expect(context.selectedScenarioPreset?.id).toBe(preset.id);
      expect(context.selectedOpeningTitle).toBe(preset.title);
      expect(context.freeOpeningInput.officialPresetId).toBe(preset.id);
      expect(context.freeOpeningInput.regionId).toBe(preset.regionId);
      expect(context.freeOpeningInput.chapterId).toBe(preset.chapterId);
      expect(context.freeOpeningInput.chapterName).toBe(preset.chapterName);
      expect(context.selectedOpeningLocation).toBe(preset.defaultLocationHint);
      const archive = 根据官方开局预设创建开局档案(preset);
      expect(archive.官方预设ID).toBe(preset.id);
      expect(archive.地区ID).toBe(preset.regionId);
      expect(archive.章节锚点ID).toBe(preset.chapterId);
      expect(archive.整理档案?.关键角色参考).toEqual(preset.keyNpcs.slice(0, 8));
    }
  });

  it('共享同一章节锚点的两个翁法罗斯预设各自解析到自己的名称与日期', () => {
    const falling = requirePreset('official_amphoreus_falling_wood');
    const refugee = requirePreset('official_amphoreus_refugee');
    expect(falling.chapterId).toBe(refugee.chapterId);
    const fallingContext = deriveOpeningDraftContext(draftFor(falling.id));
    const refugeeContext = deriveOpeningDraftContext(draftFor(refugee.id));
    expect(fallingContext.selectedOpeningTitle).toBe(falling.title);
    expect(refugeeContext.selectedOpeningTitle).toBe(refugee.title);
    expect(fallingContext.selectedOpeningLocation).toBe(falling.defaultLocationHint);
    expect(refugeeContext.selectedOpeningLocation).toBe(refugee.defaultLocationHint);
    expect(fallingContext.selectedOpeningLocation).not.toBe(refugeeContext.selectedOpeningLocation);
  });

  it('旧存档的章节锚点 ID 仍能解析到对应官方预设', () => {
    expect(resolveOfficialOpeningPreset('herta_station_incident')?.id).toBe('official_herta_station_incident');
    expect(resolveOfficialOpeningPreset('amphoreus_falling_wood')?.id).toBe('official_amphoreus_falling_wood');
    expect(getOpeningScenarioBundle('heita_station_incident').preset?.id).toBe('official_herta_station_incident');
  });
});

describe('开局卡片稳定身份', () => {
  it('同一章节下的不同预设各自成卡，身份等于预设 ID', () => {
    const falling = requirePreset('official_amphoreus_falling_wood');
    const refugee = requirePreset('official_amphoreus_refugee');
    const cards = buildOfficialPresetCards([falling, refugee]);
    expect(cards.map((card) => card.id)).toEqual([falling.id, refugee.id]);
    expect(new Set(cards.map((card) => card.id)).size).toBe(2);
    expect(cards.map((card) => card.chapterId)).toEqual([falling.chapterId, refugee.chapterId]);
  });

  it('同章节、同标题的两个预设仍是两张卡（身份不能退回标题或数组位置）', () => {
    const base = requirePreset('official_amphoreus_falling_wood');
    const twinA = { ...base, id: 'test_twin_a', title: '同名测试开局' };
    const twinB = { ...base, id: 'test_twin_b', title: '同名测试开局' };
    const cards = buildOfficialPresetCards([twinB, twinA]);
    expect(cards.map((card) => card.id)).toEqual(['test_twin_b', 'test_twin_a']);
    expect(cards.map((card) => card.title)).toEqual(['同名测试开局', '同名测试开局']);
  });

  it('选中哪张卡就写回哪张卡的身份，不会串到同章节的另一张', () => {
    const cards = buildOfficialPresetCards([
      requirePreset('official_amphoreus_falling_wood'),
      requirePreset('official_amphoreus_refugee'),
    ]);
    let startingScenarioId = '';
    let selectedWorkshopTemplateId = '';
    const select = (cardId: number) => selectOpeningScenario(
      cards[cardId],
      'official_preset',
      (id) => { startingScenarioId = id; },
      (id) => { selectedWorkshopTemplateId = id; },
    );
    select(0);
    expect(startingScenarioId).toBe('official_amphoreus_falling_wood');
    select(1);
    expect(startingScenarioId).toBe('official_amphoreus_refugee');
    expect(selectedWorkshopTemplateId).toBe('');
  });

  it('工坊模板共享章节锚点时各自成卡，选中写回模板 ID 与章节身份', () => {
    const base = workshopOpeningTemplates[0];
    const twinA = { ...base, id: 'workshop_twin_a', title: '同名工坊开局' };
    const twinB = { ...base, id: 'workshop_twin_b', title: '同名工坊开局' };
    const cards = buildWorkshopTemplateCards([twinA, twinB]);
    expect(cards.map((card) => card.id)).toEqual(['workshop_twin_a', 'workshop_twin_b']);
    let startingScenarioId = '';
    let selectedWorkshopTemplateId = '';
    selectOpeningScenario(
      cards[1],
      'workshop',
      (id) => { startingScenarioId = id; },
      (id) => { selectedWorkshopTemplateId = id; },
    );
    expect(selectedWorkshopTemplateId).toBe('workshop_twin_b');
    expect(startingScenarioId).toBe(twinB.chapterId);
  });

  it('高亮身份按来源取模板 ID 或开局身份 ID', () => {
    expect(getActiveOpeningCardId('official_preset', 'official_amphoreus_refugee', 'workshop_twin_a')).toBe('official_amphoreus_refugee');
    expect(getActiveOpeningCardId('workshop', 'amphoreus_falling_wood', 'workshop_twin_a')).toBe('workshop_twin_a');
    expect(getActiveOpeningCardId('free', 'amphoreus_falling_wood', 'workshop_twin_a')).toBe('amphoreus_falling_wood');
  });

  it('新局默认身份能直接命中官方预设卡片', () => {
    const defaultId = getDefaultOpeningScenarioId();
    expect(defaultId).toBe('official_herta_station_incident');
    expect(buildOpeningScenarioCards('official_preset', 'herta_space_station').map((card) => card.id)).toContain(defaultId);
  });
});

describe('开局预设持久化身份', () => {
  it('官方预设 ID 与旧章节 ID 都能通过草稿校验', () => {
    expect(isKnownOpeningScenarioId('official_amphoreus_refugee')).toBe(true);
    expect(isKnownOpeningScenarioId('official_planarcadia_ink_residue')).toBe(true);
    expect(isKnownOpeningScenarioId('herta_station_incident')).toBe(true);
    expect(isKnownOpeningScenarioId('heita_station_incident')).toBe(true);
    expect(isKnownOpeningScenarioId('unknown_id')).toBe(false);
    expect(draftFor('official_planarcadia_ink_residue').startingScenarioId).toBe('official_planarcadia_ink_residue');
    expect(draftFor('herta_station_incident').startingScenarioId).toBe('herta_station_incident');
  });

  it('同名不同 ID 的预设保存后不会互相覆盖，重载仍是两条且各自保留配置', () => {
    const presetA = {
      id: 'opening-a',
      title: '重渊开局',
      updatedAt: 1,
      draft: draftFor('official_amphoreus_falling_wood'),
    };
    const presetB = {
      id: 'opening-b',
      title: '重渊开局',
      updatedAt: 2,
      draft: draftFor('official_amphoreus_refugee'),
    };
    const afterSavingNew = upsertOpeningPlayerPreset([presetB], presetA);
    expect(afterSavingNew.map((preset) => preset.id)).toEqual(['opening-a', 'opening-b']);
    const restored = normalizeOpeningPresets(afterSavingNew);
    expect(restored.map((preset) => preset.id).sort()).toEqual(['opening-a', 'opening-b']);
    expect(restored.find((preset) => preset.id === 'opening-a')?.draft.startingScenarioId).toBe('official_amphoreus_falling_wood');
    expect(restored.find((preset) => preset.id === 'opening-b')?.draft.startingScenarioId).toBe('official_amphoreus_refugee');
  });

  it('保存同一 ID 时只替换自己，不触碰其他预设', () => {
    const draft = draftFor('official_amphoreus_loop');
    const presetA = { id: 'opening-a', title: '旧名', updatedAt: 1, draft };
    const presetB = { id: 'opening-b', title: '另一个', updatedAt: 2, draft };
    const next = upsertOpeningPlayerPreset([presetB, presetA], { ...presetA, title: '新名', updatedAt: 3 });
    expect(next.map((preset) => preset.id)).toEqual(['opening-a', 'opening-b']);
    expect(next.find((preset) => preset.id === 'opening-a')?.title).toBe('新名');
    expect(next.find((preset) => preset.id === 'opening-b')?.title).toBe('另一个');
  });

  it('损坏存储里同 ID 的重复记录重载后合并为最新一条，不同 ID 保留', () => {
    const draft = draftFor('official_amphoreus_styx');
    const restored = normalizeOpeningPresets([
      { id: 'dup', title: '旧', updatedAt: 1, draft },
      { id: 'dup', title: '新', updatedAt: 5, draft },
      { id: 'other', title: '旧', updatedAt: 2, draft },
    ]);
    expect(restored.map((preset) => preset.id)).toEqual(['dup', 'other']);
    expect(restored[0].title).toBe('新');
  });
});

describe('开局卡片渲染', () => {
  it('同章节的两个预设渲染为两张独立卡片，点击触发各自身份', () => {
    const cards = buildOfficialPresetCards([
      requirePreset('official_amphoreus_falling_wood'),
      requirePreset('official_amphoreus_refugee'),
    ]);
    const clicked: string[] = [];
    render(
      <>
        {cards.map((card) => (
          <ScenarioAnchorCard key={card.id} card={card} active={false} onClick={() => clicked.push(card.id)} />
        ))}
      </>,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(screen.getByText(cards[0].title)).toBeDefined();
    expect(screen.getByText(cards[1].title)).toBeDefined();
    fireEvent.click(buttons[1]);
    expect(clicked).toEqual(['official_amphoreus_refugee']);
  });
});
