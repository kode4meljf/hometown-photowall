// pages/edit-profile/edit-profile.js
const { userApi } = require('../../utils/api');
const { showToast } = require('../../utils/util');

Page({
  data: {
    // 表单数据
    formData: {
      avatar: '',
      nickname: '',
      gender: 'secret',  // 'male' | 'female' | 'secret'
      region: [],  // [省份, 城市, 区县]
      regionDisplay: '',  // 格式化显示字符串「省 市」
      bio: ''
    },
    avatarVersion: '',
    bioLength: 0,
    saving: false,
  },


  onLoad() {
    wx.setNavigationBarTitle({ title: '编辑资料' });
    this.loadUserInfo();
  },

  onShow() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ hidden: true });
  },

  onUnload() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ hidden: false });
  },

  // 加载用户信息
  async loadUserInfo() {
    wx.showLoading({ title: '加载中...', mask: true });
    try {
      const res = await userApi.getCurrentUser();
      wx.hideLoading();
      if (res.success && res.data) {
        const u = res.data;
        this.setData({
          formData: {
            avatar: u.avatar || '',
            nickname: u.nickname || '',
            gender: u.gender || 'secret',
            region: u.region || [],
            regionDisplay: this._formatRegionForEdit(u.region || []),
            bio: u.bio || ''
          },
          bioLength: (u.bio || '').length
        });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('加载用户信息失败:', e);
      showToast('加载失败');
    }
  },

  // 头像选择
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) return;
    this.setData({ 'formData.avatar': avatarUrl });
    this._uploadAvatar(avatarUrl);
  },

  // 上传头像
  async _uploadAvatar(filePath) {
    wx.showLoading({ title: '上传中...', mask: true });
    try {
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath });
      if (!uploadRes.fileID) {
        wx.hideLoading();
        showToast('上传失败');
        return;
      }
      // 更新本地显示
      this.setData({
        'formData.avatar': uploadRes.fileID,
        avatarVersion: '?v=' + Date.now()
      });
      wx.hideLoading();
      showToast('头像已更新');
    } catch (e) {
      wx.hideLoading();
      showToast('上传失败');
      console.error('上传头像失败:', e);
    }
  },

  // 昵称输入
  onNicknameInput(e) {
    this.setData({ 'formData.nickname': e.detail.value });
  },

  // 昵称失焦（用于预获取昵称）
  onNicknameBlur(e) {
    const nickname = e.detail.value.trim();
    this.setData({ 'formData.nickname': nickname });
  },

  // 性别选择
  onGenderSelect(e) {
    const gender = e.currentTarget.dataset.g;
    this.setData({ 'formData.gender': gender });
  },

  // 地区选择（省+市，显示「省 市」）
  onRegionChange(e) {
    const [province, city, district] = e.detail.value;
    this.setData({
      'formData.region': e.detail.value,
      'formData.regionDisplay': province + ' ' + city
    });
  },

  // 格式化地区（编辑页用：「省 市」）
  _formatRegionForEdit(region) {
    if (!region || region.length < 2) return '';
    return region[0] + ' ' + region[1];  // 省 + 市
  },

  // 简介输入
  onBioInput(e) {
    const bio = e.detail.value;
    this.setData({
      'formData.bio': bio,
      bioLength: bio.length
    });
  },

  // 保存
  async onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });

    const { avatar, nickname, gender, region, bio } = this.data.formData;

    // 简单校验
    if (!nickname || !nickname.trim()) {
      this.setData({ saving: false });
      showToast('请输入昵称');
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      // 调用更新接口（avatar 单独处理）
      const payload = {
        avatar,
        nickname: nickname.trim(),
        gender,
        region,
        bio
      };
      console.log('[DEBUG] onSave payload:', JSON.stringify(payload));
      const res = await userApi.updateUserProfile(payload);
      console.log('[DEBUG] onSave result:', JSON.stringify(res));

      wx.hideLoading();
      this.setData({ saving: false });

      if (res.success) {
        showToast('保存成功');
        // 延迟返回，让用户看到提示
        setTimeout(() => {
          wx.navigateBack();
        }, 1200);
      } else {
        showToast(res.message || '保存失败');
      }
    } catch (e) {
      wx.hideLoading();
      this.setData({ saving: false });
      showToast('保存失败');
      console.error('保存失败:', e);
    }
  }
});
