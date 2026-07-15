/**
 * Kernel news-domain types (Stage 5.3).
 *
 * Minimal formal shapes for pure news patch application.
 * Not a full dump of models/news.
 */

export type KernelNewsEntry = Readonly<{
  id: string;
  title: string;
  body: string;
  issueNumber: number;
  createdAtTurn: number;
}>;

export type KernelNewsSystem = Readonly<{
  entries: readonly KernelNewsEntry[];
}>;

export type KernelNewsUpdate = Readonly<{
  id: string;
  title: string;
  body: string;
}>;

export type KernelNewsGenerationPatch = Readonly<{
  add: readonly KernelNewsEntry[];
  update: readonly KernelNewsUpdate[];
  removeIds: readonly string[];
}>;

/** Empty formal news system — valid state for new sessions / schema ingress. */
export function createEmptyKernelNews(): KernelNewsSystem {
  return { entries: [] };
}

export function createEmptyNewsPatch(): KernelNewsGenerationPatch {
  return { add: [], update: [], removeIds: [] };
}

export function cloneKernelNews(news: KernelNewsSystem): KernelNewsSystem {
  return {
    entries: news.entries.map((entry) => ({ ...entry })),
  };
}
