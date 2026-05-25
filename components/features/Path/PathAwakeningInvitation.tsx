// 「命途狭间之引」邀请卡片。
//
// AI 发出 <触发狭间>命途ID</触发狭间> → sendWorkflow 写入 世界.待触发狭间 → 本组件渲染。
// 玩家点「踏入」→ App 调用 actions.handleSend('[系统] 踏入命途狭间')。
//   sendWorkflow 内部统一处理:① 把 待触发狭间 转成 进行中狭间 ② 发请求让 AI 出第一道诘问。
//   不让组件内部直接 setWorld + 外部再 handleSend——React 异步 setState 会让 handleSend
//   闭包里读到的还是旧的 state.世界,scope 切不到 pathAwakening,prompt 走错。
// 玩家点「暂缓」→ 纯前端 setWorld 清空 待触发狭间(命途进度仍满,等待下次邀请),不发请求。

import type { 世界状态 } from '@/models/world';
import { 拒绝命途狭间 } from '@/services/pathService';
import { getPath } from '@/data/journeyPresets';
import { PATH_CORE_BELIEFS } from '@/models/path';

interface Props {
  world: 世界状态;
  setWorld: React.Dispatch<React.SetStateAction<世界状态>>;
  /** 玩家点「踏入」时调用。App 那一层接 actions.handleSend('[系统] 踏入命途狭间')。 */
  onTrigger: () => void;
  disabled?: boolean;
}

const cardClip =
  'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)';

const btnClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

export function PathAwakeningInvitation({ world, setWorld, onTrigger, disabled }: Props) {
  if (!world.待触发狭间) return null;
  const pathId = world.待触发狭间;
  const def = getPath(pathId);
  const belief = PATH_CORE_BELIEFS[pathId];
  if (!def) return null;

  const handleEnter = () => {
    if (disabled) return;
    onTrigger();
  };
  const handleDecline = () => {
    setWorld((prev) => 拒绝命途狭间(prev));
  };

  return (
    <div
      className="mx-3 mb-2 p-4"
      style={{
        background:
          'linear-gradient(135deg, rgba(245, 217, 122, 0.08) 0%, rgba(140, 100, 60, 0.10) 100%)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)',
        clipPath: cardClip,
      }}
    >
      <div
        className="mb-2 text-xs tracking-[0.4em]"
        style={{ color: 'rgba(245, 217, 122, 0.7)' }}
      >
        命 途 狭 间 之 引
      </div>
      <div
        className="mb-1 text-base font-serif"
        style={{ color: 'rgba(255, 235, 180, 0.95)' }}
      >
        「{def.name}」的意志正注视着你
      </div>
      <div
        className="mb-3 text-sm leading-relaxed"
        style={{ color: 'rgba(225, 210, 170, 0.85)' }}
      >
        {belief?.核心 ?? '命途的拷问即将开始。'}
      </div>
      <div
        className="mb-3 text-xs leading-relaxed"
        style={{ color: 'rgba(190, 178, 145, 0.75)' }}
      >
        踏入后,下一回合不推进主剧情,而是进入命途狭间——你将在虚境中接受三道诘问,
        命途意志会据此评判是否让你跨入下一阶。可以选择暂缓,但满载的进度会一直等到你回头。
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleEnter}
          disabled={disabled}
          className="flex-1 px-4 py-2 text-sm font-serif tracking-[0.3em] transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background:
              'linear-gradient(135deg, rgba(245, 217, 122, 0.85), rgba(200, 160, 80, 0.85))',
            color: '#1a1610',
            clipPath: btnClip,
            boxShadow: 'inset 0 0 0 1px rgba(255, 235, 180, 0.5)',
          }}
        >
          踏 入
        </button>
        <button
          type="button"
          onClick={handleDecline}
          disabled={disabled}
          className="px-4 py-2 text-sm tracking-[0.2em] transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background: 'rgba(50, 45, 40, 0.6)',
            color: 'rgba(200, 188, 160, 0.85)',
            clipPath: btnClip,
            boxShadow: 'inset 0 0 0 1px rgba(160, 148, 120, 0.35)',
          }}
        >
          暂 缓
        </button>
      </div>
    </div>
  );
}
