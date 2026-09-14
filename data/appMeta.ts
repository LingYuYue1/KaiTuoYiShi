// 应用级元数据：版本号与应用署名。
// 集中在此，界面组件不再各自去读 package.json——版本号是数据，不是渲染细节。

import pkg from '@/package.json';

export const APP_VERSION: string = pkg.version;

export interface AppCredits {
  author: string;
  contributors: readonly string[];
}

export const APP_CREDITS: AppCredits = {
  author: '牢凌',
  contributors: ['11MOMO', 'Penna Mch'],
};
