/**
 * Stage 5.1 — variable + narrative commit as one CAS (executeTurn).
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AdvanceTurnEnvelope,
} from '@/src/kernel/contract';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import { createEmptyKernelVariables } from '@/src/kernel/domain/variables';

const SESSION = asSessionId('phase5-atomic');

function seed(
  revision = 0,
  travelerName = '开拓者',
  variables = createEmptyKernelVariables({ 旅人: { 姓名: travelerName } }),
) {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(revision),
      state: { turnCount: 1, travelerName, variables },
    }),
  );
  return sessions;
}

function advance(
  text: string,
  opts?: Readonly<{ commandId?: string; expectedRevision?: number }>,
): AdvanceTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts?.commandId ?? 'cmd-1'),
    sessionId: SESSION,
    expectedRevision: asRevision(opts?.expectedRevision ?? 0),
    command: { type: 'turn.advance', input: { text } },
  };
}

describe('variables + narrative atomicity (Stage 5.1)', () => {
  it('commits narrative and variables in a single revision bump', async () => {
    const sessions = seed(0, '旧名');
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['三月七笑了笑。'],
      completedText: `三月七笑了笑。
<变量更新>
set 旅人.姓名 = "星核旅人"
set 旅人.身份 = "列车乘客"
add 旅人.数值属性.好感 = 2
</变量更新>`,
    });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      executeTurn(advance('改名并叙事', { commandId: 'atomic-1' }), {
        sessions,
        model,
      }),
    );

    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    // Exactly one CAS: revision +1
    expect(after.revision).toBe(before.revision + 1);
    // Narrative applied
    expect(after.state.messages).toEqual([
      { role: 'user', content: '改名并叙事' },
      { role: 'assistant', content: '三月七笑了笑。' },
    ]);
    expect(after.state.turnCount).toBe(before.state.turnCount + 1);
    // Variables applied atomically with narrative
    expect(after.state.travelerName).toBe('星核旅人');
    expect(after.state.variables.旅人.姓名).toBe('星核旅人');
    expect(after.state.variables.旅人.身份).toBe('列车乘客');
    expect(after.state.variables.旅人.数值属性.好感).toBe(2);
    // Turn records base for reroll
    expect(after.state.turns[0]?.variablesBefore?.旅人.姓名).toBe('旧名');
    expect(after.state.turns[0]?.travelerNameBefore).toBe('旧名');

    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      const { view } = terminal;
      expect(view.travelerName).toBe('星核旅人');
      expect(view.travelerVariables.身份).toBe('列车乘客');
      expect(view.revision).toBe(after.revision);
    }
  });

  it('model failure leaves variables and narrative unchanged', async () => {
    const sessions = seed(
      0,
      '甲',
      createEmptyKernelVariables({
        旅人: { 姓名: '甲', 身份: '旧身份', 数值属性: { 好感: 7 } },
      }),
    );
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'failure', message: 'upstream timeout', chunks: ['…'] });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      executeTurn(advance('失败', { commandId: 'model-fail' }), {
        sessions,
        model,
      }),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure' },
    });
    const after = await sessions.read(SESSION);
    expect(after).toEqual(before);
    expect(after.state.variables.旅人.数值属性.好感).toBe(7);
  });

  it('illegal variable commands do not block narrative commit', async () => {
    const sessions = seed(0, '开拓者甲');
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['叙事仍成功。'],
      completedText: `叙事仍成功。
<变量更新>
set 世界.当前地点 = "观景车厢"
set 未知根.字段 = "x"
set 旅人.姓名 = {{broken
</变量更新>`,
    });

    const frames = await collectAsync(
      executeTurn(advance('非法变量', { commandId: 'ill-var' }), {
        sessions,
        model,
      }),
    );
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.state.travelerName).toBe('开拓者甲');
    expect(after.state.messages.at(-1)?.content).toBe('叙事仍成功。');
    expect(after.revision).toBe(1);
  });
});
