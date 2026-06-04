/**
 * 帖子相关工具：云文件删除、响应字段规范化
 */

const DELETE_CHUNK_SIZE = 50;

async function deleteCloudFiles(cloud, fileList) {
  if (!fileList || !fileList.length) return;
  for (let i = 0; i < fileList.length; i += DELETE_CHUNK_SIZE) {
    const chunk = fileList.slice(i, i + DELETE_CHUNK_SIZE);
    try {
      await cloud.deleteFile({ fileList: chunk });
    } catch (e) {
      console.error('[deleteCloudFiles] 失败:', e);
    }
  }
}

function firstPhoto(post) {
  return (post.photos && post.photos.length > 0) ? post.photos[0] : null;
}

/** 小程序端：瀑布流 aspectRatio 等 */
function normalizePostForClient(post) {
  const photo = firstPhoto(post);
  return {
    ...post,
    id: post._id,
    imageUrl: photo ? photo.imageUrl : '',
    aspectRatio: (() => {
      if (!photo || !photo.width || !photo.height) return 1;
      const r = photo.height / photo.width;
      if (!isFinite(r) || isNaN(r)) return 1;
      return Math.min(Math.max(r, 0.3), 3.0);
    })(),
  };
}

/** 管理后台：列表展示默认值 */
function normalizePostForAdmin(post) {
  const photo = firstPhoto(post);
  return {
    ...post,
    id: post._id,
    imageUrl: photo ? photo.imageUrl : (post.imageUrl || ''),
    category: post.category || post.tag || '-',
    likes: post.likes || 0,
    views: post.views || 0,
  };
}

module.exports = {
  deleteCloudFiles,
  normalizePostForClient,
  normalizePostForAdmin,
};
