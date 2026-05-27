export interface BuiltinPhoneWallpaper {
  id: string;
  title: string;
  description: string;
  src: string;
}

export const BUILTIN_PHONE_WALLPAPERS: BuiltinPhoneWallpaper[] = [
  {
    id: 'express_observation_warm',
    title: '列车观景车厢',
    description: '星穹列车观景车厢的暖色日常壁纸。',
    src: '/assets/phone-wallpapers/express-observation-warm.png',
  },
  {
    id: 'express_observation_refined',
    title: '列车星河窗',
    description: '更贴近观景车厢构图的星河窗壁纸。',
    src: '/assets/phone-wallpapers/express-observation-refined.png',
  },
  {
    id: 'express_morning',
    title: '列车清晨',
    description: '星穹列车穿过淡金星云的清晨壁纸。',
    src: '/assets/phone-wallpapers/express-morning.png',
  },
  {
    id: 'herta_station_lounge',
    title: '空间站休息区',
    description: '黑塔空间站风格的观景休息区壁纸。',
    src: '/assets/phone-wallpapers/herta-station-lounge.png',
  },
  {
    id: 'express_table_message',
    title: '桌边来信',
    description: '星穹列车桌面与手机消息的近景壁纸。',
    src: '/assets/phone-wallpapers/express-table-message.png',
  },
];

export const DEFAULT_PHONE_HOME_WALLPAPER = BUILTIN_PHONE_WALLPAPERS[0].src;
export const DEFAULT_PHONE_CHAT_WALLPAPER = BUILTIN_PHONE_WALLPAPERS[4].src;
