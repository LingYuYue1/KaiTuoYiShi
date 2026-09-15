import React, { useLayoutEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { App } from '@/App';
import { bootPerfCommit, bootPerfStart } from '@/utils/bootPerf';
import { registerHyperellipse } from 'hyperellipse';
import '@/styles/tailwind.css';
import '@/styles/root-theme.css';
import '@/styles/global.css';

/**
 * 切角垫片。切角的**形状**由 clip-path 管（Baseline，所有浏览器一致，且会裁掉后代内容）；
 * 垫片补的是**斜边上的描边**——`clip-path` 会把元素自己的 border 一起裁掉，斜边因此画不出描边。
 *
 * - Chrome/Edge 139+ 有原生 `corner-shape`，本包只注入一层零优先级的 CSS 桥
 *   （`corner-shape: var(--corner-shape, round)`），渲染全走原生，**不建观察器、不跑 JS**。
 * - Safari/Firefox 没有，垫片扫描样式表里声明了 `--corner-shape` 的规则，给命中元素补 SVG 描边环。
 *
 * `pendingRadiusScale` 必须为 1：默认 0.6 是超椭圆的圆角视觉补偿，而 bevel 的切角边长与半径严格
 * 相等，缩放会让 Safari/Firefox 在垫片接管前短暂显示偏小的圆角。同理**不要**导入 `hyperellipse/css`
 * ——那条 `--corner-scale` 片段只服务超椭圆。
 *
 * 单例在模块级注册，且**不接任何 effect 清理**：`destroy()` 是全局的，StrictMode 的双挂载会把它
 * 连同全部已应用样式一起拆掉。
 */
const hyperellipse = registerHyperellipse({ pendingRadiusScale: 1 });

window.addEventListener('error', (event) => {
  console.error('[global-error]', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason);
});

/**
 * 静态首屏的移除。必须等到 React 真正提交后才算「已挂载」——createRoot().render() 只是异步调度，
 * 返回时什么都没渲染；若在那里立刻置位 __ROOT_MOUNTED__，首次提交前的错误会被当成「已挂载」
 * 而漏出 index.html 的首屏错误捕获。置位与移除放在同一个 useLayoutEffect 里，同帧完成。
 */
function BootSplashRemover() {
  useLayoutEffect(() => {
    // 在首帧落地**之前**把形状算完。refresh() 同步重扫，之后才移除静态首屏；
    // 否则 Safari/Firefox 上会先闪一帧「圆角 + 斜边无描边」的中间态。
    hyperellipse.refresh();
    window.__ROOT_MOUNTED__ = true;
    document.getElementById('boot-splash')?.remove();
  }, []);
  return null;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

bootPerfStart();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BootSplashRemover />
      {/* TEMP 性能测量：记录 React 提交次数与单次提交成本（测量后移除）。 */}
      <React.Profiler
        id="app"
        onRender={(_id, phase, actualDuration) => { bootPerfCommit(phase, actualDuration); }}
      >
        <App />
      </React.Profiler>
    </ErrorBoundary>
  </React.StrictMode>
);
