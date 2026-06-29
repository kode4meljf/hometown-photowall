/**
 * 开发/自动化动作门禁：生产环境默认关闭。
 * 启用时在云函数环境变量中设置：ALLOW_DEV_ACTIONS=1，DEV_SEED_KEY=<随机密钥>
 */

function isDevActionsEnabled() {
  return process.env.ALLOW_DEV_ACTIONS === '1' && !!process.env.DEV_SEED_KEY;
}

function assertDevKey(data) {
  if (!isDevActionsEnabled()) return false;
  const key = data && data.devKey;
  return !!key && key === process.env.DEV_SEED_KEY;
}

function devActionsDisabledResponse() {
  return { success: false, message: '未知操作' };
}

module.exports = {
  isDevActionsEnabled,
  assertDevKey,
  devActionsDisabledResponse,
};
