// 中文分词（零依赖）：Intl.Segmenter 原生切分 + Trie 领域词表最长匹配。
// 原生切分对游戏专名是碎的（黑塔→黑/塔，主控舱段→主/控/舱/段），词表命中整块保留；
// 间隙段走 Segmenter 取 isWordLike。本模块只管切开，不过滤——长度/停用词是调用方（评分器）的事。
import { devLog } from '@/utils/devLog';

/**
 * 领域核心词（活表）：原生切分会切碎的游戏专名，随 canon 增补。调用方再叠加分段/系列实体。
 * 只读：下方的 Trie 与词项缓存都假定它不会在运行期被改写。
 */
export const 领域核心词: readonly string[] = [
  '黑塔',
  '空间站',
  '星穹列车',
  '列车组',
  '无名客',
  '乘务组',
  '观景车厢',
  '仙舟',
  '罗浮',
  '星槎',
  '贝洛伯格',
  '雅利洛',
  '翁法罗斯',
  '二相乐园',
  '匹诺康尼',
  '琥珀纪',
  '命途',
  '狭间',
  '智库',
  '忆庭',
  '开拓',
  '星神',
  '丰饶',
  '巡猎',
  '毁灭',
  '虚无',
  '同谐',
  '欢愉',
  '存护',
  '终末',
  '绝灭大君',
  '令使',
  '星核',
  '裂界',
];

let segmenter: Intl.Segmenter | null = null;
let segmenterProbed = false;

function getSegmenter(): Intl.Segmenter | null {
  if (!segmenterProbed) {
    segmenterProbed = true;
    try {
      segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
    } catch {
      devLog('stage', 'chinese_segments.fallback', { reason: 'Intl.Segmenter 不可用，回退标点切分' });
      segmenter = null;
    }
  }
  return segmenter;
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isWord: boolean;
}

/** 标点/空白切分正则。含 `g`，只可交给 split/replace（test/exec 会带着 lastIndex 串味）。 */
export const 标点切分正则 = /[\s，。；、：:,.!?！？「」『』（）()[\]【】\-—]+/g;

function buildTrie(words: string[]): TrieNode {
  const root: TrieNode = { children: new Map(), isWord: false };
  for (const word of words) {
    let node = root;
    for (const char of word) {
      let next = node.children.get(char);
      if (!next) {
        next = { children: new Map(), isWord: false };
        node.children.set(char, next);
      }
      node = next;
    }
    node.isWord = true;
  }
  return root;
}

/**
 * 词表 → Trie 缓存。评分器按分段取词表，每回合要问同一个词表几十次，而 buildTrie 是
 * 逐个 Map 分配的——不缓存，分词建表就成了评分的主开销。词表种类有限（领域核心词 +
 * 各分段实体），64 条足够装下一整轮；超了就整表丢弃重建，不引入 LRU 的复杂度。
 */
const trieCache = new Map<string, TrieNode>();
const TRIE_CACHE_MAX = 64;

function 取词表Trie(lexicon: string[]): TrieNode {
  // 键用 JSON 序列化：join('') 会让 ['ab','c'] 与 ['a','bc'] 撞同一个键。
  const key = JSON.stringify(lexicon);
  const cached = trieCache.get(key);
  if (cached) return cached;
  const trie = buildTrie(lexicon);
  if (trieCache.size >= TRIE_CACHE_MAX) trieCache.clear();
  trieCache.set(key, trie);
  return trie;
}

/** 无 Segmenter 时的回退：按标点/空白切分（旧语义），保证 exotic 运行时不崩。 */
function splitByPunctuation(text: string): string[] {
  return text.split(标点切分正则).map((item) => item.trim()).filter(Boolean);
}

function segmentGap(gap: string): string[] {
  const active = getSegmenter();
  if (!active) return splitByPunctuation(gap);
  const pieces: string[] = [];
  for (const part of active.segment(gap)) {
    if (!part.isWordLike) continue;
    const text = part.segment.trim();
    if (text) pieces.push(text);
  }
  return pieces;
}

/**
 * 切分中文词：词表（含领域核心词）最长匹配优先，间隙走原生分词。
 * 词表项需 ≥2 字（去重去空）；返回含单字（调用方按长度过滤）。
 */
export function 切分中文词(text: string, 词表: string[] = []): string[] {
  const source = text.trim();
  if (!source) return [];
  const lexicon = Array.from(new Set(
    [...领域核心词, ...词表].map((word) => word.trim()).filter((word) => word.length >= 2),
  ));
  if (!lexicon.length) return segmentGap(source);
  const trie = 取词表Trie(lexicon);
  const pieces: string[] = [];
  let gap = '';
  const flushGap = () => {
    if (gap) {
      pieces.push(...segmentGap(gap));
      gap = '';
    }
  };
  let index = 0;
  while (index < source.length) {
    let node = trie;
    let matched: string | null = null;
    let cursor = index;
    while (cursor < source.length) {
      const next = node.children.get(source[cursor]);
      if (!next) break;
      node = next;
      cursor += 1;
      if (node.isWord) matched = source.slice(index, cursor);
    }
    if (matched) {
      flushGap();
      pieces.push(matched);
      index += matched.length;
    } else {
      gap += source[index];
      index += 1;
    }
  }
  flushGap();
  return pieces;
}
