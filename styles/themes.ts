export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  variables: Record<string, string>;
}

export const themes: ThemeDefinition[] = [
  {
    id: 'deepspace',
    name: '开拓金辉',
    description: '深空之上，开拓任务的金辉缓缓流转',
    variables: {
      /* ── 基础色 ── */
      '--tj-bg-primary': '8, 7, 9',
      '--tj-bg-secondary': '16, 14, 16',
      '--tj-text-primary': '230, 218, 188',
      '--tj-text-secondary': '160, 148, 120',
      '--tj-accent-primary': '245, 217, 122',
      '--tj-accent-secondary': '196, 163, 90',
      '--tj-accent-primary-deep': '196, 163, 90',
      '--tj-accent-mid': '223, 211, 130',
      '--tj-border': '245, 217, 122',
      '--tj-danger': '220, 90, 90',
      '--tj-on-accent': '26, 19, 37',
      /* ── 表面 / 气泡 ── */
      '--tj-surface': '16, 14, 16',
      '--tj-surface-strong': '10, 9, 10',
      '--tj-bubble': '8, 7, 9',
      /* ── 面板 / 弹窗背景 ── */
      '--tj-panel-bg-start': '16, 14, 16',
      '--tj-panel-bg-end': '10, 9, 10',
      /* ── 通用表面背景 ── */
      '--tj-surface-bg-start': '14, 12, 14',
      '--tj-surface-bg-end': '6, 5, 7',
      /* ── 抽屉 / 遮罩 ── */
      '--tj-drawer-bg': '18, 16, 18',
      '--tj-overlay-bg': '5, 4, 3',
      /* ── 输入框 ── */
      '--tj-input-bg-start': '14, 12, 14',
      '--tj-input-bg-end': '10, 9, 10',
      '--tj-input-focus-bg': '18, 16, 18',
      '--tj-option-bg': '14, 12, 14',
      /* ── 按钮（金蓝渐变） ── */
      '--tj-btn-primary-start': '245, 217, 122',
      '--tj-btn-primary-end': '142, 215, 255',
      '--tj-btn-primary-text': '26, 19, 37',
      /* ── 聊天 ── */
      '--tj-chat-bubble': '20, 16, 28',
      '--tj-chat-bubble-alpha': '0.78',
      '--tj-chat-text': '236, 224, 194',
      '--tj-chat-muted': '182, 168, 132',
      /* ── 阴影 ── */
      '--tj-shadow': '0, 0, 0',
      /* ── 科技色（冷青蓝，与金色 accent 形成对比） ── */
      '--tj-tech-cyan': '117, 214, 216',
      '--tj-tech-cyan-deep': '90, 185, 190',
      '--tj-tech-blue': '150, 175, 210',
      '--tj-tech-blue-deep': '130, 155, 190',
      /* ── 纸面 ── */
      '--tj-paper-deep': '10, 9, 10',
      '--tj-paper-warm': '16, 14, 16',
      /* ── 琥珀 / 鼠尾草 ── */
      '--tj-amber-soft': '245, 217, 122',
      '--tj-amber-deep': '218, 188, 100',
      '--tj-sage-soft': '160, 230, 170',
      '--tj-sage-deep': '160, 230, 170',
      '--tj-tech-wash': '16, 14, 16',
      /* ── UI 语义 ── */
      '--tj-ui-title': '255, 244, 212',
      '--tj-ui-body': '235, 223, 193',
      '--tj-ui-muted': '180, 168, 140',
      '--tj-ui-faint': '160, 148, 120',
      '--tj-ui-active-text': '26, 19, 37',
      '--tj-ui-panel': '16, 14, 16',
      '--tj-ui-panel-strong': '8, 7, 9',
      '--tj-ui-nsfw': '241, 183, 206',
      '--tj-ui-success': '165, 230, 170',
    },
  },
  {
    id: 'starOceanCyan',
    name: '星海青辉',
    description: '深空星海间，星际和平公司的冷峻科技蓝辉流转',
    variables: {
      /* ── 基础色 ── */
      '--tj-bg-primary': '10, 10, 16',
      '--tj-bg-secondary': '16, 18, 28',
      '--tj-text-primary': '210, 225, 245',
      '--tj-text-secondary': '130, 155, 190',
      '--tj-accent-primary': '142, 215, 255',
      '--tj-accent-secondary': '140, 120, 210',
      '--tj-accent-primary-deep': '120, 100, 200',
      '--tj-accent-mid': '150, 160, 230',
      '--tj-border': '120, 175, 225',
      '--tj-danger': '220, 90, 90',
      '--tj-on-accent': '6, 14, 28',
      /* ── 表面 / 气泡 ── */
      '--tj-surface': '16, 20, 32',
      '--tj-surface-strong': '10, 12, 20',
      '--tj-bubble': '10, 10, 16',
      /* ── 面板 / 弹窗背景 ── */
      '--tj-panel-bg-start': '18, 28, 42',
      '--tj-panel-bg-end': '12, 18, 32',
      /* ── 通用表面背景 ── */
      '--tj-surface-bg-start': '16, 22, 34',
      '--tj-surface-bg-end': '8, 12, 22',
      /* ── 抽屉 / 遮罩 ── */
      '--tj-drawer-bg': '18, 24, 36',
      '--tj-overlay-bg': '4, 10, 22',
      /* ── 输入框 ── */
      '--tj-input-bg-start': '16, 24, 38',
      '--tj-input-bg-end': '10, 18, 30',
      '--tj-input-focus-bg': '20, 30, 46',
      '--tj-option-bg': '16, 24, 38',
      /* ── 按钮（蓝淡紫渐变） ── */
      '--tj-btn-primary-start': '142, 215, 255',
      '--tj-btn-primary-end': '160, 140, 220',
      '--tj-btn-primary-text': '6, 14, 28',
      /* ── 聊天 ── */
      '--tj-chat-bubble': '18, 22, 36',
      '--tj-chat-bubble-alpha': '0.78',
      '--tj-chat-text': '205, 222, 242',
      '--tj-chat-muted': '150, 172, 200',
      /* ── 阴影 ── */
      '--tj-shadow': '0, 0, 0',
      /* ── 科技色 ── */
      '--tj-tech-cyan': '142, 215, 255',
      '--tj-tech-cyan-deep': '91, 170, 240',
      '--tj-tech-blue': '130, 110, 200',
      '--tj-tech-blue-deep': '100, 80, 170',
      /* ── 纸面 ── */
      '--tj-paper-deep': '8, 10, 18',
      '--tj-paper-warm': '14, 18, 28',
      /* ── 琥珀 / 鼠尾草 ── */
      '--tj-amber-soft': '140, 120, 210',
      '--tj-amber-deep': '160, 140, 220',
      '--tj-sage-soft': '100, 200, 180',
      '--tj-sage-deep': '60, 160, 140',
      '--tj-tech-wash': '14, 18, 28',
      /* ── UI 语义 ── */
      '--tj-ui-title': '210, 225, 250',
      '--tj-ui-body': '190, 210, 240',
      '--tj-ui-muted': '140, 165, 200',
      '--tj-ui-faint': '120, 145, 180',
      '--tj-ui-active-text': '6, 14, 28',
      '--tj-ui-panel': '14, 18, 28',
      '--tj-ui-panel-strong': '8, 10, 18',
      '--tj-ui-nsfw': '220, 170, 200',
      '--tj-ui-success': '100, 210, 170',
    },
  },
];

export function applyTheme(themeId: string): void {
  const theme = themes.find((t) => t.id === themeId) ?? themes[0];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.variables)) {
    root.style.setProperty(key, value);
  }
  root.setAttribute('data-theme', theme.id);
}

export function getThemeById(id: string): ThemeDefinition {
  return themes.find((t) => t.id === id) ?? themes[0];
}

/** 旧主题降级：已删除的主题自动回退到 deepspace */
export function normalizeThemeId(id: string): string {
  if (themes.some((t) => t.id === id)) return id;
  return 'deepspace';
}