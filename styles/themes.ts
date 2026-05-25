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
      '--tj-border': '80, 70, 50',
      '--tj-danger': '220, 90, 90',
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
