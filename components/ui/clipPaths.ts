// 全应用唯一的切角来源。形状是「切掉左上与右下两角的矩形」——整套界面的视觉签名。
//
// 为什么仍然是 clip-path：`corner-shape: bevel`（CSS Borders and Box Decorations L4）
// 是唯一能画出「直边斜切」的原生属性，但它尚非 Baseline——Chrome/Edge 139+ 与 Opera 支持，
// Safari 与 Firefox 全版本不支持，覆盖约 69%。而 border-radius 是圆弧，给不出直边斜切，
// 所以它不构成降级方案，只是另一个形状。clip-path: polygon() 因此仍是当下唯一能表达该形状的
// Baseline API。等 Firefox 落地后，改动只需发生在这个文件里。
//
// 注意 clip-path 会连同元素自身的外阴影一起裁掉——不要在这些元素上写外投影，写了也画不出来。
// 需要投影时套一层不裁切的父元素，或用 inset 阴影。

/** 生成切角多边形。n 为切角边长（px）。 */
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
