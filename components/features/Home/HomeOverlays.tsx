// 首页与开局向导之间的四个转场遮罩，以及首页的「神秘聊天」弹窗。
//
// 这些组件只负责把 starfield.ts 里算好的粒子数据铺成 DOM，不含任何计时逻辑：
// 何时出现、何时消失由 hooks/useHomePage 的转场状态机决定。

import type { HomeTransition } from '@/hooks/useHomePage';
import { Modal } from '@/components/ui/Modal';
import {
  BOOK_OPEN_PARTICLES,
  HOME_JOURNEY_PARTICLES,
  JOURNEY_LAUNCH_PARTICLES,
  SAVE_LOAD_PARTICLES,
} from '@/components/features/Home/starfield';
import { mediumClip } from '@/components/ui/clipPaths';

/** 踏上旅途：进入开局向导。 */
function JourneyLaunchOverlay() {
  return (
    <div className="kaituo-journey-launch" role="status" aria-live="polite" aria-label="星轨已接入">
      <div className="kaituo-journey-launch__field" />
      <div className="kaituo-journey-launch__vignette" />
      {JOURNEY_LAUNCH_PARTICLES.map((star) => (
        <span
          key={star.id}
          className="kaituo-journey-launch__star"
          style={{
            left: star.left,
            top: star.top,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: star.delay,
          }}
        />
      ))}
      <div className="kaituo-journey-launch__rail kaituo-journey-launch__rail--a" />
      <div className="kaituo-journey-launch__rail kaituo-journey-launch__rail--b" />
      <div className="kaituo-journey-launch__rail kaituo-journey-launch__rail--c" />
      <div className="kaituo-journey-launch__rail kaituo-journey-launch__rail--d" />
      <div className="kaituo-journey-launch__core">
        <div className="kaituo-journey-launch__ring" />
        <div className="kaituo-journey-launch__glyph" aria-hidden="true">
          <span className="kaituo-journey-launch__starburst kaituo-journey-launch__starburst--main" />
          <span className="kaituo-journey-launch__starburst kaituo-journey-launch__starburst--cross" />
          <span className="kaituo-journey-launch__starburst-core" />
        </div>
        <div className="kaituo-journey-launch__title">星轨已接入</div>
        <div className="kaituo-journey-launch__subtitle">正在校准你的开拓坐标</div>
      </div>
      <div className="kaituo-journey-launch__flash" />
    </div>
  );
}

/** 首页 → 开局向导的过渡：旅途入口开启。 */
function HomeJourneyOverlay() {
  return (
    <div className="kaituo-home-journey" role="status" aria-live="polite" aria-label="旅途入口开启中">
      <div className="kaituo-home-journey__backdrop" />
      <div className="kaituo-home-journey__tracks" />
      {HOME_JOURNEY_PARTICLES.map((glint) => (
        <span
          key={glint.id}
          className="kaituo-home-journey__glint"
          style={{
            left: glint.left,
            top: glint.top,
            animationDelay: glint.delay,
            ['--glint-drift' as string]: glint.drift,
          }}
        />
      ))}
      <div className="kaituo-home-journey__door kaituo-home-journey__door--left" />
      <div className="kaituo-home-journey__door kaituo-home-journey__door--right" />
      <div className="kaituo-home-journey__threshold">
        <div className="kaituo-home-journey__seal">启</div>
        <div className="kaituo-home-journey__title">旅途入口已开启</div>
        <div className="kaituo-home-journey__subtitle">正在进入开拓档案</div>
      </div>
      <div className="kaituo-home-journey__wipe" />
    </div>
  );
}

/** 首页 → 存档界面。 */
function SaveLoadOverlay() {
  return (
    <div className="kaituo-save-load" role="status" aria-live="polite" aria-label="存档读取中">
      <div className="kaituo-save-load__backdrop" />
      <div className="kaituo-save-load__grid" />
      {SAVE_LOAD_PARTICLES.map((node) => (
        <span
          key={node.id}
          className="kaituo-save-load__node"
          style={{
            left: node.left,
            top: node.top,
            width: `${node.size}px`,
            height: `${node.size}px`,
            animationDelay: node.delay,
          }}
        />
      ))}
      <div className="kaituo-save-load__archive">
        <div className="kaituo-save-load__frame" />
        <div className="kaituo-save-load__seal">档</div>
        <div className="kaituo-save-load__title">存档索引已唤醒</div>
        <div className="kaituo-save-load__subtitle">正在同步开拓记忆</div>
        <div className="kaituo-save-load__bar"><span /></div>
      </div>
      <div className="kaituo-save-load__scan kaituo-save-load__scan--a" />
      <div className="kaituo-save-load__scan kaituo-save-load__scan--b" />
    </div>
  );
}

/** 首页 → 如我所书。 */
function BookOpenOverlay() {
  return (
    <div className="kaituo-book-open" role="status" aria-live="polite" aria-label="书页展开中">
      <div className="kaituo-book-open__backdrop" />
      {BOOK_OPEN_PARTICLES.map((mote) => (
        <span
          key={mote.id}
          className="kaituo-book-open__mote"
          style={{
            left: mote.left,
            top: mote.top,
            animationDelay: mote.delay,
            ['--book-mote-drift' as string]: mote.drift,
          }}
        />
      ))}
      <div className="kaituo-book-open__book">
        <div className="kaituo-book-open__spine" />
        <div className="kaituo-book-open__page kaituo-book-open__page--left"><span /><span /><span /></div>
        <div className="kaituo-book-open__page kaituo-book-open__page--right"><span /><span /><span /></div>
        <div className="kaituo-book-open__leaf kaituo-book-open__leaf--a" />
        <div className="kaituo-book-open__leaf kaituo-book-open__leaf--b" />
      </div>
      <div className="kaituo-book-open__copy">
        <div className="kaituo-book-open__title">如我所书</div>
        <div className="kaituo-book-open__subtitle">正在翻开未署名的页</div>
      </div>
      <div className="kaituo-book-open__glow" />
    </div>
  );
}

/**
 * 转场遮罩的唯一出口：按当前的转场类型渲染对应遮罩。
 * 首页与开局向导两个界面都要挂这一个节点，因为转场会跨越视图切换。
 */
export function HomeTransitionOverlay({ transition }: { transition: HomeTransition }) {
  if (transition === 'journeyLaunch') return <JourneyLaunchOverlay />;
  if (transition === 'homeJourney') return <HomeJourneyOverlay />;
  if (transition === 'saveLoad') return <SaveLoadOverlay />;
  if (transition === 'bookOpen') return <BookOpenOverlay />;
  return null;
}

export function MysteryChatModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} title="神秘聊天" className="max-w-lg">
      <div className="space-y-4">
        <div
          className="rounded-sm px-4 py-4 text-sm leading-7"
          style={{
            background: 'rgba(var(--tj-bg-primary), 0.34)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.7)',
          }}
        >
          <div className="font-serif text-base tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
            960494342
          </div>
          <p className="mt-3" style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}>
            本群只进行内部交流与聊天，禁止对外宣传。
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2 font-serif text-sm tracking-[0.18em]"
          style={{
            color: 'rgb(var(--tj-ui-active-text))',
            background: 'linear-gradient(135deg, rgb(var(--tj-accent-primary)) 0%, rgb(var(--tj-tech-cyan)) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.46)',
            clipPath: mediumClip,
          }}
        >
          关闭
        </button>
      </div>
    </Modal>
  );
}
