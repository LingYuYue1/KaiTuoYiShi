/**
 * Stage 5.3 — news.apply success, illegal patch, revision conflict, idempotency.
 * Also covers news.generate via model.complete → parse → CAS.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type NewsApplyEnvelope,
  type NewsGenerateEnvelope,
} from '@/src/kernel/contract';
import { applyNews, generateNews } from '@/src/kernel/application/applyNews';
import { NativeKernel } from '@/src/kernel/NativeKernel';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { createSessionSnapshot } from '@/src/kernel/domain/session/types';
import type { KernelNewsGenerationPatch } from '@/src/kernel/domain/news';

const SESSION = asSessionId('phase53-news-exec');

function seedEmpty() {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(0),
      state: { turnCount: 2, travelerName: '开拓者' },
    }),
  );
  return sessions;
}

function addPatch(): KernelNewsGenerationPatch {
  return {
    add: [
      {
        id: 'news_1',
        title: '星穹列车到站',
        body: '列车停靠空间站。',
        issueNumber: 1,
        createdAtTurn: 2,
      },
    ],
    update: [],
    removeIds: [],
  };
}

function applyEnvelope(
  patch: KernelNewsGenerationPatch,
  opts?: Readonly<{ commandId?: string; expectedRevision?: number }>,
): NewsApplyEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts?.commandId ?? 'news-cmd-1'),
    sessionId: SESSION,
    expectedRevision: asRevision(opts?.expectedRevision ?? 0),
    command: { type: 'news.apply', patch },
  };
}

describe('news.apply execute (Stage 5.3)', () => {
  it('applies patch and bumps revision once', async () => {
    const sessions = seedEmpty();
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      applyNews(applyEnvelope(addPatch(), { commandId: 'news-ok-1' }), {
        sessions,
      }),
    );

    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state.news.entries).toHaveLength(1);
    expect(after.state.news.entries[0]?.title).toBe('星穹列车到站');
    expect(after.state.phone).toEqual(before.state.phone);
    expect(after.state.knowledge).toEqual(before.state.knowledge);

    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      expect(terminal.view.news.entryCount).toBe(1);
      expect(terminal.view.news.latestTitles).toContain('星穹列车到站');
    }
  });

  it('illegal patch rejects without write', async () => {
    const sessions = seedEmpty();
    const before = await sessions.read(SESSION);
    const badPatch: KernelNewsGenerationPatch = {
      add: [],
      update: [{ id: 'missing', title: 'x', body: 'y' }],
      removeIds: [],
    };

    const frames = await collectAsync(
      applyNews(applyEnvelope(badPatch, { commandId: 'news-bad-1' }), {
        sessions,
      }),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'unknown' },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('revision conflict leaves news unchanged', async () => {
    const sessions = new InMemorySessionRepository();
    sessions.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(5),
        state: { turnCount: 1, travelerName: '开拓者' },
      }),
    );
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      applyNews(
        applyEnvelope(addPatch(), {
          commandId: 'news-stale',
          expectedRevision: 0,
        }),
        { sessions },
      ),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'revision_conflict' },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
  });

  it('commandId idempotency returns prior commit', async () => {
    const sessions = seedEmpty();
    const envelope = applyEnvelope(addPatch(), { commandId: 'news-idem-1' });

    const first = await collectAsync(applyNews(envelope, { sessions }));
    expect(first.at(-1)?.type).toBe('committed');
    const mid = await sessions.read(SESSION);

    const second = await collectAsync(applyNews(envelope, { sessions }));
    expect(second.at(-1)?.type).toBe('committed');
    if (second.at(-1)?.type === 'committed' && first.at(-1)?.type === 'committed') {
      expect(second.at(-1)).toEqual(first.at(-1));
    }
    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(mid.revision);
    expect(after.state.news.entries).toHaveLength(1);
  });

  it('NativeKernel routes news.apply', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    const kernel = new NativeKernel({ sessions, model });

    const frames = await collectAsync(
      kernel.execute(applyEnvelope(addPatch(), { commandId: 'news-native-1' })),
    );
    expect(frames.at(-1)?.type).toBe('committed');
    const after = await sessions.read(SESSION);
    expect(after.state.news.entries[0]?.id).toBe('news_1');
  });
});

describe('news.generate execute (Stage 5.3)', () => {
  it('model.complete → parse → apply → single CAS', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    const payload = JSON.stringify({
      add: [
        {
          id: 'news_gen_1',
          title: '前线战报',
          body: '星核猎手现身。',
          issueNumber: 2,
          createdAtTurn: 999,
        },
      ],
      update: [],
      removeIds: [],
    });
    model.enqueue({
      kind: 'success',
      chunks: [payload],
      completedText: payload,
    });
    const before = await sessions.read(SESSION);

    const envelope: NewsGenerateEnvelope = {
      protocolVersion: 1,
      commandId: asCommandId('news-gen-1'),
      sessionId: SESSION,
      expectedRevision: asRevision(0),
      command: { type: 'news.generate' },
    };

    const frames = await collectAsync(generateNews(envelope, { sessions, model }));
    expect(frames.at(-1)?.type).toBe('committed');

    const after = await sessions.read(SESSION);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state.news.entries[0]?.title).toBe('前线战报');
    expect(after.state.news.entries[0]?.createdAtTurn).toBe(2);
  });

  it('model failure leaves news unchanged', async () => {
    const sessions = seedEmpty();
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'failure', message: 'news model down' });
    const before = await sessions.read(SESSION);

    const envelope: NewsGenerateEnvelope = {
      protocolVersion: 1,
      commandId: asCommandId('news-gen-fail'),
      sessionId: SESSION,
      expectedRevision: asRevision(0),
      command: { type: 'news.generate' },
    };

    const frames = await collectAsync(generateNews(envelope, { sessions, model }));
    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure' },
    });
    expect(await sessions.read(SESSION)).toEqual(before);
  });
});
