const PROMPT_LEAK_PATTERNS = [
  /^(?:你是伙伴系统的同行记忆整理器。)?请把某一名\s*NPC\s*的「与你同行的记忆」压缩为[\s\S]*?不要让关系突然跳变。[：:]\s*/u,
  /^你是伙伴系统的同行记忆整理器。[\s\S]*?不要让关系突然跳变。[：:]\s*/u,
  /^请把与你同行的记忆整理得更凝练，保留称呼、约定、关系变化和关键事件。[：:]\s*/u,
];

export function 清理NPC同行记忆摘要(raw: string, prompt?: string): string {
  let text = (raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

  text = text.replace(/^\[压缩\]\s*/u, '').trim();

  const note = prompt?.trim();
  if (note && text.startsWith(note)) {
    text = text.slice(note.length).replace(/^[：:\s]+/u, '').trim();
  }

  for (const pattern of PROMPT_LEAK_PATTERNS) {
    text = text.replace(pattern, '').trim();
  }

  return text;
}
