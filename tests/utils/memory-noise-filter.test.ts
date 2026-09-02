import { describe, expect, it } from 'vitest';
import { compressToShortTerm } from '@/hooks/useGame/memoryUtils';
import type { 记忆系统 } from '@/models/memory';

function 建记忆系统(即时记忆: string[]): 记忆系统 {
  return { 即时记忆, 短期记忆: [], 中期记忆: [], 长期记忆: [] };
}

const 进度行 = '剧情编织进度：星核 当前进入第 3 段「裂隙」';

describe('压缩时的进度元数据过滤', () => {
  it('整批都是进度元数据时，摘要里也不残留噪声（fallback 同样过滤）', () => {
    const result = compressToShortTerm(建记忆系统([进度行, '剧情编织进度：星核 当前进入第 4 段']), 7);
    expect(result.短期记忆).toHaveLength(1);
    expect(result.短期记忆[0]).not.toContain('剧情编织进度');
    expect(result.短期记忆[0]).not.toContain('当前进入第');
  });

  it('混合批次只留有效内容', () => {
    const result = compressToShortTerm(
      建记忆系统([进度行, '玩家输入：与守夜人达成停战', '剧情回应：双方各自后撤三里']),
      7,
    );
    expect(result.短期记忆[0]).toContain('停战');
    expect(result.短期记忆[0]).not.toContain('剧情编织进度');
  });
});
