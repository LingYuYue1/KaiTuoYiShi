import { useSyncExternalStore } from 'react';

let text = '';
const listeners = new Set<() => void>();

export function getStreamingMessage(): string {
  return text;
}

export function setStreamingMessage(value: string): void {
  if (text === value) return;
  text = value;
  for (const listener of listeners) listener();
}

export function subscribeStreamingMessage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribe to stream preview text without fan-out through App / useGameState. */
export function useStreamingMessage(): string {
  return useSyncExternalStore(subscribeStreamingMessage, getStreamingMessage, getStreamingMessage);
}
