import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { NovelAIContentMode } from '@/models/imageGeneration';
import type { NovelAI模型族, PNG画风预设来源, 故事快照解析规则预设, 文生图NAI规则预设, 文生图PNG画风预设, 文生图画师串预设, 文生图模型规则集, 文生图规则模板, 文生图规则模板类型, 文生图规则中心设置, 文生图详细画风预设, 文生图质量增强预设, 画师串预设适用范围 } from '@/models/settings';
import { normalizeImageRules, 获取规则模板列表 } from '@/utils/imagePromptRules';

interface Props {
  rules: 文生图规则中心设置;
  onChange: (patch: Partial<文生图规则中心设置>) => void;
}

const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

type VisibleRuleSection = Exclude<文生图规则模板类型, 'scene_judge'>;

const ruleSections: { id: VisibleRuleSection; label: string; desc: string }[] = [
  { id: 'npc', label: '角色生成规则', desc: '旅人头像、旅人立绘、伙伴头像、伙伴立绘和 NSFW 参考图都会读取这里。' },
  { id: 'scene', label: '场景生成规则', desc: '场景图、故事快照和手机背景都会读取这里；有角色锚点时只注入在场人物。' },
];

type RuleCenterTab = 'model' | 'style' | 'template' | 'novelai' | 'snapshot';
type StyleLayerTab = 'artist' | 'detail' | 'quality' | 'png';

const ruleCenterTabs: { id: RuleCenterTab; label: string; desc: string }[] = [
  { id: 'template', label: '规则模板', desc: '角色 / 场景' },
  { id: 'model', label: '模型规则集', desc: '绑定规则与模型' },
  { id: 'style', label: '风格预设', desc: '画师串 / PNG' },
  { id: 'novelai', label: 'NAI 规则', desc: 'Quality / UC / 提示词层' },
  { id: 'snapshot', label: '快照解析', desc: '故事画面语义规则' },
];

const novelAIContentModes: { id: NovelAIContentMode; label: string }[] = [
  { id: 'official', label: '使用官方默认' },
  { id: 'append', label: '官方默认 + 自定义追加' },
  { id: 'replace', label: '仅使用自定义内容' },
  { id: 'off', label: '关闭此层' },
];

export function ImageRuleTemplateEditor({ rules, onChange }: Props) {
  const [activeRuleTab, setActiveRuleTab] = useState<RuleCenterTab>('template');
  const [activeStyleLayer, setActiveStyleLayer] = useState<StyleLayerTab>('artist');
  const [activeSection, setActiveSection] = useState<VisibleRuleSection>('npc');
  const [styleScope, setStyleScope] = useState<'npc' | 'scene'>('npc');
  const [modelEditorId, setModelEditorId] = useState('');
  const [artistEditorId, setArtistEditorId] = useState('');
  const [detailStyleEditorId, setDetailStyleEditorId] = useState('');
  const [qualityEditorId, setQualityEditorId] = useState('');
  const [pngEditorId, setPngEditorId] = useState('');
  const [novelAIEditorId, setNovelAIEditorId] = useState('');
  const [snapshotEditorId, setSnapshotEditorId] = useState('');
  const [editorIds, setEditorIds] = useState<Record<VisibleRuleSection, string>>({
    npc: '',
    scene: '',
  });

  const normalizedRules = useMemo(() => normalizeImageRules(rules), [rules]);
  const section = ruleSections.find((item) => item.id === activeSection) ?? ruleSections[0];
  const presets = useMemo(() => 获取规则模板列表(normalizedRules, activeSection), [normalizedRules, activeSection]);
  const activeId = getActiveId(normalizedRules, activeSection);
  const editorId = editorIds[activeSection] || activeId || presets[0]?.id || '';
  const selectedPreset = presets.find((preset) => preset.id === editorId) ?? presets[0] ?? null;
  const activeModelRule = normalizedRules.模型词组转化器预设列表.find((preset) => preset.是否启用) ?? null;
  const selectedModelRule = normalizedRules.模型词组转化器预设列表.find((preset) => preset.id === (modelEditorId || activeModelRule?.id)) ?? normalizedRules.模型词组转化器预设列表[0] ?? null;
  const scopedArtistPresets = normalizedRules.画师串预设列表.filter((preset) => preset.适用范围 === styleScope || preset.适用范围 === 'all');
  const activeArtistId = styleScope === 'scene' ? normalizedRules.当前场景画师串预设ID : normalizedRules.当前NPC画师串预设ID;
  const activeArtist = activeArtistId ? scopedArtistPresets.find((preset) => preset.id === activeArtistId) ?? null : null;
  const selectedArtist = scopedArtistPresets.find((preset) => preset.id === (artistEditorId || activeArtistId)) ?? scopedArtistPresets[0] ?? null;
  const scopedDetailStylePresets = normalizedRules.详细画风预设列表.filter((preset) => preset.适用范围 === styleScope || preset.适用范围 === 'all');
  const activeDetailStyleId = styleScope === 'scene' ? normalizedRules.当前场景详细画风预设ID : normalizedRules.当前NPC详细画风预设ID;
  const activeDetailStyle = activeDetailStyleId ? scopedDetailStylePresets.find((preset) => preset.id === activeDetailStyleId) ?? null : null;
  const selectedDetailStyle = scopedDetailStylePresets.find((preset) => preset.id === (detailStyleEditorId || activeDetailStyleId)) ?? scopedDetailStylePresets[0] ?? null;
  const activeQualityId = normalizedRules.当前质量增强预设ID;
  const activeQuality = activeQualityId ? normalizedRules.质量增强预设列表.find((preset) => preset.id === activeQualityId) ?? null : null;
  const selectedQuality = normalizedRules.质量增强预设列表.find((preset) => preset.id === (qualityEditorId || activeQualityId)) ?? normalizedRules.质量增强预设列表[0] ?? null;
  const activePngId = styleScope === 'scene' ? normalizedRules.当前场景PNG画风预设ID : normalizedRules.当前NPCPNG画风预设ID;
  const activePng = activePngId ? normalizedRules.PNG画风预设列表.find((preset) => preset.id === activePngId) ?? null : null;
  const selectedPng = normalizedRules.PNG画风预设列表.find((preset) => preset.id === (pngEditorId || activePngId)) ?? normalizedRules.PNG画风预设列表[0] ?? null;
  const activeNovelAIId = normalizedRules.当前NAI规则预设ID;
  const activeNovelAI = normalizedRules.NAI规则预设列表.find((preset) => preset.id === activeNovelAIId) ?? normalizedRules.NAI规则预设列表[0] ?? null;
  const selectedNovelAI = normalizedRules.NAI规则预设列表.find((preset) => preset.id === (novelAIEditorId || activeNovelAI?.id)) ?? normalizedRules.NAI规则预设列表[0] ?? null;
  const activeSnapshotId = normalizedRules.当前故事快照解析规则预设ID;
  const activeSnapshot = normalizedRules.故事快照解析规则预设列表.find((preset) => preset.id === activeSnapshotId) ?? normalizedRules.故事快照解析规则预设列表[0] ?? null;
  const selectedSnapshot = normalizedRules.故事快照解析规则预设列表.find((preset) => preset.id === (snapshotEditorId || activeSnapshot?.id)) ?? normalizedRules.故事快照解析规则预设列表[0] ?? null;

  useEffect(() => {
    if (editorIds[activeSection] && presets.some((preset) => preset.id === editorIds[activeSection])) return;
    setEditorIds((prev) => ({ ...prev, [activeSection]: activeId || presets[0]?.id || '' }));
  }, [activeId, activeSection, editorIds, presets]);

  useEffect(() => {
    if (modelEditorId && normalizedRules.模型词组转化器预设列表.some((preset) => preset.id === modelEditorId)) return;
    setModelEditorId(activeModelRule?.id || normalizedRules.模型词组转化器预设列表[0]?.id || '');
  }, [activeModelRule?.id, modelEditorId, normalizedRules.模型词组转化器预设列表]);

  useEffect(() => {
    if (artistEditorId && scopedArtistPresets.some((preset) => preset.id === artistEditorId)) return;
    setArtistEditorId(activeArtistId || scopedArtistPresets[0]?.id || '');
  }, [activeArtistId, artistEditorId, scopedArtistPresets]);

  useEffect(() => {
    if (detailStyleEditorId && scopedDetailStylePresets.some((preset) => preset.id === detailStyleEditorId)) return;
    setDetailStyleEditorId(activeDetailStyleId || scopedDetailStylePresets[0]?.id || '');
  }, [activeDetailStyleId, detailStyleEditorId, scopedDetailStylePresets]);

  useEffect(() => {
    if (qualityEditorId && normalizedRules.质量增强预设列表.some((preset) => preset.id === qualityEditorId)) return;
    setQualityEditorId(activeQualityId || normalizedRules.质量增强预设列表[0]?.id || '');
  }, [activeQualityId, normalizedRules.质量增强预设列表, qualityEditorId]);

  useEffect(() => {
    if (pngEditorId && normalizedRules.PNG画风预设列表.some((preset) => preset.id === pngEditorId)) return;
    setPngEditorId(activePngId || normalizedRules.PNG画风预设列表[0]?.id || '');
  }, [activePngId, pngEditorId, normalizedRules.PNG画风预设列表]);

  useEffect(() => {
    if (novelAIEditorId && normalizedRules.NAI规则预设列表.some((preset) => preset.id === novelAIEditorId)) return;
    setNovelAIEditorId(activeNovelAI?.id || normalizedRules.NAI规则预设列表[0]?.id || '');
  }, [activeNovelAI?.id, novelAIEditorId, normalizedRules.NAI规则预设列表]);

  useEffect(() => {
    if (snapshotEditorId && normalizedRules.故事快照解析规则预设列表.some((preset) => preset.id === snapshotEditorId)) return;
    setSnapshotEditorId(activeSnapshot?.id || normalizedRules.故事快照解析规则预设列表[0]?.id || '');
  }, [activeSnapshot?.id, normalizedRules.故事快照解析规则预设列表, snapshotEditorId]);

  const setActiveId = (id: string) => {
    onChange({ [activeIdKey(activeSection)]: id } as Partial<文生图规则中心设置>);
  };

  const setEditorId = (id: string) => {
    setEditorIds((prev) => ({ ...prev, [activeSection]: id }));
  };

  const updatePreset = (id: string, updater: (preset: 文生图规则模板) => 文生图规则模板) => {
    onChange({
      词组转化器提示词预设列表: normalizedRules.词组转化器提示词预设列表.map((preset) => (
        preset.id === id ? updater(preset) : preset
      )),
    });
  };

  const addPreset = () => {
    const now = Date.now();
    const next: 文生图规则模板 = {
      id: `template_${activeSection}_${now}`,
      名称: section.label,
      类型: activeSection,
      提示词: '',
      角色锚定模式提示词: activeSection === 'npc' ? '' : undefined,
      场景角色锚定模式提示词: activeSection === 'scene' ? '' : undefined,
      无锚点回退提示词: '',
      输出格式提示词: '',
      createdAt: now,
      updatedAt: now,
    };
    onChange({
      词组转化器提示词预设列表: [...normalizedRules.词组转化器提示词预设列表, next],
      [activeIdKey(activeSection)]: getActiveId(normalizedRules, activeSection) || next.id,
    } as Partial<文生图规则中心设置>);
    setEditorId(next.id);
  };

  const deletePreset = () => {
    if (!selectedPreset) return;
    const remaining = normalizedRules.词组转化器提示词预设列表.filter((preset) => preset.id !== selectedPreset.id);
    const nextActive = remaining.find((preset) => preset.类型 === activeSection)?.id ?? '';
    onChange({
      词组转化器提示词预设列表: remaining,
      [activeIdKey(activeSection)]: activeId === selectedPreset.id ? nextActive : activeId,
    } as Partial<文生图规则中心设置>);
    setEditorId(nextActive);
  };

  const updateModelRule = (id: string, updater: (preset: 文生图模型规则集) => 文生图模型规则集) => {
    onChange({
      模型词组转化器预设列表: normalizedRules.模型词组转化器预设列表.map((preset) => (
        preset.id === id ? updater(preset) : preset
      )),
    });
  };

  const addModelRule = () => {
    const now = Date.now();
    const next: 文生图模型规则集 = {
      id: `model_rule_${now}`,
      名称: '新建模型规则集',
      模型专属提示词: '',
      锚定模式模型提示词: '',
      是否启用: normalizedRules.模型词组转化器预设列表.length === 0,
      NPC词组转化器提示词预设ID: 获取规则模板列表(normalizedRules, 'npc')[0]?.id ?? '',
      场景词组转化器提示词预设ID: 获取规则模板列表(normalizedRules, 'scene')[0]?.id ?? '',
      场景判定提示词预设ID: normalizedRules.当前场景判定提示词预设ID || 获取规则模板列表(normalizedRules, 'scene_judge')[0]?.id || '',
      createdAt: now,
      updatedAt: now,
    };
    onChange({ 模型词组转化器预设列表: [...normalizedRules.模型词组转化器预设列表, next] });
    setModelEditorId(next.id);
  };

  const deleteModelRule = () => {
    if (!selectedModelRule) return;
    const remaining = normalizedRules.模型词组转化器预设列表.filter((preset) => preset.id !== selectedModelRule.id);
    onChange({ 模型词组转化器预设列表: remaining });
    setModelEditorId(remaining[0]?.id ?? '');
  };

  const setActiveModelRule = (id: string) => {
    onChange({
      模型词组转化器预设列表: normalizedRules.模型词组转化器预设列表.map((preset) => ({
        ...preset,
        是否启用: id ? preset.id === id : false,
        updatedAt: preset.id === id ? Date.now() : preset.updatedAt,
      })),
    });
  };

  const updateArtist = (id: string, updater: (preset: 文生图画师串预设) => 文生图画师串预设) => {
    onChange({
      画师串预设列表: normalizedRules.画师串预设列表.map((preset) => (
        preset.id === id ? updater(preset) : preset
      )),
    });
  };

  const addArtist = () => {
    const now = Date.now();
    const next: 文生图画师串预设 = {
      id: `artist_${styleScope}_${now}`,
      名称: styleScope === 'scene' ? '新建场景画师串' : '新建NPC画师串',
      适用范围: styleScope,
      画师串: '',
      正面提示词: '',
      负面提示词: '',
      createdAt: now,
      updatedAt: now,
    };
    onChange({
      画师串预设列表: [...normalizedRules.画师串预设列表, next],
      [styleScope === 'scene' ? '当前场景画师串预设ID' : '当前NPC画师串预设ID']: activeArtistId || next.id,
    } as Partial<文生图规则中心设置>);
    setArtistEditorId(next.id);
  };

  const deleteArtist = () => {
    if (!selectedArtist) return;
    const remaining = normalizedRules.画师串预设列表.filter((preset) => preset.id !== selectedArtist.id);
    const nextId = remaining.find((preset) => preset.适用范围 === styleScope || preset.适用范围 === 'all')?.id ?? '';
    onChange({
      画师串预设列表: remaining,
      [styleScope === 'scene' ? '当前场景画师串预设ID' : '当前NPC画师串预设ID']: activeArtistId === selectedArtist.id ? nextId : activeArtistId,
    } as Partial<文生图规则中心设置>);
    setArtistEditorId(nextId);
  };

  const updateDetailStyle = (id: string, updater: (preset: 文生图详细画风预设) => 文生图详细画风预设) => {
    onChange({
      详细画风预设列表: normalizedRules.详细画风预设列表.map((preset) => (
        preset.id === id ? updater(preset) : preset
      )),
    });
  };

  const addDetailStyle = () => {
    const now = Date.now();
    const next: 文生图详细画风预设 = {
      id: `detail_style_${styleScope}_${now}`,
      名称: styleScope === 'scene' ? '新建场景详细画风' : '新建NPC详细画风',
      适用范围: styleScope,
      风格定位: '',
      构图镜头: '',
      光影色彩: '',
      材质细节: '',
      正面提示词: '',
      负面提示词: '',
      createdAt: now,
      updatedAt: now,
    };
    onChange({
      详细画风预设列表: [...normalizedRules.详细画风预设列表, next],
      [styleScope === 'scene' ? '当前场景详细画风预设ID' : '当前NPC详细画风预设ID']: activeDetailStyleId || next.id,
    } as Partial<文生图规则中心设置>);
    setDetailStyleEditorId(next.id);
  };

  const deleteDetailStyle = () => {
    if (!selectedDetailStyle) return;
    const remaining = normalizedRules.详细画风预设列表.filter((preset) => preset.id !== selectedDetailStyle.id);
    const nextId = remaining.find((preset) => preset.适用范围 === styleScope || preset.适用范围 === 'all')?.id ?? '';
    onChange({
      详细画风预设列表: remaining,
      [styleScope === 'scene' ? '当前场景详细画风预设ID' : '当前NPC详细画风预设ID']: activeDetailStyleId === selectedDetailStyle.id ? nextId : activeDetailStyleId,
    } as Partial<文生图规则中心设置>);
    setDetailStyleEditorId(nextId);
  };

  const updateQuality = (id: string, updater: (preset: 文生图质量增强预设) => 文生图质量增强预设) => {
    onChange({
      质量增强预设列表: normalizedRules.质量增强预设列表.map((preset) => (
        preset.id === id ? updater(preset) : preset
      )),
    });
  };

  const addQuality = () => {
    const now = Date.now();
    const next: 文生图质量增强预设 = {
      id: `quality_stability_${now}`,
      名称: '新建质量增强',
      正面提示词: '',
      负面提示词: '',
      createdAt: now,
      updatedAt: now,
    };
    onChange({
      质量增强预设列表: [...normalizedRules.质量增强预设列表, next],
      当前质量增强预设ID: activeQualityId || next.id,
    });
    setQualityEditorId(next.id);
  };

  const deleteQuality = () => {
    if (!selectedQuality) return;
    const remaining = normalizedRules.质量增强预设列表.filter((preset) => preset.id !== selectedQuality.id);
    const nextId = remaining[0]?.id ?? '';
    onChange({
      质量增强预设列表: remaining,
      当前质量增强预设ID: activeQualityId === selectedQuality.id ? '' : activeQualityId,
    });
    setQualityEditorId(nextId);
  };

  const updatePng = (id: string, updater: (preset: 文生图PNG画风预设) => 文生图PNG画风预设) => {
    onChange({
      PNG画风预设列表: normalizedRules.PNG画风预设列表.map((preset) => (
        preset.id === id ? updater(preset) : preset
      )),
    });
  };

  const addPng = () => {
    const now = Date.now();
    const next: 文生图PNG画风预设 = {
      id: `png_style_${now}`,
      名称: '新建PNG画风预设',
      来源: 'unknown',
      画师串: '',
      正面提示词: '',
      负面提示词: '',
      createdAt: now,
      updatedAt: now,
    };
    onChange({
      PNG画风预设列表: [...normalizedRules.PNG画风预设列表, next],
      [styleScope === 'scene' ? '当前场景PNG画风预设ID' : '当前NPCPNG画风预设ID']: activePngId || next.id,
    } as Partial<文生图规则中心设置>);
    setPngEditorId(next.id);
  };

  const deletePng = () => {
    if (!selectedPng) return;
    const remaining = normalizedRules.PNG画风预设列表.filter((preset) => preset.id !== selectedPng.id);
    const nextId = remaining[0]?.id ?? '';
    onChange({
      PNG画风预设列表: remaining,
      当前NPCPNG画风预设ID: normalizedRules.当前NPCPNG画风预设ID === selectedPng.id ? nextId : normalizedRules.当前NPCPNG画风预设ID,
      当前场景PNG画风预设ID: normalizedRules.当前场景PNG画风预设ID === selectedPng.id ? nextId : normalizedRules.当前场景PNG画风预设ID,
    });
    setPngEditorId(nextId);
  };

  const updateNovelAIRule = (id: string, updater: (preset: 文生图NAI规则预设) => 文生图NAI规则预设) => {
    const target = normalizedRules.NAI规则预设列表.find((preset) => preset.id === id);
    if (!target || target.isBuiltin) return;
    onChange({
      NAI规则预设列表: normalizedRules.NAI规则预设列表.map((preset) => (
        preset.id === id ? updater(preset) : preset
      )),
    });
  };

  const addNovelAIRule = () => {
    const now = Date.now();
    const next: 文生图NAI规则预设 = {
      id: `nai_rule_custom_${now}_${Math.random().toString(36).slice(2, 8)}`,
      名称: '新建 NAI 规则',
      模型族: 'all',
      isBuiltin: false,
      qualityMode: 'official',
      qualityText: '',
      ucMode: 'official',
      ucText: '',
      basePromptPrefix: '',
      basePromptSuffix: '',
      characterPromptPrefix: '',
      characterPromptSuffix: '',
      negativePromptAppend: '',
      createdAt: now,
      updatedAt: now,
    };
    onChange({ NAI规则预设列表: [...normalizedRules.NAI规则预设列表, next] });
    setNovelAIEditorId(next.id);
  };

  const copyNovelAIRuleAsCustom = () => {
    const source = selectedNovelAI
      ?? normalizedRules.NAI规则预设列表.find((preset) => preset.isBuiltin)
      ?? normalizedRules.NAI规则预设列表[0];
    if (!source) return;
    const now = Date.now();
    const next: 文生图NAI规则预设 = {
      ...source,
      id: `nai_rule_custom_${now}_${Math.random().toString(36).slice(2, 8)}`,
      名称: `${source.名称} · 自定义副本`,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };
    onChange({ NAI规则预设列表: [...normalizedRules.NAI规则预设列表, next] });
    setNovelAIEditorId(next.id);
  };

  const deleteNovelAIRule = () => {
    if (!selectedNovelAI || selectedNovelAI.isBuiltin) return;
    const remaining = normalizedRules.NAI规则预设列表.filter((preset) => preset.id !== selectedNovelAI.id);
    const fallbackId = remaining.find((preset) => preset.isBuiltin)?.id ?? remaining[0]?.id ?? '';
    onChange({
      NAI规则预设列表: remaining,
      当前NAI规则预设ID: activeNovelAIId === selectedNovelAI.id ? fallbackId : activeNovelAIId,
    });
    setNovelAIEditorId(fallbackId);
  };

  const updateSnapshotRule = (id: string, updater: (preset: 故事快照解析规则预设) => 故事快照解析规则预设) => {
    const target = normalizedRules.故事快照解析规则预设列表.find((preset) => preset.id === id);
    if (!target || target.isBuiltin) return;
    onChange({
      故事快照解析规则预设列表: normalizedRules.故事快照解析规则预设列表.map((preset) => (
        preset.id === id ? updater(preset) : preset
      )),
    });
  };

  const addSnapshotRule = () => {
    const baseline = normalizedRules.故事快照解析规则预设列表.find((preset) => preset.isBuiltin)
      ?? normalizedRules.故事快照解析规则预设列表[0];
    const now = Date.now();
    const next: 故事快照解析规则预设 = {
      id: `story_snapshot_rule_custom_${now}_${Math.random().toString(36).slice(2, 8)}`,
      名称: '新建快照解析规则',
      语义规则: baseline?.语义规则 ?? '',
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };
    onChange({ 故事快照解析规则预设列表: [...normalizedRules.故事快照解析规则预设列表, next] });
    setSnapshotEditorId(next.id);
  };

  const copySnapshotRuleAsCustom = () => {
    const source = selectedSnapshot
      ?? normalizedRules.故事快照解析规则预设列表.find((preset) => preset.isBuiltin)
      ?? normalizedRules.故事快照解析规则预设列表[0];
    if (!source) return;
    const now = Date.now();
    const next: 故事快照解析规则预设 = {
      ...source,
      id: `story_snapshot_rule_custom_${now}_${Math.random().toString(36).slice(2, 8)}`,
      名称: `${source.名称} · 自定义副本`,
      isBuiltin: false,
      createdAt: now,
      updatedAt: now,
    };
    onChange({ 故事快照解析规则预设列表: [...normalizedRules.故事快照解析规则预设列表, next] });
    setSnapshotEditorId(next.id);
  };

  const deleteSnapshotRule = () => {
    if (!selectedSnapshot || selectedSnapshot.isBuiltin) return;
    const remaining = normalizedRules.故事快照解析规则预设列表.filter((preset) => preset.id !== selectedSnapshot.id);
    const fallbackId = remaining.find((preset) => preset.isBuiltin)?.id ?? remaining[0]?.id ?? '';
    onChange({
      故事快照解析规则预设列表: remaining,
      当前故事快照解析规则预设ID: activeSnapshotId === selectedSnapshot.id ? fallbackId : activeSnapshotId,
    });
    setSnapshotEditorId(fallbackId);
  };

  return (
    <div className="space-y-4">
      <div
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        style={{
          background: 'rgba(0,0,0,0.18)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
          clipPath: smallClip,
          padding: 8,
        }}
      >
        {ruleCenterTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveRuleTab(tab.id)}
            className="min-w-0 px-4 py-3 text-left transition-all"
            style={{
              color: activeRuleTab === tab.id ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-accent-primary),0.86)',
              background: activeRuleTab === tab.id
                ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92))'
                : 'rgba(var(--tj-accent-primary),0.045)',
              boxShadow: activeRuleTab === tab.id
                ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45), 0 0 16px rgba(var(--tj-accent-primary),0.10)'
                : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
              clipPath: smallClip,
            }}
          >
            <div className="font-serif text-sm font-bold tracking-[0.16em]">{tab.label}</div>
            <div className="mt-1 truncate text-[11px] opacity-70">{tab.desc}</div>
          </button>
        ))}
      </div>

      {activeRuleTab === 'novelai' && (
        <TemplateCard
          eyebrow="NovelAI Prompt Compiler"
          title="NAI 规则预设"
          desc="系统基线保持只读；新建或复制为自定义规则后，可编辑 NAI 模型族、Quality、UC 与提示词层。"
          actions={
            <>
              <TemplateButton onClick={addNovelAIRule}>新建规则</TemplateButton>
              <TemplateButton onClick={copyNovelAIRuleAsCustom}>复制为自定义</TemplateButton>
              {selectedNovelAI && (
                <TemplateButton
                  onClick={() => onChange({ 当前NAI规则预设ID: selectedNovelAI.id })}
                  disabled={activeNovelAIId === selectedNovelAI.id}
                >设为当前生效</TemplateButton>
              )}
              <TemplateButton onClick={deleteNovelAIRule} disabled={!selectedNovelAI || selectedNovelAI.isBuiltin} danger>删除自定义</TemplateButton>
            </>
          }
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3">
              <PresetSelectField
                label="当前生效"
                value={activeNovelAI?.id ?? ''}
                onChange={(value) => onChange({ 当前NAI规则预设ID: value })}
                presets={normalizedRules.NAI规则预设列表}
              />
              <PresetSelectField
                label="当前编辑"
                value={selectedNovelAI?.id ?? ''}
                onChange={setNovelAIEditorId}
                presets={normalizedRules.NAI规则预设列表}
              />
              <BuiltinPresetState isBuiltin={Boolean(selectedNovelAI?.isBuiltin)} />
            </div>

            {selectedNovelAI ? (
              <div className="min-w-0 space-y-4">
                <TextInput
                  label="预设名称"
                  value={selectedNovelAI.名称}
                  disabled={selectedNovelAI.isBuiltin}
                  onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))}
                />

                <label className="block min-w-0 space-y-2">
                  <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>适用模型族</span>
                  <select
                    value={selectedNovelAI.模型族}
                    disabled={selectedNovelAI.isBuiltin}
                    onChange={(e) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, 模型族: e.target.value as NovelAI模型族, updatedAt: Date.now() }))}
                    className="kaituo-input w-full min-w-0 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
                    style={{ clipPath: smallClip }}
                  >
                    <option value="all">全部模型</option>
                    <option value="v3">V3</option>
                    <option value="v4">V4</option>
                    <option value="v4.5">V4.5</option>
                  </select>
                </label>

                <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                  <div className="min-w-0 space-y-3 border-t pt-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.12)' }}>
                    <NovelAIContentModeField
                      label="Quality Tags 模式"
                      value={selectedNovelAI.qualityMode}
                      disabled={selectedNovelAI.isBuiltin}
                      onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, qualityMode: value, updatedAt: Date.now() }))}
                    />
                    <TemplateTextarea
                      label="Quality Tags 自定义字符串"
                      value={selectedNovelAI.qualityText}
                      rows={5}
                      disabled={selectedNovelAI.isBuiltin}
                      onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, qualityText: value, updatedAt: Date.now() }))}
                    />
                  </div>
                  <div className="min-w-0 space-y-3 border-t pt-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.12)' }}>
                    <NovelAIContentModeField
                      label="Undesired Content 模式"
                      value={selectedNovelAI.ucMode}
                      disabled={selectedNovelAI.isBuiltin}
                      onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, ucMode: value, updatedAt: Date.now() }))}
                    />
                    <TemplateTextarea
                      label="Undesired Content 自定义字符串"
                      value={selectedNovelAI.ucText}
                      rows={5}
                      disabled={selectedNovelAI.isBuiltin}
                      onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, ucText: value, updatedAt: Date.now() }))}
                    />
                  </div>
                </div>

                <div className="grid min-w-0 gap-4 md:grid-cols-2">
                  <TemplateTextarea label="Base Prompt 前缀" value={selectedNovelAI.basePromptPrefix} rows={4} disabled={selectedNovelAI.isBuiltin} onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, basePromptPrefix: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="Base Prompt 后缀" value={selectedNovelAI.basePromptSuffix} rows={4} disabled={selectedNovelAI.isBuiltin} onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, basePromptSuffix: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="Character Prompt 前缀" value={selectedNovelAI.characterPromptPrefix} rows={4} disabled={selectedNovelAI.isBuiltin} onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, characterPromptPrefix: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="Character Prompt 后缀" value={selectedNovelAI.characterPromptSuffix} rows={4} disabled={selectedNovelAI.isBuiltin} onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, characterPromptSuffix: value, updatedAt: Date.now() }))} />
                </div>
                <TemplateTextarea
                  label="Negative Prompt 追加"
                  value={selectedNovelAI.negativePromptAppend}
                  rows={5}
                  disabled={selectedNovelAI.isBuiltin}
                  onChange={(value) => updateNovelAIRule(selectedNovelAI.id, (preset) => ({ ...preset, negativePromptAppend: value, updatedAt: Date.now() }))}
                />
              </div>
            ) : (
              <EmptyBox>暂无 NAI 规则预设。</EmptyBox>
            )}
          </div>
        </TemplateCard>
      )}

      {activeRuleTab === 'snapshot' && (
        <TemplateCard
          eyebrow="Story Snapshot Parser"
          title="故事快照解析规则"
          desc="系统基线保持只读；新建或复制为自定义规则后，可编辑画面理解语义，输出 Schema 与安全契约仍由系统固定。"
          actions={
            <>
              <TemplateButton onClick={addSnapshotRule}>新建规则</TemplateButton>
              <TemplateButton onClick={copySnapshotRuleAsCustom}>复制为自定义</TemplateButton>
              {selectedSnapshot && (
                <TemplateButton
                  onClick={() => onChange({ 当前故事快照解析规则预设ID: selectedSnapshot.id })}
                  disabled={activeSnapshotId === selectedSnapshot.id}
                >设为当前生效</TemplateButton>
              )}
              <TemplateButton onClick={deleteSnapshotRule} disabled={!selectedSnapshot || selectedSnapshot.isBuiltin} danger>删除自定义</TemplateButton>
            </>
          }
        >
          <div className="grid min-w-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="min-w-0 space-y-3">
              <PresetSelectField
                label="当前生效"
                value={activeSnapshot?.id ?? ''}
                onChange={(value) => onChange({ 当前故事快照解析规则预设ID: value })}
                presets={normalizedRules.故事快照解析规则预设列表}
              />
              <PresetSelectField
                label="当前编辑"
                value={selectedSnapshot?.id ?? ''}
                onChange={setSnapshotEditorId}
                presets={normalizedRules.故事快照解析规则预设列表}
              />
              <BuiltinPresetState isBuiltin={Boolean(selectedSnapshot?.isBuiltin)} />
            </div>

            {selectedSnapshot ? (
              <div className="min-w-0 space-y-4">
                <TextInput
                  label="预设名称"
                  value={selectedSnapshot.名称}
                  disabled={selectedSnapshot.isBuiltin}
                  onChange={(value) => updateSnapshotRule(selectedSnapshot.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))}
                />
                <TemplateTextarea
                  label="语义规则"
                  value={selectedSnapshot.语义规则}
                  rows={18}
                  disabled={selectedSnapshot.isBuiltin}
                  onChange={(value) => updateSnapshotRule(selectedSnapshot.id, (preset) => ({ ...preset, 语义规则: value, updatedAt: Date.now() }))}
                />
              </div>
            ) : (
              <EmptyBox>暂无故事快照解析规则。</EmptyBox>
            )}
          </div>
        </TemplateCard>
      )}

      {activeRuleTab === 'model' && (
      <TemplateCard
        eyebrow="模型规则集"
        title="模型规则集"
        desc="模型规则集负责绑定角色生成规则与场景生成规则，并提供模型专属规则与锚定模式补充。场景判定层已退场，正文生图固定走故事快照流程。"
        actions={
          <>
            <TemplateButton onClick={addModelRule}>新增规则集</TemplateButton>
            <TemplateButton onClick={deleteModelRule} disabled={!selectedModelRule} danger>删除当前</TemplateButton>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            <ModelSelectField
              label="当前启用"
              value={activeModelRule?.id ?? ''}
              onChange={setActiveModelRule}
              presets={normalizedRules.模型词组转化器预设列表}
              emptyLabel="不启用模型规则集"
            />
            <ModelSelectField
              label="当前编辑"
              value={selectedModelRule?.id ?? ''}
              onChange={setModelEditorId}
              presets={normalizedRules.模型词组转化器预设列表}
              emptyLabel="未选择规则集"
            />
          </div>
          {selectedModelRule ? (
            <div className="space-y-4">
              <TextInput label="规则集名称" value={selectedModelRule.名称} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))} />
              <div className="grid gap-3 md:grid-cols-2">
                <SelectField label="绑定角色生成规则" value={selectedModelRule.NPC词组转化器提示词预设ID} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, NPC词组转化器提示词预设ID: value, updatedAt: Date.now() }))} presets={获取规则模板列表(normalizedRules, 'npc')} />
                <SelectField label="绑定场景生成规则" value={selectedModelRule.场景词组转化器提示词预设ID} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, 场景词组转化器提示词预设ID: value, updatedAt: Date.now() }))} presets={获取规则模板列表(normalizedRules, 'scene')} />
              </div>
              <TemplateTextarea label="基础模型规则" value={selectedModelRule.模型专属提示词} rows={5} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, 模型专属提示词: value, updatedAt: Date.now() }))} />
              <TemplateTextarea label="锚定模式模型规则" value={selectedModelRule.锚定模式模型提示词 || ''} rows={5} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, 锚定模式模型提示词: value, updatedAt: Date.now() }))} />
            </div>
          ) : (
            <EmptyBox>暂无模型规则集。</EmptyBox>
          )}
        </div>
      </TemplateCard>
      )}

      {activeRuleTab === 'style' && (
      <TemplateCard
        eyebrow="风格预设"
        title="风格层"
        desc="画师串、详细画风和 PNG 画风会叠加使用；这里用分层切换方式单独编辑每一层。"
        >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <LayerSwitchButton active={styleScope === 'npc'} onClick={() => setStyleScope('npc')}>NPC</LayerSwitchButton>
            <LayerSwitchButton active={styleScope === 'scene'} onClick={() => setStyleScope('scene')}>场景</LayerSwitchButton>
          </div>
          <div className="flex flex-wrap gap-2">
            <LayerSwitchButton active={activeStyleLayer === 'artist'} onClick={() => setActiveStyleLayer('artist')}>画师串</LayerSwitchButton>
            <LayerSwitchButton active={activeStyleLayer === 'detail'} onClick={() => setActiveStyleLayer('detail')}>详细画风</LayerSwitchButton>
            <LayerSwitchButton active={activeStyleLayer === 'quality'} onClick={() => setActiveStyleLayer('quality')}>质量增强</LayerSwitchButton>
            <LayerSwitchButton active={activeStyleLayer === 'png'} onClick={() => setActiveStyleLayer('png')}>PNG 画风</LayerSwitchButton>
          </div>

          {activeStyleLayer === 'artist' && (
            <div className="space-y-4">
              <StylePaneTitleWithState
                title="画师串"
                desc="保留原来的简版风格层，适合放短标签、作者串或基础正负面词。"
                activeName={activeArtist?.名称}
                activeTag={activeArtistId ? '启用中' : '已禁用'}
                active={Boolean(activeArtistId)}
                onEnable={() => selectedArtist && onChange({ [styleScope === 'scene' ? '当前场景画师串预设ID' : '当前NPC画师串预设ID']: selectedArtist.id } as Partial<文生图规则中心设置>)}
                onDisable={() => onChange({ [styleScope === 'scene' ? '当前场景画师串预设ID' : '当前NPC画师串预设ID']: '' } as Partial<文生图规则中心设置>)}
                enableDisabled={!selectedArtist || selectedArtist.id === activeArtistId}
                disableDisabled={!activeArtistId}
                onAdd={addArtist}
                onDelete={deleteArtist}
                deleteDisabled={!selectedArtist}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <ArtistSelectField label="当前编辑画师串" value={selectedArtist?.id ?? ''} onChange={setArtistEditorId} presets={scopedArtistPresets} />
              </div>
              {selectedArtist ? (
                <>
                  <TextInput label="画师串名称" value={selectedArtist.名称} onChange={(value) => updateArtist(selectedArtist.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))} />
                  <select value={selectedArtist.适用范围} onChange={(e) => updateArtist(selectedArtist.id, (preset) => ({ ...preset, 适用范围: e.target.value as 画师串预设适用范围, updatedAt: Date.now() }))} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                    <option value="npc">NPC</option>
                    <option value="scene">场景</option>
                    <option value="all">通用</option>
                  </select>
                  <TemplateTextarea label="画师串" value={selectedArtist.画师串} rows={3} onChange={(value) => updateArtist(selectedArtist.id, (preset) => ({ ...preset, 画师串: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="正面提示词" value={selectedArtist.正面提示词} rows={5} onChange={(value) => updateArtist(selectedArtist.id, (preset) => ({ ...preset, 正面提示词: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="负面提示词" value={selectedArtist.负面提示词} rows={4} onChange={(value) => updateArtist(selectedArtist.id, (preset) => ({ ...preset, 负面提示词: value, updatedAt: Date.now() }))} />
                </>
              ) : <EmptyBox>暂无画师串预设。</EmptyBox>}
            </div>
          )}

          {activeStyleLayer === 'detail' && (
            <div className="space-y-4">
              <StylePaneTitleWithState
                title="详细画风"
                desc="独立于旧画师串，用更细的层级控制风格、镜头、光影和材质。"
                activeName={activeDetailStyle?.名称}
                activeTag={activeDetailStyleId ? '启用中' : '已禁用'}
                active={Boolean(activeDetailStyleId)}
                onEnable={() => selectedDetailStyle && onChange({ [styleScope === 'scene' ? '当前场景详细画风预设ID' : '当前NPC详细画风预设ID']: selectedDetailStyle.id } as Partial<文生图规则中心设置>)}
                onDisable={() => onChange({ [styleScope === 'scene' ? '当前场景详细画风预设ID' : '当前NPC详细画风预设ID']: '' } as Partial<文生图规则中心设置>)}
                enableDisabled={!selectedDetailStyle || selectedDetailStyle.id === activeDetailStyleId}
                disableDisabled={!activeDetailStyleId}
                onAdd={addDetailStyle}
                onDelete={deleteDetailStyle}
                deleteDisabled={!selectedDetailStyle}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <DetailStyleSelectField label="当前编辑详细画风" value={selectedDetailStyle?.id ?? ''} onChange={setDetailStyleEditorId} presets={scopedDetailStylePresets} />
              </div>
              {selectedDetailStyle ? (
                <>
                  <TextInput label="详细画风名称" value={selectedDetailStyle.名称} onChange={(value) => updateDetailStyle(selectedDetailStyle.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))} />
                  <select value={selectedDetailStyle.适用范围} onChange={(e) => updateDetailStyle(selectedDetailStyle.id, (preset) => ({ ...preset, 适用范围: e.target.value as 画师串预设适用范围, updatedAt: Date.now() }))} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                    <option value="npc">NPC</option>
                    <option value="scene">场景</option>
                    <option value="all">通用</option>
                  </select>
                  <div className="grid gap-3 md:grid-cols-2">
                    <TemplateTextarea label="风格定位" value={selectedDetailStyle.风格定位} rows={4} onChange={(value) => updateDetailStyle(selectedDetailStyle.id, (preset) => ({ ...preset, 风格定位: value, updatedAt: Date.now() }))} />
                    <TemplateTextarea label="构图镜头" value={selectedDetailStyle.构图镜头} rows={4} onChange={(value) => updateDetailStyle(selectedDetailStyle.id, (preset) => ({ ...preset, 构图镜头: value, updatedAt: Date.now() }))} />
                    <TemplateTextarea label="光影色彩" value={selectedDetailStyle.光影色彩} rows={4} onChange={(value) => updateDetailStyle(selectedDetailStyle.id, (preset) => ({ ...preset, 光影色彩: value, updatedAt: Date.now() }))} />
                    <TemplateTextarea label="材质细节" value={selectedDetailStyle.材质细节} rows={4} onChange={(value) => updateDetailStyle(selectedDetailStyle.id, (preset) => ({ ...preset, 材质细节: value, updatedAt: Date.now() }))} />
                  </div>
                  <TemplateTextarea label="详细正面提示词" value={selectedDetailStyle.正面提示词} rows={5} onChange={(value) => updateDetailStyle(selectedDetailStyle.id, (preset) => ({ ...preset, 正面提示词: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="详细负面提示词" value={selectedDetailStyle.负面提示词} rows={4} onChange={(value) => updateDetailStyle(selectedDetailStyle.id, (preset) => ({ ...preset, 负面提示词: value, updatedAt: Date.now() }))} />
                </>
              ) : <EmptyBox>暂无详细画风预设。</EmptyBox>}
            </div>
          )}

          {activeStyleLayer === 'quality' && (
            <div className="space-y-4">
              <StylePaneTitleWithState
                title="质量增强"
                desc="可选的人体、发型与轮廓稳定层。默认禁用，启用后会叠加到角色、场景、故事快照和正文插图的最终提示词。"
                activeName={activeQuality?.名称}
                activeTag={activeQualityId ? '启用中' : '已禁用'}
                active={Boolean(activeQualityId)}
                onEnable={() => selectedQuality && onChange({ 当前质量增强预设ID: selectedQuality.id })}
                onDisable={() => onChange({ 当前质量增强预设ID: '' })}
                enableDisabled={!selectedQuality || selectedQuality.id === activeQualityId}
                disableDisabled={!activeQualityId}
                onAdd={addQuality}
                onDelete={deleteQuality}
                deleteDisabled={!selectedQuality}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <QualitySelectField label="当前编辑质量增强" value={selectedQuality?.id ?? ''} onChange={setQualityEditorId} presets={normalizedRules.质量增强预设列表} />
              </div>
              {selectedQuality ? (
                <>
                  <TextInput label="质量增强名称" value={selectedQuality.名称} onChange={(value) => updateQuality(selectedQuality.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="正面增强提示词" value={selectedQuality.正面提示词} rows={6} onChange={(value) => updateQuality(selectedQuality.id, (preset) => ({ ...preset, 正面提示词: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="负面增强提示词" value={selectedQuality.负面提示词} rows={5} onChange={(value) => updateQuality(selectedQuality.id, (preset) => ({ ...preset, 负面提示词: value, updatedAt: Date.now() }))} />
                </>
              ) : <EmptyBox>暂无质量增强预设。</EmptyBox>}
            </div>
          )}

          {activeStyleLayer === 'png' && (
            <div className="space-y-4">
              <StylePaneTitleWithState
                title="PNG 画风"
                desc="从参考图或 PNG 元数据整理出的风格层，可和详细画风同时叠加。"
                activeName={activePng?.名称}
                activeTag={activePngId ? '启用中' : '已禁用'}
                active={Boolean(activePngId)}
                onEnable={() => selectedPng && onChange({ [styleScope === 'scene' ? '当前场景PNG画风预设ID' : '当前NPCPNG画风预设ID']: selectedPng.id } as Partial<文生图规则中心设置>)}
                onDisable={() => onChange({ [styleScope === 'scene' ? '当前场景PNG画风预设ID' : '当前NPCPNG画风预设ID']: '' } as Partial<文生图规则中心设置>)}
                enableDisabled={!selectedPng || selectedPng.id === activePngId}
                disableDisabled={!activePngId}
                onAdd={addPng}
                onDelete={deletePng}
                deleteDisabled={!selectedPng}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <PngSelectField label="当前编辑PNG画风" value={selectedPng?.id ?? ''} onChange={setPngEditorId} presets={normalizedRules.PNG画风预设列表} />
              </div>
              {selectedPng ? (
                <>
                  <TextInput label="PNG画风名称" value={selectedPng.名称} onChange={(value) => updatePng(selectedPng.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))} />
                  <select value={selectedPng.来源} onChange={(e) => updatePng(selectedPng.id, (preset) => ({ ...preset, 来源: e.target.value as PNG画风预设来源, updatedAt: Date.now() }))} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
                    <option value="unknown">unknown</option>
                    <option value="novelai">NovelAI</option>
                    <option value="sd_webui">SD WebUI</option>
                    <option value="comfyui">ComfyUI</option>
                  </select>
                  <TemplateTextarea label="PNG画师串" value={selectedPng.画师串} rows={3} onChange={(value) => updatePng(selectedPng.id, (preset) => ({ ...preset, 画师串: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="正面提示词" value={selectedPng.正面提示词} rows={5} onChange={(value) => updatePng(selectedPng.id, (preset) => ({ ...preset, 正面提示词: value, updatedAt: Date.now() }))} />
                  <TemplateTextarea label="负面提示词" value={selectedPng.负面提示词} rows={4} onChange={(value) => updatePng(selectedPng.id, (preset) => ({ ...preset, 负面提示词: value, updatedAt: Date.now() }))} />
                </>
              ) : <EmptyBox>暂无PNG画风预设。</EmptyBox>}
            </div>
          )}
        </div>
      </TemplateCard>
      )}

      {activeRuleTab === 'template' && (
      <div
        className="space-y-4 p-4"
        style={{
          background: 'rgba(0,0,0,0.24)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
          clipPath: smallClip,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-serif text-xs font-bold tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>
              规则模板
            </div>
            <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.62)' }}>
              角色生成与场景生成分开维护；普通用户只需要选择当前生效模板，高级用户可以继续编辑细项。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ruleSections.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className="px-3 py-2 text-xs font-serif tracking-[0.12em] transition-all"
                style={{
                  color: activeSection === item.id ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-accent-primary),0.86)',
                  background: activeSection === item.id
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.9))'
                    : 'rgba(var(--tj-accent-primary),0.055)',
                  boxShadow: activeSection === item.id
                    ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                  clipPath: smallClip,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="space-y-4 p-4"
          style={{
            background: 'rgba(0,0,0,0.28)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.10)',
            clipPath: smallClip,
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.10)' }}>
            <div>
              <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.9)' }}>
                {section.label}
              </div>
              <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>{section.desc}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <TemplateButton onClick={addPreset}>新增规则</TemplateButton>
              <TemplateButton onClick={deletePreset} disabled={!selectedPreset} danger>删除当前</TemplateButton>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-3">
              <SelectField
                label="当前生效"
                value={activeId}
                onChange={setActiveId}
                presets={presets}
              />
              <SelectField
                label="当前编辑"
                value={selectedPreset?.id ?? ''}
                onChange={setEditorId}
                presets={presets}
              />
            </div>

            {selectedPreset ? (
              <div className="space-y-4">
                <TextInput
                  label="规则名称"
                  value={selectedPreset.名称}
                  onChange={(value) => updatePreset(selectedPreset.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))}
                />
                <TemplateTextarea
                  label="基础生成规则"
                  value={selectedPreset.提示词}
                  rows={8}
                  onChange={(value) => updatePreset(selectedPreset.id, (preset) => ({ ...preset, 提示词: value, updatedAt: Date.now() }))}
                />
                {activeSection === 'npc' && (
                  <TemplateTextarea
                    label="锚定模式专属规则"
                    value={selectedPreset.角色锚定模式提示词 || ''}
                    rows={6}
                    onChange={(value) => updatePreset(selectedPreset.id, (preset) => ({ ...preset, 角色锚定模式提示词: value, updatedAt: Date.now() }))}
                  />
                )}
                {activeSection === 'scene' && (
                  <TemplateTextarea
                    label="场景锚定专属规则"
                    value={selectedPreset.场景角色锚定模式提示词 || ''}
                    rows={6}
                    onChange={(value) => updatePreset(selectedPreset.id, (preset) => ({ ...preset, 场景角色锚定模式提示词: value, updatedAt: Date.now() }))}
                  />
                )}
                <TemplateTextarea
                  label="无锚点回退规则"
                  value={selectedPreset.无锚点回退提示词 || ''}
                  rows={4}
                  onChange={(value) => updatePreset(selectedPreset.id, (preset) => ({ ...preset, 无锚点回退提示词: value, updatedAt: Date.now() }))}
                />
                <TemplateTextarea
                  label="输出格式规则"
                  value={selectedPreset.输出格式提示词 || ''}
                  rows={4}
                  onChange={(value) => updatePreset(selectedPreset.id, (preset) => ({ ...preset, 输出格式提示词: value, updatedAt: Date.now() }))}
                />
              </div>
            ) : (
              <div
                className="p-4 text-center text-sm"
                style={{
                  color: 'rgba(var(--tj-accent-primary),0.42)',
                  background: 'rgba(0,0,0,0.18)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
                  clipPath: smallClip,
                }}
              >
                暂无{section.label}。
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, presets }: { label: string; value: string; onChange: (value: string) => void; presets: 文生图规则模板[] }) {
  const options = value && !presets.some((preset) => preset.id === value)
    ? [{ id: value, 名称: `${value}（当前缺失）`, 类型: 'npc' as const, 提示词: '', createdAt: 0, updatedAt: 0 }, ...presets]
    : presets;
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        <option value="">不启用</option>
        {options.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
      </select>
    </label>
  );
}

function PresetSelectField({
  label,
  value,
  onChange,
  presets,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  presets: { id: string; 名称: string; isBuiltin: boolean }[];
}) {
  return (
    <label className="block min-w-0 space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full min-w-0 px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        {presets.map((preset) => (
          <option key={preset.id} value={preset.id}>{preset.isBuiltin ? '◆ ' : ''}{preset.名称}</option>
        ))}
      </select>
    </label>
  );
}

function NovelAIContentModeField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: NovelAIContentMode;
  onChange: (value: NovelAIContentMode) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0 space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as NovelAIContentMode)}
        className="kaituo-input w-full min-w-0 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        style={{ clipPath: smallClip }}
      >
        {novelAIContentModes.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
      </select>
    </label>
  );
}

function BuiltinPresetState({ isBuiltin }: { isBuiltin: boolean }) {
  return (
    <div
      className="px-3 py-2 text-[11px] font-serif tracking-[0.12em]"
      style={{
        color: isBuiltin ? 'rgba(var(--tj-accent-primary),0.82)' : 'rgba(var(--tj-text-secondary),0.62)',
        background: isBuiltin ? 'rgba(var(--tj-accent-primary),0.07)' : 'rgba(255,255,255,0.035)',
        boxShadow: isBuiltin ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.20)' : 'inset 0 0 0 1px rgba(var(--tj-text-secondary),0.10)',
        clipPath: smallClip,
      }}
    >
      {isBuiltin ? '◆ 系统内置 · 只读 · 复制后可编辑' : '自定义预设 · 可编辑'}
    </div>
  );
}

function ModelSelectField({ label, value, onChange, presets, emptyLabel }: { label: string; value: string; onChange: (value: string) => void; presets: 文生图模型规则集[]; emptyLabel: string }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        <option value="">{emptyLabel}</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
      </select>
    </label>
  );
}

function ArtistSelectField({ label, value, onChange, presets }: { label: string; value: string; onChange: (value: string) => void; presets: 文生图画师串预设[] }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        <option value="">不启用</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
      </select>
    </label>
  );
}

function DetailStyleSelectField({ label, value, onChange, presets }: { label: string; value: string; onChange: (value: string) => void; presets: 文生图详细画风预设[] }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        <option value="">不启用</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
      </select>
    </label>
  );
}

function PngSelectField({ label, value, onChange, presets }: { label: string; value: string; onChange: (value: string) => void; presets: 文生图PNG画风预设[] }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        <option value="">不启用</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
      </select>
    </label>
  );
}

function QualitySelectField({ label, value, onChange, presets }: { label: string; value: string; onChange: (value: string) => void; presets: 文生图质量增强预设[] }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        <option value="">不启用</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
      </select>
    </label>
  );
}

function StylePaneTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div
      className="space-y-1 p-3"
      style={{
        background: 'rgba(var(--tj-accent-primary),0.045)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="font-serif text-xs font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.88)' }}>{title}</div>
      <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>{desc}</div>
    </div>
  );
}

function StylePaneTitleWithState({
  title,
  desc,
  activeName,
  activeTag,
  active,
  onEnable,
  onDisable,
  enableDisabled,
  disableDisabled,
  onAdd,
  onDelete,
  deleteDisabled,
}: {
  title: string;
  desc: string;
  activeName?: string | null;
  activeTag: string;
  active: boolean;
  onEnable: () => void;
  onDisable: () => void;
  enableDisabled?: boolean;
  disableDisabled?: boolean;
  onAdd: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 p-3"
      style={{
        background: 'rgba(var(--tj-accent-primary),0.045)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="font-serif text-xs font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.88)' }}>{title}</div>
        <div className="text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>{desc}</div>
      </div>
      <div className="flex min-w-[250px] flex-wrap items-center justify-end gap-2">
        <div
          className="px-3 py-2 text-[11px] font-serif tracking-[0.12em]"
          style={{
            color: active ? 'rgba(var(--tj-accent-primary),0.94)' : 'rgba(var(--tj-text-secondary),0.45)',
            background: active ? 'rgba(var(--tj-accent-primary),0.075)' : 'rgba(255,255,255,0.035)',
            boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.22)' : 'inset 0 0 0 1px rgba(var(--tj-text-secondary),0.10)',
            clipPath: smallClip,
          }}
          title={activeName || '未启用'}
        >
          {activeTag}{activeName ? ` · ${activeName}` : ''}
        </div>
        <TemplateButton onClick={onAdd}>新增</TemplateButton>
        <TemplateButton onClick={onDelete} disabled={deleteDisabled} danger>删除</TemplateButton>
        <TemplateButton onClick={onEnable} disabled={enableDisabled}>启用当前编辑</TemplateButton>
        <TemplateButton onClick={onDisable} disabled={disableDisabled} danger>禁用此层</TemplateButton>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50" style={{ clipPath: smallClip }} />
    </label>
  );
}

function TemplateTextarea({ label, value, onChange, rows, disabled = false }: { label: string; value: string; onChange: (value: string) => void; rows: number; disabled?: boolean }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.66)' }}>{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs leading-relaxed disabled:cursor-not-allowed disabled:opacity-50"
        style={{ clipPath: smallClip }}
      />
    </label>
  );
}

function TemplateButton({ children, onClick, disabled = false, danger = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-3 py-2 text-xs font-serif tracking-[0.14em] disabled:opacity-40"
      style={{
        color: danger ? 'rgba(255,190,190,0.9)' : 'rgba(var(--tj-accent-primary),0.88)',
        background: danger ? 'rgba(170,60,70,0.10)' : 'rgba(var(--tj-accent-primary),0.055)',
        boxShadow: danger ? 'inset 0 0 0 1px rgba(255,130,140,0.22)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.20)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function LayerSwitchButton({ children, active, onClick }: { children: ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 text-xs font-serif tracking-[0.16em] transition-all"
      style={{
        color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-accent-primary),0.78)',
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-accent-secondary),0.88))'
          : 'rgba(var(--tj-accent-primary),0.045)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.38), 0 0 14px rgba(var(--tj-accent-secondary),0.18)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function TemplateCard({ eyebrow, title, desc, actions, children }: { eyebrow: string; title: string; desc: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div
      className="space-y-4 p-4"
      style={{
        background: 'rgba(0,0,0,0.24)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.10)' }}>
        <div>
          <div className="font-serif text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(var(--tj-accent-primary),0.58)' }}>{eyebrow}</div>
          <div className="mt-1 font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.9)' }}>{title}</div>
          <div className="mt-1 max-w-3xl text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>{desc}</div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function EmptyBox({ children }: { children: ReactNode }) {
  return (
    <div
      className="p-4 text-center text-sm"
      style={{
        color: 'rgba(var(--tj-accent-primary),0.42)',
        background: 'rgba(0,0,0,0.18)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
        clipPath: smallClip,
      }}
    >
      {children}
    </div>
  );
}

function getActiveId(rules: 文生图规则中心设置, type: VisibleRuleSection): string {
  if (type === 'scene') return rules.当前场景词组转化器提示词预设ID;
  return rules.当前NPC词组转化器提示词预设ID;
}

function activeIdKey(type: VisibleRuleSection): keyof 文生图规则中心设置 {
  if (type === 'scene') return '当前场景词组转化器提示词预设ID';
  return '当前NPC词组转化器提示词预设ID';
}
