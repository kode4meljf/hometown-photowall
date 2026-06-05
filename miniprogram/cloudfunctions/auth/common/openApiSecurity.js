/**
 * 微信内容安全：文本 msgSecCheck 2.0、图片 imgSecCheck（同步）/ mediaCheckAsync（大图异步兜底）
 * 大图：压缩副本后 ≤1MB 走同步 imgSecCheck，仍 >1MB 直接 mediaCheckAsync（不调同步）；展示用原图
 */
let Jimp;
try {
  Jimp = require('jimp');
} catch (e) {
  console.error('[contentSecurity] jimp load failed, large images use async only:', e.message);
}
const SCENE = {
  PROFILE: 1,
  COMMENT: 2,
  FORUM: 3,
  SOCIAL: 4,
};

const IMG_MAX_SYNC = 1024 * 1024;
const BLOCK_MSG = '内容不符合规范，请修改后重试';
const IMAGE_BLOCK_MSG = '图片不符合规范，请更换后重试';
const IMAGE_TOO_LARGE_MSG = '头像图片较大，请换一张较小的图片后重试';
const OPENID_MSG = '请关闭小程序后重新打开，再试一次';
const SERVICE_MSG = '内容安全服务暂不可用，请稍后重试';

function isRiskySuggest(suggest) {
  return suggest === 'risky';
}

function getApiErrCode(err) {
  if (!err) return null;
  return err.errCode != null ? err.errCode : err.errcode;
}

/** wx-server-sdk openapi 成功时多为 errCode/errMsg，微信原始为 errcode/errmsg */
function normalizeOpenApiRes(res) {
  if (!res || typeof res !== 'object') return res;
  const errcode = res.errcode != null ? res.errcode : res.errCode;
  const errmsg = res.errmsg != null ? res.errmsg : res.errMsg;
  return { ...res, errcode, errmsg };
}

function mapSecApiError(errOrRes, { image = false } = {}) {
  const norm = normalizeOpenApiRes(errOrRes);
  const code = getApiErrCode(errOrRes) ?? norm?.errcode;
  if (code === 61010 || code === 40003) return OPENID_MSG;
  if (code === -604101 || code === 604101) {
    return '云函数未授权内容安全 API，请上传 auth/config.json 后重部署';
  }
  if (code === -601018) return '云环境未授权 openapi，请检查云开发环境与 config.json';
  if (code === 87014) return image ? IMAGE_BLOCK_MSG : BLOCK_MSG;
  if (code === 44991) return '内容安全调用过于频繁，请稍后再试';
  if (code === 45009) return '内容安全今日配额已用完';
  return SERVICE_MSG;
}

/** openapi 抛错时转为用户可读文案（避免 errCode/rid 泄露到前端） */
function formatOpenApiException(err, { image = false } = {}) {
  const code = getApiErrCode(err);
  if (code != null) {
    return mapSecApiError(err, { image });
  }
  const msg = err && err.message ? String(err.message) : '';
  if (/87014|risky content/i.test(msg)) {
    return image ? IMAGE_BLOCK_MSG : BLOCK_MSG;
  }
  if (/61010|40003|invalid openid/i.test(msg)) return OPENID_MSG;
  return image ? IMAGE_BLOCK_MSG : SERVICE_MSG;
}

function blockCode(image = false) {
  return image ? 'image_block' : 'text_block';
}

function parseMsgSecCheckResult(res) {
  const r = normalizeOpenApiRes(res);
  if (!r) return { ok: false, message: SERVICE_MSG };
  if (r.errcode === 0) {
    const suggest = r.result && r.result.suggest;
    if (isRiskySuggest(suggest)) {
      return { ok: false, message: BLOCK_MSG, code: blockCode(false) };
    }
    return { ok: true };
  }
  if (r.errcode == null) {
    console.error('[contentSecurity] msgSecCheck unexpected response:', JSON.stringify(res).slice(0, 500));
    return { ok: false, message: SERVICE_MSG };
  }
  const message = mapSecApiError(r);
  console.error('[contentSecurity] msgSecCheck error:', r.errcode, r.errmsg);
  return { ok: false, message, errcode: r.errcode };
}

async function checkText(cloud, openId, { content, scene, title, nickname }) {
  const text = (content || '').trim();
  if (!text) return { ok: true };

  if (!openId) {
    return { ok: false, message: OPENID_MSG };
  }

  try {
    const payload = {
      openid: openId,
      scene,
      version: 2,
      content: text.slice(0, 2500),
    };
    if (title) payload.title = String(title).slice(0, 2500);
    if (nickname) payload.nickname = String(nickname).slice(0, 2500);

    const res = await cloud.openapi.security.msgSecCheck(payload);
    return parseMsgSecCheckResult(res);
  } catch (e) {
    console.error('[contentSecurity] msgSecCheck exception:', e);
    const message = formatOpenApiException(e, { image: false });
    return { ok: false, message, code: blockCode(false), errcode: getApiErrCode(e) };
  }
}

async function checkTexts(cloud, openId, items) {
  for (const item of items) {
    const result = await checkText(cloud, openId, item);
    if (!result.ok) return result;
  }
  return { ok: true };
}

function guessContentType(fileId) {
  const lower = (fileId || '').toLowerCase();
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.webp')) return 'image/webp';
  return 'image/jpeg';
}

/**
 * 头像/资料图：多轮压缩直至 ≤1MB，仅用于同步 imgSecCheck（不走异步）。
 * 推荐 3 轮：1280/q70 → 1024/q58 → 60%/q45
 */
async function compressBufferUnderLimit(buffer, maxBytes = IMG_MAX_SYNC) {
  if (!Jimp) return null;
  try {
    const image = await Jimp.read(buffer);
    const rounds = [
      { maxDim: 1280, scale: 1, quality: 70 },
      { maxDim: 1024, scale: 1, quality: 58 },
      { maxDim: 1024, scale: 0.6, quality: 45 },
    ];

    for (const round of rounds) {
      const img = image.clone();
      if (round.maxDim) {
        img.scaleToFit(round.maxDim, round.maxDim);
      }
      if (round.scale !== 1) {
        img.scale(round.scale);
      }
      const out = await img.quality(round.quality).getBufferAsync(Jimp.MIME_JPEG);
      if (out.length <= maxBytes) return out;
    }

    return null;
  } catch (e) {
    console.error('[contentSecurity] compress under limit failed:', e.message);
    return null;
  }
}

/** 仅同步审核：原图或压缩副本 ≤1MB 时 imgSecCheck；压到极限仍 >1MB 则失败 */
async function checkImageSyncOnly(cloud, fileId) {
  try {
    const dl = await cloud.downloadFile({ fileID: fileId });
    const buffer = dl.fileContent;
    if (!buffer || !buffer.length) {
      return { ok: false, message: '图片读取失败，请重试', code: blockCode(true) };
    }

    if (buffer.length <= IMG_MAX_SYNC) {
      return runImgSecCheck(cloud, buffer, guessContentType(fileId));
    }

    const compressed = await compressBufferUnderLimit(buffer);
    if (!compressed) {
      return {
        ok: false,
        message: IMAGE_TOO_LARGE_MSG,
        code: blockCode(true),
      };
    }

    return runImgSecCheck(cloud, compressed, 'image/jpeg');
  } catch (e) {
    console.error('[contentSecurity] checkImageSyncOnly exception:', e);
    return {
      ok: false,
      message: formatOpenApiException(e, { image: true }),
      code: blockCode(true),
    };
  }
}

/** 资料头像：只走同步 imgSecCheck，不走 mediaCheckAsync */
async function checkProfileImages(cloud, openId, fileIds) {
  for (const fileId of fileIds) {
    if (!fileId) continue;
    const result = await checkImageSyncOnly(cloud, fileId);
    if (!result.ok) return result;
  }
  return { ok: true };
}

/**
 * 发帖大图压缩副本（仅用于审核）。尽量 1～2 次编码，避免云函数超时。
 * 返回 buffer；调用方：≤1MB 同步审，>1MB 直接 mediaCheckAsync。
 */
async function compressBufferForSecCheck(buffer, maxBytes = IMG_MAX_SYNC) {
  if (!Jimp) return null;
  try {
    const image = await Jimp.read(buffer);
    image.scaleToFit(1280, 1280);

    const first = await image.quality(65).getBufferAsync(Jimp.MIME_JPEG);
    if (first.length <= maxBytes) return first;

    const second = await image.clone().scale(0.65).quality(50).getBufferAsync(Jimp.MIME_JPEG);
    return second;
  } catch (e) {
    console.error('[contentSecurity] compress for sec check failed:', e.message);
    return null;
  }
}

async function runImgSecCheck(cloud, buffer, contentType) {
  try {
    const res = normalizeOpenApiRes(await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: contentType || 'image/jpeg',
        value: buffer,
      },
    }));
    if (res.errcode === 0) return { ok: true };
    if (res.errcode === 87014) {
      return { ok: false, message: IMAGE_BLOCK_MSG, code: blockCode(true) };
    }
    console.error('[contentSecurity] imgSecCheck error:', res.errcode, res.errmsg);
    return { ok: false, message: mapSecApiError(res, { image: true }) };
  } catch (e) {
    console.error('[contentSecurity] imgSecCheck exception:', e);
    return {
      ok: false,
      message: formatOpenApiException(e, { image: true }),
      code: blockCode(true),
    };
  }
}

async function checkImageSync(cloud, fileId) {
  try {
    const dl = await cloud.downloadFile({ fileID: fileId });
    const buffer = dl.fileContent;
    if (!buffer || !buffer.length) {
      return { ok: false, message: '图片读取失败，请重试' };
    }

    if (buffer.length <= IMG_MAX_SYNC) {
      return runImgSecCheck(cloud, buffer, guessContentType(fileId));
    }

    const compressed = await compressBufferForSecCheck(buffer);
    if (!compressed) {
      console.warn('[contentSecurity] compress failed, fallback mediaCheckAsync:', fileId);
      return { ok: true, needsAsync: true, fileId };
    }
    if (compressed.length <= IMG_MAX_SYNC) {
      return runImgSecCheck(cloud, compressed, 'image/jpeg');
    }

    console.warn('[contentSecurity] compressed still >1MB, skip sync, mediaCheckAsync:', fileId);
    return { ok: true, needsAsync: true, fileId };
  } catch (e) {
    console.error('[contentSecurity] imgSecCheck exception:', e);
    return {
      ok: false,
      message: formatOpenApiException(e, { image: true }),
      code: blockCode(true),
    };
  }
}

async function submitImageAsyncCheck(cloud, openId, fileId, scene) {
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [fileId] });
    const file = urlRes.fileList && urlRes.fileList[0];
    if (!file || file.status !== 0 || !file.tempFileURL) {
      return { ok: false, message: '图片审核提交失败，请重试' };
    }

    const res = normalizeOpenApiRes(await cloud.openapi.security.mediaCheckAsync({
      openid: openId,
      scene,
      version: 2,
      mediaUrl: file.tempFileURL,
      mediaType: 2,
    }));
    if (res.errcode === 0) {
      return { ok: true, traceId: res.trace_id || '' };
    }
    if (res.errcode === 61010) return { ok: false, message: OPENID_MSG };
    console.error('[contentSecurity] mediaCheckAsync error:', res.errcode, res.errmsg);
    return { ok: false, message: mapSecApiError(res) };
  } catch (e) {
    console.error('[contentSecurity] mediaCheckAsync exception:', e);
    if (getApiErrCode(e) === 61010) return { ok: false, message: OPENID_MSG };
    return { ok: false, message: SERVICE_MSG };
  }
}

/** 逐张检测；大图优先压缩后同步审，压缩失败才走异步审核 */
async function checkImages(cloud, openId, fileIds, scene = SCENE.SOCIAL) {
  const traces = [];
  const mediaTraceEntries = [];
  let needsReview = false;

  for (const fileId of fileIds) {
    if (!fileId) continue;
    const syncResult = await checkImageSync(cloud, fileId);
    if (!syncResult.ok) return syncResult;

    if (syncResult.needsAsync) {
      const asyncResult = await submitImageAsyncCheck(cloud, openId, fileId, scene);
      if (!asyncResult.ok) return asyncResult;
      if (asyncResult.traceId) {
        traces.push(asyncResult.traceId);
        mediaTraceEntries.push({ traceId: asyncResult.traceId, fileId });
      }
      needsReview = true;
    }
  }

  return { ok: true, needsReview, mediaTraceIds: traces, mediaTraceEntries };
}

module.exports = {
  SCENE,
  checkText,
  checkTexts,
  checkImages,
  checkProfileImages,
  formatOpenApiException,
  IMAGE_BLOCK_MSG,
  IMAGE_TOO_LARGE_MSG,
  BLOCK_MSG,
};
