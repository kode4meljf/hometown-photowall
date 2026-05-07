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
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.globalData.userInfo = userInfo;
      this.globalData.isLoggedIn = true;
    }
  },

  // 登录
  login(username, password) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'auth',
        data: {
          action: 'login',
          username,
          password
        },
        success: (res) => {
          if (res.result.success) {
            this.globalData.userInfo = res.result.data.user;
            this.globalData.isLoggedIn = true;
            wx.setStorageSync('userInfo', res.result.data.user);
            resolve(res.result);
          } else {
            reject(res.result);
          }
        },
        fail: reject
      });
    });
  },

  // 注册
  register(username, password, nickname) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'auth',
        data: {
          action: 'register',
          username,
          password,
          nickname
        },
        success: (res) => {
          if (res.result.success) {
            this.globalData.userInfo = res.result.data.user;
            this.globalData.isLoggedIn = true;
            wx.setStorageSync('userInfo', res.result.data.user);
            resolve(res.result);
          } else {
            reject(res.result);
          }
        },
        fail: reject
      });
    });
  },

  // 登出
  logout() {
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    wx.removeStorageSync('userInfo');
  },

  // 检查是否登录
  checkLogin() {
    return this.globalData.isLoggedIn;
  }
});
