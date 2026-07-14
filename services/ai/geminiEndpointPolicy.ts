const OFFICIAL_GEMINI_HOSTNAME = 'generativelanguage.googleapis.com';
const OFFICIAL_GEMINI_V1BETA_BASE_URL = `https://${OFFICIAL_GEMINI_HOSTNAME}/v1beta`;

function normalizeThirdPartyGeminiBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/openai(?:\/chat\/completions)?$/i, '')
    .replace(/\/chat\/completions$/i, '');
}

export function normalizeGeminiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() === OFFICIAL_GEMINI_HOSTNAME) {
      return OFFICIAL_GEMINI_V1BETA_BASE_URL;
    }
  } catch {
    // Custom gateways sometimes use non-standard base strings. Keep cleanup conservative.
  }
  return normalizeThirdPartyGeminiBaseUrl(trimmed);
}
