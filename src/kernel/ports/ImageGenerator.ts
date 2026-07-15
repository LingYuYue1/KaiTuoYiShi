/**
 * ImageGenerator port (Stage 5.4).
 *
 * Separate from ModelGateway — do not expand ModelGateway with image methods.
 * Adapters may load reference bytes via AssetStore when needed.
 * Yields progress/success/failure frames; success carries raw bytes (Uint8Array),
 * never object URLs or formal data URLs.
 */

export type ImageGenerateRequest = Readonly<{
  prompt: string;
  negativePrompt?: string;
  nsfw: boolean;
  size?: string;
  /** Committed asset refs used as references — generator adapter loads bytes via AssetStore if needed */
  referenceAssetIds?: readonly string[];
}>;

export type ImageGenerateProgress = Readonly<{
  type: 'progress';
  attempt: number;
  totalAttempts: number;
  message?: string;
}>;

export type ImageGenerateSuccess = Readonly<{
  type: 'success';
  bytes: Uint8Array;
  mimeType: string;
  model?: string;
  backend?: string;
  /** Remote URL only — NOT object URL, NOT data URL for formal use */
  originalUrl?: string;
}>;

export type ImageGenerateFailure = Readonly<{
  type: 'failure';
  message: string;
}>;

export type ImageGenerateFrame =
  | ImageGenerateProgress
  | ImageGenerateSuccess
  | ImageGenerateFailure;

export interface ImageGenerator {
  generate(request: ImageGenerateRequest): AsyncIterable<ImageGenerateFrame>;
}
