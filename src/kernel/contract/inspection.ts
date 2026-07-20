export interface ContextSection {
  id: string;
  title: string;
  category: string;
  order: number;
  content: string;
  estimatedTokens: number;
  upload?: boolean;
  diagnostic?: boolean;
}

export type ContextSnapshotKind = 'main' | 'variable' | 'phone' | 'news' | 'yiting' | 'zhiku';

export interface ContextSnapshot {
  kind: ContextSnapshotKind;
  title: string;
  sections: ContextSection[];
  fullText: string;
  estimatedTokens: number;
  uploadEstimatedTokens: number;
  diagnosticEstimatedTokens: number;
  createdAt: number;
  sourceInput: string;
}
