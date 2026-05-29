// pages/profile/settings/security/security.js
const { userApi } = require('../../../../utils/api');
const { formatRegisterTime, showLoading, hideLoading } = require('../../../../utils/util');
const { ensureSession } = require('../../../../utils/session');
const app = getApp();

Page({
  data: {
    nickname: '加载中…',
    registerTime: '',
    hasPhone: false,
    phoneDisplay: '',
    avatar: '/assets/icons/default-avatar.png',
  },

  onShow() {
    this.loadUser();
  },

  async loadUser() {
    const valid = await ensureSession({ toast: true, navigateBack: true });
    if (!valid) return;
    const user = app.globalData.userInfo;
    if (user) {
      this.applyUser(user);
    }
  },

  applyUser(user) {
    const registerTime = formatRegisterTime(user.createdAt) || '未知';
    this.setData({
      nickname: user.nickname || user.name || '未设置昵称',
      registerTime,
      hasPhone: !!user.hasPhone || !!user.phone,
      phoneDisplay: user.phone || '',
      avatar: user.avatar || '/assets/icons/default-avatar.png',
    });
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
    showLoading('正在注销…');
    userApi.deleteAccount()
      .then((res) => {
        hideLoading();
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
        hideLoading();
        wx.showToast({ title: '注销失败，请重试', icon: 'none' });
      });
  },
});
