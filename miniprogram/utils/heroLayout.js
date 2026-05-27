/**
 * 卡片 → 详情 布局计算（首页浮层放大动画）
 */

function aspectFillCenter(rect, imgAR) {
  if (!rect || !imgAR) return null;
  const boxAR = rect.width / rect.height;
  let visW, visH;
  if (imgAR > boxAR) {
    visH = rect.height;
    visW = visH * imgAR;
  } else {
    visW = rect.width;
    visH = visW / imgAR;
  }
  return {
    left: rect.left + (rect.width - visW) / 2,
    top: rect.top + (rect.height - visH) / 2,
    width: visW,
    height: visH,
  };
}

function rectToStyle(rect) {
  if (!rect) return '';
  return `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
}

function getDetailImageRect(windowWidth, headerTop) {
  const top = headerTop;
  const width = windowWidth;
  const height = Math.round(width * 4 / 3);
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
  rectToStyle,
  getDetailImageRect,
  getDetailTitleRect,
};
