// pages/profile/profile.js
const { postApi } = require('../../../utils/api');
const { showToast } = require('../../../utils/util');
const app = getApp();

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    loginModalShow: false,
    activeTab: 'works',
    currentTabIndex: 0,
    worksFilter: 'all',
    worksDropdownOpen: false,
    dropdownTop: 0,
    dropdownLeft: 0,
    triangleLeft: 0,
    works: [],
    liked: [],
    worksCount: 0,
    likedCount: 0,
    loading: false,
    hiddenCount: 0,
    showPhotoAction: false,
    currentPhotoHidden: false,
    showEditPostModal: false,
    editPostTitle: '',
    editPostDescription: '',
    editPostEditable: true,
    _postId: null,
    worksPage: 1,
    likedPage: 1,
    worksHasMore: true,
    likedHasMore: true,
    worksLoadingMore: false,
    likedLoadingMore: false,
    _pageSize: 20
  },

  onLoad() {
    this.updateUserStatus();
  },

  onShow() {
    setTimeout(() => {
      const tabBar = this.getTabBar && this.getTabBar();
      if (tabBar) tabBar.setData({ selected: 2 });
    }, 0);
    this.updateUserStatus();
    if (this.data.isLoggedIn && !this._loaded) {
      this.loadData();
    }
    if (this.data.isLoggedIn && this._loaded) {
      this._fetchUserInfoWithAvatar();
    }
  },

  onReachBottom() {
    if (this.data.activeTab === 'liked') {
      this.loadMoreLiked();
    } else {
      this.loadMoreWorks();
    }
  },

  onPullDownRefresh() {
    // 下拉刷新时显示 loading，防止未登录状态下空态闪现
    if (!this.data.isLoggedIn) {
      wx.stopPullDownRefresh();
      return;
    }
    this.refreshData();
  },

  async refreshData() {
    if (app.checkLogin()) {
      await this.fetchLatestUserInfo();
    }
    if (app.checkLogin()) {
      await this.loadData();
    }
    wx.stopPullDownRefresh();
  },

  updateUserStatus() {
    const isLoggedIn = app.checkLogin();
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      this._fetchUserInfoWithAvatar();
    } else {
      this.setData({
        userInfo: null,
        works: [],
        liked: [],
        worksCount: 0,
        likedCount: 0,
        hiddenCount: 0,
        worksPage: 1,
        likedPage: 1,
        worksHasMore: true,
        likedHasMore: true,
        _loaded: false
      });
    }
  },

  async _fetchUserInfoWithAvatar() {
    const wasLoggedIn = app.checkLogin();
    try {
      const valid = await app.syncSession({ toast: wasLoggedIn });
      if (!valid) {
        this.updateUserStatus();
        return;
      }
      let userInfo = app.globalData.userInfo;
      if (!userInfo) return;
      if (!userInfo.avatar) {
        userInfo = { ...userInfo, avatar: '/assets/icons/default-avatar.png' };
      }
      if (userInfo.region && userInfo.region.length >= 2) {
        userInfo.regionDisplay = userInfo.region[0].slice(0, -1) + '·' + userInfo.region[1];
      }
      if (userInfo.gender === 'male') {
        userInfo.genderDisplay = '男';
      } else if (userInfo.gender === 'female') {
        userInfo.genderDisplay = '女';
      }
      app.globalData.userInfo = userInfo;
      wx.setStorageSync('userInfo', userInfo);
      this.setData({ userInfo });
    } catch (e) {
      console.error('获取用户信息失败:', e);
      if (!app.checkLogin()) {
        this.updateUserStatus();
        return;
      }
      const userInfo = app.globalData.userInfo;
      if (userInfo) {
        if (!userInfo.avatar) {
          userInfo.avatar = '/assets/icons/default-avatar.png';
        }
        if (userInfo.region && userInfo.region.length >= 2) {
          userInfo.regionDisplay = userInfo.region[0].slice(0, -1) + '·' + userInfo.region[1];
        }
        this.setData({ userInfo });
      }
    }
  },

  async fetchLatestUserInfo() {
    await this._fetchUserInfoWithAvatar();
  },

  async loadData() {
    this.setData({ loading: true });
    this.setData({
      works: [],
      liked: [],
      worksPage: 1,
      likedPage: 1,
      worksHasMore: true,
      likedHasMore: true
    });
    try {
      await Promise.all([
        this.loadWorks(true),
        this.loadWorks(true, 'hidden'),
        this.loadLiked(true)
      ]);
    } finally {
      this.setData({ loading: false });
      this._loaded = true;
    }
  },

  async loadWorks(reset = false, silentFilter = null) {
    const filter = silentFilter ?? this.data.worksFilter;
    const hidden = filter === 'hidden' ? true : undefined;

    if (reset && !silentFilter) {
      this.setData({ works: [], worksPage: 1, worksHasMore: true });
    }
    if (!this.data.worksHasMore && !silentFilter) return;

    const page = reset ? 1 : this.data.worksPage;
    try {
      const res = await postApi.getMyWorks({ page, pageSize: this.data._pageSize, hidden });
      if (res.success) {
        const photos = (res.data.posts || []).map(p => ({
          ...p,
          id: p._id,
          imageUrl: p.imageUrl
        }));
        const works = reset ? photos : [...this.data.works, ...photos];
        const setData = {};
        if (!silentFilter) {
          setData.works = works;
          setData.worksPage = page + 1;
          setData.worksHasMore = res.data.hasMore !== false;
        }
        if (filter === 'hidden') {
          setData.hiddenCount = res.data.total || photos.length;
        } else {
          setData.worksCount = res.data.total || works.length;
        }
        this.setData(setData);
      }
    } catch (e) {
      console.error('加载作品失败:', e);
    }
  },

  onWorksFilterTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.activeTab === tab) {
      if (this.data.worksDropdownOpen) {
        this.setData({ worksDropdownOpen: false });
        return;
      } else {
        this._openWorksDropdown();
      }
    } else {
      this.setData({ worksDropdownOpen: false });
      this.switchTab({ currentTarget: { dataset: { tab } } });
    }
  },

  _openWorksDropdown() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#works-tab').boundingClientRect(tabRect => {
      if (!tabRect) return;
      const top = tabRect.bottom;
      const tabCenter = tabRect.left + tabRect.width / 2;
      const screenWidth = wx.getSystemInfoSync().windowWidth;
      const dropdownWidthRpx = 300;
      const dropdownWidthPx = dropdownWidthRpx / (750 / screenWidth);
      const sideMarginPx = 24 / (750 / screenWidth);
      const rawLeft = tabCenter - dropdownWidthPx / 2;
      const dropdownLeft = Math.max(sideMarginPx, Math.min(rawLeft, screenWidth - dropdownWidthPx - sideMarginPx));
      const pxPerRpx = screenWidth / 750;
      const triangleLeftRpx = (tabCenter - dropdownLeft) / pxPerRpx - 18;
      this.setData({ dropdownTop: top, dropdownLeft: dropdownLeft, triangleLeft: triangleLeftRpx, worksDropdownOpen: true });
    }).exec();
  },

  closeWorksDropdown() {
    this.setData({ worksDropdownOpen: false });
  },

  onPageScroll() {
    if (this.data.worksDropdownOpen) {
      this.setData({ worksDropdownOpen: false });
    }
  },

  noop() {},

  onWorksFilterChange(e) {
    const filter = e.currentTarget.dataset.filter;
    if (filter === this.data.worksFilter && this.data.worksDropdownOpen) {
      this.setData({ worksDropdownOpen: false });
      return;
    }
    this.setData({ worksFilter: filter, worksDropdownOpen: false, works: [], worksPage: 1, worksHasMore: true });
    this.loadWorks(true);
  },

  async loadLiked(reset = false) {
    if (reset) {
      this.setData({ liked: [], likedPage: 1, likedHasMore: true });
    }
    if (!this.data.likedHasMore) return;

    const page = reset ? 1 : this.data.likedPage;
    try {
      const res = await postApi.getMyLiked({ page, pageSize: this.data._pageSize });
      if (res.success) {
        const photos = (res.data.posts || []).map(p => ({
          ...p,
          id: p._id,
          imageUrl: p.imageUrl
        }));
        const liked = reset ? photos : [...this.data.liked, ...photos];
        this.setData({
          liked,
          likedCount: res.data.total || liked.length,
          likedPage: page + 1,
          likedHasMore: res.data.hasMore !== false
        });
      }
    } catch (e) {
      console.error('加载赞过失败:', e);
    }
  },

  async loadMoreWorks() {
    if (this.data.worksLoadingMore || !this.data.worksHasMore) return;
    this.setData({ worksLoadingMore: true });
    try {
      await this.loadWorks(false);
    } finally {
      this.setData({ worksLoadingMore: false });
    }
  },

  async loadMoreLiked() {
    if (this.data.likedLoadingMore || !this.data.likedHasMore) return;
    this.setData({ likedLoadingMore: true });
    try {
      await this.loadLiked(false);
    } finally {
      this.setData({ likedLoadingMore: false });
    }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const index = tab === 'works' ? 0 : 1;
    this.setData({ activeTab: tab, currentTabIndex: index });
    this._checkLikedRefresh(tab);
  },

  onSwiperChange(e) {
    const index = e.detail.current;
    const tab = index === 0 ? 'works' : 'liked';
    this.setData({ activeTab: tab });
    this._checkLikedRefresh(tab);
  },

  _checkLikedRefresh(tab) {
    if (tab === 'liked' && this._likedNeedsRefresh) {
      this._likedNeedsRefresh = false;
      this.loadLiked(true);
    }
  },

  onNeedRefresh() {
    this._likedNeedsRefresh = true;
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const { openPostDetail } = require('../../../utils/openPostDetail');
    const post =
      this.data.works.find((p) => p.id === id) ||
      this.data.liked.find((p) => p.id === id);
    openPostDetail(post || { id });
  },

  goToUpload() {
    if (!this.data.isLoggedIn) {
      this.showLoginModal();
      return;
    }
    wx.navigateTo({ url: '/pages/upload/upload' });
  },

  goToHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goToLogin() {
    this.showLoginModal();
  },

  // ── 登录弹窗 ──
  showLoginModal() {
    this.setData({ loginModalShow: true });
  },

  onLoginModalClose() {
    this.setData({ loginModalShow: false });
  },

  onLoginSuccess() {
    this.updateUserStatus();
  },

  // ── 入口操作 ──
  onAvatarTap() {
    if (!this.data.isLoggedIn) {
      this.showLoginModal();
      return;
    }
    const avatar = this.data.userInfo && this.data.userInfo.avatar;
    if (!avatar || avatar.includes('default-avatar')) return;
    wx.previewImage({ urls: [avatar], current: avatar });
  },

  goToEditProfile() {
    if (!this.data.isLoggedIn) {
      this.showLoginModal();
      return;
    }
    wx.navigateTo({ url: '/pages/profile/edit-profile/edit-profile' });
  },

  onSettingsTap() {
    if (!this.data.isLoggedIn) {
      this.showLoginModal();
      return;
    }
    wx.navigateTo({ url: '/pages/profile/settings/settings' });
  },

  onFuncTap(e) {
    if (!this.data.isLoggedIn) {
      this.showLoginModal();
      return;
    }
    const func = e.currentTarget.dataset.func;
    if (func === 'comments') {
      wx.navigateTo({ url: '/pages/profile/comments/comments' });
    } else if (func === 'signin') {
      wx.navigateTo({ url: '/pages/profile/signin/signin' });
    } else if (func === 'stats') {
      wx.navigateTo({ url: '/pages/profile/stats/stats' });
    }
  },

  buyPoints() {
    showToast('购买积分功能开发中');
  },

  freePoints() {
    showToast('免费领积分功能开发中');
  },

  // ── 作品操作弹窗 ──
  _isPostEditable(createdAt) {
    if (!createdAt) return false;
    const ts = new Date(createdAt).getTime();
    if (!isFinite(ts)) return false;
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - ts < monthMs;
  },

  openPhotoAction(e) {
    const { id, title, description, createdAt, hidden } = e.currentTarget.dataset;
    this._postId = id;
    this._currentPhotoTitle = title || '';
    this._currentPhotoDescription = description || '';
    this._currentPhotoCreatedAt = createdAt || '';
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ hidden: true });
    this.setData({ showPhotoAction: true, currentPhotoHidden: !!hidden });
  },

  hidePhotoAction() {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ hidden: false });
    this.setData({ showPhotoAction: false });
    this._postId = null;
  },

  editPhotoTitle() {
    const id = this._postId;
    if (!id) return;
    const editable = this._isPostEditable(this._currentPhotoCreatedAt);
    this._editPostId = id;
    this.hidePhotoAction();

    this.setData({
      showEditPostModal: true,
      editPostTitle: this._currentPhotoTitle || '',
      editPostDescription: this._currentPhotoDescription || '',
      editPostEditable: editable,
    });
  },

  hideEditPostModal() {
    this._editPostId = null;
    this.setData({
      showEditPostModal: false,
      editPostTitle: '',
      editPostDescription: '',
      editPostEditable: true,
    });
  },

  onEditPostTitleInput(e) {
    this.setData({ editPostTitle: e.detail.value });
  },

  onEditPostDescInput(e) {
    this.setData({ editPostDescription: e.detail.value });
  },

  async saveEditPost() {
    if (!this.data.editPostEditable) return;
    const id = this._editPostId;
    if (!id) return;

    const newTitle = (this.data.editPostTitle || '').trim();
    const newDescription = (this.data.editPostDescription || '').trim();
    const oldTitle = (this._currentPhotoTitle || '').trim();
    const oldDescription = (this._currentPhotoDescription || '').trim();

    if (newTitle === oldTitle && newDescription === oldDescription) {
      this.hideEditPostModal();
      return;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    try {
      const result = await postApi.updatePost(id, {
        title: newTitle,
        description: newDescription,
      });
      wx.hideLoading();
      if (result.success) {
        const works = this.data.works.map((item) =>
          item.id === id
            ? { ...item, title: newTitle, description: newDescription }
            : item
        );
        this.setData({ works });
        this._currentPhotoTitle = newTitle;
        this._currentPhotoDescription = newDescription;
        this.hideEditPostModal();
        showToast('已保存');
      } else {
        showToast(result.message || '保存失败');
      }
    } catch (e) {
      wx.hideLoading();
      showToast('保存失败');
      console.error('编辑作品失败:', e);
    }
  },

  toggleHidePost() {
    console.log('[toggleHidePost] _postId:', this._postId, 'currentPhotoHidden:', this.data.currentPhotoHidden);
    const id = this._postId;
    if (!id) {
      showToast('缺少帖子ID');
      return;
    }
    const currentlyHidden = this.data.currentPhotoHidden;
    this.hidePhotoAction();

    wx.showLoading({ title: currentlyHidden ? '显示中...' : '隐藏中...', mask: true });
    const callData = { action: 'update', postId: id, data: { hidden: !currentlyHidden } };
    console.log('[toggleHidePost] calling cloud with:', JSON.stringify(callData));
    wx.cloud.callFunction({
      name: 'posts',
      data: callData
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        const filter = this.data.worksFilter;
        const setData = {};
        if (filter === 'all') {
          if (!currentlyHidden) {
            setData.works = this.data.works.filter(item => item.id !== id);
            setData.worksCount = Math.max(0, this.data.worksCount - 1);
            setData.hiddenCount = (this.data.hiddenCount || 0) + 1;
          } else {
            setData.hiddenCount = Math.max(0, (this.data.hiddenCount || 0) - 1);
          }
        } else if (filter === 'hidden') {
          if (currentlyHidden) {
            setData.works = this.data.works.filter(item => item.id !== id);
            setData.hiddenCount = Math.max(0, (this.data.hiddenCount || 0) - 1);
          }
        }
        setData.liked = this.data.liked.filter(item => item.id !== id);
        this.setData(setData);
        showToast(currentlyHidden ? '已显示' : '已隐藏');
      } else {
        showToast(res.result?.message || '操作失败');
      }
    }).catch(err => {
      wx.hideLoading();
      showToast('操作失败');
      console.error('[toggleHidePost]', err);
    });
  },

  deletePost() {
    const id = this._postId;
    this.hidePhotoAction();
    if (!id) return;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这张照片吗？',
      confirmColor: '#e02020',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...', mask: true });
          try {
            const result = await postApi.deletePost(id);
            wx.hideLoading();
            if (result.success) {
              const works = this.data.works.filter(item => item.id !== id);
              this.setData({ works, worksCount: Math.max(0, this.data.worksCount - 1) });
              this._likedNeedsRefresh = true;
              showToast('已删除');
            } else {
              console.error('[deletePost] 云函数返回失败:', result);
              showToast(result.message || '删除失败');
            }
          } catch (e) {
            wx.hideLoading();
            console.error('[deletePost] 调用异常:', e);
            showToast('删除失败: ' + (e.errMsg || e.message || '网络错误'));
          }
        }
      }
    });
  },

  stopPropagation() {}
});