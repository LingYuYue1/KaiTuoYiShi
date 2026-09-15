// 全应用唯一的切角来源。形状是「切掉左上与右下两角的矩形」——整套界面的视觉签名。
//
// ── 形状由两条通道叠加而成，缺一不可 ──────────────────────────────────────────
//
// 1) `clip-path: polygon()`（本文件）——切角几何本身。它是 Baseline，所有浏览器一致，
//    并且会裁掉**后代内容**。描边在斜边上因此也是被裁掉的：这就是为什么全应用的描边
//    曾经只能靠 `box-shadow: inset 0 0 0 1px` 伪造。
//
// 2) `border-radius + corner-shape: bevel`（见 styles/global.css 与 zhiku-archive.css）
//    ——让**真 border 沿斜边画出来**。两者几何完全重合（bevel 即 superellipse(0)，两端点间
//    的直线段），所以 clip-path 不会裁掉这条 border：border 落在斜边内侧，而 clip 的边界
//    正好是斜边。Chrome/Edge 139+ 支持；Safari/Firefox 忽略该属性，退回「斜边无描边」，
//    即今天的样子——是渐进增强，不是降级。
//
// ⚠️ 第 2 条由 CSS 的**属性选择器**按内联 polygon 的字面前缀挂上去，前缀由本文件的
//    `cornerClip()` 生成。改这里的输出格式会让那些选择器静默失配（形状不受影响，
//    但斜边描边会消失）。刻度取值与本格式同步维护在 CSS 里，见下面的 CHAMFER_SCALES。
//
// 为什么不上 hyperellipse 垫片（曾实测，2026-09-15）：垫片自带形状与描边两件事，但形状
// clip-path 已经全包了，它在这里唯一能加的只有「Safari/Firefox 上斜边那一道描边」。而它
// 会把命中元素的内联 clip-path 改写成 `path(…)`，正好抹掉上面那个属性选择器赖以匹配的
// 字符串——下一次重扫时选择器失配、border-radius 归零，元素退回直角。两者互斥，
// 除非把 949 处调用点从 `clipPath: X` 改成展开样式片段（届时载体换成内联的
// `border-radius` + `--corner-shape`，不再依赖字符串匹配）。为一道 1px 斜边描边做那次
// 重构不划算；有原生 corner-shape 的浏览器（Chrome/Edge 139+）现在已经拿到了它。
//
// 注意 clip-path 会连同元素自身的外阴影一起裁掉——不要在这些元素上写外投影，写了也画不出来。
// 需要投影时套一层不裁切的父元素，或用 inset 阴影。

/** 生成切角多边形。n 为切角边长（px）。改格式前先看上面那段 ⚠️。 */
export const cornerClip = (n: number): string =>
  `polygon(${n}px 0, 100% 0, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, 0 100%, 0 ${n}px)`;

// 七级刻度。此前同名常量在不同目录取值不一（cardClip 曾同时是 8/10/12/14px，
// smallClip 曾同时是 6/7/8px），现已统一到刻度上。
export const tinyClip = cornerClip(4);
export const smallClip = cornerClip(6);
export const mediumClip = cornerClip(8);
export const cardClip = cornerClip(10);
export const badgeClip = cornerClip(12);
export const panelClip = cornerClip(14);
export const shellClip = cornerClip(18);

/** 七级刻度的数值。CSS 侧按这些值生成 border-radius/corner-shape 规则，两边必须一致。 */
export const CHAMFER_SCALES = [4, 6, 8, 10, 12, 14, 18] as const;
