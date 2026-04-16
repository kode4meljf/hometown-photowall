// pages/upload/upload.js
const { postApi, uploadImage } = require('../../utils/api');
const { showLoading, hideLoading, showToast, showSuccess } = require('../../utils/util');

Page({
  data: {
    imageList: [],        // 已选图片临时路径列表
    imageInfoList: [],   // 图片尺寸信息 [{width, height}]
    currentIndex: 0,     // 当前选中预览的图片索引
    isOverflow: false,   // 缩略图是否超出屏幕宽度
    scrollWidth: '100rpx',  // scroll-view 宽度（初始值，会被 JS 覆盖）

    form: {
      title: '',
      description: '',
      location: ''
    },
    locations: [],       // 已有地点列表
    customLocation: '',

    submitting: false,
    highlightTitle: false,
    focusTitle: false
  },

  onLoad() {
    this.loadLocations();
  },

  async loadLocations() {
    try {
      const res = await postApi.getPosts({ limit: 100 });
      if (res.success && res.data) {
        const locationSet = new Set();
        res.data.forEach(post => {
          if (post.location) locationSet.add(post.location);
        });
        this.setData({ locations: Array.from(locationSet) });
      }
    } catch (e) {}
  },

  // 选择图片（多选，不限数量）
  chooseImage() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newFiles = res.tempFiles;
        const newPaths = newFiles.map(f => f.tempFilePath);

        const getInfoPromises = newPaths.map(path => {
          return new Promise(resolve => {
            wx.getImageInfo({
              src: path,
              success: info => resolve({ width: info.width, height: info.height }),
              fail: () => resolve({ width: 1, height: 1 })
            });
          });
        });

        Promise.all(getInfoPromises).then(infos => {
          const newImageList = [...this.data.imageList, ...newPaths];
          const newImageInfoList = [...this.data.imageInfoList, ...infos];

          this.setData({
            imageList: newImageList,
            imageInfoList: newImageInfoList,
            currentIndex: newImageList.length - 1
          }, () => {
            this.checkOverflow();
          });
        });
      }
    });
  },

  // 点击缩略图切换预览
  selectImage(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentIndex: index });
  },

  // 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const { imageList, imageInfoList, currentIndex } = this.data;

    const newImageList = imageList.filter((_, i) => i !== index);
    const newImageInfoList = imageInfoList.filter((_, i) => i !== index);

    let newCurrentIndex = currentIndex;
    if (newImageList.length === 0) {
      newCurrentIndex = 0;
    } else if (currentIndex >= index) {
      newCurrentIndex = Math.max(0, currentIndex - 1);
    }

    this.setData({
      imageList: newImageList,
      imageInfoList: newImageInfoList,
      currentIndex: newCurrentIndex
    }, () => {
      this.checkOverflow();
    });
  },

  // 检查缩略图是否超出屏幕宽度，并设置 scroll-view 宽度
  checkOverflow() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.thumbnail-list').boundingClientRect();
    query.select('.thumbnail-bar').boundingClientRect();
    query.exec(res => {
      const listWidth = res[0]?.width || 0;
      const barWidth = res[1]?.width || 0;
      const screenWidth = wx.getSystemInfoSync().windowWidth;

      // 按钮宽度换算成 px：80rpx + margin-left 16rpx = 96rpx
      const addBtnPx = Math.round(96 * (screenWidth / 750));

      // 无缩略图时：scroll-view 宽度跟添加按钮同宽，这样整体能居中
      if (this.data.imageList.length === 0) {
        this.setData({ isOverflow: false, scrollWidth: '80rpx' });
        return;
      }

      // 阈值：列表宽度 + 按钮宽度 > 容器宽度
      const threshold = barWidth - addBtnPx - 20;
      const isOverflow = listWidth > threshold;

      // 溢出：scroll 占满；未溢出：scroll = 内容宽度 + 按钮宽度 + 间隙
      const scrollWidth = isOverflow
        ? '100%'
        : (listWidth + addBtnPx + 10) + 'px';

      this.setData({ isOverflow, scrollWidth });
    });
  },

  // 大图点击全屏预览
  previewFullScreen() {
    if (this.data.imageList.length === 0) return;
    wx.previewImage({
      current: this.data.imageList[this.data.currentIndex],
      urls: this.data.imageList
    });
  },

  // 表单输入
  onTitleInput(e) {
    this.setData({ 'form.title': e.detail.value });
  },

  onDescInput(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  selectLocation(e) {
    const location = e.currentTarget.dataset.location;
    this.setData({
      'form.location': location,
    });
  },

  onCustomLocationInput(e) {
    this.setData({ customLocation: e.detail.value });
  },

  confirmCustomLocation() {
    if (this.data.customLocation.trim()) {
      this.setData({
        'form.location': this.data.customLocation.trim(),
        customLocation: '',
      });
    }
  },

  clearLocation() {
    this.setData({ 'form.location': '' });
  },

  // 提交发布
  async handleSubmit() {
    const { imageList, imageInfoList, form } = this.data;

    if (imageList.length === 0) {
      showToast('请先选择图片');
      return;
    }

    if (!form.title.trim()) {
      showToast('请输入标题');
      this.setData({ highlightTitle: true, focusTitle: true });
      setTimeout(() => this.setData({ highlightTitle: false }), 2000);
      return;
    }

    this.setData({ submitting: true });
    showLoading('发布中...');

    try {
      const uploadPromises = imageList.map(path => uploadImage(path));
      const fileIds = await Promise.all(uploadPromises);

      const photos = fileIds.map((fileId, index) => ({
        imageUrl: fileId,
        width: imageInfoList[index].width,
        height: imageInfoList[index].height,
        order: index
      }));

      const res = await postApi.createPost({
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        photos: photos
      });

      hideLoading();

      if (res.success) {
        showSuccess('发布成功');
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        showToast(res.message || '发布失败');
      }
    } catch (e) {
      hideLoading();
      showToast('发布失败：' + (e.message || '网络错误'));
    } finally {
      this.setData({ submitting: false });
    }
  }
});
