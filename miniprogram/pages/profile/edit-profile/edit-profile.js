// pages/edit-profile/edit-profile.js
const { userApi, uploadImage } = require('../../../utils/api');
const { showToast, showLoading, hideLoading } = require('../../../utils/util');
const { ensureSession } = require('../../../utils/session');
const { ensurePrivacyAuthorized } = require('../../../utils/privacy');

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
    avatarPickerReady: false,
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
    showLoading('加载中...');
    try {
      const valid = await ensureSession({ toast: true, navigateBack: true });
      hideLoading();
      if (!valid) return;
      const app = getApp();
      const u = app.globalData.userInfo;
      if (!u) return;
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
    } catch (e) {
      hideLoading();
      console.error('加载用户信息失败:', e);
      showToast('加载失败');
    }
  },

  // 头像选择
  async onAvatarTapPrepare() {
    const privacyOk = await ensurePrivacyAuthorized();
    if (!privacyOk) return;
    this.setData({ avatarPickerReady: true });
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) return;
    this.setData({ 'formData.avatar': avatarUrl, avatarPickerReady: false });
    this._uploadAvatar(avatarUrl);
  },

  // 上传头像（选完即生效）
  async _uploadAvatar(filePath) {
    showLoading('上传中...');
    try {
      const fileID = await uploadImage(filePath, 'avatars');
      if (!fileID) {
        hideLoading();
        showToast('上传失败');
        return;
      }
      await userApi.updateUserProfile({ avatar: fileID });
      const fresh = await userApi.getCurrentUser();
      if (fresh.success && fresh.data) {
        this.setData({ 'formData.avatar': fresh.data.avatar || fileID });
      } else {
        this.setData({ 'formData.avatar': fileID });
      }
      hideLoading();
      showToast('头像已更新');
      getApp().globalData.profileNeedUserRefresh = true;
    } catch (e) {
      hideLoading();
      showToast('头像保存失败');
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

    const { nickname, gender, region, bio } = this.data.formData;

    // 简单校验
    if (!nickname || !nickname.trim()) {
      this.setData({ saving: false });
      showToast('请输入昵称');
      return;
    }

    showLoading('保存中...');
    try {
      // avatar 已通过 _uploadAvatar 单独存库，此处只更新文字类内容
      const payload = {
        nickname: nickname.trim(),
        gender,
        region,
        bio
      };
      const res = await userApi.updateUserProfile(payload);

      hideLoading();
      this.setData({ saving: false });

      if (res.success) {
        getApp().globalData.profileNeedUserRefresh = true;
        showToast('保存成功');
        // 延迟返回，让用户看到提示
        setTimeout(() => {
          wx.navigateBack();
        }, 1200);
      } else {
        showToast(res.message || '保存失败');
      }
    } catch (e) {
      hideLoading();
      this.setData({ saving: false });
      showToast('保存失败');
      console.error('保存失败:', e);
    }
  }
});
