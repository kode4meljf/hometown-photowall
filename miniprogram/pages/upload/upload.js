// pages/upload/upload.js
const { photoApi } = require('../../utils/api');
const { showLoading, hideLoading, showToast, showSuccess } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    imageUrl: '',
    form: {
      title: '',
      description: '',
      location: '',
      category: '风景'
    },
    categories: [],
    locations: [],
    locationOptions: ['不选择'],
    submitting: false
  },

  onLoad() {
    this.loadCategories();
    this.loadLocations();
  },

  async loadCategories() {
    try {
      const res = await photoApi.getCategories();
      if (res.success) {
        this.setData({ categories: res.data });
      }
    } catch (e) {}
  },

  async loadLocations() {
    try {
      const res = await photoApi.getLocations();
      if (res.success) {
        this.setData({ 
          locations: res.data,
          locationOptions: ['不选择', ...res.data]
        });
      }
    } catch (e) {}
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        // 获取图片宽高比
        wx.getImageInfo({
          src: tempFilePath,
          success: (info) => {
            const rawRatio = info.height / info.width;
            // ratio = 高宽比（height/width），存真实值，瀑布流用乘法渲染
            this.setData({
              imageUrl: tempFilePath,
              aspectRatio: rawRatio
            });
          },
          fail: () => {
            // 获取失败时默认 1
            this.setData({
              imageUrl: tempFilePath,
              aspectRatio: 1
            });
          }
        });
      }
    });
  },

  onTitleInput(e) {
    this.setData({ 'form.title': e.detail.value });
  },

  onDescInput(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  // 从下拉列表选择地点
  onLocationSelect(e) {
    const index = e.detail.value;
    if (index == 0) {
      // 不选择，保持当前输入框的值
      return;
    }
    const location = this.data.locationOptions[index];
    this.setData({ 'form.location': location });
  },

  // 自定义输入地点
  onLocationInput(e) {
    this.setData({ 'form.location': e.detail.value });
  },

  onCategoryChange(e) {
    const category = this.data.categories[e.detail.value];
    this.setData({ 'form.category': category.name });
  },

  async handleSubmit() {
    // 验证
    if (!this.data.imageUrl) {
      showToast('请选择图片');
      return;
    }
    if (!this.data.form.title) {
      showToast('请输入标题');
      return;
    }
    if (!app.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }

    this.setData({ submitting: true });
    showLoading('上传中...');

    try {
      const formData = {
        title: this.data.form.title,
        description: this.data.form.description,
        location: this.data.form.location,
        category: this.data.form.category,
        author: app.globalData.userInfo?.nickname || '匿名用户',
        aspectRatio: this.data.aspectRatio || 1  // 高宽比，默认 1
      };

      const res = await photoApi.uploadPhoto(this.data.imageUrl, formData);
      hideLoading();

      if (res.success) {
        showSuccess('上传成功');
        setTimeout(() => {
          // 通知首页刷新
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.onNeedRefresh) {
            prevPage.onNeedRefresh();
          }
          wx.navigateBack();
        }, 1500);
      } else {
        showToast(res.message || '上传失败');
        this.setData({ submitting: false });
      }
    } catch (e) {
      hideLoading();
      showToast('上传失败');
      this.setData({ submitting: false });
    }
  }
});