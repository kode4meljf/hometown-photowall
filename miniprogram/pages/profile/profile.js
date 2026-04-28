// pages/profile/profile.js
const { postApi, userApi } = require('../../utils/api');
const { showToast } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    isLoggedIn: false,
    userInfo: null,
    activeTab: 'works',
    currentTabIndex: 0,  // 0=作品, 1=赞过
    worksFilter: 'all',  // 'all' | 'hidden'
    worksDropdownOpen: false,  // 下拉弹窗是否展开
    dropdownTop: 0,
    dropdownLeft: 0,
    triangleLeft: 0,
    works: [],
    liked: [],
    worksCount: 0,
    likedCount: 0,
    loading: false,
    hiddenCount: 0,       // 隐藏作品数量
    showPhotoAction: false,
    currentPhotoHidden: false,
    _postId: null,
    // 分页
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
    // 更新自定义 tabBar 选中状态
    setTimeout(() => {
      const tabBar = this.getTabBar && this.getTabBar();
      if (tabBar) {
        tabBar.setData({ selected: 2 });
      }
    }, 0);
    this.updateUserStatus();
    // 只在首次加载时获取数据，不在每次 onShow 都刷新
    if (this.data.isLoggedIn && !this._loaded) {
      this.loadData();
    }
    // 从编辑页返回时，刷新用户信息（昵称/头像/标签等）
    if (this.data.isLoggedIn && this._loaded) {
      this._fetchUserInfoWithAvatar();
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.activeTab === 'liked') {
      this.loadMoreLiked();
    } else {
      this.loadMoreWorks();
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.refreshData();
  },

  async refreshData() {
    // 先从数据库获取最新用户信息
    if (this.data.isLoggedIn) {
      await this.fetchLatestUserInfo();
    }
    // 再加载其他数据
    if (this.data.isLoggedIn) {
      await this.loadData();
    }
    wx.stopPullDownRefresh();
  },

  updateUserStatus() {
    const isLoggedIn = app.checkLogin();
    this.setData({ isLoggedIn });
    
    // 已登录时，主动获取完整用户信息（含转换后的头像 URL）
    if (isLoggedIn) {
      this._fetchUserInfoWithAvatar();
    } else {
      this.setData({ userInfo: null });
    }
  },
  
  // 获取用户信息
  async _fetchUserInfoWithAvatar() {
    try {
      const res = await userApi.getCurrentUser();
      if (res.success && res.data) {
        let userInfo = res.data;
        if (!userInfo.avatar) {
          userInfo = { ...userInfo, avatar: '/assets/icons/default-avatar.png' };
        }
        // 格式化地区显示：广东·深圳
        if (userInfo.region && userInfo.region.length >= 2) {
          userInfo.regionDisplay = userInfo.region[0].slice(0, -1) + '·' + userInfo.region[1];
        }
        app.globalData.userInfo = userInfo;
        wx.setStorageSync('userInfo', userInfo);
        this.setData({ userInfo });
      }
    } catch (e) {
      console.error('获取用户信息失败:', e);
      // 降级：使用本地缓存
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

  // 获取最新用户信息
  async fetchLatestUserInfo() {
    await this._fetchUserInfoWithAvatar();
  },

  async loadData() {
    this.setData({ loading: true });
    // 重置分页状态
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
        this.loadLiked(true)
      ]);
    } finally {
      this.setData({ loading: false });
      this._loaded = true;
    }
  },

  async loadWorks(reset = false) {
    const filter = this.data.worksFilter;
    // hidden: true=仅隐藏帖子, false=仅可见帖子, undefined=全部帖子
    const hidden = filter === 'hidden' ? true : (filter === 'visible' ? false : undefined);

    if (reset) {
      this.setData({ works: [], worksPage: 1, worksHasMore: true });
    }
    if (!this.data.worksHasMore) return;

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
        const setData = {
          works,
          worksPage: page + 1,
          worksHasMore: res.data.hasMore !== false
        };
        // 分别维护可见计数和隐藏计数，切换时互不覆盖
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

  // 点击作品 Tab：已选中则弹窗，未选中则切换过来
  onWorksFilterTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.activeTab === tab) {
      if (this.data.worksDropdownOpen) {
        // 已展开 → 关闭
        this.setData({ worksDropdownOpen: false });
        return;
      } else {
        // 要展开 → 先查 Tab 坐标，再定位弹窗
        this._openWorksDropdown();
      }
    } else {
      this.setData({ worksDropdownOpen: false });
      this.switchTab({ currentTarget: { dataset: { tab } } });
    }
  },

  // 查询作品 Tab 坐标，动态定位弹窗居中于 Tab 正下方
  _openWorksDropdown() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#works-tab').boundingClientRect(tabRect => {
      if (!tabRect) return;
      const top = tabRect.bottom;
      const tabCenter = tabRect.left + tabRect.width / 2;
      // dropdown 与屏幕左右各留 24rpx 边距，弹窗水平居中于 Tab
      const screenWidth = wx.getSystemInfoSync().windowWidth;
      const dropdownWidthRpx = 300;
      const dropdownWidthPx = dropdownWidthRpx / (750 / screenWidth); // rpx → px
      const sideMarginPx = 24 / (750 / screenWidth);                  // 24rpx → px
      const rawLeft = tabCenter - dropdownWidthPx / 2;
      const dropdownLeft = Math.max(sideMarginPx, Math.min(rawLeft, screenWidth - dropdownWidthPx - sideMarginPx));
      // 三角尖端（宽36rpx的一半 = 18rpx）要对准 Tab 中心
      const pxPerRpx = screenWidth / 750;
      const triangleLeftRpx = (tabCenter - dropdownLeft) / pxPerRpx - 18;
      this.setData({ dropdownTop: top, dropdownLeft: dropdownLeft, triangleLeft: triangleLeftRpx, worksDropdownOpen: true });
    }).exec();
  },

  // 关闭筛选弹窗
  closeWorksDropdown() {
    this.setData({ worksDropdownOpen: false });
  },

  // 页面滚动时关闭弹窗（iOS 弹性滚动时 onPageScroll 可能不触发，用 touchstart 兜底）
  onPageScroll() {
    if (this.data.worksDropdownOpen) {
      this.setData({ worksDropdownOpen: false });
    }
  },

  onPageTouch() {
    if (this.data.worksDropdownOpen) {
      this.setData({ worksDropdownOpen: false });
    }
  },

  // 切换作品筛选：全部 / 已隐藏
  onWorksFilterChange(e) {
    const filter = e.currentTarget.dataset.filter;
    if (filter === this.data.worksFilter && this.data.worksDropdownOpen) {
      // 相同选项点击 → 收起弹窗
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

  // 加载更多作品
  async loadMoreWorks() {
    if (this.data.worksLoadingMore || !this.data.worksHasMore) return;
    this.setData({ worksLoadingMore: true });
    try {
      await this.loadWorks(false);
    } finally {
      this.setData({ worksLoadingMore: false });
    }
  },

  // 加载更多赞过
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

  // Swiper 左右滑动切换
  onSwiperChange(e) {
    const index = e.detail.current;
    const tab = index === 0 ? 'works' : 'liked';
    this.setData({ activeTab: tab });
    this._checkLikedRefresh(tab);
  },

  // 检查赞过列表是否需要刷新
  _checkLikedRefresh(tab) {
    if (tab === 'liked' && this._likedNeedsRefresh) {
      this._likedNeedsRefresh = false;
      this.loadLiked(true);
    }
  },

  // detail 页点赞后回调（onUnload → prevPage.onNeedRefresh）
  onNeedRefresh() {
    this._likedNeedsRefresh = true;
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  goToUpload() {
    if (!this.data.isLoggedIn) {
      this.goToLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/upload/upload' });
  },

  goToHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goToLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  goToEditProfile() {
    wx.navigateTo({ url: '/pages/edit-profile/edit-profile' });
  },

  buyPoints() {
    showToast('购买积分功能开发中');
  },

  freePoints() {
    showToast('免费领积分功能开发中');
  },

  // 常用功能3宫格点击
  onFuncTap(e) {
    const func = e.currentTarget.dataset.func;
    if (func === 'comments') {
      wx.navigateTo({ url: '/pages/comments/comments' });
    } else if (func === 'signin') {
      wx.showToast({ title: '每日签到功能开发中', icon: 'none' });
    } else if (func === 'stats') {
      wx.showToast({ title: '数据统计功能开发中', icon: 'none' });
    }
  },

  // 点击头像查看大图
  onAvatarTap() {
    const avatar = this.data.userInfo.avatar;
    if (!avatar || avatar.includes('default-avatar')) return;
    wx.previewImage({
      urls: [avatar],
      current: avatar,
    });
  },

  // 打开作品操作弹窗
  openPhotoAction(e) {
    const { id, title, hidden } = e.currentTarget.dataset;
    this._postId = id;
    this._currentPhotoTitle = title || '';
    // 隐藏 TabBar
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ hidden: true });
    this.setData({ showPhotoAction: true, currentPhotoHidden: !!hidden });
  },

  // 关闭作品操作弹窗
  hidePhotoAction() {
    // 恢复 TabBar
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) tabBar.setData({ hidden: false });
    this.setData({ showPhotoAction: false });
    this._postId = null;
  },

  // 编辑标题
  editPhotoTitle() {
    const id = this._postId;
    const currentTitle = this._currentPhotoTitle || '';
    this.hidePhotoAction();
    if (!id) return;

    wx.showModal({
      title: '编辑标题',
      editable: true,
      placeholderText: '请输入标题',
      defaultText: currentTitle,
      success: async (res) => {
        if (res.confirm && res.content && res.content.trim() !== currentTitle) {
          const newTitle = res.content.trim();
          wx.showLoading({ title: '保存中...', mask: true });
          try {
            const result = await postApi.updatePost(id, { title: newTitle });
            wx.hideLoading();
            if (result.success) {
              // 更新本地数据
              const works = this.data.works.map(item =>
                item.id === id ? { ...item, title: newTitle } : item
              );
              this.setData({ works });
              showToast('已保存');
            } else {
              showToast(result.message || '保存失败');
            }
          } catch (e) {
            wx.hideLoading();
            showToast('保存失败');
            console.error('编辑标题失败:', e);
          }
        }
      }
    });
  },

  // 切换隐藏/显示作品
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
    wx.cloud.callFunction({
      name: 'posts',
      data: {
        action: 'update',
        postId: id,
        data: { hidden: !currentlyHidden }
      }
    }).then(res => {
      wx.hideLoading();
      if (res.result && res.result.success) {
        // 更新本地数据
        // 乐观更新：本地列表和计数同步
        const updateList = (list) => list.map(item =>
          item.id === id ? { ...item, hidden: !currentlyHidden } : item
        );
        const filter = this.data.worksFilter;
        const setData = { works: updateList(this.data.works), liked: updateList(this.data.liked) };
        // 全部列表：隐藏时可见计数-1、隐藏计数+1，显示时反过来
        if (filter === 'all') {
          if (currentlyHidden) {
            setData.worksCount = Math.max(0, this.data.worksCount - 1);
            setData.hiddenCount = (this.data.hiddenCount || 0) + 1;
          } else {
            setData.worksCount = this.data.worksCount + 1;
            setData.hiddenCount = Math.max(0, (this.data.hiddenCount || 0) - 1);
          }
        } else if (filter === 'hidden') {
          // 已隐藏列表：操作后该帖从列表消失，hiddenCount-1
          setData.hiddenCount = Math.max(0, (this.data.hiddenCount || 0) - 1);
        }
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

  // 删除帖子
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
              // 从列表中移除
              const works = this.data.works.filter(item => item.id !== id);
              this.setData({ works, worksCount: Math.max(0, this.data.worksCount - 1) });
              this._likedNeedsRefresh = true;  // 被删的可能在赞过列表里
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

  stopPropagation() {
    // 阻止事件冒泡
  },

  // 拍照
  takePhoto() {
    this.hideAvatarModal();
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.uploadAvatar(res.tempFiles[0].tempFilePath);
      }
    });
  },

  // 从相册选择
  chooseFromAlbum() {
    this.hideAvatarModal();
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.uploadAvatar(res.tempFiles[0].tempFilePath);
      }
    });
  },

  // 上传头像
  async uploadAvatar(filePath) {
    showLoading('上传中...');
    try {
      // 上传到云存储
      const cloudPath = `avatars/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath });
      
      if (!uploadRes.fileID) {
        hideLoading();
        showToast('上传失败');
        return;
      }

      // 保存到数据库（存 fileID）
      const saveRes = await userApi.updateUserInfo(uploadRes.fileID);
      
      if (!saveRes.success) {
        hideLoading();
        showToast('保存失败');
        return;
      }

      // 重新获取用户信息（云函数会转换 cloud:// → HTTPS 临时链接）
      await this._fetchUserInfoWithAvatar();
      
      hideLoading();
      showToast('头像已更新');
      
    } catch (e) {
      hideLoading();
      showToast('上传失败');
      console.error('上传头像失败:', e);
    }
  }
});

// 辅助函数
function showLoading(title) {
  wx.showLoading({ title, mask: true });
}

function hideLoading() {
  wx.hideLoading();
}