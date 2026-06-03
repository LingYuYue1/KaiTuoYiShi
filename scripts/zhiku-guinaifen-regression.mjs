import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rebuildPreset = JSON.parse(fs.readFileSync('public/zhiku-presets/character-rebuild-core.json', 'utf8'));
const panel = fs.readFileSync('components/features/GameSystems/ZhikuPanel.tsx', 'utf8');

const TITLE = '\u6807\u9898';
const SOURCE = '\u539f\u6587';
const PERSONALITY = '\u6027\u683c\u951a\u70b9';
const VOICE = '\u8bf4\u8bdd\u65b9\u5f0f';
const BEHAVIOR = '\u884c\u4e3a\u4e60\u60ef';
const RELATION_BOUNDARY = '\u5173\u7cfb\u8fb9\u754c';
const FORBIDDEN_WRITING = '\u7981\u6b62\u8bef\u5199';
const guinevere = '\u683c\u59ae\u8587\u513f';
const outworlder = '\u5316\u5916\u6c11';
const streetPerformer = '\u8857\u5934\u884c\u4e3a\u8868\u6f14\u827a\u672f\u5bb6';
const sushang = '\u7d20\u88f3';
const liveStream = '\u76f4\u64ad';
const family = '\u5bb6\u4eba';
const phone = '\u624b\u673a';
const boulderSmashing = '\u80f8\u53e3\u788e\u5927\u77f3';
const readableHelper = '\u4eba\u683c\u3001\u547d\u9014\u3001\u9636\u6bb5\u4e0e\u89e3\u9501\u8fb9\u754c';
const nodeCountLabel = '\u4e2a\u8d44\u6599\u8282\u70b9';
const hookId = 'zhiku_character_rebuild_hook_persona';
const childRoleText = '\u864e\u514b\u662f\u513f\u7ae5\u89d2\u8272';
const hookRelationshipAnchor = '\u9f39\u9f20\u515a';
const gallagherId = 'zhiku_character_rebuild_gallagher_persona_gate';
const APPEARANCE = '\u5916\u8c8c\u951a\u70b9';
const femaleText = '\u5973\u6027';
const matureMaleText = '\u6210\u719f\u7537\u6027';
const bartenderText = '\u8c03\u996e\u5e08';
const bloodhoundText = '\u730e\u72ac\u5bb6\u7cfb';
const saberId = 'zhiku_character_rebuild_fate_saber_persona';
const archerId = 'zhiku_character_rebuild_fate_archer_persona';
const genericCrossoverAppearance = '\u8be5\u8282\u70b9\u662f\u8054\u52a8\u89d2\u8272\u4e3b\u4f53\u8d44\u6599';
const genericCrossoverVoice = '\u6309\u6761\u76ee\u89d2\u8272\u6216\u7fa4\u50cf\u5404\u81ea\u53e3\u543b\u8868\u73b0';
const saberAppearanceAnchor = '\u91d1\u53d1\u78a7\u773c';
const saberVoiceAnchor = '\u8a93\u7ea6';
const archerAppearanceAnchor = '\u767d\u53d1\u8910\u80a4';
const archerVoiceAnchor = '\u8bbd\u523a';

function similarity(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (!left || !right) return 0;
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  let longest = 0;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      if (left[i - 1] !== right[j - 1]) continue;
      dp[i][j] = dp[i - 1][j - 1] + 1;
      longest = Math.max(longest, dp[i][j]);
    }
  }
  return (longest * 2) / (left.length + right.length);
}

const guinaifen = rebuildPreset.entries.find((entry) => entry.id === 'zhiku_character_rebuild_guinaifen_persona');
assert(guinaifen, 'Guinaifen rebuilt persona entry must exist.');

const personaFields = [guinaifen[PERSONALITY], guinaifen[VOICE], guinaifen[BEHAVIOR]].map((value) => String(value ?? '').trim());
assert(personaFields.every(Boolean), 'Guinaifen persona performance fields must not be empty.');
assert(new Set(personaFields).size === personaFields.length, 'Guinaifen personality / voice / behavior fields must not be duplicated.');

assert(
  guinaifen[SOURCE].includes(guinevere) &&
    guinaifen[SOURCE].includes(outworlder) &&
    guinaifen[SOURCE].includes(streetPerformer) &&
    guinaifen[SOURCE].includes(sushang),
  'Guinaifen source brief must preserve checked anchors: Guinevere, outworlder, street performer, and Sushang.',
);
assert(guinaifen[VOICE].includes(liveStream) && guinaifen[VOICE].includes(family), 'Guinaifen voice should keep streamer-like audience interaction anchors.');
assert(guinaifen[BEHAVIOR].includes(phone) && guinaifen[BEHAVIOR].includes(boulderSmashing) && guinaifen[BEHAVIOR].includes(sushang), 'Guinaifen behavior should keep recording, street stunt, and Sushang anchors.');

const noisyFields = [PERSONALITY, VOICE, BEHAVIOR];
const strongDuplications = [];
for (const entry of rebuildPreset.entries) {
  if (!String(entry.id ?? '').startsWith('zhiku_character_rebuild_')) continue;
  const values = noisyFields.map((field) => String(entry[field] ?? '').trim());
  for (let leftIndex = 0; leftIndex < values.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < values.length; rightIndex += 1) {
      const left = values[leftIndex];
      const right = values[rightIndex];
      if (!left || !right) continue;
      const exact = left === right;
      const longContains = (left.length > 40 && right.includes(left)) || (right.length > 40 && left.includes(right));
      const tooSimilar = similarity(left, right) >= 0.78;
      if (exact || longContains || tooSimilar) {
        strongDuplications.push(`${entry.id} ${entry[TITLE] ?? ''}`);
      }
    }
  }
}
assert(strongDuplications.length === 0, `Rebuilt character personality / voice / behavior fields must not be copied: ${strongDuplications.join(', ')}`);

const duplicatedBoundaryFields = rebuildPreset.entries
  .filter((entry) => String(entry.id ?? '').startsWith('zhiku_character_rebuild_'))
  .filter((entry) => {
    const relationBoundary = String(entry[RELATION_BOUNDARY] ?? '').trim();
    const forbiddenWriting = String(entry[FORBIDDEN_WRITING] ?? '').trim();
    return relationBoundary && forbiddenWriting && relationBoundary === forbiddenWriting;
  })
  .map((entry) => `${entry.id} ${entry[TITLE] ?? ''}`);
assert(duplicatedBoundaryFields.length === 0, `Rebuilt character relation boundary and forbidden-writing fields must not be copied: ${duplicatedBoundaryFields.join(', ')}`);

const hook = rebuildPreset.entries.find((entry) => entry.id === hookId);
assert(hook, 'Hook rebuilt persona entry must exist.');
assert(
  hook[RELATION_BOUNDARY].includes(hookRelationshipAnchor) &&
    hook[RELATION_BOUNDARY] !== hook[FORBIDDEN_WRITING] &&
    !hook[RELATION_BOUNDARY].startsWith(childRoleText) &&
    !hook[RELATION_BOUNDARY].includes('\u963f\u864e\u514b'),
  'Hook relation boundary must describe story relationship scope instead of repeating the child-safety forbidden-writing text.',
);

const gallagher = rebuildPreset.entries.find((entry) => entry.id === gallagherId);
assert(gallagher, 'Gallagher rebuilt persona entry must exist.');
assert(
  gallagher[APPEARANCE].includes(matureMaleText) &&
    gallagher[APPEARANCE].includes(bartenderText) &&
    gallagher[APPEARANCE].includes(bloodhoundText) &&
    !gallagher[APPEARANCE].includes(femaleText),
  'Gallagher appearance anchor must describe his male bartender / Bloodhound Family persona and must not mark him as female.',
);

const saber = rebuildPreset.entries.find((entry) => entry.id === saberId);
const archer = rebuildPreset.entries.find((entry) => entry.id === archerId);
assert(saber && archer, 'Fate crossover Saber and Archer persona entries must exist.');
assert(
  saber[APPEARANCE].includes(saberAppearanceAnchor) &&
    saber[VOICE].includes(saberVoiceAnchor) &&
    !saber[APPEARANCE].includes(genericCrossoverAppearance) &&
    !saber[VOICE].includes(genericCrossoverVoice),
  'Saber crossover persona must have concrete appearance and voice anchors instead of generic placeholders.',
);
assert(
  archer[APPEARANCE].includes(archerAppearanceAnchor) &&
    archer[VOICE].includes(archerVoiceAnchor) &&
    !archer[APPEARANCE].includes(genericCrossoverAppearance) &&
    !archer[VOICE].includes(genericCrossoverVoice),
  'Archer crossover persona must have concrete appearance and voice anchors instead of generic placeholders.',
);

const corruptedTextFields = [];
for (const entry of rebuildPreset.entries) {
  if (!String(entry.id ?? '').startsWith('zhiku_character_rebuild_')) continue;
  for (const field of [PERSONALITY, VOICE, BEHAVIOR, RELATION_BOUNDARY, FORBIDDEN_WRITING]) {
    const value = String(entry[field] ?? '');
    if (value.includes('???') || (value.match(/\?/g) ?? []).length >= 5) {
      corruptedTextFields.push(`${entry.id} ${entry[TITLE] ?? ''} ${field}`);
    }
  }
}
assert(corruptedTextFields.length === 0, `Rebuilt character text fields must not contain mojibake question marks: ${corruptedTextFields.join(', ')}`);

assert(
  panel.includes("className=\"text-[11px] font-mono tracking-[0.12em]\" style={{ color: 'rgba(var(--tj-accent-primary), 0.86)' }}") &&
    !panel.includes("className=\"text-[10px] font-mono tracking-[0.18em]\" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}"),
  'Zhiku soft-structure labels must use larger, brighter text instead of dim 10px labels.',
);
assert(
  panel.includes(readableHelper) &&
    panel.includes("className=\"mt-1 text-xs\" style={{ color: 'rgba(var(--tj-text-secondary), 0.84)' }}") &&
    panel.includes(nodeCountLabel),
  'Character node helper text must be readable enough in the Zhiku panel.',
);

console.log('zhiku guinaifen regression ok');
