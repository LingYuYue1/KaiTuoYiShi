import type {
  CreateZhikuEntryEnvelope,
  DeleteZhikuEntryEnvelope,
  ExecutionFrame,
  RefreshBundledZhikuEnvelope,
  UpdateZhikuEntryEnvelope,
} from '@/src/kernel/contract';
import type { ContentResolver, SessionRepository } from '@/src/kernel/ports';
import { 创建智库条目 } from '@/models/zhiku';
import { mergeBundledZhikuSystem } from '@/data/zhikuPreset';
import { executeSessionCommand } from './executeSessionCommand';

export async function* createZhikuEntry(
  envelope: CreateZhikuEntryEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const entry = 创建智库条目(envelope.command.draft, {
      id: `zhiku_${envelope.commandId}`,
      now: envelope.command.createdAt,
    });
    return nextZhiku(base.state.story, [entry, ...base.state.story.content.zhikuRuntime.条目]);
  });
}

export async function* updateZhikuEntry(
  envelope: UpdateZhikuEntryEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const current = base.state.story.content.zhikuRuntime.条目.find((entry) => entry.id === envelope.command.entryId);
    if (!current) return rejected('Zhiku entry not found');
    const patch = current.builtin
      ? pickBuiltinRuntimePatch(envelope.command.patch)
      : envelope.command.patch;
    if (current.builtin && Object.keys(patch).length === 0) return rejected('Bundled Zhiku entries are read-only');
    return nextZhiku(base.state.story, base.state.story.content.zhikuRuntime.条目.map((entry) => entry.id === current.id
      ? { ...entry, ...patch, updatedAt: envelope.command.updatedAt }
      : entry));
  });
}

export async function* deleteZhikuEntry(
  envelope: DeleteZhikuEntryEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const current = base.state.story.content.zhikuRuntime.条目.find((entry) => entry.id === envelope.command.entryId);
    if (!current) return rejected('Zhiku entry not found');
    if (current.builtin) return rejected('Bundled Zhiku entries are read-only');
    return nextZhiku(
      base.state.story,
      base.state.story.content.zhikuRuntime.条目.filter((entry) => entry.id !== current.id),
    );
  });
}

export async function* refreshBundledZhiku(
  envelope: RefreshBundledZhikuEnvelope,
  sessions: SessionRepository,
  content: ContentResolver,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, async (base) => {
    const bundled = await content.loadBundledZhiku(envelope.command.cacheBust);
    const merged = mergeBundledZhikuSystem(bundled, base.state.story.content.zhikuRuntime);
    return {
      type: 'next',
      state: { story: { ...base.state.story, content: { ...base.state.story.content, zhikuRuntime: merged } } },
    };
  });
}

function nextZhiku(story: import('@/src/kernel/domain/session/storyState').StoryState, entries: import('@/models/zhiku').智库条目[]) {
  return {
    type: 'next' as const,
    state: { story: { ...story, content: { ...story.content, zhikuRuntime: { 条目: entries } } } },
  };
}

function pickBuiltinRuntimePatch(
  patch: UpdateZhikuEntryEnvelope['command']['patch'],
): UpdateZhikuEntryEnvelope['command']['patch'] {
  return {
    ...(patch.运行时解锁状态 !== undefined ? { 运行时解锁状态: patch.运行时解锁状态 } : {}),
    ...(patch.运行时解锁备注 !== undefined ? { 运行时解锁备注: patch.运行时解锁备注 } : {}),
  };
}

function rejected(message: string) {
  return { type: 'rejected' as const, error: { code: 'no_changes' as const, message } };
}
