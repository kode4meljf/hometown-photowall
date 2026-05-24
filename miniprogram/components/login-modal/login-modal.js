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

  methods: {
    onClose() {
      this.triggerEvent('close');
    },

    onWechatLogin() {
      this.triggerEvent('close');
      wx.showLoading({ title: '登录中...', mask: true });

      app.wechatLogin()
        .then(() => {
          wx.hideLoading();
          wx.showToast({ title: '登录成功', icon: 'success' });
          this.triggerEvent('success');
        })
        .catch((err) => {
          wx.hideLoading();
          wx.showToast({ title: err.message || '登录失败', icon: 'none' });
        });
    },

    preventTouchMove() {}
  }
});
