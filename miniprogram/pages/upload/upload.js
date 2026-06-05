// pages/upload/upload.js
const { postApi, uploadImage } = require('../../utils/api');
const { showToast, showLoading, hideLoading, showSuccess, showContentAuditModal, isContentAuditFailure } = require('../../utils/util');
const { mapApiErrorMessage } = require('../../utils/apiErrors');
const { chooseMedia } = require('../../utils/mediaPicker');
const { isLoggedIn, requireLogin } = require('../../utils/session');

const MAX_PHOTOS = 9;
const REJECTED_TIP = '未通过作品保留 7 天，请尽快处理，超时系统自动清除';

Page({
  data: {
    isResubmit: false,
    isRejectedMode: false,
    imageReady: false,
    rejectedTip: REJECTED_TIP,
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
    publishOverlayVisible: false,
    publishOverlayTitle: '发布并审核中…',
    publishOverlayStatus: '',
    loginModalShow: false,
    highlightTitle: false,
    focusTitle: false,
  },

  _showLoginModal() {
    this.setData({ loginModalShow: true });
  },

  _ensureLoggedIn() {
    return requireLogin({
      toast: false,
      onUnauthenticated: () => this._showLoginModal(),
    });
  },

  _isAuthRequiredError(err) {
    const msg = err && err.message ? String(err.message) : String(err || '');
    return /请先登录|未登录|login/i.test(msg);
  },

  _isAuthRequiredResponse(res) {
    if (!res) return false;
    const msg = res.message ? String(res.message) : '';
    return /请先登录|未登录/i.test(msg);
  },

  onLoginModalClose() {
    this.setData({ loginModalShow: false });
  },

  onLoginSuccess() {
    this.setData({ loginModalShow: false });
  },

  preventTouchMove() {},

  _startPublishOverlay() {
    this._leftDuringSubmit = false;
    this.setData({
      submitting: true,
      publishOverlayVisible: true,
      publishOverlayTitle: '发布并审核中…',
      publishOverlayStatus: '',
    });
  },

  _finishPublishOverlay() {
    this.setData({
      submitting: false,
      publishOverlayVisible: false,
      publishOverlayStatus: '',
    });
  },

  _setPublishOverlayAudit() {
    this.setData({ publishOverlayStatus: '审核中...' });
  },

  goProfileWhileSubmitting() {
    if (!this.data.submitting) return;
    this._leftDuringSubmit = true;
    wx.switchTab({ url: '/pages/profile/profile/profile' });
  },

  _refreshProfileIfVisible() {
    const app = getApp();
    app.globalData.profileNeedRefresh = true;
    const pages = getCurrentPages();
    const cur = pages[pages.length - 1];
    if (
      cur
      && cur.route
      && cur.route.indexOf('profile/profile/profile') !== -1
      && typeof cur.loadData === 'function'
    ) {
      app.globalData.profileNeedRefresh = false;
      cur.loadData();
    }
  },

  _isOnUploadPage() {
    const pages = getCurrentPages();
    const cur = pages[pages.length - 1];
    return !!(cur && cur.route && cur.route.indexOf('upload/upload') !== -1);
  },

  _handlePublishResult(res, newUploadedIds) {
    const app = getApp();
    const MSG_AUDIT_PENDING = '作品审核中，通过后将展示在首页';
    const stayedOnUpload = !this._leftDuringSubmit && this._isOnUploadPage();

    if (!res.success && this._isAuthRequiredResponse(res)) {
      if (stayedOnUpload) this._showLoginModal();
      return;
    }

    if (res.success) {
      app.globalData.profileNeedRefresh = true;
      const status = res.data && res.data.status;
      const msg = status === 'reviewing'
        ? (res.message || MSG_AUDIT_PENDING)
        : (res.message || '发布成功');

      if (status === 'released') {
        app.globalData.homeNeedRefresh = true;
      }

      if (stayedOnUpload) {
        showSuccess(msg);
        if (status === 'reviewing') {
          wx.switchTab({ url: '/pages/profile/profile/profile' });
        } else {
          wx.switchTab({ url: '/pages/index/index' });
        }
      } else {
        showToast(msg);
        this._refreshProfileIfVisible();
      }
      return;
    }

    if (res.data && res.data.id && res.data.status === 'rejected') {
      if (stayedOnUpload) {
        this._enterRejectedMode(res.data.id, mapApiErrorMessage(res), res.code);
      } else {
        showToast(mapApiErrorMessage(res));
      }
      return;
    }

    this._cleanupCloudFiles(newUploadedIds);
    const errMsg = isContentAuditFailure(res)
      ? mapApiErrorMessage(res)
      : mapApiErrorMessage(res);
    if (stayedOnUpload && isContentAuditFailure(res)) {
      showContentAuditModal(errMsg, res.code);
    } else {
      showToast(errMsg || '提交失败，请稍后重试');
    }
  },

  onLoad(options) {
    const mode = options.mode;
    const postId = options.postId;
    if (mode === 'resubmit' && postId) {
      this._resubmitPostId = postId;
      this._originalCloudFileIds = [];
      this.setData({
        isResubmit: true,
        isRejectedMode: true,
        imageReady: false,
        submitBtnText: '再次发布',
        rejectedTip: REJECTED_TIP,
      });
      wx.setNavigationBarTitle({ title: '重新提交' });
      this.loadResubmitPost(postId);
    }
    this.loadLocations();
    if (!isLoggedIn() && (options.needLogin === '1' || options.needLogin === true)) {
      this._showLoginModal();
    }
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
      if (res.data.status !== 'rejected' && res.data.status !== 'failed') {
        showToast('当前作品不可重新提交');
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      const imageRemoved = !!res.data.imageRemoved;
      const photos = (res.data.photos || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      let imageList = [];
      if (!imageRemoved) {
        imageList = photos.map((p) => p.imageUrl).filter(Boolean);
        if (!imageList.length && res.data.imageUrl) {
          imageList.push(res.data.imageUrl);
        }
      }
      this._originalCloudFileIds = imageList.slice();

      this.setData({
        imageList,
        imageSources: imageList.map(() => (imageRemoved ? 'placeholder' : 'cloud')),
        imageInfoList: photos.length
          ? photos.map((p) => ({ width: p.width || 1, height: p.height || 1 }))
          : [{ width: 1, height: 1 }],
        form: {
          title: res.data.title || '',
          description: res.data.description || '',
          location: res.data.location || '',
        },
        currentIndex: 0,
        imageReady: false,
        isRejectedMode: true,
        rejectedTip: REJECTED_TIP,
      }, () => this.checkOverflow());
    } catch (e) {
      hideLoading();
      showToast('加载失败');
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  async loadLocations() {
    try {
      const res = await postApi.getLocations();
      if (res.success && res.data) {
        this.setData({ locations: res.data });
      }
    } catch (e) {
      console.error('加载地点列表失败:', e);
    }
  },

  chooseImage() {
    if (this.data.submitting) return;
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
              imageReady: true,
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
    if (this.data.submitting) return;
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
        imageReady: newImageList.some((_, i) => newImageSources[i] === 'local'),
      },
      () => this.checkOverflow()
    );
  },

  _enterRejectedMode(postId, message, code) {
    this._resubmitPostId = postId;
    this.setData({
      isResubmit: true,
      isRejectedMode: true,
      imageReady: false,
      submitBtnText: '再次发布',
      rejectedTip: REJECTED_TIP,
    });
    wx.setNavigationBarTitle({ title: '重新提交' });
    if (message) {
      if (isContentAuditFailure({ message, code })) {
        showContentAuditModal(message, code);
      } else {
        showToast(message);
      }
    }
  },

  async handleDeleteRejected() {
    if (this.data.submitting) return;
    const postId = this._resubmitPostId;
    if (!postId) {
      wx.navigateBack();
      return;
    }
    showLoading('删除中...');
    try {
      const res = await postApi.deletePost(postId);
      hideLoading();
      if (res.success) {
        showSuccess('已删除');
        getApp().globalData.profileNeedRefresh = true;
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        showToast(mapApiErrorMessage(res));
      }
    } catch (e) {
      hideLoading();
      showToast('删除失败');
    }
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
    if (this.data.submitting) return;
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
    const uploadTotal = imageSources.filter((s) => s === 'local').length;
    let uploadedCount = 0;

    for (let i = 0; i < imageList.length; i++) {
      let fileId = imageList[i];
      if (imageSources[i] === 'local') {
        uploadedCount += 1;
        this.setData({
          publishOverlayStatus: `上传 ${uploadedCount}/${uploadTotal}`,
        });
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

    if (this.data.isResubmit || this.data.isRejectedMode) {
      if (!this.data.imageReady) {
        showToast('请先重新选择图片');
        return;
      }
    }

    if (!this._ensureLoggedIn()) {
      return;
    }

    this._startPublishOverlay();

    let newUploadedIds = [];

    try {
      const { photos, newUploadedIds: uploaded } = await this._buildPhotosPayload();
      newUploadedIds = uploaded;

      this._setPublishOverlayAudit();

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

      this._finishPublishOverlay();
      this._handlePublishResult(res, newUploadedIds);
    } catch (e) {
      console.error('[upload] handleSubmit 失败:', e);
      this._finishPublishOverlay();
      if (this._isAuthRequiredError(e)) {
        if (!this._leftDuringSubmit && this._isOnUploadPage()) {
          this._showLoginModal();
        }
        return;
      }
      await this._cleanupCloudFiles(newUploadedIds);
      showToast('提交失败，请稍后重试');
    }
  },
});
