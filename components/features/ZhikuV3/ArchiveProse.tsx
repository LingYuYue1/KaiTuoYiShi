import type { ReactNode } from 'react';

const SECTION_HEADINGS = new Set([
  '基础识别',
  '角色详情',
  '常驻事实层',
  '角色故事',
  '角色故事层',
  '表现锚点层',
  '语料层',
  '写法指导',
  '语料参考：',
  '能力与职责模块',
  '人物概要',
  '关系与知情边界',
  '事实边界',
  '本回合注入建议',
  '关键事件',
  '时间线',
  '角色档案',
  '势力档案',
  '地图地点档案',
]);

const VOICE_LABEL_PATTERN = /^(?:初次见面|问候|道别|关于|闲谈|爱好|烦恼|分享|见闻|危机|提醒)/u;

type ProseBlock =
  | { kind: 'heading'; level: 3 | 4; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'voice'; lines: string[] }
  | { kind: 'paragraph'; text: string };

function formatVoiceLine(line: string): string {
  const normalized = line.replace(/^#{2,4}\s+/u, '').trim();
  if (!VOICE_LABEL_PATTERN.test(normalized)) return normalized;
  const match = normalized.match(/^(.+?)\s+([「『“"][\s\S]*)$/u);
  if (!match) return normalized;
  const label = match[1].replace(/[：:]$/u, '').trimEnd();
  return `${label} ：${match[2]}`;
}

function parseBlock(lines: string[]): ProseBlock {
  if (lines.length === 1) {
    const line = lines[0].trim();
    const markdown = line.match(/^(#{2,4})\s+(.+)$/u);
    if (markdown && !/[「『“"]/u.test(markdown[2])) {
      return { kind: 'heading', level: markdown[1].length <= 2 ? 3 : 4, text: markdown[2].trim() };
    }
    if (SECTION_HEADINGS.has(line)) return { kind: 'heading', level: 3, text: line.replace(/：$/u, '') };
  }
  if (lines.every((line) => line.trim().startsWith('- '))) {
    return { kind: 'list', items: lines.map((line) => line.trim().slice(2)) };
  }
  if (lines.length > 1 && lines.every((line) => /^#{3,4}\s+/u.test(line.trim()) && /[「『“"]/u.test(line))) {
    return { kind: 'voice', lines };
  }
  return { kind: 'paragraph', text: lines.map((line) => line.trim()).join('\n') };
}

function renderBlock(block: ProseBlock, key: string, withDropCap: boolean): ReactNode {
  if (block.kind === 'heading') {
    const Heading = block.level === 3 ? 'h3' : 'h4';
    return <Heading key={key}>{block.text}</Heading>;
  }
  if (block.kind === 'list') {
    return (
      <ul key={key}>
        {block.items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
      </ul>
    );
  }
  if (block.kind === 'voice') {
    return <span key={key} style={{ display: 'contents' }}>{block.lines.map((line, index) => <p key={`${line}-${index}`}>{formatVoiceLine(line)}</p>)}</span>;
  }
  return <p key={key} className={withDropCap ? 'zj-dropcap' : undefined}>{block.text}</p>;
}

/**
 * 档案正文渲染：按空行切块，只识别预设书写契约里真实存在的结构
 * （二三级标题、列表、语料语音行），其余保持原样段落。
 */
export function ArchiveProse({ source, dropCap = false, footer }: { source: string; dropCap?: boolean; footer?: ReactNode }) {
  const trimmed = source.trim();
  if (!trimmed) {
    return <p className="zj-paper__empty">该档案暂无可阅读正文。</p>;
  }
  const blocks = trimmed
    .split(/\n\s*\n/u)
    .map((block) => block.split(/\r?\n/u).filter((line) => line.trim()))
    .filter((block) => block.length > 0)
    .map(parseBlock);
  return (
    <div className="zj-paper">
      {blocks.map((block, index) => renderBlock(block, `block-${index}`, dropCap && index === 0 && block.kind === 'paragraph'))}
      {footer}
    </div>
  );
}
