// Slim 瘦身脚本（只操作 .tmp-split/album/workspaces.tsx 副本）
// 结构操作走 ts-morph 符号定位；简单文本替换走字符串 replaceAll。
// 用法: node scripts/slim-workspaces.mjs [--dry]
import { Project, SyntaxKind } from 'ts-morph';

const FILE = '.tmp-split/album/workspaces.tsx';
const dry = process.argv.includes('--dry');

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
const w = project.addSourceFileAtPath(FILE);
const log = (msg) => console.log(msg);

function findJsx(name) {
  const res = [];
  for (const open of w.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    if (open.getTagNameNode().getText() === name) {
      const parent = open.getParent();
      res.push(parent.isKind(SyntaxKind.JsxElement) ? parent : open);
    }
  }
  for (const self of w.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    if (self.getTagNameNode().getText() === name) res.push(self);
  }
  return res;
}

// ---------- 1. 模块常量 CHARACTER_SLOTS ----------
{
  const slotFn = w.getFunction('SlotPickerModal');
  const slotsDecl = slotFn.getDescendantsOfKind(SyntaxKind.VariableStatement)
    .find((v) => v.getDeclarations()[0]?.getName() === 'slots');
  const initializer = slotsDecl.getDeclarations()[0].getInitializer().getText();
  const insertPos = slotFn.getStart();
  slotsDecl.remove();
  w.insertText(insertPos, `export const CHARACTER_SLOTS: Array<{ slot: 图片槽位; title: string; desc: string }> = ${initializer};\n\n`);
  log('CHARACTER_SLOTS: 提取为模块常量');
}

// ---------- 2. 卡片组件合并 StateCard ----------
const stateCardText = `export function StateCard({ title, desc, minHeight = 210, spinning = false }: { title: string; desc: string; minHeight?: number; spinning?: boolean }) {
  return (
    <div className="flex items-center justify-center px-4 py-8 text-center" style={{ color: 'rgba(var(--tj-ui-muted),0.72)', background: spinning ? 'rgba(var(--tj-ui-panel-strong),0.3)' : 'rgba(var(--tj-ui-panel-strong),0.24)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.14)', clipPath: smallClip, minHeight }}>
      <div>
        {spinning && <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-transparent" style={{ borderTopColor: 'rgba(var(--tj-btn-primary-start),0.86)', borderRightColor: 'rgba(var(--tj-tech-cyan),0.55)' }} />}
        <div className="font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.78)' }}>{title}</div>
        <div className="mt-2 text-xs leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}
`;
{
  const removed = ['EmptySnapshotAnalysisCard', 'EmptySceneImageAnalysisCard', 'StorySnapshotParsingCard', 'EmptySnapshotPromptCard'];
  for (const name of removed) {
    const fn = w.getFunction(name);
    const pos = fn.getStart();
    fn.remove();
    w.insertText(pos, stateCardText + '\n');
    log(`StateCard: 合并 ${name}`);
  }
  // 只留一份 StateCard 定义
  const stateCards = w.getFunctions().filter((f) => f.getName() === 'StateCard');
  for (const extra of stateCards.slice(1)) extra.remove();
}

// ---------- 3. ParsedPanel 合并 ----------
const parsedPanelText = `export function ParsedPanel({ titleLabel = '标题', title, fields }: { titleLabel?: string; title: string; fields: Array<[string, string]> }) {
  return (
    <div className="space-y-3">
      <div className="px-3 py-3" style={{ background: 'rgba(var(--tj-ui-panel-strong),0.34)', boxShadow: insetBorder, clipPath: smallClip }}>
        <div className="text-[11px] font-serif tracking-[0.18em]" style={{ color: labelColor }}>{titleLabel}</div>
        <div className="mt-1 font-serif text-sm font-bold leading-relaxed" style={{ color: titleColor }}>{title}</div>
      </div>
      <div className="grid gap-2">
        {fields.map(([label, value]) => <SnapshotParsedField key={label} label={label} value={value} />)}
      </div>
    </div>
  );
}
`;
{
  const a = w.getFunction('StorySnapshotParsedPanel');
  const aPos = a.getStart();
  a.remove();
  w.insertText(aPos, parsedPanelText + '\n');
  const b = w.getFunction('SceneImageParsedPanel');
  b.remove();
  log('ParsedPanel: 合并两个解析面板');
}

// ---------- 4. SceneParameterPanel 插入 ----------
const sceneParameterPanelText = `export function SceneParameterPanel(props: {
  generateTitle: string;
  setGenerateTitle: (v: string) => void;
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  hint: string;
  target: typeof generateTargets[number];
  resolvedSize: string;
}) {
  return (
    <div className="space-y-3">
      <BaseGenerationFields
        generateTitle={props.generateTitle}
        setGenerateTitle={props.setGenerateTitle}
        sizePreset={props.sizePreset}
        setSizePreset={props.setSizePreset}
        customSize={props.customSize}
        setCustomSize={props.setCustomSize}
      />
      <div className="mt-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.68)' }}>{props.hint}</div>
      <GenerationSummary target={props.target} size={props.resolvedSize} />
    </div>
  );
}
`;
{
  const gs = w.getFunction('GenerationSummary');
  const gsPos = gs.getStart();
  w.insertText(gsPos, sceneParameterPanelText + '\n');
}
log('SceneParameterPanel: 插入');

// ---------- 5. CharacterGenerationParameters 合并（替换双组件） ----------
const charParamsText = `export function CharacterGenerationParameters(props: {
  sizePreset: 'default' | '1:1' | '3:4' | '16:9' | 'custom';
  setSizePreset: (v: 'default' | '1:1' | '3:4' | '16:9' | 'custom') => void;
  customSize: string;
  setCustomSize: (v: string) => void;
  targetId: GenerateTarget;
  imageRules: 文生图规则中心设置;
  onImageRulesChange: (patch: Partial<文生图规则中心设置>) => void;
  extraRequirement: string;
  setExtraRequirement: (v: string) => void;
  anchorLabel: string;
}) {
  const isAvatar = props.targetId === 'traveler_avatar' || props.targetId === 'npc_avatar';
  const artistPresets = props.imageRules.画师串预设列表.filter((preset) => preset.适用范围 === 'npc' || preset.适用范围 === 'all');
  const pngStyleOptions = buildPngStyleOptions(props.imageRules);
  return (
    <div className="space-y-3">
      {!isAvatar && (
        <OptionButtonGroup
          label="构图预设"
          columns="md:grid-cols-3"
          value={props.sizePreset}
          options={[
            { id: '3:4', title: '3:4', desc: '竖图比例' },
            { id: 'default', title: '默认', desc: '跟随用途' },
            { id: 'custom', title: '自定义', desc: '手动尺寸' },
          ]}
          onChange={(id) => props.setSizePreset(id as 'default' | '3:4' | 'custom')}
        />
      )}
      {!isAvatar && props.sizePreset === 'custom' && (
        <Field label="自定义尺寸">
          <input value={props.customSize} onChange={(e) => props.setCustomSize(e.target.value)} placeholder="例如 1024x1536" className="kaituo-input w-full px-3 py-2 text-sm font-mono" style={{ clipPath: smallClip }} />
        </Field>
      )}
      <OptionButtonGroup
        label="画风选择"
        columns="md:grid-cols-5"
        value={props.imageRules.当前NPCPNG画风预设ID}
        options={pngStyleOptions}
        onChange={(id) => props.onImageRulesChange({ 当前NPCPNG画风预设ID: id })}
      />
      <Field label="画师串预设">
        <select value={props.imageRules.当前NPC画师串预设ID} onChange={(e) => props.onImageRulesChange({ 当前NPC画师串预设ID: e.target.value })} className="kaituo-input w-full px-3 py-2 text-sm" style={{ clipPath: smallClip }}>
          <option value="">不启用</option>
          {artistPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.名称}</option>)}
        </select>
      </Field>
      <Field label="额外要求">
        <textarea rows={3} value={props.extraRequirement} onChange={(e) => props.setExtraRequirement(e.target.value)} placeholder={'可写镜头、表情、姿势、服装临时变化、背景氛围或构图禁忌。角色稳定外观仍优先沿用' + props.anchorLabel + '。'} className="kaituo-input w-full resize-y px-3 py-2 text-sm" style={{ clipPath: smallClip }} />
      </Field>
    </div>
  );
}
`;
{
  const t = w.getFunction('TravelerGenerationParameters');
  const tPos = t.getStart();
  t.remove();
  w.insertText(tPos, charParamsText + '\n');
  const n = w.getFunction('NpcGenerationParameters');
  n.remove();
  log('CharacterGenerationParameters: 双组件合并');
}

// ---------- 6. StudioHero 通用化 ----------
{
  const heroFn = w.getFunction('StudioHero');
  heroFn.replaceWithText(`export function StudioHero({ imageEnabled, eyebrow = '◆ 生成工作室', title = '图片生成', chipText, description = '先确定用途、构图和提示词，再把结果送进队列。生成后的图片进入成品库，由玩家决定是否挂到角色、正文快照或手机背景。' }: { imageEnabled: boolean; eyebrow?: string; title?: string; chipText: string; description?: string }) {
  return (
    <section className="px-4 py-3" style={{ background: heroSurface, ...heroGridBackgroundStyle, boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.58), inset 3px 0 0 rgba(var(--tj-tech-cyan),0.36)', clipPath: cardClip }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
        <div className="font-serif text-xs tracking-[0.32em]" style={{ color: 'rgba(var(--tj-btn-primary-start),0.72)' }}>{eyebrow}</div>
        <div className="mt-1 font-serif text-xl font-bold tracking-[0.2em]" style={{ color: titleColor }}>{title}</div>
        </div>
        <div className="px-3 py-2 text-xs" style={{ color: imageEnabled ? 'rgba(var(--tj-ui-success),0.9)' : 'rgba(255,180,180,0.86)', background: panelStrongSurface, boxShadow: insetBorder, clipPath: smallClip }}>
          {imageEnabled ? '文生图已开启' : '文生图未开启'} · 当前：{chipText}
        </div>
      </div>
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-ui-muted),0.76)' }}>{description}</p>
    </section>
  );
}`);
  log('StudioHero: 通用化（eyebrow/title/chipText/description）');
}

// ---------- 7. 调用点替换 ----------
// 7a. CreateWorkspace: 双参数组件 -> 单组件
{
  const createFn = w.getFunction('CreateWorkspace');
  const labelVar = createFn.getDescendantsOfKind(SyntaxKind.VariableStatement)
    .find((v) => v.getDeclarations()[0]?.getName() === 'selectedCharacterLabel');
  w.insertText(labelVar.getEnd(), `  const travelerParams = props.currentTarget.targetType === 'traveler' || (props.currentTarget.nsfw && selectedCharacterId === 'traveler');
  const purposeLabel = props.currentTarget.nsfw ? 'NSFW 参考' : props.currentTarget.tokenizerMode === 'portrait' ? '立绘' : '头像';`);
  const jsxExprs = w.getFunction('CreateWorkspace').getDescendantsOfKind(SyntaxKind.JsxExpression)
    .filter((e) => e.getText().includes('TravelerGenerationParameters'));
  for (const expr of jsxExprs) {
    expr.replaceWithText(`<CharacterGenerationParameters
              sizePreset={props.sizePreset}
              setSizePreset={props.setSizePreset}
              customSize={props.customSize}
              setCustomSize={props.setCustomSize}
              targetId={props.currentTarget.id}
              imageRules={props.imageRules}
              onImageRulesChange={props.onImageRulesChange}
              extraRequirement={props.extraRequirement}
              setExtraRequirement={props.setExtraRequirement}
              anchorLabel={travelerParams ? '主控锚点' : '角色锚点'}
            />`);
  }
  const heroCall = findJsx('StudioHero')[0];
  heroCall.replaceWithText(`<StudioHero
              imageEnabled={props.imageEnabled}
              chipText={selectedCharacterLabel + ' · ' + purposeLabel}
            />`);
  log('CreateWorkspace: 合并参数组件调用 + StudioHero 调用');
}
// 7b. SceneCreationWorkspaceShell: hero section -> StudioHero + 默认参数面板 -> SceneParameterPanel
{
  const shellFn = w.getFunction('SceneCreationWorkspaceShell');
  const section = shellFn.getDescendantsOfKind(SyntaxKind.JsxElement)
    .find((el) => el.getOpeningElement().getTagNameNode().getText() === 'section');
  section.replaceWithText(`<StudioHero
          imageEnabled={props.imageEnabled}
          eyebrow={props.eyebrow}
          title={props.title}
          chipText={props.currentTarget.label}
          description={props.description}
        />`);
  const paramPanel = findJsx('Panel').find((p) => p.getOpeningElement().getText().includes('parameterTitle'));
  paramPanel.replaceWithText(`<Panel title={props.parameterTitle}>
            <SceneParameterPanel
              generateTitle={props.generateTitle}
              setGenerateTitle={props.setGenerateTitle}
              sizePreset={props.sizePreset}
              setSizePreset={props.setSizePreset}
              customSize={props.customSize}
              setCustomSize={props.setCustomSize}
              hint={props.defaultSizeHint}
              target={props.currentTarget}
              resolvedSize={props.resolvedSize}
            />
          </Panel>`);
  log('Shell: hero -> StudioHero，参数面板 -> SceneParameterPanel');
}
// 7c. StorySnapshotWorkspace / SceneImageWorkspace 调用点
{
  const snapFn = w.getFunction('StorySnapshotWorkspace');
  const rep = (fn, pairs) => {
    for (const [tag, to] of pairs) {
      const els = findJsx(tag).filter((x) => x.getStart() > fn.getStart() && x.getEnd() < fn.getEnd());
      if (!els.length) throw new Error('未找到 ' + tag + ' 于 ' + fn.getName());
      for (const el of els) el.replaceWithText(to);
    }
  };
  rep(snapFn, [
    ['StorySnapshotParsingCard', '<StateCard title="正在解析正文" desc="正在提取画面要素并整理最终提示词，完成后再显示解析结果。" spinning />'],
    ['StorySnapshotParsedPanel', `<ParsedPanel titleLabel="快照标题" title={props.summary.title} fields={[['人物', props.summary.characters.length ? props.summary.characters.join('、') : '未明确'], ['地点', props.summary.location], ['氛围', props.summary.atmosphere], ['动作', props.summary.action], ['镜头', props.summary.camera], ['避免', props.summary.avoid]]} />`],
    ['EmptySnapshotAnalysisCard', '<StateCard title="等待解析" desc="选择正文来源后点击「生成快照提示词」，这里会显示从正文解析出的画面要素。" />'],
    ['EmptySnapshotPromptCard', '<StateCard title="等待快照提示词" desc="选择正文来源后，点击画布下方的「生成快照提示词」。这里会展示提炼出的快照草稿和最终 Prompt。" minHeight={280} />'],
  ]);
  const snapPanel = findJsx('Panel').find((p) => p.getOpeningElement().getText().includes('快照参数'));
  snapPanel.replaceWithText(`<Panel title="快照参数">
              <SceneParameterPanel
                generateTitle={props.generateTitle}
                setGenerateTitle={props.setGenerateTitle}
                sizePreset={props.sizePreset}
                setSizePreset={props.setSizePreset}
                customSize={props.customSize}
                setCustomSize={props.setCustomSize}
                hint="故事快照默认更适合横图；如果想做竖向海报可改为自定义。"
                target={props.currentTarget}
                resolvedSize={props.resolvedSize}
              />
            </Panel>`);
  log('StorySnapshotWorkspace: 卡片/Panel 调用点替换');

  const sceneFn = w.getFunction('SceneImageWorkspace');
  rep(sceneFn, [
    ['StorySnapshotParsingCard', '<StateCard title="正在解析场景" desc="正在提取地点、主体、光线与镜头，完成后再显示解析结果。" spinning />'],
    ['SceneImageParsedPanel', `<ParsedPanel titleLabel="场景标题" title={props.sceneSummary.title} fields={[['地点', props.sceneSummary.location], ['主体', props.sceneSummary.subject], ['氛围', props.sceneSummary.atmosphere], ['镜头', props.sceneSummary.camera], ['避免', props.sceneSummary.avoid]]} />`],
    ['EmptySceneImageAnalysisCard', '<StateCard title="等待解析" desc="填写场景说明后点击「解析场景提示词」，这里会显示地点、主体、氛围与镜头。" />'],
  ]);
  const scenePanel = findJsx('Panel').find((p) => p.getOpeningElement().getText().includes('场景参数'));
  scenePanel.replaceWithText(`<Panel title="场景参数">
        <SceneParameterPanel
          generateTitle={props.generateTitle}
          setGenerateTitle={props.setGenerateTitle}
          sizePreset={props.sizePreset}
          setSizePreset={props.setSizePreset}
          customSize={props.customSize}
          setCustomSize={props.setCustomSize}
          hint="场景图更适合横图或全景感镜头；如果是封面式画面可再手动改尺寸。"
          target={props.currentTarget}
          resolvedSize={props.resolvedSize}
        />
      </Panel>`);
  log('SceneImageWorkspace: 卡片/Panel 调用点替换');
}

// ---------- 8. 新纯函数（逻辑层准备） ----------
{
  const tail = w.getFunction('statusLabel');
  w.insertText(tail.getEnd(), `

export function resolvePromptMeta(task: 图片生成任务 | undefined, promptMeta: PromptMeta | null): PromptMeta | null {
  if (!task) return promptMeta;
  return {
    anchorMode: task.anchorMode === true,
    anchorSummary: task.anchorSummary || (task.anchorMode ? '角色锚点已参与本次生成' : '本次生成按档案回退'),
    sourcePrompt: task.sourcePrompt,
  };
}

export function buildPngStyleOptions(imageRules: 文生图规则中心设置): Array<{ id: string; title: string; desc: string }> {
  return [
    { id: '', title: '无要求', desc: '不附加' },
    ...imageRules.PNG画风预设列表.map((preset) => ({
      id: preset.id,
      title: preset.名称,
      desc: pngStyleSourceLabel(preset.来源),
    })),
  ];
}

export function buildBatchExtractPlan(records: NpcLibraryRecord[], travelerHasAnchor: boolean): Array<{ kind: 'traveler' } | { kind: 'npc'; npcId: string }> {
  const plan: Array<{ kind: 'traveler' } | { kind: 'npc'; npcId: string }> = [];
  if (!travelerHasAnchor) plan.push({ kind: 'traveler' });
  for (const record of records) {
    const anchor = record.npc.图像档案?.角色锚点;
    if (anchor?.正面提示词 || anchor?.负面提示词) continue;
    plan.push({ kind: 'npc', npcId: record.npc.id });
  }
  return plan;
}`);
  log('新纯函数: resolvePromptMeta / buildPngStyleOptions / buildBatchExtractPlan');
}

// ---------- 9. 文本级替换 ----------
let out = w.getText();
const textOps = [
  // activePromptMeta 两处重复 -> resolvePromptMeta
  [`  const activePromptMeta = props.canvasTask
    ? {
        anchorMode: props.canvasTask.anchorMode === true,
        anchorSummary: props.canvasTask.anchorSummary || (props.canvasTask.anchorMode ? '角色锚点已参与本次生成' : '本次生成按档案回退'),
        sourcePrompt: props.canvasTask.sourcePrompt,
      }
    : props.promptMeta;`,
   `  const activePromptMeta = resolvePromptMeta(props.canvasTask, props.promptMeta);`],
  // handleBatchExtract -> buildBatchExtractPlan
  [`  const handleBatchExtract = () => {
    setAnchorBatchExtracting(true);
    void (async () => {
      try {
        let count = 0;
        if (!travelerHasAnchor) {
          await onExtractTravelerAnchor(travelerRequirement);
          count += 1;
        }
        for (const record of records) {
          const anchor = record.npc.图像档案?.角色锚点;
          if (anchor?.正面提示词 || anchor?.负面提示词) continue;
          await onExtractAnchor(record.npc.id, requirement);
          count += 1;
        }
        setBatchMessage(count > 0
          ? ` + '`已为 ${count} 个缺失对象生成锚点，并写入对应档案。`' + `
          : '当前列表没有缺失锚点。');
      } finally {
        setAnchorBatchExtracting(false);
      }
    })();
  };`,
   `  const handleBatchExtract = () => {
    setAnchorBatchExtracting(true);
    void (async () => {
      try {
        const plan = buildBatchExtractPlan(records, travelerHasAnchor);
        let count = 0;
        for (const item of plan) {
          if (item.kind === 'traveler') {
            await onExtractTravelerAnchor(travelerRequirement);
          } else {
            await onExtractAnchor(item.npcId, requirement);
          }
          count += 1;
        }
        setBatchMessage(count > 0
          ? ` + '`已为 ${count} 个缺失对象生成锚点，并写入对应档案。`' + `
          : '当前列表没有缺失锚点。');
      } finally {
        setAnchorBatchExtracting(false);
      }
    })();
  };`],
  // 重复样式字符串 -> visualTokens 常量
  ["'rgba(var(--tj-btn-primary-start),0.68)'", 'labelColor'],
  ["'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)'", 'insetBorder'],
  ["'rgba(var(--tj-ui-panel-strong),0.36)'", 'panelStrongSurface'],
  // CHARACTER_SLOTS 调用点
  ['{slots.map((option) => {', '{CHARACTER_SLOTS.map((option) => {'],
];
for (const [from, to] of textOps) {
  if (!out.includes(from)) {
    console.warn('文本替换未命中: ' + from.slice(0, 60) + '…');
    continue;
  }
  const n = out.split(from).length - 1;
  out = out.split(from).join(to);
  log(`文本替换: ${n} 处 -> ${to.slice(0, 40)}`);
}

// import 更新
out = out.replace(
  "  imageWellSurface, titleColor, activeAccentSurface, cardSurface, heroGridBackgroundStyle,\n} from './visualTokens';",
  "  imageWellSurface, titleColor, activeAccentSurface, cardSurface, heroGridBackgroundStyle,\n  labelColor, insetBorder, panelStrongSurface,\n} from './visualTokens';",
);

if (dry) {
  console.log('\n[dry] 未写盘。');
} else {
  const fs = await import('fs');
  fs.writeFileSync(FILE, out);
  console.log('\n已写盘: ' + FILE + ' (' + out.split('\n').length + ' 行)');
}
