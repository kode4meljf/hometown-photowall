/**
 * 卡片 → 详情 布局计算（首页浮层放大动画）
 * aspectFit 核心算法见 aspectFit.js
 */

const {
  aspectFillCenter,
  aspectFitCenter,
  aspectFitLayoutWH,
} = require('./aspectFit');

function rectToSlotLocal(fitRect, slotRect) {
  if (!fitRect || !slotRect) return '';
  return `left:${fitRect.left - slotRect.left}px;top:${fitRect.top - slotRect.top}px;width:${fitRect.width}px;height:${fitRect.height}px;`;
}

function rectToStyle(rect) {
  if (!rect) return '';
  return `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
}

/**
 * 平移 + 缩放（transform-origin: left top）
 * uniform=true：等比 scale，用于详情 aspectFit 区域
 * uniform=false：scale(sx,sy)，用于退回卡片 aspectFill 槽位（宽高比与详情不同）
 */
function flyTransformStyle(startRect, endRect, uniform = true) {
  if (!startRect || !endRect) return rectToStyle(startRect);
  const tx = endRect.left - startRect.left;
  const ty = endRect.top - startRect.top;
  if (uniform) {
    const s = endRect.width / startRect.width;
    return `${rectToStyle(startRect)}transform:translate(${tx}px,${ty}px) scale(${s});`;
  }
  const sx = endRect.width / startRect.width;
  const sy = endRect.height / startRect.height;
  return `${rectToStyle(startRect)}transform:translate(${tx}px,${ty}px) scale(${sx},${sy});`;
}

/** 详情图区：宽 X 铺满；高 clamp(自然高, min, max)，max = 3:4 竖图高度 */
const DETAIL_SLOT_MAX_RATIO = 4 / 3;
/** 横图保底高度（约 5:3 横图铺满宽时的高），避免极扁全景图区过矮 */
const DETAIL_SLOT_MIN_RATIO = 0.6;

function getDetailSlotHeight(windowWidth, aspectRatioHW) {
  const w = windowWidth || 375;
  const safeRatio = Math.min(Math.max(aspectRatioHW || 1, 0.3), 3);
  const natural = w * safeRatio;
  const maxH = w * DETAIL_SLOT_MAX_RATIO;
  const minH = w * DETAIL_SLOT_MIN_RATIO;
  return Math.round(Math.min(Math.max(natural, minH), maxH));
}

function getDetailImageRect(windowWidth, headerTop, aspectRatioHW) {
  const top = headerTop;
  const width = windowWidth;
  const height = getDetailSlotHeight(windowWidth, aspectRatioHW);
  return { left: 0, top, width, height };
}

module.exports = {
  aspectFillCenter,
  aspectFitCenter,
  aspectFitLayoutWH,
  rectToStyle,
  flyTransformStyle,
  rectToSlotLocal,
  getDetailSlotHeight,
  getDetailImageRect,
};
