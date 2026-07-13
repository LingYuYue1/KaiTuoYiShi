import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createWorkflowRecoveryJournal,
  isWorkflowRecoveryComplete,
  parseWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
} from '../utils/workflowRecoveryModel.ts';

const created = createWorkflowRecoveryJournal('继续前往观景车厢', 7);
assert.equal(created.version, 1);
assert.equal(created.phase, 'main_request');
assert.equal(created.turnAtStart, 7);
assert.equal(created.input, '继续前往观景车厢');

const variablePhase = updateWorkflowRecoveryJournal(created, {
  phase: 'variable_settlement',
  userMessageId: 'user-7',
  assistantMessageId: 'assistant-7',
});
assert.equal(variablePhase.phase, 'variable_settlement');
assert.equal(variablePhase.assistantMessageId, 'assistant-7');
assert(variablePhase.updatedAt >= created.updatedAt);

const parsed = parseWorkflowRecoveryJournal({
  ...variablePhase,
  apiKey: 'must-not-survive',
  systemPrompt: 'must-not-survive',
  streamedText: 'must-not-survive',
});
assert(parsed);
assert.equal('apiKey' in parsed, false);
assert.equal('systemPrompt' in parsed, false);
assert.equal('streamedText' in parsed, false);
assert.equal(parseWorkflowRecoveryJournal({ ...created, phase: 'unknown' }), null);
assert.equal(parseWorkflowRecoveryJournal({ ...created, input: '' }), null);

assert.equal(isWorkflowRecoveryComplete(variablePhase, [
  { id: 'user-7', role: 'user' },
  { id: 'assistant-7', role: 'assistant' },
]), true);
assert.equal(isWorkflowRecoveryComplete({ ...variablePhase, assistantMessageId: undefined }, [
  { id: 'user-7', role: 'user' },
  { id: 'other-assistant', role: 'assistant' },
]), true, 'an assistant after the matching user also proves completion');
assert.equal(isWorkflowRecoveryComplete(variablePhase, [
  { id: 'user-7', role: 'user' },
]), false);

const root = process.cwd();
const inputArea = await fs.readFile(path.join(root, 'components/features/Chat/InputArea.tsx'), 'utf8');
const sendWorkflow = await fs.readFile(path.join(root, 'hooks/useGame/sendWorkflow.ts'), 'utf8');
assert(inputArea.includes('setInput(recoveryDraft.input)'), 'interrupted input must be restored into the editor');
const recoveryEffect = inputArea.slice(inputArea.indexOf('useEffect(() => {'), inputArea.indexOf('const handleSend'));
assert(!recoveryEffect.includes('onSend('), 'recovery must never automatically resend or charge the API');
assert(sendWorkflow.includes("phase: 'variable_settlement'"), 'main response must advance the journal to variable settlement');
assert(sendWorkflow.includes("phase: 'autosave'"), 'autosave must be journaled before persistence');
assert(sendWorkflow.includes('clearWorkflowRecoveryJournal(recoveryJournal.workflowId)'), 'successful and cancelled workflows must clear their own journal');

console.log('workflow recovery regression ok');
