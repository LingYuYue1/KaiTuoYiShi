// 进入游戏后右侧菜单的所有系统入口。
// 顺序即菜单显示顺序。新增系统时在此追加。

export type GameSystemId =
  | 'path'
  | 'skill'
  | 'equipment'
  | 'inventory'
  | 'companion'
  | 'album'
  | 'news'
  | 'plot'
  | 'yiting'
  | 'worldbook'
  | 'zhiku'
  | 'memory';

export interface GameMenuItem {
  id: GameSystemId;
  label: string;
  subtitle: string;
  glyph: string;
}

export const GAME_MENU_ITEMS: GameMenuItem[] = [
  { id: 'path', label: '命途', subtitle: '对于行走在自身执掌的命途之上的凡人，星神往往不闻不问。但他们因赞许或悲悯偶尔投下的一瞥，却足以被追随者奉为至宝。', glyph: '✶' },
  { id: 'skill', label: '战技', subtitle: '命途招式', glyph: '✧' },
  { id: 'equipment', label: '装备', subtitle: '装备系统', glyph: '◈' },
  { id: 'inventory', label: '背包', subtitle: '背包系统', glyph: '◇' },
  { id: 'companion', label: '伙伴', subtitle: '社交系统', glyph: '✦' },
  { id: 'album', label: '相册', subtitle: '视觉资产', glyph: '▧' },
  { id: 'news', label: '新闻', subtitle: '世界演变', glyph: '☉' },
  { id: 'plot', label: '剧情', subtitle: '剧情编织', glyph: '❖' },
  { id: 'memory', label: '记忆', subtitle: '长中短期', glyph: '◐' },
  { id: 'yiting', label: '忆庭', subtitle: '回忆库', glyph: '◌' },
  { id: 'zhiku', label: '智库', subtitle: '原著资料', glyph: '◈' },
  { id: 'worldbook', label: '如我所书', subtitle: '世界书管理', glyph: '✧' },
];
