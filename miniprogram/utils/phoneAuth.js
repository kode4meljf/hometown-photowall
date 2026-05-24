/**
 * 手机号授权：隐私协议 + getPhoneNumber 回调处理
 */

function checkPrivacyNeed() {
  return new Promise((resolve) => {
    if (!wx.getPrivacySetting) {
      resolve(false);
      return;
    }
    wx.getPrivacySetting({
      success: (res) => resolve(!!res.needAuthorization),
      fail: () => resolve(false)
    });
  });
}

function mapGetPhoneErrMsg(errMsg) {
  if (!errMsg || errMsg === 'getPhoneNumber:ok') return '';
  if (/cancel|deny|拒绝/i.test(errMsg)) return '';

  if (/privacy|api scope|隐私/i.test(errMsg)) {
    return '请先同意隐私协议（见上方按钮）';
  }
  if (/no permission|jsapi|未开通|not authorized/i.test(errMsg)) {
    return '未开通手机号能力，请在微信公众平台开通「手机号快速验证」';
  }
  if (/fail/.test(errMsg)) {
    return '获取手机号失败，请用真机测试（模拟器不支持）';
  }
  return '获取手机号失败';
}

/**
 * 处理 bindgetphonenumber 回调
 * @returns {boolean} 是否拿到 code 并已交给 onCode
 */
function handleGetPhoneNumberEvent(e, onCode) {
  const errMsg = (e.detail && e.detail.errMsg) || '';
  console.log('[phoneAuth] getPhoneNumber detail:', e.detail);

  if (errMsg && errMsg !== 'getPhoneNumber:ok') {
    const tip = mapGetPhoneErrMsg(errMsg);
    if (tip) {
      wx.showToast({ title: tip, icon: 'none', duration: 3000 });
    }
    return false;
  }

  const code = e.detail && e.detail.code;
  if (!code) {
    wx.showToast({ title: '未获取到授权码，请重试', icon: 'none' });
    return false;
  }

  if (typeof onCode === 'function') {
    onCode(code);
  }
  return true;
}

module.exports = {
  checkPrivacyNeed,
  mapGetPhoneErrMsg,
  handleGetPhoneNumberEvent
};
