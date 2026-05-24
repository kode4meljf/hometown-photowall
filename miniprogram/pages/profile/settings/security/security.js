// pages/profile/settings/security/security.js
const { userApi } = require('../../../../utils/api');
const app = getApp();

Page({
  data: {
    nickname: '加载中…',
    uid: '',
    hasPhone: false,
    phoneDisplay: '',
    avatar: '/assets/icons/default-avatar.png',
  },

  onShow() {
    this.loadUser();
  },

  async loadUser() {
    const valid = await app.syncSession({ toast: true });
    if (!valid) {
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
    const user = app.globalData.userInfo;
    if (user) {
      this.applyUser(user);
    }
  },

  applyUser(user) {
    this.setData({
      nickname: user.nickname || user.name || '未设置昵称',
      uid: user.id || user._id || '',
      hasPhone: !!user.hasPhone || !!user.phone,
      phoneDisplay: user.phone || '',
      avatar: user.avatar || '/assets/icons/default-avatar.png',
    });
  },

  onGetPhoneNumber(e) {
    if (e.detail.errMsg && e.detail.errMsg !== 'getPhoneNumber:ok') {
      if (!e.detail.errMsg.includes('deny') && !e.detail.errMsg.includes('cancel')) {
        wx.showToast({ title: '获取手机号失败', icon: 'none' });
      }
      return;
    }
    if (!e.detail.code) {
      wx.showToast({ title: '需要授权手机号', icon: 'none' });
      return;
    }
    if (!app.checkLogin()) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '绑定中...', mask: true });
    app.bindPhone(e.detail.code)
      .then((res) => {
        wx.hideLoading();
        wx.showToast({ title: res.message || '绑定成功', icon: 'success' });
        if (res.data && res.data.user) {
          this.applyUser(res.data.user);
        } else {
          this.loadUser();
        }
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '绑定失败', icon: 'none' });
      });
  },

  onChangePhone() {
    wx.showToast({ title: '请先解绑后再绑定新号码（功能完善中）', icon: 'none' });
  },

  onDeleteAccount() {
    wx.showModal({
      title: '注销账号',
      content: '注销后您的所有个人数据将被永久删除，此操作不可恢复。确定要注销吗？',
      confirmText: '确定注销',
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) this.doDeleteAccount();
      },
    });
  },

  doDeleteAccount() {
    wx.showLoading({ title: '正在注销…' });
    userApi.deleteAccount()
      .then((res) => {
        wx.hideLoading();
        if (res.success) {
          app.logout();
          wx.clearStorageSync();
          wx.reLaunch({ url: '/pages/index/index' });
          wx.showToast({ title: '账号已注销', icon: 'none', duration: 3000 });
        } else {
          wx.showToast({ title: res.message || '注销失败，请重试', icon: 'none' });
        }
      })
      .catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '注销失败，请重试', icon: 'none' });
      });
  },
});
