const VOICE_CORPUS_LABEL_PATTERN = /^(?:初次见面|问候|道别|关于|闲谈|爱好|烦恼|分享|见闻|危机|提醒)/u;

export function formatArchiveParagraphLine(line: string): string {
  const hasMarkdownVoiceLabel = /^#{3,4}\s+/u.test(line);
  const normalized = line.replace(/^#{3,4}\s+/u, '').trim();
  if (!hasMarkdownVoiceLabel || !VOICE_CORPUS_LABEL_PATTERN.test(normalized)) return normalized;

  const voiceLine = normalized.match(/^(.+?)\s+([「『“"][\s\S]*)$/u);
  if (!voiceLine) return normalized;

  const label = voiceLine[1].replace(/[：:]$/u, '').trimEnd();
  return `${label} ：${voiceLine[2]}`;
}
