/** 帖子状态 — 与 miniprogram/utils/postStatus.js 保持同步 */

const POST_STATUS = {
  RELEASED: 'released',
  REVIEWING: 'reviewing',
  HIDDEN: 'hidden',
  REJECTED: 'rejected',
};

const POST_STATUS_LIST = Object.values(POST_STATUS);

function normalizePostStatus(status) {
  if (status === 'failed') return POST_STATUS.REJECTED;
  return status;
}

function isPublicStatus(status) {
  return status === POST_STATUS.RELEASED;
}

function isUserToggleableStatus(status) {
  return status === POST_STATUS.RELEASED || status === POST_STATUS.HIDDEN;
}

module.exports = {
  POST_STATUS,
  POST_STATUS_LIST,
  normalizePostStatus,
  isPublicStatus,
  isUserToggleableStatus,
};
