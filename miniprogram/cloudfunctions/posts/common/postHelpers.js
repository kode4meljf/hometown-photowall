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

function extractCloudFileIds(photos) {
  return (photos || [])
    .map((p) => p.imageUrl)
    .filter((url) => url && typeof url === 'string' && url.startsWith('cloud://'));
}

/** 审核驳回后清空云图引用，保留宽高/order 等元数据 */
function clearPhotosCloudUrls(photos) {
  return (photos || []).map((p, idx) => ({
    ...p,
    imageUrl: '',
    order: p.order !== undefined ? p.order : idx,
  }));
}

/** 小程序端：瀑布流 aspectRatio 等 */
function normalizePostForClient(post) {
  const photo = firstPhoto(post);
  const imageRemoved = !!post.imageRemoved;
  const rawUrl = photo && photo.imageUrl ? photo.imageUrl : '';
  const imageUrl = imageRemoved || !rawUrl ? '' : rawUrl;
  return {
    ...post,
    id: post._id,
    imageUrl,
    imageRemoved,
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
  const imageRemoved = !!post.imageRemoved;
  const rawUrl = photo && photo.imageUrl ? photo.imageUrl : (post.imageUrl || '');
  return {
    ...post,
    id: post._id,
    imageUrl: imageRemoved || !rawUrl ? '' : rawUrl,
    category: post.category || post.tag || '-',
    likes: post.likes || 0,
    views: post.views || 0,
  };
}

/** 从 cloud:// fileID 解析对象存储路径（不含 env 前缀） */
function cloudStoragePath(fileId) {
  if (!fileId || typeof fileId !== 'string' || !fileId.startsWith('cloud://')) return '';
  const rest = fileId.slice('cloud://'.length);
  const slash = rest.indexOf('/');
  return slash >= 0 ? rest.slice(slash + 1) : '';
}

/** 旧版上传：photos/文件名.jpg（无用户子目录） */
function isLegacyScopedPhotosPath(path) {
  const parts = path.split('/');
  return parts.length === 2 && parts[0] === 'photos' && parts[1] && !parts[1].includes('/');
}

function assertActorOwnsCloudFile(fileId, actor, { allowedLegacyFileIds } = {}) {
  const path = cloudStoragePath(fileId);
  if (!path || path.includes('..')) {
    return { ok: false, message: '无效的图片地址' };
  }
  const userId = String(actor.userId || '');
  if (!userId) {
    return { ok: false, message: '请先登录' };
  }
  if (path.startsWith(`photos/${userId}/`) || path.startsWith(`avatars/${userId}/`)) {
    return { ok: true };
  }
  if (isLegacyScopedPhotosPath(path)) {
    if (allowedLegacyFileIds && allowedLegacyFileIds.has(fileId)) {
      return { ok: true };
    }
    return { ok: false, message: '图片地址无效，请重新上传' };
  }
  return { ok: false, message: '图片地址无效，请重新上传' };
}

function assertActorOwnsCloudFiles(fileIds, actor, options = {}) {
  const list = (fileIds || []).filter(Boolean);
  for (let i = 0; i < list.length; i++) {
    const check = assertActorOwnsCloudFile(list[i], actor, options);
    if (!check.ok) return check;
  }
  return { ok: true };
}

async function assertCloudFilesExist(cloud, fileIds) {
  const list = (fileIds || []).filter((id) => id && String(id).startsWith('cloud://'));
  if (!list.length) {
    return { ok: false, code: 'image_not_reselected' };
  }
  try {
    const res = await cloud.getTempFileURL({ fileList: list });
    const files = res.fileList || [];
    for (let i = 0; i < list.length; i++) {
      const entry = files.find((f) => f.fileID === list[i]) || files[i];
      if (!entry || entry.status !== 0) {
        return { ok: false, code: 'image_invalid' };
      }
    }
    return { ok: true };
  } catch (e) {
    console.error('[assertCloudFilesExist] failed:', e.message);
    return { ok: false, code: 'image_invalid' };
  }
}

module.exports = {
  deleteCloudFiles,
  normalizePostForClient,
  normalizePostForAdmin,
  cloudStoragePath,
  assertActorOwnsCloudFiles,
  assertCloudFilesExist,
  extractCloudFileIds,
  clearPhotosCloudUrls,
};
