const { userApi } = require('../../utils/api');
const { showLoading, hideLoading } = require('../../utils/util');
const { ensurePrivacyAuthorized } = require('../../utils/privacy');
const Z_INDEX = require('../../utils/zIndex');
const app = getApp();

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '需要登录'
    },
    subtitle: {
      type: String,
      value: ''
    },
    loginText: {
      type: String,
      value: '微信授权登录'
    },
    cancelText: {
      type: String,
      value: '继续浏览'
    },
    zIndex: {
      type: Number,
      value: Z_INDEX.MODAL
    }
  },

  data: {
    step: 'login',
    nicknameDraft: ''
  },

  observers: {
    visible(val) {
      if (val) {
        this.setData({ step: 'login', nicknameDraft: '' });
      }
    }
  },

  methods: {
    onClose() {
      this.triggerEvent('close');
    },

    onOpenAgreement() {
      wx.navigateTo({ url: '/pages/profile/settings/agreement/agreement' });
    },

    onOpenPrivacy() {
      wx.navigateTo({ url: '/pages/profile/settings/privacy/privacy' });
    },

    async onWechatLogin() {
      const privacyOk = await ensurePrivacyAuthorized();
      if (!privacyOk) return;

      showLoading('登录中...');

      app.wechatLogin()
        .then((result) => {
          hideLoading();
          if (result.data && result.data.isNewUser) {
            this.setData({ step: 'nickname', nicknameDraft: '' });
            return;
          }
          wx.showToast({ title: '登录成功', icon: 'success' });
          this.finishLogin();
        })
        .catch((err) => {
          hideLoading();
          wx.showToast({ title: err.message || '登录失败', icon: 'none' });
        });
    },

    onNicknameInput(e) {
      this.setData({ nicknameDraft: e.detail.value });
    },

    onSkipNickname() {
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.finishLogin();
    },

    async onConfirmNickname() {
      const nickname = (this.data.nicknameDraft || '').trim();
      if (!nickname) {
        this.onSkipNickname();
        return;
      }

      showLoading('保存中...');
      try {
        const res = await userApi.updateUserProfile({ nickname });
        hideLoading();
        if (res.success) {
          const user = { ...app.globalData.userInfo, nickname };
          app.globalData.userInfo = user;
          wx.setStorageSync('userInfo', user);
          wx.showToast({ title: '设置成功', icon: 'success' });
          this.finishLogin();
        } else {
          wx.showToast({ title: res.message || '保存失败', icon: 'none' });
        }
      } catch (e) {
        hideLoading();
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    },

    finishLogin() {
      this.setData({ step: 'login', nicknameDraft: '' });
      this.triggerEvent('close');
      this.triggerEvent('success');
    },

    preventTouchMove() {}
  }
});
