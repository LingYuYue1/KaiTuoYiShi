export type RawSessionMigrationRecord = Readonly<{
  schemaVersion: unknown;
  sessionId: string;
  revision: number;
  state: unknown;
}>;

export interface SessionMigrationStorage {
  readRaw(sessionId: string): Promise<RawSessionMigrationRecord | null>;
  replaceV2(sessionId: string, next: RawSessionMigrationRecord): Promise<void>;
}
