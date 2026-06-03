// pages/upload/upload.js
const { postApi, uploadImage } = require('../../utils/api');
const { showToast, showLoading, hideLoading, showSuccess } = require('../../utils/util');
const { chooseMedia } = require('../../utils/mediaPicker');

const MAX_PHOTOS = 9;

Page({
  data: {
    isResubmit: false,
    submitBtnText: '发布照片',
    imageList: [],
    imageSources: [],
    imageInfoList: [],
    currentIndex: 0,
    isOverflow: false,

    form: {
      title: '',
      description: '',
      location: '',
    },
    locations: [],
    customLocation: '',

    submitting: false,
    highlightTitle: false,
    focusTitle: false,
  },

  onLoad(options) {
    const mode = options.mode;
    const postId = options.postId;
    if (mode === 'resubmit' && postId) {
      this._resubmitPostId = postId;
      this._originalCloudFileIds = [];
      this.setData({ isResubmit: true, submitBtnText: '重新提交' });
      wx.setNavigationBarTitle({ title: '重新提交' });
      this.loadResubmitPost(postId);
    }
    this.loadLocations();
  },

  async loadResubmitPost(postId) {
    showLoading('加载中...');
    try {
      const res = await postApi.getPostDetail(postId);
      hideLoading();
      if (!res.success || !res.data) {
        showToast(res.message || '加载失败');
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      if (res.data.status !== 'rejected') {
        showToast('当前作品不可重新提交');
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      const photos = (res.data.photos || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      if (!photos.length && res.data.imageUrl) {
        photos.push({ imageUrl: res.data.imageUrl, width: 1, height: 1, order: 0 });
      }
      const imageList = photos.map((p) => p.imageUrl).filter(Boolean);
      this._originalCloudFileIds = imageList.slice();

      this.setData({
        imageList,
        imageSources: imageList.map(() => 'cloud'),
        imageInfoList: photos.map((p) => ({
          width: p.width || 1,
          height: p.height || 1,
        })),
        form: {
          title: res.data.title || '',
          description: res.data.description || '',
          location: res.data.location || '',
        },
        currentIndex: 0,
      }, () => this.checkOverflow());
    } catch (e) {
      hideLoading();
      showToast('加载失败');
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  async loadLocations() {
    try {
      const res = await postApi.getPosts({ pageSize: 100 });
      const posts = (res.success && res.data && res.data.posts) ? res.data.posts : [];
      const locationSet = new Set();
      posts.forEach((post) => {
        if (post.location) locationSet.add(post.location);
      });
      this.setData({ locations: Array.from(locationSet) });
    } catch (e) {}
  },

  chooseImage() {
    const remain = MAX_PHOTOS - this.data.imageList.length;
    if (remain <= 0) {
      showToast(`最多 ${MAX_PHOTOS} 张图片`);
      return;
    }

    chooseMedia({
      count: remain,
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
          this.setData(
            {
              imageList: [...this.data.imageList, ...newPaths],
              imageSources: [...this.data.imageSources, ...newPaths.map(() => 'local')],
              imageInfoList: [...this.data.imageInfoList, ...infos],
              currentIndex: 0,
            },
            () => this.checkOverflow()
          );
        });
      },
    });
  },

  onSwiperChange(e) {
    const newIndex = e.detail.current;
    if (newIndex !== this.data.currentIndex) {
      this.setData({ currentIndex: newIndex });
    }
  },

  setAsCover(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (idx === 0) return;
    const list = this.data.imageList.slice();
    const sources = this.data.imageSources.slice();
    const infoList = this.data.imageInfoList.slice();
    const [item] = list.splice(idx, 1);
    const [source] = sources.splice(idx, 1);
    const [info] = infoList.splice(idx, 1);
    list.unshift(item);
    sources.unshift(source);
    infoList.unshift(info);
    this.setData({ imageList: list, imageSources: sources, imageInfoList: infoList, currentIndex: 0 });
  },

  selectImage(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ currentIndex: index });
  },

  deleteCurrentImage() {
    const { imageList, imageSources, imageInfoList, currentIndex } = this.data;
    if (imageList.length === 0) return;

    const newImageList = imageList.filter((_, i) => i !== currentIndex);
    const newImageSources = imageSources.filter((_, i) => i !== currentIndex);
    const newImageInfoList = imageInfoList.filter((_, i) => i !== currentIndex);

    let newCurrentIndex = currentIndex;
    if (newImageList.length === 0) {
      newCurrentIndex = 0;
    } else if (currentIndex >= newImageList.length) {
      newCurrentIndex = newImageList.length - 1;
    }

    this.setData(
      {
        imageList: newImageList,
        imageSources: newImageSources,
        imageInfoList: newImageInfoList,
        currentIndex: Math.min(newCurrentIndex, Math.max(newImageList.length - 1, 0)),
      },
      () => this.checkOverflow()
    );
  },

  checkOverflow() {
    const query = wx.createSelectorQuery().in(this);
    query.select('.thumbnail-wrapper').boundingClientRect();
    query.exec((res) => {
      const wrapperRect = res[0];
      if (!wrapperRect) return;
      const screenWidth = wx.getSystemInfoSync().windowWidth;
      const rpx2px = screenWidth / 750;
      const barPadding = 64 * rpx2px;
      const maxWidth = screenWidth - barPadding;
      this.setData({ isOverflow: wrapperRect.width > maxWidth });
    });
  },

  previewFullScreen() {
    if (this.data.imageList.length === 0) return;
    wx.previewImage({
      current: this.data.imageList[this.data.currentIndex],
      urls: this.data.imageList,
    });
  },

  onTitleInput(e) {
    this.setData({ 'form.title': e.detail.value });
  },

  onDescInput(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  selectLocation(e) {
    const location = e.currentTarget.dataset.location;
    this.setData({ 'form.location': location });
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

  _cleanupCloudFiles(fileIds) {
    if (!fileIds || !fileIds.length) return Promise.resolve();
    return wx.cloud.deleteFile({ fileList: fileIds }).catch(() => {});
  },

  async _buildPhotosPayload() {
    const { imageList, imageSources, imageInfoList } = this.data;
    const photos = [];
    const newUploadedIds = [];

    for (let i = 0; i < imageList.length; i++) {
      let fileId = imageList[i];
      if (imageSources[i] === 'local') {
        fileId = await uploadImage(imageList[i]);
        newUploadedIds.push(fileId);
      }
      photos.push({
        imageUrl: fileId,
        width: imageInfoList[i].width,
        height: imageInfoList[i].height,
        order: i,
      });
    }

    return { photos, newUploadedIds };
  },

  async handleSubmit() {
    if (this.data.submitting) return;

    const customLoc = this.data.customLocation && this.data.customLocation.trim();
    if (customLoc && !this.data.form.location) {
      this.data.form.location = customLoc;
      this.data.customLocation = '';
    }
    const { imageList, form } = this.data;

    if (imageList.length === 0) {
      showToast('请先选择图片');
      return;
    }

    this.setData({ submitting: true });
    const loadingText = this.data.isResubmit ? '提交中...' : '发布中...';
    showLoading(loadingText);

    let newUploadedIds = [];

    try {
      const { photos, newUploadedIds: uploaded } = await this._buildPhotosPayload();
      newUploadedIds = uploaded;

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        photos,
      };

      let res;
      if (this._resubmitPostId) {
        res = await postApi.resubmitPost(this._resubmitPostId, payload);
      } else {
        res = await postApi.createPost(payload);
      }

      hideLoading();

      if (res.success) {
        if (this._resubmitPostId) {
          getApp().globalData.profileNeedRefresh = true;
          showSuccess(res.message || '已提交审核');
          setTimeout(() => {
            wx.switchTab({ url: '/pages/profile/profile/profile' });
          }, 1500);
        } else {
          if (res.message) {
            showSuccess(res.message);
          } else {
            showSuccess('发布成功');
          }
          getApp().globalData.homeNeedRefresh = true;
          setTimeout(() => {
            wx.switchTab({ url: '/pages/index/index' });
          }, 1500);
        }
      } else {
        await this._cleanupCloudFiles(newUploadedIds);
        showToast(res.message || '提交失败');
      }
    } catch (e) {
      console.error('[upload] handleSubmit 失败:', e);
      hideLoading();
      await this._cleanupCloudFiles(newUploadedIds);
      showToast('提交失败：' + (e.message || '网络错误'));
    } finally {
      this.setData({ submitting: false });
    }
  },
});
