/**
 * 微信内容安全：文本 msgSecCheck 2.0、图片 imgSecCheck（同步）/ mediaCheckAsync（大图异步）
 */
const SCENE = {
  PROFILE: 1,
  COMMENT: 2,
  FORUM: 3,
  SOCIAL: 4,
};

const IMG_MAX_SYNC = 1024 * 1024;
const BLOCK_MSG = '内容不符合规范，请修改后重试';
const IMAGE_BLOCK_MSG = '图片不符合规范，请更换后重试';
const OPENID_MSG = '请关闭小程序后重新打开，再试一次';
const SERVICE_MSG = '内容安全服务暂不可用，请稍后重试';

function isRiskySuggest(suggest) {
  return suggest === 'risky';
}

function parseMsgSecCheckResult(res) {
  if (!res) return { ok: false, message: SERVICE_MSG };
  if (res.errcode === 0) {
    const suggest = res.result && res.result.suggest;
    if (isRiskySuggest(suggest)) {
      return { ok: false, message: BLOCK_MSG };
    }
    return { ok: true };
  }
  if (res.errcode === 61010) return { ok: false, message: OPENID_MSG };
  console.error('[contentSecurity] msgSecCheck error:', res.errcode, res.errmsg);
  return { ok: false, message: SERVICE_MSG };
}

function getApiErrCode(err) {
  if (!err) return null;
  return err.errCode != null ? err.errCode : err.errcode;
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
    if (getApiErrCode(e) === 61010) return { ok: false, message: OPENID_MSG };
    return { ok: false, message: SERVICE_MSG };
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

async function checkImageSync(cloud, fileId) {
  try {
    const dl = await cloud.downloadFile({ fileID: fileId });
    const buffer = dl.fileContent;
    if (!buffer || !buffer.length) {
      return { ok: false, message: '图片读取失败，请重试' };
    }
    if (buffer.length > IMG_MAX_SYNC) {
      return { ok: true, needsAsync: true, fileId };
    }

    const res = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: guessContentType(fileId),
        value: buffer,
      },
    });
    if (res.errcode === 0) return { ok: true };
    if (res.errcode === 87014) {
      return { ok: false, message: IMAGE_BLOCK_MSG };
    }
    console.error('[contentSecurity] imgSecCheck error:', res.errcode, res.errmsg);
    return { ok: false, message: SERVICE_MSG };
  } catch (e) {
    console.error('[contentSecurity] imgSecCheck exception:', e);
    if (getApiErrCode(e) === 87014) {
      return { ok: false, message: IMAGE_BLOCK_MSG };
    }
    return { ok: false, message: SERVICE_MSG };
  }
}

async function submitImageAsyncCheck(cloud, openId, fileId, scene) {
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [fileId] });
    const file = urlRes.fileList && urlRes.fileList[0];
    if (!file || file.status !== 0 || !file.tempFileURL) {
      return { ok: false, message: '图片审核提交失败，请重试' };
    }

    const res = await cloud.openapi.security.mediaCheckAsync({
      openid: openId,
      scene,
      version: 2,
      mediaUrl: file.tempFileURL,
      mediaType: 2,
    });
    if (res.errcode === 0) {
      return { ok: true, traceId: res.trace_id || '' };
    }
    if (res.errcode === 61010) return { ok: false, message: OPENID_MSG };
    console.error('[contentSecurity] mediaCheckAsync error:', res.errcode, res.errmsg);
    return { ok: false, message: SERVICE_MSG };
  } catch (e) {
    console.error('[contentSecurity] mediaCheckAsync exception:', e);
    if (getApiErrCode(e) === 61010) return { ok: false, message: OPENID_MSG };
    return { ok: false, message: SERVICE_MSG };
  }
}

/** 逐张检测；超过 1MB 的图片走异步审核，帖子需暂隐藏 */
async function checkImages(cloud, openId, fileIds, scene = SCENE.SOCIAL) {
  const traces = [];
  let needsReview = false;

  for (const fileId of fileIds) {
    if (!fileId) continue;
    const syncResult = await checkImageSync(cloud, fileId);
    if (!syncResult.ok) return syncResult;

    if (syncResult.needsAsync) {
      const asyncResult = await submitImageAsyncCheck(cloud, openId, fileId, scene);
      if (!asyncResult.ok) return asyncResult;
      if (asyncResult.traceId) traces.push(asyncResult.traceId);
      needsReview = true;
    }
  }

  return { ok: true, needsReview, mediaTraceIds: traces };
}

module.exports = {
  SCENE,
  checkText,
  checkTexts,
  checkImages,
};
