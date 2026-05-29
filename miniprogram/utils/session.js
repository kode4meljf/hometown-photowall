const { showToast } = require('./util');

function isLoggedIn() {
  const app = getApp();
  return !!(app.checkLogin && app.checkLogin()) || !!app.globalData.isLoggedIn;
}

/**
 * 与服务器同步登录态
 * @returns {Promise<boolean>}
 */
async function ensureSession(options = {}) {
  const { toast = false, navigateBack = false, delay = 500 } = options;
  const app = getApp();

  if (!app.globalData.isLoggedIn) {
    if (toast) showToast('请先登录');
    if (navigateBack) setTimeout(() => wx.navigateBack(), delay);
    return false;
  }

  const valid = await app.syncSession({ toast });
  if (!valid && navigateBack) {
    setTimeout(() => wx.navigateBack(), delay);
  }
  return valid;
}

/**
 * 本地登录检查；未登录时可 toast 或自定义处理（如弹登录窗）
 */
function requireLogin(options = {}) {
  const { onUnauthenticated, toast = true, message = '请先登录' } = options;
  if (isLoggedIn()) return true;
  if (typeof onUnauthenticated === 'function') {
    onUnauthenticated();
  } else if (toast) {
    showToast(message);
  }
  return false;
}

module.exports = {
  isLoggedIn,
  ensureSession,
  requireLogin,
};
