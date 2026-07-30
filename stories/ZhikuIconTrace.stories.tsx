import type { Meta, StoryObj } from '@storybook/react-vite';
import './zhiku-icon-trace.css';

const CHARACTER_REFERENCE_SRC = '/assets/zhiku/icon-trace/gold-emblem-reference.png';
const CHARACTER_TRACE_SRC = '/assets/zhiku/icon-trace/gold-emblem-trace.svg';
const ENEMY_REFERENCE_SRC = '/assets/zhiku/icon-trace/enemy-emblem-reference.png';
const ENEMY_TRACE_SRC = '/assets/zhiku/icon-trace/enemy-emblem-precision-h.svg';
const AEON_REFERENCE_SRC = '/assets/zhiku/icon-trace/aeon-emblem-reference.png';
const AEON_TRACE_SRC = '/assets/zhiku/icon-trace/aeon-emblem-trace.svg';
const FACTION_REFERENCE_SRC = '/assets/zhiku/icon-trace/faction-emblem-reference.png';
const FACTION_TRACE_SRC = '/assets/zhiku/icon-trace/faction-emblem-precision-a.svg';
const TERM_REFERENCE_SRC = '/assets/zhiku/icon-trace/term-emblem-reference.png';
const TERM_TRACE_SRC = '/assets/zhiku/icon-trace/term-emblem-precision-a.svg';
const LOCATION_TRACE_SRC = '/assets/zhiku/icon-trace/location-emblem-concept-a.svg';
const STORY_ARCHIVE_TRACE_SRC = '/assets/zhiku/icon-trace/story-archive-emblem-concept-a.svg';
const PATH_TRACE_SRC = '/assets/zhiku/icon-trace/path-emblem-precision-c.svg';
const EVENT_TRACE_SRC = '/assets/zhiku/icon-trace/event-emblem-concept-a.svg';

type IconTraceComparisonProps = {
  bitmapLabel: string;
  heading: string;
  referenceAlt: string;
  referenceSrc?: string;
  subjectLabel: string;
  traceCode: string;
  traceSrc: string;
};

function TracedEmblem({ size, label, traceSrc }: { size: number; label: string; traceSrc: string }) {
  return (
    <div className="zhiku-icon-trace__size-sample">
      <div className="zhiku-icon-trace__emblem-stack" style={{ width: size, height: size }}>
        <span className="zhiku-icon-trace__rings" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div
          className="zhiku-icon-trace__emblem"
          style={{
            WebkitMaskImage: `url(${traceSrc})`,
            maskImage: `url(${traceSrc})`,
          }}
          role="img"
          aria-label={label}
        />
      </div>
      <span>{size}px</span>
    </div>
  );
}

function ZhikuIconTraceComparison({
  bitmapLabel,
  heading,
  referenceAlt,
  referenceSrc,
  subjectLabel,
  traceCode,
  traceSrc,
}: IconTraceComparisonProps) {
  return (
    <main className="zhiku-icon-trace">
      <header className="zhiku-icon-trace__header">
        <div>
          <span>ZHIKU / VECTOR TRACE STUDY</span>
          <h1>{heading}</h1>
        </div>
        <strong>{traceCode}</strong>
      </header>

      <section className="zhiku-icon-trace__comparison" aria-label="原图与矢量描摹对照">
        <article>
          <div className="zhiku-icon-trace__label">
            <span>01</span>
            <strong>{referenceSrc ? '参考原图' : '原创候选'}</strong>
          </div>
          <div className="zhiku-icon-trace__preview zhiku-icon-trace__preview--reference">
            {referenceSrc ? (
              <img src={referenceSrc} alt={referenceAlt} />
            ) : (
              <div
                className="zhiku-icon-trace__original-glyph"
                style={{
                  WebkitMaskImage: `url(${traceSrc})`,
                  maskImage: `url(${traceSrc})`,
                }}
                role="img"
                aria-label={referenceAlt}
              />
            )}
          </div>
        </article>

        <article>
          <div className="zhiku-icon-trace__label">
            <span>02</span>
            <strong>{subjectLabel} · 细环方案</strong>
          </div>
          <div className="zhiku-icon-trace__preview zhiku-icon-trace__preview--vector">
            <TracedEmblem size={236} label={`${subjectLabel}矢量描摹`} traceSrc={traceSrc} />
          </div>
        </article>

        <article>
          <div className="zhiku-icon-trace__label">
            <span>03</span>
            <strong>节点尺寸检查</strong>
          </div>
          <div className="zhiku-icon-trace__preview zhiku-icon-trace__preview--sizes">
            <TracedEmblem size={96} label={`96 像素${subjectLabel}矢量描摹`} traceSrc={traceSrc} />
            <TracedEmblem size={72} label={`72 像素${subjectLabel}矢量描摹`} traceSrc={traceSrc} />
            <TracedEmblem size={48} label={`48 像素${subjectLabel}矢量描摹`} traceSrc={traceSrc} />
          </div>
        </article>
      </section>

      <footer className="zhiku-icon-trace__footer">
        <span>{bitmapLabel}</span>
        <span>VECTOR / CURVE TRACE</span>
        <span>BACKGROUND REMOVED</span>
      </footer>
    </main>
  );
}

const meta = {
  title: '开拓轶事/智库 V2/图标描摹实验',
  component: ZhikuIconTraceComparison,
  parameters: { layout: 'fullscreen' },
  args: {
    bitmapLabel: 'BITMAP 194 x 188',
    heading: '角色分类图标对照',
    referenceAlt: '用户提供的角色分类图标参考图',
    referenceSrc: CHARACTER_REFERENCE_SRC,
    subjectLabel: '角色主体',
    traceCode: 'TRACE 01',
    traceSrc: CHARACTER_TRACE_SRC,
  },
} satisfies Meta<typeof ZhikuIconTraceComparison>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 金色徽记对照: Story = {};

export const 敌对生物图标对照: Story = {
  args: {
    bitmapLabel: 'BITMAP 304 x 304',
    heading: '敌对生物分类图标对照',
    referenceAlt: '用户提供的敌对生物分类图标参考图',
    referenceSrc: ENEMY_REFERENCE_SRC,
    subjectLabel: '敌对生物主体',
    traceCode: 'TRACE 02',
    traceSrc: ENEMY_TRACE_SRC,
  },
};

export const 星神图标对照: Story = {
  args: {
    bitmapLabel: 'BITMAP 369 x 329',
    heading: '星神分类图标对照',
    referenceAlt: '用户提供的星神分类图标参考图',
    referenceSrc: AEON_REFERENCE_SRC,
    subjectLabel: '星神徽记',
    traceCode: 'TRACE 03',
    traceSrc: AEON_TRACE_SRC,
  },
};

export const 派系图标对照: Story = {
  args: {
    bitmapLabel: 'BITMAP 242 x 232',
    heading: '派系分类图标对照',
    referenceAlt: '用户提供的派系分类图标参考图',
    referenceSrc: FACTION_REFERENCE_SRC,
    subjectLabel: '派系徽记',
    traceCode: 'TRACE 04',
    traceSrc: FACTION_TRACE_SRC,
  },
};

export const 专有名词图标对照: Story = {
  args: {
    bitmapLabel: 'BITMAP 408 x 332',
    heading: '专有名词分类图标对照',
    referenceAlt: '用户提供的专有名词分类图标参考图',
    referenceSrc: TERM_REFERENCE_SRC,
    subjectLabel: '专有名词徽记',
    traceCode: 'TRACE 05',
    traceSrc: TERM_TRACE_SRC,
  },
};

export const 地点图标设计候选: Story = {
  args: {
    bitmapLabel: 'ORIGINAL VECTOR / NO SOURCE',
    heading: '地点分类图标确认稿',
    referenceAlt: '原创地点分类徽记确认稿 A',
    referenceSrc: undefined,
    subjectLabel: '地点星门',
    traceCode: 'TRACE 06 / APPROVED A',
    traceSrc: LOCATION_TRACE_SRC,
  },
};

export const 剧情档案图标设计候选: Story = {
  args: {
    bitmapLabel: 'ORIGINAL VECTOR / NO SOURCE',
    heading: '剧情档案分类图标确认稿',
    referenceAlt: '原创剧情档案分类徽记确认稿 A',
    referenceSrc: undefined,
    subjectLabel: '剧情档案册',
    traceCode: 'TRACE 07 / APPROVED A',
    traceSrc: STORY_ARCHIVE_TRACE_SRC,
  },
};

export const 命途图标设计候选: Story = {
  args: {
    bitmapLabel: 'ORIGINAL VECTOR / NO SOURCE',
    heading: '命途分类图标原创候选',
    referenceAlt: '原创命途分类精密徽记候选 C',
    referenceSrc: undefined,
    subjectLabel: '命途星路',
    traceCode: 'TRACE 08 / PRECISION C',
    traceSrc: PATH_TRACE_SRC,
  },
};

export const 事件图标设计候选: Story = {
  args: {
    bitmapLabel: 'ORIGINAL VECTOR / NO SOURCE',
    heading: '事件分类图标原创候选',
    referenceAlt: '原创事件分类因果时结徽记候选 A',
    referenceSrc: undefined,
    subjectLabel: '事件因果时结',
    traceCode: 'TRACE 09 / CONCEPT A',
    traceSrc: EVENT_TRACE_SRC,
  },
};
