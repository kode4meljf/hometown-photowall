// pages/login/login.js
const { showLoading, hideLoading, showToast, showSuccess } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    activeTab: 'login',
    loginForm: { username: '', password: '' },
    registerForm: { username: '', nickname: '', password: '', confirmPassword: '' },
    loading: false
  },

  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  onLoginUsername(e) { this.setData({ 'loginForm.username': e.detail.value }); },
  onLoginPassword(e) { this.setData({ 'loginForm.password': e.detail.value }); },
  onRegUsername(e) { this.setData({ 'registerForm.username': e.detail.value }); },
  onRegNickname(e) { this.setData({ 'registerForm.nickname': e.detail.value }); },
  onRegPassword(e) { this.setData({ 'registerForm.password': e.detail.value }); },
  onRegConfirm(e) { this.setData({ 'registerForm.confirmPassword': e.detail.value }); },

  async handleLogin() {
    const { username, password } = this.data.loginForm;
    if (!username) { showToast('请输入用户名'); return; }
    if (!password) { showToast('请输入密码'); return; }

    this.setData({ loading: true });
    showLoading('登录中...');

    try {
      await app.login(username, password);
      hideLoading();
      showSuccess('登录成功');
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e) {
      hideLoading();
      showToast(e.message || '登录失败');
      this.setData({ loading: false });
    }
  },

  async handleRegister() {
    const { username, nickname, password, confirmPassword } = this.data.registerForm;
    if (!username) { showToast('请输入用户名'); return; }
    if (!nickname) { showToast('请输入昵称'); return; }
    if (!password) { showToast('请输入密码'); return; }
    if (password !== confirmPassword) { showToast('两次密码不一致'); return; }

    this.setData({ loading: true });
    showLoading('注册中...');

    try {
      await app.register(username, password, nickname);
      hideLoading();
      showSuccess('注册成功');
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (e) {
      hideLoading();
      showToast(e.message || '注册失败');
      this.setData({ loading: false });
    }
  }
});
