// pages/index/index.js
const { photoApi } = require('../../utils/api');
const { showToast } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    photos: [],
    leftList: [],   // 左列
    rightList: [],  // 右列
    leftHeight: 0,  // 左列累计高度
    rightHeight: 0, // 右列累计高度
    categories: [{ id: 0, name: '全部分类' }],
    locations: ['全部地点'],
    categoryText: '分类',
    locationText: '地点',
    sortText: '最新',
    sortOptions: [
      { value: 'latest', label: '最新' },
      { value: 'likes', label: '最多赞' },
      { value: 'views', label: '最多浏览' }
    ],
    selectedCategory: '',
    selectedLocation: '',
    sortBy: 'latest',
    keyword: '',
    loading: false,
    loadingMore: false,
    hasMore: true,
    _loaded: false
  },

  onLoad() {
    this.loadData();
  },

  onShow() {
    if (this._needRefresh) {
      this._needRefresh = false;
      this.refreshPhotos();
    }
  },

  onReachBottom() {
    this.loadMorePhotos();
  },

  onPullDownRefresh() {
    this.refreshPhotos().then(() => wx.stopPullDownRefresh());
  },

  // 接收刷新通知
  onNeedRefresh() {
    this._needRefresh = true;
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      await Promise.all([
        this.loadPhotos(true),
        this.loadCategories(),
        this.loadLocations()
      ]);
    } finally {
      this.setData({ loading: false, _loaded: true });
    }
  },

  // 刷新（重置分页）
  async refreshPhotos() {
    await this.loadPhotos(true);
  },

  // 加载照片
  async loadPhotos(reset = false) {
    if (reset) {
      this.setData({ photos: [], leftList: [], rightList: [], leftHeight: 0, rightHeight: 0, hasMore: true });
    }
    if (!this.data.hasMore) return;

    if (reset) this.setData({ loading: true });
    else this.setData({ loadingMore: true });

    try {
      const page = reset ? 1 : Math.ceil(this.data.photos.length / 20) + 1;
      const res = await photoApi.getPhotos({
        category: this.data.selectedCategory,
        location: this.data.selectedLocation,
        keyword: this.data.keyword,
        sort: this.data.sortBy,
        page,
        pageSize: 20
      });

      if (res.success) {
        const newPhotos = (res.data.posts || []).map(p => {
          const d = p.createdAt ? new Date(p.createdAt) : null;
          let _formattedDate = '';
          if (d && !isNaN(d.getTime())) {
            _formattedDate = d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
          }
          return {
            ...p,
            id: p._id,
            liked: !!p.liked,
            imageUrl: p.imageUrl,
            _formattedDate,
            authorInitial: (p.author || '?').charAt(0).toUpperCase()
          };
        });

        const photos = reset ? newPhotos : [...this.data.photos, ...newPhotos];
        const hasMore = res.data.hasMore !== false && newPhotos.length > 0;

        // 瀑布流分配
        this._distributeWaterfall(newPhotos, reset);

        this.setData({ photos, hasMore });
      }
    } catch (e) {
      showToast('加载失败');
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  // 瀑布流分配算法
  _distributeWaterfall(photos, reset = false) {
    // 获取卡片宽度（px / rpx 比例，iPhone6≈0.5）
    const sysInfo = wx.getSystemInfoSync();
    const screenWidth = sysInfo.windowWidth;
    const rpxRatio = screenWidth / 750;
    // 把屏幕宽转成 rpx，减 padding+gap，除 2 得每列宽度（rpx）
    const cardWidthRpx = (screenWidth / rpxRatio - 20 * 2 - 10) / 2;
    // 转回 px：rpx × rpx比例 = px（_renderHeight 需要的单位）
    const cardWidthPx = cardWidthRpx * rpxRatio;
    
    // info 区域高度（标题 + padding，估算 80rpx）
    const infoHeight = 80 * rpxRatio;

    let leftHeight = reset ? 0 : this.data.leftHeight;
    let rightHeight = reset ? 0 : this.data.rightHeight;
    let leftList = reset ? [] : [...this.data.leftList];
    let rightList = reset ? [] : [...this.data.rightList];

    photos.forEach(photo => {
      // ratio = height / width（高宽比），幂函数压缩极端值，减小高度差
      const rawRatio = photo.aspectRatio || 1;
      const safeRatio = Math.min(Math.max(rawRatio, 0.6), 1.8);
      const compressedRatio = Math.pow(safeRatio, 0.4);  // ratio^0.4 压缩
      photo._renderWidth = cardWidthPx;
      photo._renderHeight = cardWidthPx * compressedRatio;
      photo._renderHeightRpx = cardWidthRpx * compressedRatio;
      const totalHeight = photo._renderHeight + infoHeight;

      // 加权平衡：高度优先，但限制单列图片数差不超过1
      if (leftHeight <= rightHeight) {
        if (leftList.length - rightList.length > 1) {
          rightList.push(photo);
          rightHeight += totalHeight;
        } else {
          leftList.push(photo);
          leftHeight += totalHeight;
        }
      } else {
        if (rightList.length - leftList.length > 1) {
          leftList.push(photo);
          leftHeight += totalHeight;
        } else {
          rightList.push(photo);
          rightHeight += totalHeight;
        }
      }
    });

    this.setData({ leftList, rightList, leftHeight, rightHeight });
  },

  // 加载更多（触底）
  async loadMorePhotos() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    await this.loadPhotos(false);
  },

  async loadCategories() {
    try {
      const res = await photoApi.getCategories();
      if (res.success) {
        this.setData({ categories: [{ id: 0, name: '全部分类' }, ...res.data] });
      }
    } catch (e) {}
  },

  async loadLocations() {
    try {
      const res = await photoApi.getLocations();
      if (res.success) {
        this.setData({ locations: ['全部地点', ...res.data] });
      }
    } catch (e) {}
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  handleSearch() {
    this.loadPhotos(true);
  },

  onCategoryChange(e) {
    const cat = this.data.categories[e.detail.value];
    this.setData({
      selectedCategory: cat.id === 0 ? '' : cat.name,
      categoryText: cat.name
    });
    this.loadPhotos(true);
  },

  onLocationChange(e) {
    const location = this.data.locations[e.detail.value];
    this.setData({
      selectedLocation: e.detail.value === 0 ? '' : location,
      locationText: location
    });
    this.loadPhotos(true);
  },

  onSortChange(e) {
    const sort = this.data.sortOptions[e.detail.value];
    this.setData({ sortBy: sort.value, sortText: sort.label });
    this.loadPhotos(true);
  },

  goToDetail(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` });
  },

  goToUpload() {
    if (!app.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    wx.navigateTo({ url: '/pages/upload/upload' });
  },

  // DEBUG: 初始化测试数据
  async initTestData() {
    wx.showLoading({ title: '初始化中...' });
    try {
      const res = await seedApi.initData();
      wx.hideLoading();
      if (res.success) {
        wx.showModal({ title: '✅ 成功', content: '测试数据已初始化', showCancel: false });
        this.loadData();
      } else {
        wx.showModal({ title: '⚠️ ' + (res.message || '初始化失败'), content: res.message || '', showCancel: false });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showModal({ title: '❌ 错误', content: '请检查云函数是否已部署', showCancel: false });
    }
  }
});
