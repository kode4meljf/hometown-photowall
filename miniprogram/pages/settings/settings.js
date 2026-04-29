// pages/settings/settings.js
const app = getApp();

Page({
  data: {
    cacheSize: '12.4 MB',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '设置' });
    this.calculateCacheSize();
  },

  onShow() {
    // 每次进入刷新 TabBar 选中态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: -1 });
    }
  },

  /**
   * 计算本地缓存大小
   */
  calculateCacheSize() {
    wx.getStorageInfo({
      success: (res) => {
        // res.currentSize 单位是 KB
        const mb = (res.currentSize / 1024).toFixed(1);
        this.setData({ cacheSize: `${mb} MB` });
      },
      fail: () => {
        this.setData({ cacheSize: '0 MB' });
      },
    });
  },

  /**
   * 点击设置项
   */
  onItemTap(e) {
    const action = e.currentTarget.dataset.action;
    switch (action) {
      case 'security':
        wx.showToast({ title: '账号安全', icon: 'none' });
        break;
      case 'about':
        wx.navigateTo({ url: '/pages/about/about' });
        break;
      case 'agreement':
        wx.navigateTo({ url: '/pages/agreement/agreement' });
        break;
      case 'privacy':
        wx.navigateTo({ url: '/pages/privacy/privacy' });
        break;
      case 'feedback':
        wx.navigateTo({ url: '/pages/feedback/feedback' });
        break;
      case 'clear':
        this.clearCache();
        break;
    }
  },

  /**
   * 清理缓存
   */
  clearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '确定要清理本地缓存吗？',
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '清理中...' });
          // 清理 Storage
          wx.clearStorage({
            success: () => {
              // 清理临时文件缓存
              wx.getSavedFileList({
                success: (fileRes) => {
                  const files = fileRes.fileList || [];
                  if (files.length === 0) {
                    this.afterClear(0);
                    return;
                  }
                  let deleted = 0;
                  files.forEach((f) => {
                    wx.removeSavedFile({
                      filePath: f.filePath,
                      complete: () => {
                        deleted++;
                        if (deleted >= files.length) {
                          this.afterClear(files.length);
                        }
                      },
                    });
                  });
                },
                fail: () => {
                  this.afterClear(0);
                },
              });
            },
            fail: () => {
              wx.hideLoading();
              wx.showToast({ title: '清理失败', icon: 'none' });
            },
          });
        }
      },
    });
  },

  afterClear(fileCount) {
    wx.hideLoading();
    if (fileCount > 0) {
      wx.showToast({ title: `已清理 ${fileCount} 个缓存文件`, icon: 'none' });
    } else {
      wx.showToast({ title: '缓存已清空', icon: 'none' });
    }
    this.calculateCacheSize();
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          // 清除登录态
          app.globalData.userInfo = null;
          wx.removeStorageSync('token');
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('openid');
          // 跳到登录页
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});
