/** API 错误码 — 与 cloudfunctions/common/apiErrors.js 保持同步 */

const API_ERROR = {
  IMAGE_NOT_RESELECTED: 'image_not_reselected',
  IMAGE_INVALID: 'image_invalid',
  IMAGE_REMOVED: 'image_removed',
  POST_REJECTED: 'post_rejected',
};

const API_ERROR_MSG = {
  [API_ERROR.IMAGE_NOT_RESELECTED]: '请先重新选择图片',
  [API_ERROR.IMAGE_INVALID]: '图片无效，请重新上传',
  [API_ERROR.IMAGE_REMOVED]: '原图片已清除，请重新选择图片',
  [API_ERROR.POST_REJECTED]: '作品未通过审核',
};

function mapApiErrorMessage(res) {
  if (!res) return '操作失败';
  if (res.code && API_ERROR_MSG[res.code]) {
    return API_ERROR_MSG[res.code];
  }
  return res.message || '操作失败';
}

module.exports = {
  API_ERROR,
  API_ERROR_MSG,
  mapApiErrorMessage,
};
