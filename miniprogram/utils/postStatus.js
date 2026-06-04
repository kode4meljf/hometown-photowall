/** 帖子状态 — 与 cloudfunctions/common/postStatus.js、web/src/constants/postStatus.ts 保持同步 */

const POST_STATUS = {
  RELEASED: 'released',
  REVIEWING: 'reviewing',
  HIDDEN: 'hidden',
  REJECTED: 'rejected',
};

const POST_STATUS_LIST = Object.values(POST_STATUS);

const USER_STATUS_HINT = {
  [POST_STATUS.REVIEWING]: '作品审核中，通过后将展示在首页',
  [POST_STATUS.REJECTED]: '未通过审核，请修改后重新提交',
};

const EMPTY_WORKS_TEXT = {
  [POST_STATUS.REVIEWING]: '暂无审核中的作品',
  [POST_STATUS.REJECTED]: '暂无未通过的作品',
  [POST_STATUS.HIDDEN]: '暂无已隐藏的作品',
};

const POST_STATUS_USER_BADGE = {
  [POST_STATUS.REVIEWING]: '审核中',
  [POST_STATUS.REJECTED]: '未通过',
};

function isPublicStatus(status) {
  return status === POST_STATUS.RELEASED;
}

function isUserToggleableStatus(status) {
  return status === POST_STATUS.RELEASED || status === POST_STATUS.HIDDEN;
}

function getUserStatusHint(status) {
  return USER_STATUS_HINT[status] || '';
}

function getEmptyWorksText(filter) {
  if (filter === POST_STATUS.REVIEWING) return EMPTY_WORKS_TEXT[POST_STATUS.REVIEWING];
  if (filter === POST_STATUS.REJECTED) return EMPTY_WORKS_TEXT[POST_STATUS.REJECTED];
  if (filter === POST_STATUS.HIDDEN) return EMPTY_WORKS_TEXT[POST_STATUS.HIDDEN];
  return '暂无作品';
}

module.exports = {
  POST_STATUS,
  POST_STATUS_LIST,
  USER_STATUS_HINT,
  POST_STATUS_USER_BADGE,
  isPublicStatus,
  isUserToggleableStatus,
  getUserStatusHint,
  getEmptyWorksText,
};
