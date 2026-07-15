/**
 * Stage 5.1 — parseVariableBlock pure parse tests.
 */

import { describe, expect, it } from 'vitest';
import {
  parseVariableBlock,
  stripVariableBlock,
} from '@/src/kernel/domain/variables';
import { parseNarrativeActions } from '@/src/kernel/domain/turn/parseNarrativeActions';

describe('parseVariableBlock (Stage 5.1)', () => {
  it('parses set/add commands from a variable block', () => {
    const raw = `叙事正文。
<变量更新>
set 旅人.姓名 = "星核旅人"
set 旅人.身份 = "无名客"
add 旅人.数值属性.好感 = 3
</变量更新>`;
    const parsed = parseVariableBlock(raw);
    expect(parsed.parseErrors).toEqual([]);
    expect(parsed.commands).toEqual([
      { action: 'set', key: '旅人.姓名', value: '星核旅人' },
      { action: 'set', key: '旅人.身份', value: '无名客' },
      { action: 'add', key: '旅人.数值属性.好感', value: 3 },
    ]);
  });

  it('records parse errors for broken JSON without inventing commands', () => {
    // Closed braces so multi-line join does not swallow the next command line.
    const raw = `<变量更新>
set 旅人.姓名 = {not-valid-json}
set 旅人.身份 = "ok"
</变量更新>`;
    const parsed = parseVariableBlock(raw);
    expect(parsed.commands).toEqual([
      { action: 'set', key: '旅人.身份', value: 'ok' },
    ]);
    expect(parsed.commands.some((c) => c.key === '旅人.姓名')).toBe(false);
    expect(parsed.parseErrors.length).toBeGreaterThan(0);
  });

  it('returns empty when no variable block present', () => {
    const parsed = parseVariableBlock('只有叙事。');
    expect(parsed.commands).toEqual([]);
    expect(parsed.blockText).toBeNull();
  });

  it('stripVariableBlock removes the update block', () => {
    const text = '前文\n<变量更新>\nset 旅人.姓名 = "A"\n</变量更新>\n后文';
    expect(stripVariableBlock(text).replace(/\s+/g, ' ').trim()).toBe('前文 后文');
  });

  it('parseNarrativeActions exposes candidates and rejects empty narrative', () => {
    const ok = parseNarrativeActions(
      '你好。\n<变量更新>\nset 旅人.姓名 = "甲"\n</变量更新>',
    );
    expect(ok.narrativeText).toBe('你好。');
    expect(ok.variableCommands).toEqual([
      { action: 'set', key: '旅人.姓名', value: '甲' },
    ]);

    expect(() =>
      parseNarrativeActions('   <变量更新>\nset 旅人.姓名 = "x"\n</变量更新>'),
    ).toThrow(/empty narrative/i);
  });
});
