const POSTER_W = 750;
const POSTER_H = 1180;
const IMG_H = 780;
const PAD = 36;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

async function resolveImagePath(src) {
  if (!src) return '';
  if (src.startsWith('wxfile://') || src.startsWith('http://tmp') || /^\/(?!\/)/.test(src)) {
    return src;
  }
  if (src.startsWith('cloud://')) {
    const res = await wx.cloud.downloadFile({ fileID: src });
    return res.tempFilePath;
  }
  if (/^https?:\/\//.test(src)) {
    const res = await wx.downloadFile({ url: src });
    return res.tempFilePath;
  }
  return src;
}

function loadCanvasImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e || new Error('image load fail'));
    img.src = src;
  });
}

function writeBase64Image(base64) {
  const path = `${wx.env.USER_DATA_PATH}/share-qr-${Date.now()}.png`;
  wx.getFileSystemManager().writeFileSync(path, base64, 'base64');
  return path;
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const iw = img.width;
  const ih = img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (iw - sw) / 2;
  const sy = (ih - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawCircleImage(ctx, img, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  drawCoverImage(ctx, img, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function truncateToLines(ctx, text, maxWidth, maxLines) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const lines = [];
  let current = '';
  for (let i = 0; i < raw.length; i++) {
    const next = current + raw[i];
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = raw[i];
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines && lines[maxLines - 1].length < raw.length) {
    let line = lines[maxLines - 1];
    while (line.length > 1 && ctx.measureText(`${line}…`).width > maxWidth) {
      line = line.slice(0, -1);
    }
    lines[maxLines - 1] = `${line}…`;
  }
  return lines;
}

function getCanvasNode(component) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .in(component)
      .select('#sharePosterCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node) {
          reject(new Error('canvas 未就绪'));
          return;
        }
        resolve(item.node);
      });
  });
}

function exportCanvas(node, component) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath(
      {
        canvas: node,
        fileType: 'png',
        quality: 1,
        success: (res) => resolve(res.tempFilePath),
        fail: reject,
      },
      component
    );
  });
}

/**
 * 绘制分享海报并导出临时图片路径
 */
async function renderSharePoster(component, payload) {
  const {
    photoUrl,
    photoIndex = 0,
    photoCount = 1,
    titleDesc = '',
    author = '',
    authorAvatar = '',
    location = '',
    qrBase64 = '',
  } = payload;

  const node = await getCanvasNode(component);
  const dpr = wx.getSystemInfoSync().pixelRatio || 2;
  node.width = POSTER_W * dpr;
  node.height = POSTER_H * dpr;
  const ctx = node.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  const photoPath = await resolveImagePath(photoUrl);
  const avatarPath = authorAvatar ? await resolveImagePath(authorAvatar).catch(() => '') : '';
  const qrPath = qrBase64 ? writeBase64Image(qrBase64) : '';

  const [photoImg, avatarImg, qrImg] = await Promise.all([
    photoPath ? loadCanvasImage(node, photoPath) : null,
    avatarPath ? loadCanvasImage(node, avatarPath).catch(() => null) : null,
    qrPath ? loadCanvasImage(node, qrPath) : null,
  ]);

  if (photoImg) {
    drawCoverImage(ctx, photoImg, 0, 0, POSTER_W, IMG_H);
  } else {
    ctx.fillStyle = '#e8d5b7';
    ctx.fillRect(0, 0, POSTER_W, IMG_H);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, 24, 24, 168, 48, 24);
  ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  ctx.font = '600 24px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('老根茶村', 40, 48);

  if (photoCount > 1) {
    const label = `${photoIndex + 1}/${photoCount}`;
    ctx.font = '500 22px sans-serif';
    const tw = ctx.measureText(label).width + 28;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, POSTER_W - tw - 24, IMG_H - 56, tw, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label, POSTER_W - tw / 2 - 24, IMG_H - 36);
    ctx.textAlign = 'left';
  }

  let y = IMG_H + PAD;
  ctx.fillStyle = '#333333';
  ctx.font = '400 28px sans-serif';
  const descLines = truncateToLines(ctx, titleDesc, POSTER_W - PAD * 2, 2);
  descLines.forEach((line) => {
    ctx.fillText(line, PAD, y);
    y += 40;
  });
  y += 8;

  const avatarR = 22;
  const avatarCx = PAD + avatarR;
  const avatarCy = y + avatarR;
  if (avatarImg) {
    drawCircleImage(ctx, avatarImg, avatarCx, avatarCy, avatarR);
  } else {
    ctx.fillStyle = '#dddddd';
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#666666';
  ctx.font = '400 26px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(author || '茶村村民', PAD + avatarR * 2 + 16, avatarCy);

  if (location) {
    ctx.fillStyle = '#999999';
    ctx.font = '400 24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(location, POSTER_W - PAD, avatarCy);
    ctx.textAlign = 'left';
  }
  y = avatarCy + avatarR + 28;

  ctx.strokeStyle = '#f0f0f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(POSTER_W - PAD, y);
  ctx.stroke();
  y += 28;

  const qrSize = 104;
  if (qrImg) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, PAD, y, qrSize, qrSize, 12);
    ctx.fill();
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    roundRect(ctx, PAD, y, qrSize, qrSize, 12);
    ctx.stroke();
    ctx.drawImage(qrImg, PAD + 8, y + 8, qrSize - 16, qrSize - 16);
  }

  const textX = PAD + qrSize + 20;
  ctx.fillStyle = '#1b1b1b';
  ctx.font = '600 26px sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('长按识别小程序码', textX, y + 8);
  ctx.fillStyle = '#999999';
  ctx.font = '400 24px sans-serif';
  ctx.fillText('查看这条故乡照片', textX, y + 44);

  return exportCanvas(node, component);
}

module.exports = {
  renderSharePoster,
};
