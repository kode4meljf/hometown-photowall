/** API 错误码 — 与 miniprogram/utils/apiErrors.js 保持同步 */

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

function apiError(code, overrides = {}) {
  const message = overrides.message || API_ERROR_MSG[code] || '操作失败';
  return {
    success: false,
    code,
    message,
    ...overrides,
  };
}

module.exports = {
  API_ERROR,
  API_ERROR_MSG,
  apiError,
};
