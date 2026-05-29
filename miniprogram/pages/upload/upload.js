// pages/upload/upload.js
const { postApi, uploadImage } = require('../../utils/api');
const { showToast, showLoading, hideLoading, showSuccess } = require('../../utils/util');
const { chooseMedia } = require('../../utils/mediaPicker');

Page({
  data: {
    imageList: [],        // 已选图片临时路径列表
    imageInfoList: [],   // 图片尺寸信息 [{width, height}]
    currentIndex: 0,     // 当前选中预览的图片索引
    isOverflow: false,

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

  // 选择图片（多选）
  chooseImage() {
    chooseMedia({
      count: 9,
      success: (res) => {
        const newFiles = res.tempFiles || [];
        if (!newFiles.length) return;

        const newPaths = newFiles.map((f) => f.tempFilePath);

        const getInfoPromises = newPaths.map((path) => {
          return new Promise((resolve) => {
            wx.getImageInfo({
              src: path,
              success: (info) => resolve({ width: info.width, height: info.height }),
              fail: () => resolve({ width: 1, height: 1 }),
            });
          });
        });

        Promise.all(getInfoPromises).then((infos) => {
          const newImageList = [...this.data.imageList, ...newPaths];
          const newImageInfoList = [...this.data.imageInfoList, ...infos];

          this.setData(
            {
              imageList: newImageList,
              imageInfoList: newImageInfoList,
              currentIndex: 0,
            },
            () => {
              this.checkOverflow();
            }
          );
        });
      },
    });
  },

  // swiper 滑动切换
  onSwiperChange(e) {
    const newIndex = e.detail.current;
    if (newIndex !== this.data.currentIndex) {
      this.setData({ currentIndex: newIndex });
    }
  },

  // 设为封面：把当前图移到数组第一位
  setAsCover(e) {
    const idx = e.currentTarget.dataset.index;
    if (idx === 0) return; // 已经是封面
    const list = this.data.imageList.slice();
    const infoList = this.data.imageInfoList.slice();
    const [item] = list.splice(idx, 1);
    const [info] = infoList.splice(idx, 1);
    list.unshift(item);
    infoList.unshift(info);
    this.setData({
      imageList: list,
      imageInfoList: infoList,
      currentIndex: 0
    });
  },

  // 点击缩略图切换预览
  selectImage(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentIndex: index });
  },

  // 删除当前预览的图片（从预览区右上角按钮触发）
  deleteCurrentImage() {
    const { imageList, imageInfoList, currentIndex } = this.data;
    if (imageList.length === 0) return;

    const newImageList = imageList.filter((_, i) => i !== currentIndex);
    const newImageInfoList = imageInfoList.filter((_, i) => i !== currentIndex);

    let newCurrentIndex = currentIndex;
    if (newImageList.length === 0) {
      newCurrentIndex = 0;
    } else if (currentIndex >= newImageList.length) {
      newCurrentIndex = newImageList.length - 1;
    }

    this.setData({
      imageList: newImageList,
      imageInfoList: newImageInfoList,
      currentIndex: Math.min(newCurrentIndex, newImageList.length - 1)
    }, () => {
      this.checkOverflow();
    });
  },

  // 检测缩略图是否超出：量 wrapper 宽度和屏幕宽度对比
  checkOverflow() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.thumbnail-wrapper').boundingClientRect();
    query.exec((res) => {
      const wrapperRect = res[0];
      if (!wrapperRect) return;
      // 获取屏幕宽度（注意这是整个窗口宽度，不是bar宽度）
      const screenWidth = wx.getSystemInfoSync().windowWidth;
      // 转换 rpx → px: 1rpx = screenWidth / 750
      const rpx2px = screenWidth / 750;
      // bar 左右 padding: 32rpx × 2 = 64rpx
      const barPadding = 64 * rpx2px;
      const maxWidth = screenWidth - barPadding;
      this.setData({ isOverflow: wrapperRect.width > maxWidth });
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
    if (this.data.submitting) return;

    // 如果自定义地点输入框有值但未确认（未按键盘完成），自动补写到 form.location
    const customLoc = this.data.customLocation && this.data.customLocation.trim();
    if (customLoc && !this.data.form.location) {
      this.data.form.location = customLoc;
      this.data.customLocation = '';
    }
    const { imageList, imageInfoList, form } = this.data;

    if (imageList.length === 0) {
      showToast('请先选择图片');
      return;
    }

    this.setData({ submitting: true });
    showLoading('发布中...');

    try {
      const uploadPromises = imageList.map((path) => {
        return uploadImage(path);
      });
      const fileIds = await Promise.all(uploadPromises);

      const photos = fileIds.map((fileId, index) => ({
        imageUrl: fileId,
        width: imageInfoList[index].width,
        height: imageInfoList[index].height,
        order: index
      }));

      const createData = {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        photos: photos
      };

      const res = await postApi.createPost(createData);

      hideLoading();

      if (res.success) {
        showSuccess('发布成功');
        getApp().globalData.homeNeedRefresh = true;
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 1500);
      } else {
        showToast(res.message || '发布失败');
      }
    } catch (e) {
      console.error('[upload] handleSubmit 失败:', e);
      hideLoading();
      showToast('发布失败：' + (e.message || '网络错误'));
    } finally {
      this.setData({ submitting: false });
    }
  }
});
