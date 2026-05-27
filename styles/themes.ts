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
      '--tj-bg-primary': '8, 7, 9',
      '--tj-bg-secondary': '16, 14, 16',
      '--tj-text-primary': '230, 218, 188',
      '--tj-text-secondary': '160, 148, 120',
      '--tj-accent-primary': '245, 217, 122',
      '--tj-accent-secondary': '196, 163, 90',
      '--tj-border': '245, 217, 122',
      '--tj-danger': '220, 90, 90',
      '--tj-on-accent': '26, 19, 37',
      '--tj-surface': '16, 14, 16',
      '--tj-surface-strong': '10, 9, 10',
      '--tj-bubble': '8, 7, 9',
      '--tj-chat-bubble': '20, 16, 28',
      '--tj-chat-bubble-alpha': '0.78',
      '--tj-chat-text': '236, 224, 194',
      '--tj-chat-muted': '182, 168, 132',
      '--tj-shadow': '0, 0, 0',
      '--tj-tech-cyan': '117, 214, 216',
      '--tj-tech-cyan-deep': '117, 214, 216',
      '--tj-tech-blue': '120, 145, 185',
      '--tj-tech-blue-deep': '120, 145, 185',
      '--tj-paper-deep': '10, 9, 10',
      '--tj-paper-warm': '16, 14, 16',
      '--tj-amber-soft': '245, 217, 122',
      '--tj-amber-deep': '245, 217, 122',
      '--tj-sage-soft': '160, 230, 170',
      '--tj-sage-deep': '160, 230, 170',
      '--tj-tech-wash': '16, 14, 16',
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
    id: 'morningInk',
    name: '晨间墨色',
    description: '白天纸面、浅墨线框与温润朱砂，面向长时间阅读的新皮肤',
    variables: {
      '--tj-bg-primary': '232, 226, 212',
      '--tj-bg-secondary': '243, 239, 228',
      '--tj-text-primary': '46, 40, 34',
      '--tj-text-secondary': '116, 103, 88',
      '--tj-accent-primary': '145, 83, 58',
      '--tj-accent-secondary': '118, 128, 111',
      '--tj-border': '194, 179, 154',
      '--tj-danger': '176, 72, 68',
      '--tj-on-accent': '252, 248, 238',
      '--tj-surface': '247, 244, 235',
      '--tj-surface-strong': '238, 232, 218',
      '--tj-bubble': '253, 250, 242',
      '--tj-chat-bubble': '253, 250, 242',
      '--tj-chat-bubble-alpha': '0.94',
      '--tj-chat-text': '58, 50, 42',
      '--tj-chat-muted': '96, 84, 70',
      '--tj-shadow': '112, 92, 64',
      '--tj-tech-cyan': '108, 168, 178',
      '--tj-tech-cyan-deep': '38, 105, 116',
      '--tj-tech-blue': '126, 146, 164',
      '--tj-tech-blue-deep': '62, 88, 118',
      '--tj-paper-deep': '229, 220, 203',
      '--tj-paper-warm': '248, 244, 234',
      '--tj-amber-soft': '221, 185, 104',
      '--tj-amber-deep': '132, 89, 43',
      '--tj-sage-soft': '202, 215, 195',
      '--tj-sage-deep': '72, 105, 76',
      '--tj-tech-wash': '226, 238, 236',
      '--tj-ui-title': '46, 40, 34',
      '--tj-ui-body': '58, 50, 42',
      '--tj-ui-muted': '96, 84, 70',
      '--tj-ui-faint': '120, 105, 88',
      '--tj-ui-active-text': '252, 248, 238',
      '--tj-ui-panel': '253, 250, 242',
      '--tj-ui-panel-strong': '238, 232, 218',
      '--tj-ui-nsfw': '156, 82, 108',
      '--tj-ui-success': '54, 111, 74',
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
