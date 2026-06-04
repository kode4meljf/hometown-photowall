/**
 * aspectFit 统一计算
 * - 动画/详情槽位：aspectFitCenter / aspectFillCenter 使用 imgAR = 高/宽 (H/W)
 * - 预览/上传/WXS：aspectFitLayoutWH / imageStyleCss 使用 imgAR = 宽/高 (W/H)
 */

const DEFAULT_CONTAINER_AR = 4 / 3;
const DEFAULT_RADIUS = '20rpx';

function aspectRatioWH(width, height) {
  if (!width || !height) return 1;
  return width / height;
}

function aspectRatioHW(width, height) {
  const wh = aspectRatioWH(width, height);
  return wh ? 1 / wh : 1;
}

function aspectFillCenter(rect, imgAR_HW) {
  if (!rect || !imgAR_HW) return null;
  const boxAR = rect.width / rect.height;
  let visW;
  let visH;
  if (imgAR_HW > boxAR) {
    visH = rect.height;
    visW = visH / imgAR_HW;
  } else {
    visW = rect.width;
    visH = visW * imgAR_HW;
  }
  return {
    left: rect.left + (rect.width - visW) / 2,
    top: rect.top + (rect.height - visH) / 2,
    width: visW,
    height: visH,
  };
}

function aspectFitCenterWH(containerRect, imgAR_WH) {
  if (!containerRect || !imgAR_WH) return null;
  const W = containerRect.width;
  const H = containerRect.height;
  const boxAR = W / H;
  let visW;
  let visH;
  if (imgAR_WH > boxAR) {
    visW = W;
    visH = W / imgAR_WH;
  } else {
    visH = H;
    visW = H * imgAR_WH;
  }
  return {
    left: containerRect.left + (W - visW) / 2,
    top: containerRect.top + (H - visH) / 2,
    width: visW,
    height: visH,
  };
}

/** @deprecated 命名沿用 heroLayout；参数 imgAR = 高/宽 */
function aspectFitCenter(containerRect, imgAR_HW) {
  if (!containerRect || !imgAR_HW) return null;
  return aspectFitCenterWH(containerRect, 1 / imgAR_HW);
}

function aspectFitLayoutWH(containerW, containerH, imgAR_WH) {
  if (!containerW || !containerH || !imgAR_WH) {
    return { visW: containerW || 0, visH: containerH || 0, offsetX: 0, offsetY: 0 };
  }
  const fit = aspectFitCenterWH(
    { left: 0, top: 0, width: containerW, height: containerH },
    imgAR_WH
  );
  if (!fit) {
    return { visW: containerW, visH: containerH, offsetX: 0, offsetY: 0 };
  }
  return {
    visW: fit.width,
    visH: fit.height,
    offsetX: fit.left,
    offsetY: fit.top,
  };
}

/** 百分比 inline style，供 WXML 容器内 aspectFit 图片 */
function imageStyleCss(imgW, imgH, containerAR, radius) {
  if (!imgW || !imgH) return '';
  const cAR = containerAR || DEFAULT_CONTAINER_AR;
  const r = radius || DEFAULT_RADIUS;
  const imageAR = aspectRatioWH(imgW, imgH);
  if (imageAR > cAR) {
    const hPct = (cAR / imageAR) * 100;
    return `width:100%;height:${hPct}%;border-radius:${r};`;
  }
  const wPct = (imageAR / cAR) * 100;
  return `width:${wPct}%;height:100%;border-radius:${r};`;
}

module.exports = {
  DEFAULT_CONTAINER_AR,
  DEFAULT_RADIUS,
  aspectRatioWH,
  aspectRatioHW,
  aspectFillCenter,
  aspectFitCenter,
  aspectFitCenterWH,
  aspectFitLayoutWH,
  imageStyleCss,
};
