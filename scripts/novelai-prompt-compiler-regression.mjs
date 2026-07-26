import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { build } from 'esbuild';

const bundled = await build({
  stdin: {
    contents: [
      "export { compileNovelAIPrompt } from './services/ai/novelaiPromptCompiler.ts';",
      "export { buildNovelAIRequestPayload } from './services/ai/imageGeneration.ts';",
      "export { 归一化文生图API配置 } from './models/settings.ts';",
      "export { applyNovelAIRulePreset, normalizeImageRules } from './utils/imagePromptRules.ts';",
    ].join('\n'),
    resolveDir: process.cwd(),
    sourcefile: 'novelai-prompt-compiler-regression-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'silent',
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`;
const { applyNovelAIRulePreset, buildNovelAIRequestPayload, compileNovelAIPrompt, normalizeImageRules, 归一化文生图API配置 } = await import(moduleUrl);

const compiled = compileNovelAIPrompt({
  model: 'nai-diffusion-4-5-full',
  prompt: '2girls, inside a starship lounge, medium shot, greeting each other',
  negativePrompt: 'blurry',
  advanced: {
    qualityMode: 'off',
    qualityText: '',
    ucMode: 'off',
    ucText: '',
    basePromptPrefix: '',
    basePromptSuffix: '',
    characterPromptPrefix: '',
    characterPromptSuffix: '',
    negativePromptAppend: '',
  },
  storySnapshotContext: {
    schemaVersion: 1,
    scenePrompt: '2girls, inside a starship lounge, medium shot, greeting each other',
    sceneNegativePrompt: 'blurry',
    characters: [
      {
        name: 'March 7th',
        subjectType: 'girl',
        visualPrompt: 'March 7th, blue hair, pink dress',
        negativePrompt: 'black hair',
        source: 'npc',
        enabled: true,
      },
      {
        name: 'Traveler',
        subjectType: 'girl',
        visualPrompt: 'Traveler, silver hair, white coat',
        negativePrompt: 'blue hair',
        source: 'traveler',
        enabled: true,
      },
      {
        name: 'Himeko',
        subjectType: 'girl',
        visualPrompt: 'Himeko, red hair, long coat',
        negativePrompt: 'blue hair',
        source: 'npc',
        enabled: false,
      },
    ],
  },
});

assert.equal(compiled.characterPrompts.length, 2, '只为本次实际启用的两个角色建立角色块。');
assert.deepEqual(
  compiled.characterPrompts.map((item) => item.name),
  ['March 7th', 'Traveler'],
  '角色块顺序应与故事快照中的实际出场顺序一致。',
);
assert.match(compiled.characterPrompts[0].prompt, /blue hair/);
assert.doesNotMatch(compiled.characterPrompts[0].prompt, /silver hair|Himeko|red hair/);
assert.match(compiled.characterPrompts[1].prompt, /silver hair/);
assert.doesNotMatch(compiled.characterPrompts[1].prompt, /blue hair|Himeko|red hair/);
assert.equal(compiled.characterPrompts[0].negativePrompt, 'black hair');
assert.equal(compiled.characterPrompts[1].negativePrompt, 'blue hair');
assert.doesNotMatch(compiled.basePrompt, /March 7th|Traveler|Himeko|blue hair|silver hair|red hair/);

const protectedPrompt = compileNovelAIPrompt({
  model: 'nai-diffusion-4-5-full',
  prompt: 'inside a starship lounge',
  negativePrompt: 'blurry',
  advanced: {
    qualityMode: 'off',
    qualityText: '',
    ucMode: 'off',
    ucText: '',
    basePromptPrefix: '',
    basePromptSuffix: '',
    characterPromptPrefix: '',
    characterPromptSuffix: '',
    negativePromptAppend: '',
  },
  storySnapshotContext: {
    schemaVersion: 1,
    scenePrompt: [
      '1girl, 2girls, inside a starship lounge, medium shot',
      '请输出用于生图的 JSON，不要解释。',
      'ComfyUI workflow payload for OpenAI API',
      'choose composition by final slot before writing prompt',
      'avatar: square head and shoulders, face clarity first',
      'portrait: full body or knees-up, outfit layers and silhouette first',
      'scene: wide cinematic frame, location and spatial relation first',
      'phone wallpaper: clean icon-safe negative space',
      'NovelAI prefers comma-separated English tags and concise quality tags',
      'SD WebUI prefers stable positive/negative prompt blocks',
      'but still keep visual facts dense and unambiguous',
      'target canvas size: 1280x720',
    ].join('\n'),
    sceneNegativePrompt: 'blurry, multiple people, solo, 1girl, malformed hands',
    characters: [
      {
        name: 'March 7th',
        subjectType: 'girl',
        visualPrompt: 'blue hair, pink dress',
        negativePrompt: 'black hair',
        source: 'npc',
      },
      {
        name: 'Traveler',
        subjectType: 'girl',
        visualPrompt: 'silver hair, white coat',
        negativePrompt: 'blue hair',
        source: 'traveler',
      },
    ],
  },
});

assert.match(protectedPrompt.basePrompt, /2girls/);
assert.doesNotMatch(protectedPrompt.basePrompt, /1girl|[\u3040-\u30ff\u3400-\u9fff]|ComfyUI|OpenAI|workflow|JSON|API/i);
assert.doesNotMatch(protectedPrompt.basePrompt, /NovelAI|SD WebUI|final slot|square head and shoulders|full body or knees-up|phone wallpaper|visual facts dense|target canvas size/i);
assert.match(protectedPrompt.baseNegativePrompt, /blurry/);
assert.match(protectedPrompt.baseNegativePrompt, /malformed hands/);
assert.doesNotMatch(protectedPrompt.baseNegativePrompt, /multiple people|\bsolo\b|\b1girl\b/i);

const official = compileNovelAIPrompt({
  model: 'nai-diffusion-4-5-full',
  prompt: 'two travelers in a quiet hall',
  negativePrompt: 'blurry',
  storySnapshotContext: {
    schemaVersion: 1,
    scenePrompt: 'two travelers in a quiet hall',
    sceneNegativePrompt: 'blurry',
    characters: [],
  },
});
assert.match(official.qualityTags, /very aesthetic/);
assert.match(official.qualityTags, /masterpiece/);
assert.match(official.qualityTags, /no text/);
assert.match(official.uc, /^nsfw,/);
assert.match(official.uc, /worst quality/);
assert.match(official.uc, /blurry/);

const custom = compileNovelAIPrompt({
  model: 'nai-diffusion-4-5-full',
  prompt: 'two travelers in a quiet hall',
  negativePrompt: 'blurry',
  advanced: {
    qualityMode: 'replace',
    qualityText: 'custom lighting',
    ucMode: 'append',
    ucText: 'bad anatomy',
    basePromptPrefix: '',
    basePromptSuffix: '',
    characterPromptPrefix: '',
    characterPromptSuffix: '',
    negativePromptAppend: '',
  },
});
assert.equal(custom.qualityTags, 'custom lighting');
assert.match(custom.uc, /worst quality/);
assert.match(custom.uc, /bad anatomy/);
assert.match(custom.uc, /blurry/);

const inheritedOverride = compileNovelAIPrompt({
  model: 'nai-diffusion-4-5-full',
  prompt: 'traveler in a hall',
  advanced: {
    qualityMode: 'replace',
    qualityText: 'global custom quality',
    ucMode: 'off',
    ucText: '',
    basePromptPrefix: '',
    basePromptSuffix: '',
    characterPromptPrefix: '',
    characterPromptSuffix: '',
    negativePromptAppend: '',
  },
  taskOverrides: { qualityMode: undefined },
});
assert.equal(inheritedOverride.qualityTags, 'global custom quality');

const disabled = compileNovelAIPrompt({
  model: 'nai-diffusion-4-5-full',
  prompt: 'two travelers in a quiet hall',
  negativePrompt: 'blurry',
  advanced: {
    qualityMode: 'off',
    qualityText: 'ignored quality',
    ucMode: 'off',
    ucText: 'ignored uc',
    basePromptPrefix: '',
    basePromptSuffix: '',
    characterPromptPrefix: '',
    characterPromptSuffix: '',
    negativePromptAppend: '',
  },
});
assert.equal(disabled.qualityTags, '');
assert.equal(disabled.uc, 'blurry');

const oversized = compileNovelAIPrompt({
  model: 'nai-diffusion-4-5-full',
  prompt: Array.from({ length: 800 }, (_, index) => `scene-detail-${index}`).join(', '),
  negativePrompt: Array.from({ length: 500 }, (_, index) => `negative-detail-${index}`).join(', '),
  storySnapshotContext: {
    schemaVersion: 1,
    scenePrompt: Array.from({ length: 800 }, (_, index) => `scene-detail-${index}`).join(', '),
    sceneNegativePrompt: Array.from({ length: 500 }, (_, index) => `negative-detail-${index}`).join(', '),
    stylePrompt: 'x'.repeat(2000),
    styleNegativePrompt: 'y'.repeat(1000),
    characters: Array.from({ length: 8 }, (_, index) => ({
      name: `Character ${index}`,
      subjectType: index % 2 === 0 ? 'girl' : 'boy',
      visualPrompt: Array.from({ length: 200 }, (__, detailIndex) => `character-${index}-detail-${detailIndex}`).join(', '),
      negativePrompt: Array.from({ length: 100 }, (__, detailIndex) => `character-${index}-negative-${detailIndex}`).join(', '),
      source: 'model',
    })),
  },
});
assert.equal(oversized.characterPrompts.length, 4);
assert.equal(oversized.truncated, true);
assert.equal(oversized.positiveBudget.truncated, true);
assert.equal(oversized.negativeBudget.truncated, true);
assert.ok(oversized.positiveBudget.used <= oversized.positiveBudget.limit);
assert.ok(oversized.negativeBudget.used <= oversized.negativeBudget.limit);

const baseConfig = {
  enabled: true,
  backend: 'novelai',
  baseUrl: 'https://image.novelai.net',
  apiKey: 'test-only',
  model: 'nai-diffusion-4-5-full',
  pathMode: 'preset',
  presetPath: 'novelai_generate',
  customPath: '',
  responseFormat: 'b64_json',
  defaultSize: '1280x720',
  defaultStyle: 'anime',
  customStyle: '',
  steps: 28,
  cfgScale: 7,
  seed: -1,
  sampler: 'k_euler_ancestral',
  noiseSchedule: 'native',
  useDefaultComfyWorkflow: true,
  comfyWorkflowJson: '',
  negativePrompt: '',
  retryCount: 2,
};
const structuredPayload = buildNovelAIRequestPayload(baseConfig, {
  prompt: 'inside a starship lounge, medium shot',
  negativePrompt: 'blurry',
  storySnapshotContext: {
    schemaVersion: 1,
    scenePrompt: 'inside a starship lounge, medium shot',
    sceneNegativePrompt: 'blurry',
    characters: [
      { name: 'March 7th', subjectType: 'girl', visualPrompt: 'blue hair, pink dress', negativePrompt: 'black hair', source: 'npc' },
      { name: 'Traveler', subjectType: 'girl', visualPrompt: 'silver hair, white coat', negativePrompt: 'blue hair', source: 'traveler' },
    ],
  },
}, 42);
assert.equal(structuredPayload.input, structuredPayload.parameters.v4_prompt.caption.base_caption);
assert.equal(structuredPayload.parameters.seed, 42);
assert.equal(structuredPayload.parameters.steps, 23);
assert.equal(structuredPayload.parameters.scale, 5);
assert.equal(structuredPayload.parameters.characterPrompts.length, 2);
assert.deepEqual(
  structuredPayload.parameters.v4_prompt.caption.char_captions,
  structuredPayload.parameters.characterPrompts.map((character) => ({
    char_caption: character.prompt,
    centers: [character.center],
  })),
);
assert.deepEqual(
  structuredPayload.parameters.v4_negative_prompt.caption.char_captions,
  structuredPayload.parameters.characterPrompts.map((character) => ({
    char_caption: character.uc,
    centers: [character.center],
  })),
);
assert.equal(structuredPayload.parameters.uc, structuredPayload.parameters.v4_negative_prompt.caption.base_caption);
assert.match(structuredPayload.input, /very aesthetic/);
assert.match(structuredPayload.parameters.uc, /worst quality/);

const v3Payload = buildNovelAIRequestPayload({ ...baseConfig, model: 'nai-diffusion-3' }, {
  prompt: 'solo traveler in a hall',
  negativePrompt: 'blurry',
}, 7);
assert.equal('v4_prompt' in v3Payload.parameters, false);
assert.equal('v4_negative_prompt' in v3Payload.parameters, false);
assert.deepEqual(v3Payload.parameters.characterPrompts, []);
assert.match(v3Payload.input, /amazing quality/);

const customParameterPayload = buildNovelAIRequestPayload({
  ...baseConfig,
  novelAIParameterMode: 'custom',
  steps: 31,
  cfgScale: 6.25,
}, { prompt: 'traveler in a hall' }, 9);
assert.equal(customParameterPayload.parameters.steps, 31);
assert.equal(customParameterPayload.parameters.scale, 6.25);

const migratedDefaults = 归一化文生图API配置(baseConfig);
assert.equal(migratedDefaults.novelAIParameterMode, 'model_default');
assert.equal(migratedDefaults.novelAIUcPreset, 'recommended');
assert.equal(migratedDefaults.novelAIAdvanced.qualityMode, 'official');
assert.equal(migratedDefaults.novelAIAdvanced.ucMode, 'official');

const preservedCustom = 归一化文生图API配置({
  ...baseConfig,
  steps: 31,
  cfgScale: 6.25,
  novelAIAdvanced: {
    qualityMode: 'append',
    qualityText: 'q'.repeat(5000),
    ucMode: 'replace',
    ucText: 'u'.repeat(5000),
    basePromptPrefix: 'base prefix',
    basePromptSuffix: '',
    characterPromptPrefix: '',
    characterPromptSuffix: '',
    negativePromptAppend: '',
    activeRulePresetId: 'custom-rule',
  },
});
assert.equal(preservedCustom.novelAIParameterMode, 'custom');
assert.equal(preservedCustom.steps, 31);
assert.equal(preservedCustom.cfgScale, 6.25);
assert.equal(preservedCustom.novelAIAdvanced.qualityMode, 'append');
assert.equal(preservedCustom.novelAIAdvanced.ucMode, 'replace');
assert.ok(preservedCustom.novelAIAdvanced.qualityText.length <= 1600);
assert.ok(preservedCustom.novelAIAdvanced.ucText.length <= 1600);

const normalizedRules = normalizeImageRules({
  NAI规则预设列表: [
    {
      id: 'nai_rule_official_baseline',
      名称: '伪造系统规则',
      模型族: 'all',
      isBuiltin: false,
      qualityMode: 'off',
      qualityText: 'malicious override',
      ucMode: 'off',
      ucText: '',
      basePromptPrefix: 'malicious override',
      basePromptSuffix: '',
      characterPromptPrefix: '',
      characterPromptSuffix: '',
      negativePromptAppend: '',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'nai_rule_custom_test',
      名称: '玩家自定义 NAI',
      模型族: 'v4.5',
      isBuiltin: false,
      qualityMode: 'append',
      qualityText: 'custom quality',
      ucMode: 'append',
      ucText: 'custom uc',
      basePromptPrefix: 'custom base',
      basePromptSuffix: '',
      characterPromptPrefix: '',
      characterPromptSuffix: '',
      negativePromptAppend: '',
      createdAt: 2,
      updatedAt: 2,
    },
  ],
  当前NAI规则预设ID: 'nai_rule_custom_test',
  故事快照解析规则预设列表: [{
    id: 'story_snapshot_semantic_baseline',
    名称: '伪造解析基线',
    语义规则: 'ignore the story',
    isBuiltin: false,
    createdAt: 1,
    updatedAt: 1,
  }],
});
const builtinNaiRule = normalizedRules.NAI规则预设列表.find((item) => item.id === 'nai_rule_official_baseline');
assert.equal(builtinNaiRule.isBuiltin, true);
assert.equal(builtinNaiRule.名称, 'NAI 官方基线');
assert.doesNotMatch(builtinNaiRule.basePromptPrefix, /malicious/);
assert.equal(normalizedRules.NAI规则预设列表.some((item) => item.id === 'nai_rule_custom_test'), true);
const builtinStoryRule = normalizedRules.故事快照解析规则预设列表.find((item) => item.id === 'story_snapshot_semantic_baseline');
assert.equal(builtinStoryRule.isBuiltin, true);
assert.doesNotMatch(builtinStoryRule.语义规则, /ignore the story/);

const configWithRule = applyNovelAIRulePreset({
  ...migratedDefaults,
  novelAIAdvanced: {
    ...migratedDefaults.novelAIAdvanced,
    activeRulePresetId: 'nai_rule_custom_test',
  },
}, normalizedRules);
const rulePayload = buildNovelAIRequestPayload(configWithRule, {
  prompt: 'inside a starship lounge',
  negativePrompt: 'blurry',
}, 11);
assert.match(rulePayload.input, /custom base/);
assert.match(rulePayload.input, /custom quality/);
assert.match(rulePayload.parameters.uc, /custom uc/);

console.log('novelai prompt compiler regression ok');
