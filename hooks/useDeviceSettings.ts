import { useCallback } from 'react';
import { saveSetting } from '@/services/dbService';
import { devLog, devLogError } from '@/utils/devLog';
import type { API设置, 游戏设置, 主题预设 } from '@/models/settings';
import {
  归一化额外功能设置,
  归一化剧情编织系统设置,
  归一化记忆系统设置,
  归一化视觉文本设置,
  归一化手机系统设置,
  归一化星际和平周报设置,
  归一化智库系统设置,
  归一化文生图系统设置,
} from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';

/**
 * 设备级设置持久化用例动作（片 panel-p2，审计破口 ② 收敛）。
 *
 * B 类设置（apiSettings/gameSettings/currentTheme/worldbooks）的写入侧统一收敛到本管理器：
 * 各 Settings tab 不再直连 dbService 的 saveSetting，改经 SettingsModal/App 注入的
 * 持久化动作写入。动作内部统一「归一化 → saveSetting → devLog 埋点」。
 *
 * 语义约束：写入时机与字段与收敛前完全一致；状态源仍为 useGameState（本 hook 只负责
 * IndexedDB 写入侧，不持有任何状态）。ApiSettings 的显式构造新对象再写 state+IndexedDB
 * 时序由调用方原样保留，本管理器只在其之后落盘。
 */

/** gameSettings 整体归一化：组合各子系统归一化器（对来自 state 的合法对象幂等保持结构不变）。 */
function 归一化游戏设置(settings: 游戏设置): 游戏设置 {
  return {
    ...settings,
    新闻系统: 归一化星际和平周报设置(settings.新闻系统),
    手机系统: 归一化手机系统设置(settings.手机系统),
    智库系统: 归一化智库系统设置(settings.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(settings.剧情编织系统),
    记忆系统: 归一化记忆系统设置(settings.记忆系统),
    文生图系统: 归一化文生图系统设置(settings.文生图系统),
    visualTextSettings: 归一化视觉文本设置(settings.visualTextSettings),
    额外功能: 归一化额外功能设置(settings.额外功能),
  };
}

/** API设置 归一化：最小结构保证（activeConfigId + configs 数组）。 */
function 归一化API设置(settings: API设置): API设置 {
  return {
    activeConfigId: settings.activeConfigId ?? null,
    configs: Array.isArray(settings.configs) ? settings.configs : [],
  };
}

/** worldbooks 归一化：数组保证。 */
function 归一化世界书列表(books: 世界书[]): 世界书[] {
  return Array.isArray(books) ? books : [];
}

export interface DeviceSettingsActions {
  /** 游戏设定落盘（tab 保存 / SettingsModal 变更闭环共用）。 */
  persistGameSettings: (next: 游戏设置) => Promise<void>;
  /** API 设置落盘（ApiSettings handleSave 单写 apiSettings）。 */
  persistApiSettings: (next: API设置) => Promise<void>;
  /** 主题切换落盘。 */
  persistTheme: (next: 主题预设) => Promise<void>;
  /** 世界书（ST 预设导入 / 世界书变更）落盘。 */
  persistWorldbooks: (next: 世界书[]) => Promise<void>;
  /** ApiSettings 复合写：apiSettings + gameSettings 顺序落盘（applyApiProfile 专用）。 */
  persistApiProfile: (api: API设置, game: 游戏设置) => Promise<void>;
}

export function useDeviceSettings(): DeviceSettingsActions {
  const persistGameSettings = useCallback(async (next: 游戏设置) => {
    const normalized = 归一化游戏设置(next);
    try {
      await saveSetting('gameSettings', normalized);
      devLog('ui', 'persist-game-settings', {
      });
    } catch (err) {
      devLogError('ui', 'persist-game-settings-failed', err);
      throw err;
    }
  }, []);

  const persistApiSettings = useCallback(async (next: API设置) => {
    const normalized = 归一化API设置(next);
    try {
      await saveSetting('apiSettings', normalized);
      devLog('ui', 'persist-api-settings', { configs: normalized.configs.length });
    } catch (err) {
      devLogError('ui', 'persist-api-settings-failed', err);
      throw err;
    }
  }, []);

  const persistTheme = useCallback(async (next: 主题预设) => {
    try {
      await saveSetting('theme', next);
      devLog('ui', 'persist-theme', { theme: next });
    } catch (err) {
      devLogError('ui', 'persist-theme-failed', err);
      throw err;
    }
  }, []);

  const persistWorldbooks = useCallback(async (next: 世界书[]) => {
    const normalized = 归一化世界书列表(next);
    try {
      await saveSetting('worldbooks', normalized);
      devLog('ui', 'persist-worldbooks', { count: normalized.length });
    } catch (err) {
      devLogError('ui', 'persist-worldbooks-failed', err);
      throw err;
    }
  }, []);

  const persistApiProfile = useCallback(async (api: API设置, game: 游戏设置) => {
    const normalizedApi = 归一化API设置(api);
    const normalizedGame = 归一化游戏设置(game);
    try {
      // 顺序与收敛前 applyApiProfile 原实现一致：先 apiSettings 后 gameSettings。
      await saveSetting('apiSettings', normalizedApi);
      await saveSetting('gameSettings', normalizedGame);
      devLog('ui', 'persist-api-profile', { configs: normalizedApi.configs.length });
    } catch (err) {
      devLogError('ui', 'persist-api-profile-failed', err);
      throw err;
    }
  }, []);

  return { persistGameSettings, persistApiSettings, persistTheme, persistWorldbooks, persistApiProfile };
}
