/**
 * 帖子相关工具（mediaCheckCallback 副本）
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

function extractCloudFileIds(photos) {
  return (photos || [])
    .map((p) => p.imageUrl)
    .filter((url) => url && typeof url === 'string' && url.startsWith('cloud://'));
}

function clearPhotosCloudUrls(photos) {
  return (photos || []).map((p, idx) => ({
    ...p,
    imageUrl: '',
    order: p.order !== undefined ? p.order : idx,
  }));
}

module.exports = {
  deleteCloudFiles,
  extractCloudFileIds,
  clearPhotosCloudUrls,
};
