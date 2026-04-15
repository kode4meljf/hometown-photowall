// pages/admin/admin.js
const { photoApi, adminApi } = require('../../utils/api');
const { showLoading, hideLoading, showToast, showSuccess, showConfirm, formatDate } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    isAdmin: false,
    isLoggedIn: false,
    currentTab: 'photos',
    stats: { totalPhotos: 0, totalUsers: 0, totalLikes: 0, totalComments: 0 },
    photos: [],
    users: [],
    loading: false
  },

  onShow() {
    this.checkAdmin();
  },

  onPullDownRefresh() {
    if (this.data.isAdmin) {
      this.loadData().then(() => {
        wx.stopPullDownRefresh();
      });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  checkAdmin() {
    const isLoggedIn = app.checkLogin();
    const userInfo = app.globalData.userInfo || {};
    const isAdmin = isLoggedIn && userInfo.role === 'admin';
    
    this.setData({ isLoggedIn, isAdmin });
    
    if (isAdmin) {
      this.loadData();
    }
  },

  async loadData() {
    this.setData({ loading: true });
    await Promise.all([
      this.loadStats(),
      this.loadPhotos(),
      this.loadUsers()
    ]);
    this.setData({ loading: false });
  },

  async loadStats() {
    try {
      const res = await adminApi.getStats();
      if (res.success) {
        this.setData({ stats: res.data });
      }
    } catch (e) {
      console.error('加载统计失败:', e);
    }
  },

  async loadPhotos() {
    try {
      const res = await adminApi.getPhotos({ limit: 100 });
      if (res.success) {
        const photos = res.data.photos.map(p => ({
          ...p,
          id: p._id || p.id,
          imageUrl: p.imageUrl.startsWith('http') || p.imageUrl.startsWith('cloud://')
            ? p.imageUrl
            : `http://localhost:3000${p.imageUrl}`,
          date: formatDate(p.createdAt)
        }));
        this.setData({ photos });
      }
    } catch (e) {
      console.error('加载照片失败:', e);
    }
  },

  async loadUsers() {
    try {
      const res = await adminApi.getUsers();
      if (res.success) {
        const users = res.data.map(u => ({
          ...u,
          date: formatDate(u.createdAt)
        }));
        this.setData({ users });
      }
    } catch (e) {
      console.error('加载用户失败:', e);
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ currentTab: tab });
  },

  goToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  async handleDeletePhoto(e) {
    const id = e.currentTarget.dataset.id;
    const confirm = await showConfirm('确定要删除这张照片吗？此操作不可恢复');
    if (!confirm) return;

    showLoading('删除中...');
    try {
      const res = await adminApi.deletePhoto(id);
      hideLoading();
      
      if (res.success) {
        showSuccess('删除成功');
        this.loadData();
      } else {
        showToast(res.message || '删除失败');
      }
    } catch (e) {
      hideLoading();
      showToast('删除失败');
    }
  },

  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.logout();
          this.setData({ 
            isAdmin: false, 
            isLoggedIn: false,
            photos: [],
            users: []
          });
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    });
  }
});