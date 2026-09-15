import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { 构造剧情编织系列, 构造剧情编织系统, 归一化剧情编织系列, 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 剧情编织系列 } from '@/models/storyWeaving';
import { 构造智库系统, 归一化智库系统 } from '@/models/zhiku';
import { 装配内置智库条目, bundledZhikuPresets } from '@/data/zhikuPreset';
import { STORY_WEAVING_CANON_DIR as CANON_DIR } from './helpers/storyWeavingFixture';

// 裸产物完整性契约：**直接断言仓内产物**，而不是「先归一化再断言归一化结果」。
//
// 为什么重要：运行时的可信构造（构造剧情编织系列 / 构造剧情编织系统）不做逐字段清洗与兜底，
// 一旦产物少了某个派生字段，类型擦除后运行时就会拿到 undefined。所以契约测试必须在裸 JSON
// 上验证字段，并与运行时的消费契约保持一致。

const ZHIKU_DIR = path.join(process.cwd(), 'public', 'zhiku-presets');
const CANON_START_SERIES_ID = 'story_canon_zhiku_herta_station_chapter1';

const 处理状态 = new Set(['待处理', '处理中', '已完成', '失败']);
const 运行状态 = new Set(['未开始', '当前', '已经历', '已跳过', '已偏离', '暂停']);

const 分段数组字段 = [
  '章节标题', '开局已成立事实', '前段延续事实', '本段结束状态', '给后续参考',
  '原著硬约束', '可提前铺垫', '登场角色', '涉及地点', '涉及派系',
  '角色档案', '势力档案', '地图地点档案', '关键事件', '时间线', '角色推进',
] as const;

async function readCanonFiles(): Promise<Array<{ id: string; raw: 剧情编织系列 }>> {
  const files = (await readdir(CANON_DIR)).filter((name) => name.endsWith('.json'));
  return Promise.all(files.map(async (file) => ({
    id: file.replace(/\.json$/u, ''),
    raw: JSON.parse(await readFile(path.join(CANON_DIR, file), 'utf8')) as 剧情编织系列,
  })));
}

function canonical<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('内置 canon 裸产物契约', () => {
  it('每个文件的字段都是运行时消费契约的一部分，且取值合法', async () => {
    const files = await readCanonFiles();
    expect(files).toHaveLength(27);
    for (const { id, raw } of files) {
      expect(raw.id, id).toBe(id);
      expect(raw.内置预设ID, id).toBe(id);
      expect(raw.来源类型, id).toBe('canon');
      expect(typeof raw.标题 === 'string' && raw.标题.trim().length > 0, id).toBe(true);
      expect(typeof raw.作品名 === 'string' && raw.作品名.trim().length > 0, id).toBe(true);
      expect(typeof raw.原始文本 === 'string', id).toBe(true);
      expect(Number.isInteger(raw.每段章数) && raw.每段章数 >= 1, id).toBe(true);
      expect(typeof raw.激活注入 === 'boolean', id).toBe(true);
      expect(Number.isInteger(raw.当前分段组号) && raw.当前分段组号 >= 1, id).toBe(true);
      expect(typeof raw.当前阶段概括 === 'string', id).toBe(true);
      for (const key of ['核心角色摘要', '核心角色', '涉及地点索引', '涉及派系索引'] as const) {
        expect(Array.isArray(raw[key]), `${id}.${key}`).toBe(true);
      }
      expect(Number.isFinite(raw.createdAt), id).toBe(true);
      expect(Number.isFinite(raw.updatedAt), id).toBe(true);

      expect(raw.章节列表.length, id).toBeGreaterThan(0);
      for (const chapter of raw.章节列表) {
        expect(typeof chapter.id === 'string' && chapter.id.trim().length > 0, id).toBe(true);
        expect(Number.isInteger(chapter.序号) && chapter.序号 >= 1, id).toBe(true);
        expect(typeof chapter.标题 === 'string' && chapter.标题.trim().length > 0, id).toBe(true);
        expect(typeof chapter.内容 === 'string', id).toBe(true);
        expect(Number.isFinite(chapter.字数) && chapter.字数 > 0, id).toBe(true);
      }

      expect(raw.分段列表.length, id).toBeGreaterThan(0);
      raw.分段列表.forEach((segment, index) => {
        const at = `${id}.分段[${index}]`;
        expect(segment.组号, at).toBe(index + 1);
        expect(typeof segment.id === 'string' && segment.id.trim().length > 0, at).toBe(true);
        expect(typeof segment.标题 === 'string' && segment.标题.trim().length > 0, at).toBe(true);
        expect(typeof segment.是否开局组, at).toBe('boolean');
        expect(Number.isInteger(segment.起始章序号) && segment.起始章序号 >= 1, at).toBe(true);
        expect(Number.isInteger(segment.结束章序号) && segment.结束章序号 >= 1, at).toBe(true);
        expect(typeof segment.启用注入, at).toBe('boolean');
        expect(typeof segment.原文内容 === 'string' && segment.原文内容.trim().length > 0, at).toBe(true);
        expect(Number.isFinite(segment.字数) && segment.字数 > 0, at).toBe(true);
        expect(处理状态.has(segment.处理状态), `${at}.处理状态=${segment.处理状态}`).toBe(true);
        expect(运行状态.has(segment.运行状态), `${at}.运行状态=${segment.运行状态}`).toBe(true);
        expect(Number.isFinite(segment.updatedAt), at).toBe(true);
        for (const key of 分段数组字段) {
          expect(Array.isArray(segment[key]), `${at}.${key}`).toBe(true);
        }
      });

      const 开局组 = raw.分段列表.filter((segment) => segment.是否开局组);
      expect(开局组.map((segment) => segment.组号), id).toEqual([1]);
    }
  });

  it('可信构造与边界归一化在真实产物上结果一致（证明不再需要运行时重证）', async () => {
    const files = await readCanonFiles();
    for (const { id, raw } of files) {
      expect(canonical(构造剧情编织系列(raw)), id).toEqual(canonical(归一化剧情编织系列(raw)));
    }
    const system = 构造剧情编织系统({
      系列列表: files.map(({ raw }) => 构造剧情编织系列(raw)),
      当前系列ID: CANON_START_SERIES_ID,
    });
    const normalized = 归一化剧情编织系统({
      系列列表: files.map(({ raw }) => raw),
      当前系列ID: CANON_START_SERIES_ID,
    });
    expect(system.系列列表.length).toBe(normalized.系列列表.length);
    expect(system.当前系列ID).toBe(normalized.当前系列ID);
  });
});

describe('内置 zhiku 作者格式边界契约', () => {
  it('作者格式逐文件过边界归一化后，聚合阶段不再需要重证', async () => {
    const normalizedPerFile = await Promise.all(bundledZhikuPresets.map(async (preset) => {
      const file = path.join(ZHIKU_DIR, preset.path.replace(/^\/zhiku-presets\//u, ''));
      const payload = JSON.parse(await readFile(file, 'utf8')) as unknown;
      return 归一化智库系统({ 条目: 装配内置智库条目(preset, payload) }).条目;
    }));
    const flat = normalizedPerFile.flat();
    expect(canonical(构造智库系统({ 条目: flat }))).toEqual(canonical(归一化智库系统({ 条目: flat })));
  });
});
