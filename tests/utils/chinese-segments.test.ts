import { describe, expect, it } from 'vitest';
import { 切分中文词, 领域核心词 } from '@/utils/chineseSegments';

describe('切分中文词', () => {
  it('领域核心词整块保留，不被原生切分切碎', () => {
    expect(切分中文词('黑塔发出全站通告')).toContain('黑塔');
    expect(切分中文词('翁法罗斯二相乐园')).toEqual(
      expect.arrayContaining(['翁法罗斯', '二相乐园']),
    );
    expect(切分中文词('琥珀纪2157')).toEqual(expect.arrayContaining(['琥珀纪', '2157']));
  });

  it('常用词走原生切分（单字由调用方按长度过滤）', () => {
    expect(切分中文词('列车完成对接')).toEqual(expect.arrayContaining(['列车', '完成']));
    expect(切分中文词('残骸带深空追踪行动')).toEqual(expect.arrayContaining(['残骸', '追踪']));
  });

  it('调用方词表最长匹配优先', () => {
    expect(切分中文词('主控舱段警报解除', ['主控舱段', '舱段'])).toContain('主控舱段');
    expect(切分中文词('主控舱段警报解除', ['主控舱段', '舱段'])).not.toContain('舱段');
    expect(切分中文词('三月七标记信号', ['三月七'])).toContain('三月七');
  });

  it('词表去重去空去单字，空输入返回空数组', () => {
    expect(切分中文词('黑塔空间站', ['黑塔', '黑塔', ' ', 'x'])).toEqual(['黑塔', '空间站']);
    expect(切分中文词('')).toEqual([]);
    expect(切分中文词('   ')).toEqual([]);
  });

  it('标点与空白不产出空串', () => {
    const pieces = 切分中文词('列车，完成对接；乘务组下车。');
    expect(pieces).toEqual(expect.arrayContaining(['列车', '完成', '乘务组']));
    expect(pieces.every((piece) => piece.trim().length > 0)).toBe(true);
  });

  it('领域核心词是活表：关键专名必须在列', () => {
    for (const word of ['黑塔', '翁法罗斯', '贝洛伯格', '仙舟', '罗浮', '琥珀纪', '命途']) {
      expect(领域核心词).toContain(word);
    }
  });
});
