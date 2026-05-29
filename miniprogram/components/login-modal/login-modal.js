const { userApi } = require('../../utils/api');
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
      value: '登录后可以点赞、发表评论，记录你与家乡的故事'
    },
    loginText: {
      type: String,
      value: '微信授权登录'
    },
    cancelText: {
      type: String,
      value: '继续浏览'
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

    onWechatLogin() {
      wx.showLoading({ title: '登录中...', mask: true });

      app.wechatLogin()
        .then((result) => {
          wx.hideLoading();
          if (result.data && result.data.isNewUser) {
            this.setData({ step: 'nickname', nicknameDraft: '' });
            return;
          }
          wx.showToast({ title: '登录成功', icon: 'success' });
          this.finishLogin();
        })
        .catch((err) => {
          wx.hideLoading();
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

      wx.showLoading({ title: '保存中...', mask: true });
      try {
        const res = await userApi.updateUserProfile({ nickname });
        wx.hideLoading();
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
        wx.hideLoading();
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
