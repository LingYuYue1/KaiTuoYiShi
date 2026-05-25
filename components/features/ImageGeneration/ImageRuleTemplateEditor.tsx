import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PNG画风预设来源, 文生图PNG画风预设, 文生图画师串预设, 文生图模型规则集, 文生图规则模板, 文生图规则模板类型, 文生图规则中心设置, 画师串预设适用范围 } from '@/models/settings';
import { 获取规则模板列表 } from '@/utils/imagePromptRules';

interface Props {
  rules: 文生图规则中心设置;
  onChange: (patch: Partial<文生图规则中心设置>) => void;
}

const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

const ruleSections: { id: 文生图规则模板类型; label: string; desc: string }[] = [
  { id: 'npc', label: 'NPC 转化规则', desc: '角色图使用基础规则；锚定开启后改用专属锚定规则。' },
  { id: 'scene', label: '场景转化规则', desc: '场景图使用空间与构图规则；角色锚定存在时改用场景锚定规则。' },
  { id: 'scene_judge', label: '场景判定规则', desc: '用于判断当前文本应生成风景场景还是故事快照。' },
];

type RuleCenterTab = 'model' | 'style' | 'template';

const ruleCenterTabs: { id: RuleCenterTab; label: string; desc: string }[] = [
  { id: 'template', label: '规则模板', desc: 'NPC / 场景 / 判定' },
  { id: 'model', label: '模型规则集', desc: '绑定模型与模板' },
  { id: 'style', label: '风格预设', desc: '画师串 / PNG' },
];

export function ImageRuleTemplateEditor({ rules, onChange }: Props) {
  const [activeRuleTab, setActiveRuleTab] = useState<RuleCenterTab>('template');
  const [activeSection, setActiveSection] = useState<文生图规则模板类型>('npc');
  const [styleScope, setStyleScope] = useState<'npc' | 'scene'>('npc');
  const [modelEditorId, setModelEditorId] = useState('');
  const [artistEditorId, setArtistEditorId] = useState('');
  const [pngEditorId, setPngEditorId] = useState('');
  const [editorIds, setEditorIds] = useState<Record<文生图规则模板类型, string>>({
    npc: '',
    scene: '',
    scene_judge: '',
  });

  const section = ruleSections.find((item) => item.id === activeSection) ?? ruleSections[0];
  const presets = useMemo(() => 获取规则模板列表(rules, activeSection), [rules, activeSection]);
  const activeId = getActiveId(rules, activeSection);
  const editorId = editorIds[activeSection] || activeId || presets[0]?.id || '';
  const selectedPreset = presets.find((preset) => preset.id === editorId) ?? presets[0] ?? null;
  const activeModelRule = rules.模型词组转化器预设列表.find((preset) => preset.是否启用) ?? null;
  const selectedModelRule = rules.模型词组转化器预设列表.find((preset) => preset.id === (modelEditorId || activeModelRule?.id)) ?? rules.模型词组转化器预设列表[0] ?? null;
  const scopedArtistPresets = rules.画师串预设列表.filter((preset) => preset.适用范围 === styleScope || preset.适用范围 === 'all');
  const activeArtistId = styleScope === 'scene' ? rules.当前场景画师串预设ID : rules.当前NPC画师串预设ID;
  const selectedArtist = scopedArtistPresets.find((preset) => preset.id === (artistEditorId || activeArtistId)) ?? scopedArtistPresets[0] ?? null;
  const activePngId = styleScope === 'scene' ? rules.当前场景PNG画风预设ID : rules.当前NPCPNG画风预设ID;
  const selectedPng = rules.PNG画风预设列表.find((preset) => preset.id === (pngEditorId || activePngId)) ?? rules.PNG画风预设列表[0] ?? null;

  useEffect(() => {
    if (editorIds[activeSection] && presets.some((preset) => preset.id === editorIds[activeSection])) return;
    setEditorIds((prev) => ({ ...prev, [activeSection]: activeId || presets[0]?.id || '' }));
  }, [activeId, activeSection, editorIds, presets]);

  useEffect(() => {
    if (modelEditorId && rules.模型词组转化器预设列表.some((preset) => preset.id === modelEditorId)) return;
    setModelEditorId(activeModelRule?.id || rules.模型词组转化器预设列表[0]?.id || '');
  }, [activeModelRule?.id, modelEditorId, rules.模型词组转化器预设列表]);

  useEffect(() => {
    if (artistEditorId && scopedArtistPresets.some((preset) => preset.id === artistEditorId)) return;
    setArtistEditorId(activeArtistId || scopedArtistPresets[0]?.id || '');
  }, [activeArtistId, artistEditorId, scopedArtistPresets]);

  useEffect(() => {
    if (pngEditorId && rules.PNG画风预设列表.some((preset) => preset.id === pngEditorId)) return;
    setPngEditorId(activePngId || rules.PNG画风预设列表[0]?.id || '');
  }, [activePngId, pngEditorId, rules.PNG画风预设列表]);

  const setActiveId = (id: string) => {
    onChange({ [activeIdKey(activeSection)]: id } as Partial<文生图规则中心设置>);
  };

  const setEditorId = (id: string) => {
    setEditorIds((prev) => ({ ...prev, [activeSection]: id }));
  };

  const updatePreset = (id: string, updater: (preset: 文生图规则模板) => 文生图规则模板) => {
    onChange({
      词组转化器提示词预设列表: rules.词组转化器提示词预设列表.map((preset) => (
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
      无锚点回退提示词: activeSection !== 'scene_judge' ? '' : undefined,
      输出格式提示词: activeSection !== 'scene_judge' ? '' : undefined,
      createdAt: now,
      updatedAt: now,
    };
    onChange({
      词组转化器提示词预设列表: [...rules.词组转化器提示词预设列表, next],
      [activeIdKey(activeSection)]: getActiveId(rules, activeSection) || next.id,
    } as Partial<文生图规则中心设置>);
    setEditorId(next.id);
  };

  const deletePreset = () => {
    if (!selectedPreset) return;
    const remaining = rules.词组转化器提示词预设列表.filter((preset) => preset.id !== selectedPreset.id);
    const nextActive = remaining.find((preset) => preset.类型 === activeSection)?.id ?? '';
    onChange({
      词组转化器提示词预设列表: remaining,
      [activeIdKey(activeSection)]: activeId === selectedPreset.id ? nextActive : activeId,
    } as Partial<文生图规则中心设置>);
    setEditorId(nextActive);
  };

  const updateModelRule = (id: string, updater: (preset: 文生图模型规则集) => 文生图模型规则集) => {
    onChange({
      模型词组转化器预设列表: rules.模型词组转化器预设列表.map((preset) => (
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
      是否启用: rules.模型词组转化器预设列表.length === 0,
      NPC词组转化器提示词预设ID: 获取规则模板列表(rules, 'npc')[0]?.id ?? '',
      场景词组转化器提示词预设ID: 获取规则模板列表(rules, 'scene')[0]?.id ?? '',
      场景判定提示词预设ID: 获取规则模板列表(rules, 'scene_judge')[0]?.id ?? '',
      createdAt: now,
      updatedAt: now,
    };
    onChange({ 模型词组转化器预设列表: [...rules.模型词组转化器预设列表, next] });
    setModelEditorId(next.id);
  };

  const deleteModelRule = () => {
    if (!selectedModelRule) return;
    const remaining = rules.模型词组转化器预设列表.filter((preset) => preset.id !== selectedModelRule.id);
    onChange({ 模型词组转化器预设列表: remaining });
    setModelEditorId(remaining[0]?.id ?? '');
  };

  const setActiveModelRule = (id: string) => {
    onChange({
      模型词组转化器预设列表: rules.模型词组转化器预设列表.map((preset) => ({
        ...preset,
        是否启用: id ? preset.id === id : false,
        updatedAt: preset.id === id ? Date.now() : preset.updatedAt,
      })),
    });
  };

  const updateArtist = (id: string, updater: (preset: 文生图画师串预设) => 文生图画师串预设) => {
    onChange({
      画师串预设列表: rules.画师串预设列表.map((preset) => (
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
      画师串预设列表: [...rules.画师串预设列表, next],
      [styleScope === 'scene' ? '当前场景画师串预设ID' : '当前NPC画师串预设ID']: activeArtistId || next.id,
    } as Partial<文生图规则中心设置>);
    setArtistEditorId(next.id);
  };

  const deleteArtist = () => {
    if (!selectedArtist) return;
    const remaining = rules.画师串预设列表.filter((preset) => preset.id !== selectedArtist.id);
    const nextId = remaining.find((preset) => preset.适用范围 === styleScope || preset.适用范围 === 'all')?.id ?? '';
    onChange({
      画师串预设列表: remaining,
      [styleScope === 'scene' ? '当前场景画师串预设ID' : '当前NPC画师串预设ID']: activeArtistId === selectedArtist.id ? nextId : activeArtistId,
    } as Partial<文生图规则中心设置>);
    setArtistEditorId(nextId);
  };

  const updatePng = (id: string, updater: (preset: 文生图PNG画风预设) => 文生图PNG画风预设) => {
    onChange({
      PNG画风预设列表: rules.PNG画风预设列表.map((preset) => (
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
      PNG画风预设列表: [...rules.PNG画风预设列表, next],
      [styleScope === 'scene' ? '当前场景PNG画风预设ID' : '当前NPCPNG画风预设ID']: activePngId || next.id,
    } as Partial<文生图规则中心设置>);
    setPngEditorId(next.id);
  };

  const deletePng = () => {
    if (!selectedPng) return;
    const remaining = rules.PNG画风预设列表.filter((preset) => preset.id !== selectedPng.id);
    const nextId = remaining[0]?.id ?? '';
    onChange({
      PNG画风预设列表: remaining,
      当前NPCPNG画风预设ID: rules.当前NPCPNG画风预设ID === selectedPng.id ? nextId : rules.当前NPCPNG画风预设ID,
      当前场景PNG画风预设ID: rules.当前场景PNG画风预设ID === selectedPng.id ? nextId : rules.当前场景PNG画风预设ID,
    });
    setPngEditorId(nextId);
  };

  return (
    <div className="space-y-4">
      <div
        className="grid gap-2 md:grid-cols-3"
        style={{
          background: 'rgba(0,0,0,0.18)',
          boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.12)',
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
              color: activeRuleTab === tab.id ? '#1a1325' : 'rgba(245,217,122,0.86)',
              background: activeRuleTab === tab.id
                ? 'linear-gradient(135deg, rgba(245,217,122,0.96), rgba(196,163,90,0.92))'
                : 'rgba(245,217,122,0.045)',
              boxShadow: activeRuleTab === tab.id
                ? 'inset 0 0 0 1px rgba(255,245,200,0.45), 0 0 16px rgba(245,217,122,0.10)'
                : 'inset 0 0 0 1px rgba(245,217,122,0.14)',
              clipPath: smallClip,
            }}
          >
            <div className="font-serif text-sm font-bold tracking-[0.16em]">{tab.label}</div>
            <div className="mt-1 truncate text-[11px] opacity-70">{tab.desc}</div>
          </button>
        ))}
      </div>

      {activeRuleTab === 'model' && (
      <TemplateCard
        eyebrow="模型规则集"
        title="模型规则集"
        desc="对标墨色：模型规则集负责绑定 NPC / 场景 / 场景判定模板，并提供模型专属规则与锚定模式模型规则。"
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
              presets={rules.模型词组转化器预设列表}
              emptyLabel="不启用模型规则集"
            />
            <ModelSelectField
              label="当前编辑"
              value={selectedModelRule?.id ?? ''}
              onChange={setModelEditorId}
              presets={rules.模型词组转化器预设列表}
              emptyLabel="未选择规则集"
            />
          </div>
          {selectedModelRule ? (
            <div className="space-y-4">
              <TextInput label="规则集名称" value={selectedModelRule.名称} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, 名称: value, updatedAt: Date.now() }))} />
              <div className="grid gap-3 md:grid-cols-3">
                <SelectField label="绑定 NPC 规则" value={selectedModelRule.NPC词组转化器提示词预设ID} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, NPC词组转化器提示词预设ID: value, updatedAt: Date.now() }))} presets={获取规则模板列表(rules, 'npc')} />
                <SelectField label="绑定场景规则" value={selectedModelRule.场景词组转化器提示词预设ID} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, 场景词组转化器提示词预设ID: value, updatedAt: Date.now() }))} presets={获取规则模板列表(rules, 'scene')} />
                <SelectField label="绑定判定规则" value={selectedModelRule.场景判定提示词预设ID} onChange={(value) => updateModelRule(selectedModelRule.id, (preset) => ({ ...preset, 场景判定提示词预设ID: value, updatedAt: Date.now() }))} presets={获取规则模板列表(rules, 'scene_judge')} />
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
        title="画师串 / PNG 画风"
        desc="画师串负责正负面风格层，PNG 画风用于后续从参考图或 PNG 元数据提炼出的风格层。两者都会参与最终 prompt。"
        actions={
          <div className="flex flex-wrap gap-2">
            <TemplateButton onClick={addArtist}>新增画师串</TemplateButton>
            <TemplateButton onClick={deleteArtist} disabled={!selectedArtist} danger>删除画师串</TemplateButton>
            <TemplateButton onClick={addPng}>新增PNG画风</TemplateButton>
            <TemplateButton onClick={deletePng} disabled={!selectedPng} danger>删除PNG画风</TemplateButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <TemplateButton onClick={() => setStyleScope('npc')} disabled={styleScope === 'npc'}>NPC</TemplateButton>
            <TemplateButton onClick={() => setStyleScope('scene')} disabled={styleScope === 'scene'}>场景</TemplateButton>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <ArtistSelectField label="当前使用画师串" value={activeArtistId} onChange={(value) => onChange({ [styleScope === 'scene' ? '当前场景画师串预设ID' : '当前NPC画师串预设ID']: value } as Partial<文生图规则中心设置>)} presets={scopedArtistPresets} />
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
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <PngSelectField label="当前使用PNG画风" value={activePngId} onChange={(value) => onChange({ [styleScope === 'scene' ? '当前场景PNG画风预设ID' : '当前NPCPNG画风预设ID']: value } as Partial<文生图规则中心设置>)} presets={rules.PNG画风预设列表} />
                <PngSelectField label="当前编辑PNG画风" value={selectedPng?.id ?? ''} onChange={setPngEditorId} presets={rules.PNG画风预设列表} />
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
          </div>
        </div>
      </TemplateCard>
      )}

      {activeRuleTab === 'template' && (
      <div
        className="space-y-4 p-4"
        style={{
          background: 'rgba(0,0,0,0.24)',
          boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.14)',
          clipPath: smallClip,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-serif text-xs font-bold tracking-[0.24em]" style={{ color: 'rgba(245,217,122,0.78)' }}>
              规则模板
            </div>
            <div className="mt-1 text-xs" style={{ color: 'rgba(220,208,178,0.62)' }}>
              选择当前启用的模型规则，并编辑基础模式与锚定模式规则。
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
                  color: activeSection === item.id ? '#1a1325' : 'rgba(245,217,122,0.86)',
                  background: activeSection === item.id
                    ? 'linear-gradient(135deg, rgba(245,217,122,0.96), rgba(196,163,90,0.9))'
                    : 'rgba(245,217,122,0.055)',
                  boxShadow: activeSection === item.id
                    ? 'inset 0 0 0 1px rgba(255,245,200,0.45)'
                    : 'inset 0 0 0 1px rgba(245,217,122,0.18)',
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
            boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.10)',
            clipPath: smallClip,
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'rgba(245,217,122,0.10)' }}>
            <div>
              <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.9)' }}>
                {section.label}
              </div>
              <div className="mt-1 text-xs" style={{ color: 'rgba(220,208,178,0.58)' }}>{section.desc}</div>
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
                  label={activeSection === 'scene_judge' ? '判定规则' : '基础转化规则'}
                  value={selectedPreset.提示词}
                  rows={activeSection === 'scene_judge' ? 10 : 8}
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
                {activeSection !== 'scene_judge' && (
                  <>
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
                  </>
                )}
              </div>
            ) : (
              <div
                className="p-4 text-center text-sm"
                style={{
                  color: 'rgba(245,217,122,0.42)',
                  background: 'rgba(0,0,0,0.18)',
                  boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.12)',
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
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        <option value="">不启用</option>
        {options.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
      </select>
    </label>
  );
}

function ModelSelectField({ label, value, onChange, presets, emptyLabel }: { label: string; value: string; onChange: (value: string) => void; presets: 文生图模型规则集[]; emptyLabel: string }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.66)' }}>{label}</span>
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
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.66)' }}>{label}</span>
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
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.66)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
        <option value="">不启用</option>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
      </select>
    </label>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.66)' }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
    </label>
  );
}

function TemplateTextarea({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-serif tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.66)' }}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="kaituo-input w-full resize-y px-3 py-2 font-mono text-xs leading-relaxed"
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
        color: danger ? 'rgba(255,190,190,0.9)' : 'rgba(245,217,122,0.88)',
        background: danger ? 'rgba(170,60,70,0.10)' : 'rgba(245,217,122,0.055)',
        boxShadow: danger ? 'inset 0 0 0 1px rgba(255,130,140,0.22)' : 'inset 0 0 0 1px rgba(245,217,122,0.20)',
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
        boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3" style={{ borderColor: 'rgba(245,217,122,0.10)' }}>
        <div>
          <div className="font-serif text-[11px] font-bold uppercase tracking-[0.24em]" style={{ color: 'rgba(245,217,122,0.58)' }}>{eyebrow}</div>
          <div className="mt-1 font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.9)' }}>{title}</div>
          <div className="mt-1 max-w-3xl text-xs leading-relaxed" style={{ color: 'rgba(220,208,178,0.58)' }}>{desc}</div>
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
        color: 'rgba(245,217,122,0.42)',
        background: 'rgba(0,0,0,0.18)',
        boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.12)',
        clipPath: smallClip,
      }}
    >
      {children}
    </div>
  );
}

function getActiveId(rules: 文生图规则中心设置, type: 文生图规则模板类型): string {
  if (type === 'scene') return rules.当前场景词组转化器提示词预设ID;
  if (type === 'scene_judge') return rules.当前场景判定提示词预设ID;
  return rules.当前NPC词组转化器提示词预设ID;
}

function activeIdKey(type: 文生图规则模板类型): keyof 文生图规则中心设置 {
  if (type === 'scene') return '当前场景词组转化器提示词预设ID';
  if (type === 'scene_judge') return '当前场景判定提示词预设ID';
  return '当前NPC词组转化器提示词预设ID';
}
