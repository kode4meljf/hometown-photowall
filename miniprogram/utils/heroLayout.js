/**
 * 卡片 → 详情 布局计算（首页浮层放大动画）
 */

/** imgAR = 高/宽 */
function aspectFillCenter(rect, imgAR) {
  if (!rect || !imgAR) return null;
  const boxAR = rect.width / rect.height;
  let visW, visH;
  if (imgAR > boxAR) {
    visH = rect.height;
    visW = visH / imgAR;
  } else {
    visW = rect.width;
    visH = visW * imgAR;
  }
  return {
    left: rect.left + (rect.width - visW) / 2,
    top: rect.top + (rect.height - visH) / 2,
    width: visW,
    height: visH,
  };
}

/** aspectFit：与详情 swiper photoMode=aspectFit 一致，动画终点应对齐此区域 */
function aspectFitCenter(containerRect, imgAR) {
  if (!containerRect || !imgAR) return null;
  const W = containerRect.width;
  const H = containerRect.height;
  const boxAR = W / H;
  let visW, visH;
  if (imgAR > boxAR) {
    visH = H;
    visW = H / imgAR;
  } else {
    visW = W;
    visH = W * imgAR;
  }
  return {
    left: containerRect.left + (W - visW) / 2,
    top: containerRect.top + (H - visH) / 2,
    width: visW,
    height: visH,
  };
}

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

function getDetailSlotHeight(windowWidth, aspectRatio) {
  const w = windowWidth || 375;
  const safeRatio = Math.min(Math.max(aspectRatio || 1, 0.3), 3);
  const natural = w * safeRatio;
  const maxH = w * DETAIL_SLOT_MAX_RATIO;
  const minH = w * DETAIL_SLOT_MIN_RATIO;
  return Math.round(Math.min(Math.max(natural, minH), maxH));
}

function getDetailImageRect(windowWidth, headerTop, aspectRatio) {
  const top = headerTop;
  const width = windowWidth;
  const height = getDetailSlotHeight(windowWidth, aspectRatio);
  return { left: 0, top, width, height };
}

function getDetailTitleRect(imageRect, paddingX) {
  return {
    left: paddingX,
    top: imageRect.top + imageRect.height + 10,
    width: imageRect.width - paddingX * 2,
    height: 48,
  };
}

module.exports = {
  aspectFillCenter,
  aspectFitCenter,
  rectToStyle,
  flyTransformStyle,
  rectToSlotLocal,
  getDetailSlotHeight,
  getDetailImageRect,
  getDetailTitleRect,
  DETAIL_SLOT_MAX_RATIO,
  DETAIL_SLOT_MIN_RATIO,
};
