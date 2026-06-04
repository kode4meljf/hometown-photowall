/**
 * 微信隐私合规：敏感 API 调用前检查并引导用户同意
 */

const PRIVACY_GUIDE = '《用户隐私保护指引》';

function showPrivacyContractPrompt(content) {
  return new Promise((resolve) => {
    if (!wx.openPrivacyContract) {
      resolve(false);
      return;
    }
    wx.showModal({
      title: '需要同意隐私协议',
      content,
      confirmText: '查看协议',
      success: (r) => {
        if (r.confirm) {
          wx.openPrivacyContract({ complete: () => resolve(false) });
        } else {
          resolve(false);
        }
      },
      fail: () => resolve(false),
    });
  });
}

function checkPrivacyNeed() {
  return new Promise((resolve) => {
    if (!wx.getPrivacySetting) {
      resolve(false);
      return;
    }
    wx.getPrivacySetting({
      success: (res) => resolve(!!res.needAuthorization),
      fail: () => resolve(false),
    });
  });
}

function openPrivacyContractModal() {
  return showPrivacyContractPrompt(`使用前需阅读并同意${PRIVACY_GUIDE}`);
}

function requirePrivacyAuthorize() {
  return new Promise((resolve) => {
    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: () => resolve(true),
        fail: () => resolve(false),
      });
      return;
    }
    openPrivacyContractModal().then(resolve);
  });
}

async function ensurePrivacyAuthorized() {
  const need = await checkPrivacyNeed();
  if (!need) return true;
  return requirePrivacyAuthorize();
}

async function runWithPrivacy(task) {
  const ok = await ensurePrivacyAuthorized();
  if (!ok) return { ok: false, cancelled: true };
  if (typeof task === 'function') {
    return { ok: true, result: await task() };
  }
  return { ok: true };
}

module.exports = {
  PRIVACY_GUIDE,
  checkPrivacyNeed,
  ensurePrivacyAuthorized,
  requirePrivacyAuthorize,
  openPrivacyContractModal,
  showPrivacyContractPrompt,
  runWithPrivacy,
};
