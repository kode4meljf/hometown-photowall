// app.js - 云开发版本
App({
  globalData: {
    userInfo: null,
    isLoggedIn: false
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
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'auth',
        data: { action, data },
        success: (res) => {
          if (res.result && res.result.success) {
            resolve(res.result);
          } else {
            reject(res.result || { message: '请求失败' });
          }
        },
        fail: () => reject({ message: '网络错误，请重试' })
      });
    });
  },

  // 微信授权登录
  wechatLogin() {
    return this._callAuth('wechatLogin').then((result) => {
      this._applyLoginUser(result.data.user);
      return result;
    });
  },

  // 手机号找回登录（换微信后，需已绑定过手机）
  phoneLogin(phoneCode) {
    return this._callAuth('phoneLogin', { phoneCode }).then((result) => {
      this._applyLoginUser(result.data.user);
      return result;
    });
  },

  // 绑定手机号到当前账号
  bindPhone(phoneCode) {
    return this._callAuth('bindPhone', { phoneCode }).then((result) => {
      if (result.data && result.data.user) {
        this._applyLoginUser(result.data.user);
      }
      return result;
    });
  },

  // 登出
  logout() {
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    wx.removeStorageSync('userInfo');
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
