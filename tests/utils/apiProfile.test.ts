import { describe, expect, it } from 'vitest';
import { validateApiProfile } from '@/utils/apiProfile';

const 合法包 = {
  app: 'KaiTuoYiShi',
  kind: 'api-profile',
  version: 1,
  exportedAt: '2026-08-31T00:00:00.000Z',
  includeApiKeys: false,
  apiSettings: { configs: [] },
  routes: {},
};

describe('API 配置包导入校验', () => {
  it('合法包原样通过', () => {
    expect(validateApiProfile(合法包)).toBe(合法包);
  });

  it('应用标识或包类型不对时报「不是有效的配置包」', () => {
    expect(() => validateApiProfile({ ...合法包, app: '别的游戏' }))
      .toThrow('不是有效的开拓轶事 API 配置包。');
    expect(() => validateApiProfile({ ...合法包, kind: 'save' }))
      .toThrow('不是有效的开拓轶事 API 配置包。');
    expect(() => validateApiProfile('不是对象')).toThrow('不是有效的开拓轶事 API 配置包。');
  });

  it('版本不对时报版本不兼容', () => {
    expect(() => validateApiProfile({ ...合法包, version: 2 }))
      .toThrow('API 配置包版本不兼容，请更新客户端后再导入。');
  });

  it('缺必要结构时报缺少必要配置', () => {
    expect(() => validateApiProfile({ ...合法包, apiSettings: {} }))
      .toThrow('API 配置包缺少必要配置。');
    expect(() => validateApiProfile({ ...合法包, routes: undefined }))
      .toThrow('API 配置包缺少必要配置。');
  });
});
