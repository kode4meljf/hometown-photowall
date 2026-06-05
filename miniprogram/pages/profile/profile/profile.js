// pages/profile/profile.js
const { postApi } = require('../../../utils/api');
const { showToast, showLoading, hideLoading, showSuccess, showContentAuditModal, isContentAuditFailure } = require('../../../utils/util');
const { isLoggedIn, ensureSession } = require('../../../utils/session');
const { POST_STATUS, getEmptyWorksText, isUserToggleableStatus, POST_STATUS_USER_BADGE } = require('../../../utils/postStatus');
const { mapApiErrorMessage } = require('../../../utils/apiErrors');
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
    currentPhotoStatus: POST_STATUS.RELEASED,
    emptyWorksText: '暂无作品',
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
    this.setData({
      POST_STATUS,
      postStatusUserBadge: POST_STATUS_USER_BADGE,
    });
    this.updateUserStatus();
  },

  onShow() {
    setTimeout(() => {
      const tabBar = this.getTabBar && this.getTabBar();
      if (tabBar) tabBar.setData({ selected: 2 });
    }, 0);

    const publishFeedback = app.globalData.publishFeedback;
    if (publishFeedback && publishFeedback.res) {
      app.globalData.publishFeedback = null;
      const { res } = publishFeedback;
      if (res.success) {
        const isReviewing = res.data && res.data.status === 'reviewing';
        if (!isReviewing) {
          showSuccess('发布成功，作品已展示在首页');
        }
        app.globalData.profileNeedRefresh = true;
      } else if (isContentAuditFailure(res)) {
        showContentAuditModal(res.message, res.code);
      } else {
        showToast(mapApiErrorMessage(res));
      }
    }

    const needRefresh = app.globalData.profileNeedRefresh;
    if (needRefresh) {
      app.globalData.profileNeedRefresh = false;
    }
    this.updateUserStatus();
    if (isLoggedIn() && (needRefresh || !this._loaded)) {
      if (this.data.worksFilter !== 'all' && this.data.worksFilter !== POST_STATUS.HIDDEN) {
        this.setData({ worksFilter: 'all', emptyWorksText: getEmptyWorksText('all') });
      }
      this.loadData();
    } else if (isLoggedIn() && app.globalData.profileNeedUserRefresh) {
      app.globalData.profileNeedUserRefresh = false;
      this._fetchUserInfoWithAvatar();
    }
  },

  onReachBottom() {
    if (!isLoggedIn()) return;
    if (this.data.activeTab === 'liked') {
      this.loadMoreLiked();
    } else {
      this.loadMoreWorks();
    }
  },

  onPullDownRefresh() {
    if (!isLoggedIn()) {
      wx.stopPullDownRefresh();
      return;
    }
    this.refreshData();
  },

  onWorksScrollToLower() {
    if (!isLoggedIn()) return;
    this.loadMoreWorks();
  },

  onLikedScrollToLower() {
    if (!isLoggedIn()) return;
    this.loadMoreLiked();
  },

  async refreshData() {
    if (isLoggedIn()) {
      await this.fetchLatestUserInfo();
    }
    if (isLoggedIn()) {
      await this.loadData();
      if (this.data.activeTab === 'liked') {
        await this.loadLiked(true);
        this._likedLoaded = true;
      }
    }
    wx.stopPullDownRefresh();
  },

  updateUserStatus() {
    const loggedIn = isLoggedIn();
    this.setData({ isLoggedIn: loggedIn });
    if (loggedIn) {
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
        likedHasMore: true
      });
      this._loaded = false;
    }
  },

  async _fetchUserInfoWithAvatar() {
    const wasLoggedIn = isLoggedIn();
    try {
      const valid = await ensureSession({ toast: wasLoggedIn });
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
      if (!isLoggedIn()) {
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
    if (!isLoggedIn()) return;
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
      await Promise.all([this.loadWorks(true), this.loadStatusCounts()]);
    } finally {
      this.setData({ loading: false });
      this._loaded = true;
    }
  },

  async loadStatusCounts() {
    if (!isLoggedIn()) return;
    try {
      const hiddenRes = await postApi.getMyWorks({ page: 1, pageSize: 1, status: POST_STATUS.HIDDEN });
      if (hiddenRes.success) {
        this.setData({ hiddenCount: hiddenRes.data.total || 0 });
      }
    } catch (e) {
      console.error('加载作品状态数量失败:', e);
    }
  },

  async loadWorks(reset = false, silentFilter = null) {
    if (!isLoggedIn()) return;
    const filter = silentFilter ?? this.data.worksFilter;
    if (filter === POST_STATUS.REVIEWING || filter === POST_STATUS.REJECTED) {
      this.setData({ worksFilter: 'all', emptyWorksText: getEmptyWorksText('all') });
    }
    const effectiveFilter = (filter === POST_STATUS.REVIEWING || filter === POST_STATUS.REJECTED)
      ? 'all'
      : filter;
    const status = effectiveFilter === POST_STATUS.HIDDEN ? POST_STATUS.HIDDEN : undefined;

    if (reset && !silentFilter) {
      this.setData({ works: [], worksPage: 1, worksHasMore: true });
    }
    if (!this.data.worksHasMore && !silentFilter) return;

    const page = reset ? 1 : this.data.worksPage;
    try {
      const res = await postApi.getMyWorks({ page, pageSize: this.data._pageSize, status });
      if (!isLoggedIn()) return;
      if (res.success) {
        const photos = (res.data.posts || []).map(p => ({
          ...p,
          id: p._id,
          imageUrl: p.imageUrl,
          status: p.status === 'failed' ? POST_STATUS.REJECTED : p.status,
        }));
        let works = reset ? photos : [...this.data.works, ...photos];
        works = this._dedupeWorksById(works);
        const setData = {};
        if (!silentFilter) {
          setData.works = works;
          setData.worksPage = page + 1;
          setData.worksHasMore = res.data.hasMore !== false;
        }
        if (effectiveFilter === POST_STATUS.HIDDEN) {
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

  _dedupeWorksById(works) {
    const seenIds = new Set();
    return (works || []).filter((w) => {
      const id = w && w.id;
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
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

  onWorksFilterChange(e) {
    if (!isLoggedIn()) return;
    const filter = e.currentTarget.dataset.filter;
    if (filter === this.data.worksFilter && this.data.worksDropdownOpen) {
      this.setData({ worksDropdownOpen: false });
      return;
    }
    this.setData({ worksFilter: filter, worksDropdownOpen: false, works: [], worksPage: 1, worksHasMore: true, emptyWorksText: getEmptyWorksText(filter) });
    this.loadWorks(true);
  },

  async loadLiked(reset = false) {
    if (!isLoggedIn()) return;
    if (reset) {
      this.setData({ liked: [], likedPage: 1, likedHasMore: true });
    }
    if (!this.data.likedHasMore) return;

    const page = reset ? 1 : this.data.likedPage;
    try {
      const res = await postApi.getMyLiked({ page, pageSize: this.data._pageSize });
      if (!isLoggedIn()) return;
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
    if (!isLoggedIn()) return;
    if (this.data.worksLoadingMore || !this.data.worksHasMore) return;
    this.setData({ worksLoadingMore: true });
    try {
      await this.loadWorks(false);
    } finally {
      this.setData({ worksLoadingMore: false });
    }
  },

  async loadMoreLiked() {
    if (!isLoggedIn()) return;
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
    if (!isLoggedIn()) return;
    if (tab !== 'liked') return;
    if (this._likedNeedsRefresh) {
      this._likedNeedsRefresh = false;
      this.loadLiked(true);
      this._likedLoaded = true;
      return;
    }
    if (!this._likedLoaded) {
      this.loadLiked(true);
      this._likedLoaded = true;
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const post =
      this.data.works.find((p) => p.id === id) ||
      this.data.liked.find((p) => p.id === id);
    const status = post && post.status;
    if (status === POST_STATUS.REVIEWING) {
      showToast('审核中，请耐心等待');
      return;
    }
    if (status === POST_STATUS.REJECTED || status === 'failed') {
      wx.navigateTo({ url: `/pages/upload/upload?mode=resubmit&postId=${id}` });
      return;
    }
    const { openPostDetail } = require('../../../utils/openPostDetail');
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

  // ── 作品操作弹窗 ──
  _isPostEditable(createdAt) {
    if (!createdAt) return false;
    const ts = new Date(createdAt).getTime();
    if (!isFinite(ts)) return false;
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - ts < monthMs;
  },

  openPhotoAction(e) {
    const { id, title, description, createdAt, status } = e.currentTarget.dataset;
    this._postId = id;
    this._currentPhotoTitle = title || '';
    this._currentPhotoDescription = description || '';
    this._currentPhotoCreatedAt = createdAt || '';
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ hidden: true });
    this.setData({
      showPhotoAction: true,
      currentPhotoStatus: status,
    });
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
    if (this.data.currentPhotoStatus === POST_STATUS.REVIEWING) {
      showToast('审核中的作品暂不可编辑');
      return;
    }
    if (this.data.currentPhotoStatus === POST_STATUS.REJECTED) {
      showToast('请使用重新提交修改作品');
      return;
    }
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

    showLoading('保存中...');
    try {
      const result = await postApi.updatePost(id, {
        title: newTitle,
        description: newDescription,
      });
      hideLoading();
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
      hideLoading();
      showToast('保存失败');
      console.error('编辑作品失败:', e);
    }
  },

  async toggleHidePost() {
    const id = this._postId;
    if (!id) {
      showToast('缺少帖子ID');
      return;
    }
    const currentStatus = this.data.currentPhotoStatus;
    if (!isUserToggleableStatus(currentStatus)) {
      showToast('当前状态不可隐藏');
      return;
    }
    const nextStatus = currentStatus === POST_STATUS.HIDDEN
      ? POST_STATUS.RELEASED
      : POST_STATUS.HIDDEN;
    this.hidePhotoAction();

    showLoading(nextStatus === POST_STATUS.RELEASED ? '显示中...' : '隐藏中...');
    try {
      const res = await postApi.updatePost(id, { status: nextStatus });
      hideLoading();
      if (res && res.success) {
        const filter = this.data.worksFilter;
        const setData = {};
        if (filter === 'all') {
          if (nextStatus === POST_STATUS.HIDDEN) {
            setData.works = this.data.works.filter(item => item.id !== id);
            setData.worksCount = Math.max(0, this.data.worksCount - 1);
            setData.hiddenCount = (this.data.hiddenCount || 0) + 1;
          } else {
            setData.hiddenCount = Math.max(0, (this.data.hiddenCount || 0) - 1);
          }
        } else if (filter === POST_STATUS.HIDDEN) {
          if (nextStatus === POST_STATUS.RELEASED) {
            setData.works = this.data.works.filter(item => item.id !== id);
            setData.hiddenCount = Math.max(0, (this.data.hiddenCount || 0) - 1);
          }
        }
        if (nextStatus === POST_STATUS.HIDDEN) {
          setData.liked = this.data.liked.filter(item => item.id !== id);
        }
        this.setData(setData);
        showToast(nextStatus === POST_STATUS.RELEASED ? '已显示' : '已隐藏');
      } else {
        showToast(res?.message || '操作失败');
      }
    } catch (err) {
      hideLoading();
      showToast('操作失败');
      console.error('[toggleHidePost]', err);
    }
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
          showLoading('删除中...');
          try {
            const result = await postApi.deletePost(id);
            hideLoading();
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
            hideLoading();
            console.error('[deletePost] 调用异常:', e);
            showToast('删除失败: ' + (e.errMsg || e.message || '网络错误'));
          }
        }
      }
    });
  },

  stopPropagation() {}
});