const { showToast } = require('./util');
const { ensurePrivacyAuthorized, showPrivacyContractPrompt, PRIVACY_GUIDE } = require('./privacy');

function handleChooseMediaFail(err) {
  const errMsg = (err && err.errMsg) || '';
  if (/cancel/i.test(errMsg)) return true;

  if (/privacy|scope|隐私/i.test(errMsg)) {
    showPrivacyContractPrompt(`选图前需同意${PRIVACY_GUIDE}`);
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

function handleSaveAlbumFail(err) {
  const errMsg = (err && err.errMsg) || '';
  if (/cancel/i.test(errMsg)) return;

  if (/privacy|scope|隐私/i.test(errMsg)) {
    showPrivacyContractPrompt(`保存图片前需同意${PRIVACY_GUIDE}`);
    return;
  }

  if (/auth deny|permission denied|authorize/i.test(errMsg)) {
    wx.showModal({
      title: '需要相册权限',
      content: '请在设置中允许保存到相册',
      confirmText: '去设置',
      success: (r) => {
        if (r.confirm) wx.openSetting();
      },
    });
    return;
  }

  showToast('保存失败，请重试');
}

async function chooseMedia(options = {}) {
  const {
    count = 9,
    mediaType = ['image'],
    sourceType = ['album', 'camera'],
    success,
    fail,
  } = options;

  const privacyOk = await ensurePrivacyAuthorized();
  if (!privacyOk) {
    if (typeof fail === 'function') {
      fail({ errMsg: 'chooseMedia:fail privacy not authorized' });
    }
    return;
  }

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
  handleSaveAlbumFail,
};
