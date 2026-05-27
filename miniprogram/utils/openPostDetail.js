/**
 * 从非首页进入帖子详情：回首页后用 post-detail-overlay 打开（无卡片 FLIP 时用淡入）
 */
function openPostDetail(postOrId) {
  const app = getApp();
  const meta = typeof postOrId === 'string' ? { id: postOrId } : postOrId || {};
  const postId = meta.id || meta._id;
  if (!postId) return;

  app.globalData.pendingDetail = {
    postId,
    coverUrl: meta.imageUrl || meta.coverUrl || meta.postThumb || '',
    titleText: meta.title || meta.postTitle || '',
    descText: meta.description || '',
    aspectRatio: meta.aspectRatio > 0 ? meta.aspectRatio : 1,
    authorAvatar: meta.authorAvatar || '',
    authorName: meta.author || meta.authorName || '',
  };

  wx.switchTab({ url: '/pages/index/index' });
}

module.exports = { openPostDetail };
