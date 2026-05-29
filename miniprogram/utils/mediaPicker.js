const { showToast } = require('./util');

function handleChooseMediaFail(err) {
  const errMsg = (err && err.errMsg) || '';
  if (/cancel/i.test(errMsg)) return true;

  if (/privacy|scope|隐私/i.test(errMsg) && wx.openPrivacyContract) {
    wx.showModal({
      title: '需要同意隐私协议',
      content: '选图前需同意《用户隐私保护指引》',
      confirmText: '查看协议',
      success: (r) => {
        if (r.confirm) wx.openPrivacyContract();
      },
    });
    return true;
  }

  if (/auth deny|permission denied/i.test(errMsg)) {
    wx.showModal({
      title: '需要相册权限',
      content: '请在设置中允许访问相册和相机',
      confirmText: '去设置',
      success: (r) => {
        if (r.confirm) wx.openSetting();
      },
    });
    return true;
  }

  showToast('无法打开相册，请重试');
  return true;
}

function chooseMedia(options = {}) {
  const {
    count = 9,
    mediaType = ['image'],
    sourceType = ['album', 'camera'],
    success,
    fail,
  } = options;

  return wx.chooseMedia({
    count,
    mediaType,
    sourceType,
    success,
    fail: (err) => {
      const errMsg = (err && err.errMsg) || '';
      if (!/cancel/i.test(errMsg)) {
        console.error('[mediaPicker] chooseMedia fail:', errMsg);
      }
      if (typeof fail === 'function') {
        fail(err);
        return;
      }
      handleChooseMediaFail(err);
    },
  });
}

module.exports = {
  chooseMedia,
  handleChooseMediaFail,
};
