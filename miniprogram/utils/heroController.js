/**
 * 详情媒体英雄层：布局计算 + 阶段常量
 */
const {
  aspectFillCenter,
  aspectFitCenter,
  rectToStyle,
  flyTransformStyle,
  rectToSlotLocal,
  getDetailSlotHeight,
  getDetailImageRect,
} = require('./heroLayout');

const PHASE = {
  IDLE: 'idle',
  ENTERING: 'entering',
  DOCKED: 'docked',
  HANDOFF: 'handoff',
  DETAIL: 'detail',
  EXITING: 'exiting',
};

/** 壳子从卡片放大；退出飞回卡片 */
const ANIM_MS = 280;
const SHELL_SCALE_MS = 280;
const HANDOFF_MS = 120;
/** 详情壳渐隐 / 首页卡片渐现 */
const PANEL_EXIT_MS = 180;
/** 退出末段：首页图区与 panel 同步缩放的起点（占 SHELL_SCALE_MS 比例） */
const CARD_EXIT_HANDOFF_RATIO = 0.62;

/** 由图区 rect + 整卡高度推算 fullCardRect（实测优先） */
function resolveFullCardRect(imgRect, slotHeight) {
  if (!imgRect) return null;
  const h = slotHeight > 0 ? slotHeight : imgRect.height;
  if (!h) return null;
  return {
    left: imgRect.left,
    top: imgRect.top,
    width: imgRect.width,
    height: h,
  };
}

function cardHandoffScaleAtProgress(cardRect, windowWidth, windowHeight, progress) {
  if (!cardRect || !windowWidth || !windowHeight) {
    return { scaleX: 1, scaleY: 1 };
  }
  const sx = cardRect.width / windowWidth;
  const sy = cardRect.height / windowHeight;
  const scX = 1 + (sx - 1) * progress;
  const scY = 1 + (sy - 1) * progress;
  return { scaleX: scX / sx, scaleY: scY / sy };
}

function resolveLayout(windowWidth, nav, imgRect, aspectRatio) {
  const imgAR = aspectRatio > 0 ? aspectRatio : 1;
  const slotRect = getDetailImageRect(windowWidth, nav.navBarHeight, imgAR);
  const fitRect = aspectFitCenter(slotRect, imgAR) || slotRect;
  const cardRect =
    (imgRect && (aspectFillCenter(imgRect, imgAR) || imgRect)) ||
    aspectFitCenter(slotRect, imgAR) ||
    slotRect;
  return {
    imgAR,
    slotRect,
    fitRect,
    cardRect,
    slotFitStyle: rectToSlotLocal(fitRect, slotRect),
    imageSlotHeight: getDetailSlotHeight(windowWidth, aspectRatio),
  };
}

module.exports = {
  PHASE,
  ANIM_MS,
  SHELL_SCALE_MS,
  HANDOFF_MS,
  PANEL_EXIT_MS,
  CARD_EXIT_HANDOFF_RATIO,
  resolveFullCardRect,
  cardHandoffScaleAtProgress,
  resolveLayout,
  rectToStyle,
};
