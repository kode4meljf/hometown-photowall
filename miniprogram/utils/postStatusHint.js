/** 小程序端展示用：仅泛化提示，不含具体审核标签 */
const USER_STATUS_HINT = {
  reviewing: '作品审核中，通过后将展示在首页',
  rejected: '未通过审核，请修改后重新提交',
};

function getUserStatusHint(status) {
  return USER_STATUS_HINT[status] || '';
}

function getEmptyWorksText(filter) {
  if (filter === 'reviewing') return '暂无审核中的作品';
  if (filter === 'rejected') return '暂无未通过的作品';
  if (filter === 'hidden') return '暂无已隐藏的作品';
  return '暂无作品';
}

module.exports = {
  USER_STATUS_HINT,
  getUserStatusHint,
  getEmptyWorksText,
};
