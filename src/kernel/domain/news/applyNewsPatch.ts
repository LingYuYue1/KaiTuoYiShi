/**
 * Pure news patch apply (Stage 5.3).
 *
 * Spirit of services/ai/newsModel applyNewsGenerationResult —
 * without defensive defaults, silent skips, or Date.now side effects.
 */

import type {
  KernelNewsEntry,
  KernelNewsGenerationPatch,
  KernelNewsSystem,
  KernelNewsUpdate,
} from './types';

/**
 * Apply a generation patch onto a news system snapshot.
 * Sync pure function — immutable return, no I/O.
 *
 * Invalid patch shape or missing update target → throw.
 */
export function applyNewsPatch(
  current: KernelNewsSystem,
  patch: KernelNewsGenerationPatch,
): KernelNewsSystem {
  requireNewsSystem(current);
  requireNewsPatch(patch);

  const map = new Map<string, KernelNewsEntry>();
  for (const entry of current.entries) {
    map.set(entry.id, entry);
  }

  for (const update of patch.update) {
    applyUpdate(map, update);
  }

  for (const id of patch.removeIds) {
    if (!map.has(id)) {
      throw new Error(`applyNewsPatch: remove id not found: ${id}`);
    }
    map.delete(id);
  }

  for (const entry of patch.add) {
    if (map.has(entry.id)) {
      throw new Error(`applyNewsPatch: add id already exists: ${entry.id}`);
    }
    map.set(entry.id, entry);
  }

  const entries = Array.from(map.values()).sort(compareNewsEntries);
  return { entries };
}

function applyUpdate(
  map: Map<string, KernelNewsEntry>,
  update: KernelNewsUpdate,
): void {
  const hit = map.get(update.id);
  if (!hit) {
    throw new Error(`applyNewsPatch: update id not found: ${update.id}`);
  }
  map.set(update.id, {
    ...hit,
    title: update.title,
    body: update.body,
  });
}

function compareNewsEntries(a: KernelNewsEntry, b: KernelNewsEntry): number {
  if (b.issueNumber !== a.issueNumber) return b.issueNumber - a.issueNumber;
  if (b.createdAtTurn !== a.createdAtTurn) return b.createdAtTurn - a.createdAtTurn;
  return a.id.localeCompare(b.id);
}

function requireNewsSystem(current: KernelNewsSystem): void {
  if (!current || typeof current !== 'object') {
    throw new Error('applyNewsPatch: current must be a KernelNewsSystem object');
  }
  if (!Array.isArray(current.entries)) {
    throw new Error('applyNewsPatch: current.entries must be an array');
  }
  for (const entry of current.entries) {
    requireNewsEntry(entry, 'current.entries');
  }
  const seen = new Set<string>();
  for (const entry of current.entries) {
    if (seen.has(entry.id)) {
      throw new Error(`applyNewsPatch: duplicate entry id in current: ${entry.id}`);
    }
    seen.add(entry.id);
  }
}

function requireNewsPatch(patch: KernelNewsGenerationPatch): void {
  if (!patch || typeof patch !== 'object') {
    throw new Error('applyNewsPatch: patch must be a KernelNewsGenerationPatch object');
  }
  if (!Array.isArray(patch.add)) {
    throw new Error('applyNewsPatch: patch.add must be an array');
  }
  if (!Array.isArray(patch.update)) {
    throw new Error('applyNewsPatch: patch.update must be an array');
  }
  if (!Array.isArray(patch.removeIds)) {
    throw new Error('applyNewsPatch: patch.removeIds must be an array');
  }

  for (const entry of patch.add) {
    requireNewsEntry(entry, 'patch.add');
  }
  for (const update of patch.update) {
    requireNewsUpdate(update);
  }
  for (const id of patch.removeIds) {
    requireNonEmptyString(id, 'patch.removeIds[]');
  }

  const addIds = new Set<string>();
  for (const entry of patch.add) {
    if (addIds.has(entry.id)) {
      throw new Error(`applyNewsPatch: duplicate id in patch.add: ${entry.id}`);
    }
    addIds.add(entry.id);
  }

  const updateIds = new Set<string>();
  for (const update of patch.update) {
    if (updateIds.has(update.id)) {
      throw new Error(`applyNewsPatch: duplicate id in patch.update: ${update.id}`);
    }
    updateIds.add(update.id);
  }

  const removeIds = new Set<string>();
  for (const id of patch.removeIds) {
    if (removeIds.has(id)) {
      throw new Error(`applyNewsPatch: duplicate id in patch.removeIds: ${id}`);
    }
    removeIds.add(id);
  }

  for (const id of removeIds) {
    if (updateIds.has(id)) {
      throw new Error(`applyNewsPatch: id both updated and removed: ${id}`);
    }
    if (addIds.has(id)) {
      throw new Error(`applyNewsPatch: id both added and removed: ${id}`);
    }
  }
}

function requireNewsEntry(entry: KernelNewsEntry, label: string): void {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`applyNewsPatch: ${label} item must be an object`);
  }
  requireNonEmptyString(entry.id, `${label}.id`);
  requireNonEmptyString(entry.title, `${label}.title`);
  if (typeof entry.body !== 'string') {
    throw new Error(`applyNewsPatch: ${label}.body must be a string`);
  }
  requireFiniteNumber(entry.issueNumber, `${label}.issueNumber`);
  requireFiniteNumber(entry.createdAtTurn, `${label}.createdAtTurn`);
}

function requireNewsUpdate(update: KernelNewsUpdate): void {
  if (!update || typeof update !== 'object') {
    throw new Error('applyNewsPatch: patch.update item must be an object');
  }
  requireNonEmptyString(update.id, 'patch.update.id');
  requireNonEmptyString(update.title, 'patch.update.title');
  if (typeof update.body !== 'string') {
    throw new Error('applyNewsPatch: patch.update.body must be a string');
  }
}

function requireNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`applyNewsPatch: ${label} must be a non-empty string`);
  }
}

function requireFiniteNumber(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`applyNewsPatch: ${label} must be a finite number`);
  }
}
