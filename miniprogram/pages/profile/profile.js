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
    works: [],
    liked: [],
    worksCount: 0,
    likedCount: 0,
    loading: false,
    showPhotoAction: false,
    _currentPhotoId: null,
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
    // 从本地缓存获取基本信息
    let userInfo = app.globalData.userInfo;
    this.setData({ isLoggedIn, userInfo });
  },

  // 获取最新用户信息（仅头像）
  async fetchLatestUserInfo() {
    try {
      const res = await userApi.getCurrentUser();
      
      if (res.success && res.data && res.data.avatar) {
        const currentAvatar = this.data.userInfo?.avatar;
        const newAvatar = res.data.avatar;
        
        // 只有头像确实变化了才更新
        if (currentAvatar !== newAvatar) {
          const newUserInfo = {
            ...this.data.userInfo,
            ...res.data,
            avatar: newAvatar,
            avatarUpdateTime: Date.now()
          };
          app.globalData.userInfo = newUserInfo;
          wx.setStorageSync('userInfo', newUserInfo);
          this.setData({ userInfo: newUserInfo });
        }
      }
    } catch (e) {
      console.error('获取最新用户信息失败:', e);
    }
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
    if (reset) {
      this.setData({ works: [], worksPage: 1, worksHasMore: true });
    }
    if (!this.data.worksHasMore) return;

    const page = reset ? 1 : this.data.worksPage;
    try {
      const res = await postApi.getMyWorks({ page, pageSize: this.data._pageSize });
      if (res.success) {
        const photos = (res.data.posts || []).map(p => ({
          ...p,
          id: p._id,
          imageUrl: p.imageUrl
        }));
        const works = reset ? photos : [...this.data.works, ...photos];
        this.setData({
          works,
          worksCount: res.data.total || works.length,
          worksPage: page + 1,
          worksHasMore: res.data.hasMore !== false
        });
      }
    } catch (e) {
      console.error('加载作品失败:', e);
    }
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

  buyPoints() {
    showToast('购买积分功能开发中');
  },

  freePoints() {
    showToast('免费领积分功能开发中');
  },

  // 微信头像选择回调
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    if (!avatarUrl) return;
    this.uploadAvatar(avatarUrl);
  },

  // 打开作品操作弹窗
  openPhotoAction(e) {
    const { id, title } = e.currentTarget.dataset;
    this._currentPhotoId = id;
    this._currentPhotoTitle = title || '';
    this.setData({ showPhotoAction: true });
  },

  // 关闭作品操作弹窗
  hidePhotoAction() {
    this.setData({ showPhotoAction: false });
    this._currentPhotoId = null;
  },

  // 编辑标题
  editPhotoTitle() {
    const id = this._currentPhotoId;
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

  // 删除作品
  deletePhoto() {
    const id = this._currentPhotoId;
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
              showToast(result.message || '删除失败');
            }
          } catch (e) {
            wx.hideLoading();
            showToast('删除失败');
            console.error('删除作品失败:', e);
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

      // 保存到数据库（存 fileID，读取时由云函数转换为临时链接）
      const saveRes = await userApi.updateUserInfo(uploadRes.fileID);
      
      if (!saveRes.success) {
        hideLoading();
        showToast('保存失败');
        return;
      }

      // 更新本地状态（存 fileID，显示时会通过云函数转换）
      const newUserInfo = {
        ...app.globalData.userInfo,
        avatar: uploadRes.fileID,
        avatarUpdateTime: Date.now()
      };
      app.globalData.userInfo = newUserInfo;
      wx.setStorageSync('userInfo', newUserInfo);
      this.setData({ userInfo: newUserInfo });
      
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