const { cloud, db, _, postsCollection } = require('../ctx');
const { requireReleasedPost } = require('../lib/access');

async function recordShare(data = {}) {
  const postId = data.postId || data.id;
  if (!postId) {
    return { success: false, message: '缺少帖子ID' };
  }
  const guard = await requireReleasedPost(postId, '分享');
  if (!guard.ok) {
    return { success: false, message: guard.message };
  }
  try {
    await postsCollection.doc(postId).update({
      data: { shares: _.inc(1) },
    });
    const updated = await postsCollection.doc(postId).field({ shares: true }).get();
    return {
      success: true,
      data: { shares: updated.data?.shares || 0 },
    };
  } catch (e) {
    console.error('[recordShare] failed:', e);
    return { success: false, message: '记录分享失败' };
  }
}

async function getShareQrCode(params = {}) {
  const { postId, photoIndex = 0 } = params || {};
  if (!postId) {
    return { success: false, message: '缺少帖子ID' };
  }

  const guard = await requireReleasedPost(postId, '分享');
  if (!guard.ok) {
    return { success: false, message: guard.message };
  }

  const idx = Number.isFinite(Number(photoIndex)) && Number(photoIndex) > 0
    ? Math.floor(Number(photoIndex))
    : 0;
  const scene = idx > 0
    ? `${postId},${idx}`.slice(0, 32)
    : String(postId).slice(0, 32);

  try {
    const res = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page: 'pages/index/index',
      checkPath: false,
      width: 280,
    });
    return {
      success: true,
      data: { qrBase64: res.buffer.toString('base64') },
    };
  } catch (e) {
    console.error('[getShareQrCode] failed:', e);
    return { success: false, message: '小程序码生成失败' };
  }
}

module.exports = {
  recordShare,
  getShareQrCode,
};
