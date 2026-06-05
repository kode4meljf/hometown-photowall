// app.js - 云开发版本
const { invokeCloud } = require('./utils/api');

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    homeNeedRefresh: false,
    profileNeedRefresh: false,
    profileNeedUserRefresh: false,
    publishFeedback: null,
  },

  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-d2g545zl57f7db2de', // 替换为你的云开发环境ID
        traceUser: true
      });
    }

    // 检查登录状态
    this.checkLoginStatus();
    if (this.globalData.isLoggedIn) {
      this.syncSession();
    }
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.globalData.userInfo = userInfo;
      this.globalData.isLoggedIn = true;
    }
  },

  _applyLoginUser(user) {
    this.globalData.userInfo = user;
    this.globalData.isLoggedIn = true;
    wx.setStorageSync('userInfo', user);
  },

  _callAuth(action, data = {}) {
    return invokeCloud('auth', action, data)
      .then((result) => {
        if (result && result.success) {
          return result;
        }
        return Promise.reject(result || { message: '请求失败' });
      })
      .catch((err) => {
        if (err && err.message && !err.errMsg) {
          return Promise.reject(err);
        }
        return Promise.reject({ message: '网络错误，请重试' });
      });
  },

  // 微信授权登录
  wechatLogin() {
    return this._callAuth('wechatLogin').then((result) => {
      this._applyLoginUser(result.data.user);
      return result;
    });
  },

  // 登出
  logout() {
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    wx.removeStorageSync('userInfo');
    this.globalData.homeNeedRefresh = true;
    this.globalData.profileNeedRefresh = true;
  },

  /**
   * 与服务器校验登录态：本地已登录但 users 无记录时自动登出
   * @returns {Promise<boolean>} 是否仍为有效登录
   */
  syncSession(options = {}) {
    const { toast = false } = options;
    if (!this.globalData.isLoggedIn) {
      return Promise.resolve(false);
    }
    return this._callAuth('getCurrentUser')
      .then((result) => {
        if (result.data) {
          this._applyLoginUser(result.data);
          return true;
        }
        this.logout();
        if (toast) {
          wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
        }
        return false;
      })
      .catch(() => this.globalData.isLoggedIn);
  },

  // 检查是否登录
  checkLogin() {
    return this.globalData.isLoggedIn;
  }
});
