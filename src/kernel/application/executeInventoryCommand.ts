import type {
  DropInventoryItemEnvelope,
  ExecutionFrame,
  UndoInventoryDropEnvelope,
  UseInventoryItemEnvelope,
} from '@/src/kernel/contract';
import { 使用物品, 丢弃物品, 恢复丢弃物品 } from '@/utils/inventoryActions';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* useSessionInventoryItem(
  envelope: UseInventoryItemEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const result = 使用物品(base.state.story.traveler, envelope.command.itemId, envelope.command.count);
    if (!result.ok) return rejected(result.message);
    return {
      type: 'next',
      state: { story: { ...base.state.story, traveler: result.traveler } },
    };
  });
}

export async function* dropSessionInventoryItem(
  envelope: DropInventoryItemEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const result = 丢弃物品(base.state.story.traveler, envelope.command.itemId, envelope.command.count);
    if (!result.ok || !result.receipt) return rejected(result.message);
    return {
      type: 'next',
      state: { story: { ...base.state.story, traveler: result.traveler } },
      receipt: {
        kind: 'inventory.drop',
        item: structuredClone(result.receipt.item),
        index: result.receipt.index,
      },
    };
  });
}

export async function* undoSessionInventoryDrop(
  envelope: UndoInventoryDropEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, async (base) => {
    const record = await sessions.findCommandReceipt(envelope.sessionId, envelope.command.dropCommandId);
    if (!record || record.receipt.kind !== 'inventory.drop') return rejected('Drop receipt does not exist');
    if (record.consumedBy) return rejected('Drop receipt was already consumed');
    const receipt = record.receipt;
    const result = 恢复丢弃物品(base.state.story.traveler, {
      item: structuredClone(receipt.item),
      dropCount: receipt.item.数量,
      index: receipt.index,
    });
    if (!result.ok) return rejected(result.message);
    return {
      type: 'next',
      state: { story: { ...base.state.story, traveler: result.traveler } },
      consumeReceiptFromCommandId: envelope.command.dropCommandId,
    };
  });
}

function rejected(message: string) {
  return { type: 'rejected' as const, error: { code: 'no_changes' as const, message } };
}
