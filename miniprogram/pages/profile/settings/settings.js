// pages/settings/settings.js
const { isLoggedIn, ensureSession } = require('../../../utils/session');
const { showLoading, hideLoading } = require('../../../utils/util');

const app = getApp();

Page({
  data: {
    cacheSize: '12.4 MB',
    isLoggedIn: false,
    securitySummary: '',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '设置' });
    this.calculateCacheSize();
    this.checkLogin();
  },

  checkLogin() {
    this.updateLoginState();
  },

  updateLoginState() {
    const user = app.globalData.userInfo;
    const loggedIn = isLoggedIn();
    let securitySummary = '';
    if (loggedIn && user) {
      securitySummary = user.hasPhone || user.phone
        ? (user.phone || '已绑定手机')
        : '未绑定手机';
    }
    this.setData({ isLoggedIn: loggedIn, securitySummary });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: -1 });
    }
    if (isLoggedIn()) {
      ensureSession().then(() => {
        this.updateLoginState();
      });
    } else {
      this.updateLoginState();
    }
  },

  /**
   * 计算本地缓存大小（Storage + 文件系统）
   */
  calculateCacheSize() {
    let totalKB = 0;
    let hasError = false;

    const trySetSize = () => {
      if (totalKB >= 0 && !hasError) {
        let display;
        if (totalKB >= 1024) {
          display = `${(totalKB / 1024).toFixed(1)} MB`;
        } else {
          display = `${Math.round(totalKB)} KB`;
        }
        this.setData({ cacheSize: display });
      }
    };

    // 1. Storage 大小
    wx.getStorageInfo({
      success: (res) => {
        totalKB += res.currentSize || 0;
        trySetSize();
      },
      fail: () => {
        // Storage 获取失败不阻塞，文件大小照常算
        trySetSize();
      },
    });

    // 2. 临时文件缓存大小（wx.env.USER_DATA_PATH 下的已保存文件）
    wx.getSavedFileList({
      success: (fileRes) => {
        const files = fileRes.fileList || [];
        files.forEach((f) => {
          totalKB += (f.size || 0) / 1024; // size 单位是字节，转 KB
        });
        trySetSize();
      },
      fail: () => {
        // 文件列表获取失败，不阻塞
        trySetSize();
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
        wx.navigateTo({ url: '/pages/profile/settings/security/security' });
        break;
      case 'about':
        wx.navigateTo({ url: '/pages/profile/settings/about/about' });
        break;
      case 'agreement':
        wx.navigateTo({ url: '/pages/profile/settings/agreement/agreement' });
        break;
      case 'privacy':
        wx.navigateTo({ url: '/pages/profile/settings/privacy/privacy' });
        break;
      case 'feedback':
        wx.navigateTo({ url: '/pages/profile/settings/feedback/feedback' });
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
          showLoading('清理中...');
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
              hideLoading();
              wx.showToast({ title: '清理失败', icon: 'none' });
            },
          });
        }
      },
    });
  },

  afterClear(fileCount) {
    hideLoading();
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
          app.logout();
          wx.switchTab({ url: '/pages/profile/profile/profile' });
        }
      },
    });
  },
});
