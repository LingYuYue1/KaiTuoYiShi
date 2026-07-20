import type { API设置 } from '@/models/settings';
import type {
  AppearancePreferences,
  ContentLibrary,
  DevicePreferencePlanes,
  ExecutionPolicy,
  SavePolicy,
} from '@/models/settingsPlanes';

export type { AppearancePreferences, ContentLibrary, DevicePreferencePlanes, ExecutionPolicy, SavePolicy };

export type ResolvedModelRoute = Readonly<{
  provider: string;
  baseUrl: string;
  model: string;
  credentialId: string;
}>;

export type ResolvedModelRoutes = Readonly<{
  main: ResolvedModelRoute;
  variable?: ResolvedModelRoute;
  zhiku?: ResolvedModelRoute;
  yiting?: ResolvedModelRoute;
  phone?: ResolvedModelRoute;
  news?: ResolvedModelRoute;
  storyWeaving?: ResolvedModelRoute;
  memoryCompression?: ResolvedModelRoute;
  imageTokenizer?: ResolvedModelRoute;
}>;

/** One immutable, secret-bearing command capture. It is never persisted or projected. */
export type ExecutionContext = Readonly<{
  commandId: string;
  capturedAt: number;
  apiProfiles: API设置;
  executionPolicy: ExecutionPolicy;
  appearance: AppearancePreferences;
  content: ContentLibrary;
  savePolicy: SavePolicy;
  modelRoutes: ResolvedModelRoutes;
}>;
