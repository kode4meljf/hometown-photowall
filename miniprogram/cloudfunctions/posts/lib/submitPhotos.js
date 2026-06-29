const { cloud, db, postsCollection } = require('../ctx');
const identity = require('../common/identity');
const { POST_STATUS } = require('../common/postStatus');
const {
  deleteCloudFiles,
  assertActorOwnsCloudFiles,
  assertCloudFilesExist,
  extractCloudFileIds,
  clearPhotosCloudUrls,
} = require('../common/postHelpers');
const { apiError, API_ERROR } = require('../common/apiErrors');

function normalizePhotosInput(rawPhotos) {
  return (rawPhotos || []).map((p, idx) => ({
    imageUrl: p.imageUrl || '',
    width: parseInt(p.width, 10) || 1,
    height: parseInt(p.height, 10) || 1,
    order: p.order !== undefined ? p.order : idx,
  })).filter((p) => p.imageUrl);
}

async function rejectExistingPost(postId, addData, fileIds, reason, code) {
  await deleteCloudFiles(cloud, fileIds);
  await postsCollection.doc(postId).update({
    data: {
      status: POST_STATUS.REJECTED,
      photos: clearPhotosCloudUrls(addData.photos),
      imageRemoved: true,
      reviewAdminNote: reason || '',
      rejectedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return apiError(code || API_ERROR.POST_REJECTED, {
    message: reason,
    data: { id: postId, status: POST_STATUS.REJECTED },
  });
}

async function persistRejectedPost(addData, fileIds, reason, code) {
  const data = {
    ...addData,
    status: POST_STATUS.REJECTED,
    photos: clearPhotosCloudUrls(addData.photos),
    imageRemoved: true,
    reviewAdminNote: reason || '',
    rejectedAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  const result = await postsCollection.add({ data });
  await deleteCloudFiles(cloud, fileIds);
  return apiError(code || API_ERROR.POST_REJECTED, {
    message: reason,
    data: { id: result._id, status: POST_STATUS.REJECTED },
  });
}

async function applyResubmitRejected(postId, attemptedPhotos, fileIds, reason, code) {
  await deleteCloudFiles(cloud, fileIds);
  await postsCollection.doc(postId).update({
    data: {
      status: POST_STATUS.REJECTED,
      photos: clearPhotosCloudUrls(attemptedPhotos),
      imageRemoved: true,
      reviewAdminNote: reason || '',
      rejectedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return apiError(code || API_ERROR.POST_REJECTED, {
    message: reason,
    data: { id: postId, status: POST_STATUS.REJECTED },
  });
}

async function validateSubmitPhotos(photos, actor, { previousPost } = {}) {
  const normalized = normalizePhotosInput(photos);
  if (!normalized.length) {
    return { ok: false, response: apiError(API_ERROR.IMAGE_NOT_RESELECTED) };
  }
  const fileIds = normalized.map((p) => p.imageUrl);
  const allowedLegacyFileIds = previousPost && identity.isAuthor(previousPost.authorId, actor)
    ? new Set(extractCloudFileIds(previousPost.photos))
    : undefined;
  const ownedCheck = assertActorOwnsCloudFiles(fileIds, actor, { allowedLegacyFileIds });
  if (!ownedCheck.ok) {
    return {
      ok: false,
      response: apiError(API_ERROR.IMAGE_INVALID, { message: ownedCheck.message }),
    };
  }
  if (
    previousPost
    && (previousPost.imageRemoved
      || previousPost.status === POST_STATUS.REJECTED
      || previousPost.status === 'failed')
  ) {
    const oldIds = extractCloudFileIds(previousPost.photos);
    for (let i = 0; i < fileIds.length; i++) {
      if (oldIds.includes(fileIds[i])) {
        return { ok: false, response: apiError(API_ERROR.IMAGE_INVALID) };
      }
    }
  }
  const existCheck = await assertCloudFilesExist(cloud, fileIds);
  if (!existCheck.ok) {
    return { ok: false, response: apiError(existCheck.code || API_ERROR.IMAGE_INVALID) };
  }
  return { ok: true, photos: normalized, fileIds };
}

module.exports = {
  normalizePhotosInput,
  rejectExistingPost,
  persistRejectedPost,
  applyResubmitRejected,
  validateSubmitPhotos,
};
