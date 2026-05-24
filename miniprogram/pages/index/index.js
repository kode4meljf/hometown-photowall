// pages/index/index.js - 新设计:标签组筛选 + 自定义 TabBar
const { postApi } = require('../../utils/api');
const { formatLikeCount } = require('../../utils/util');
const app = getApp();

const COLUMN_GAP = 24; // 列间距 rpx (gap 12rpx * 2 列)
const CARD_PADDING = 24; // 卡片左右内边距总和 rpx (padding 12rpx * 2 侧)

Page({
  data: {
    // 帖子数据
    posts: [],
    leftPosts: [],
    rightPosts: [],

    // 分页
    page: 1,
    pageSize: 20,
    hasMore: true,
    isLoading: false,
    isRefreshing: false,

    // 筛选
    sortType: 'latest', // latest | likes
    sortMenuShow: false,
    selectedLocation: '', // 空表示不过滤
    locations: [],
    searchKeyword: '',

    // TabBar
    activeTab: 'home',

    // 系统信息
    windowWidth: 375,
    columnWidth: 170, // 单列宽度 px
    textHeight: 100, // 文字区域高度 px
  },

  onLoad() {
    this.initSystemInfo();
    this.loadLocations();
    this.loadPosts(true);
  },

  onShow() {
    // 更新自定义 tabBar 选中状态
    setTimeout(() => {
      const tabBar = this.getTabBar && this.getTabBar();
      if (tabBar) {
        tabBar.setData({ selected: 0 });
      }
    }, 0);
    // 从其他页面返回时刷新点赞状态
    if (this.data.posts.length > 0) {
      this.refreshPostsStatus();
    }
  },

  // 初始化系统信息
  initSystemInfo() {
    const sysInfo = wx.getSystemInfoSync();
    const windowWidth = sysInfo.windowWidth;
    // 计算列宽: (屏幕宽度 - 左右padding 24rpx - 中间gap 12rpx) / 2
    // rpx 转 px: rpx * windowWidth / 750
    const gapPx = 12 * windowWidth / 750;
    const padPx = 12 * windowWidth / 750;
    const columnWidth = (windowWidth - padPx * 2 - gapPx) / 2;
    // 文字区域高度估算 (px)
    const textHeight = 200 * windowWidth / 750;

    this.setData({
      windowWidth,
      columnWidth,
      textHeight,
    });
  },

  // 加载地点列表
  async loadLocations() {
    try {
      const res = await postApi.getLocations();
      if (res.success && res.data) {
        this.setData({
          locations: res.data
        });
      }
    } catch (e) {
      console.error('加载地点列表失败:', e);
    }
  },

  // 加载帖子
  async loadPosts(reset = false) {
    if (this.data.isLoading) return;

    this.setData({ isLoading: true });

    const page = reset ? 1 : this.data.page;

    try {
      const params = {
        sort: this.data.sortType,
        location: this.data.selectedLocation,
        keyword: this.data.searchKeyword,
        page,
        pageSize: this.data.pageSize
      };

      const res = await postApi.getPosts(params);

      if (res.success) {
        const posts = res.data.posts || [];

        // 处理数据:计算卡片高度、格式化日期
        const processedPosts = this.processPosts(posts);

        // 瀑布流分配
        const { leftPosts, rightPosts } = this.distributeToColumns(
          reset ? processedPosts : [...this.data.posts, ...processedPosts],
          reset
        );

        this.setData({
          posts: reset ? processedPosts : [...this.data.posts, ...processedPosts],
          leftPosts,
          rightPosts,
          page: page + 1,
          hasMore: res.data.hasMore,
          isLoading: false,
          isRefreshing: false
        });
      } else {
        this.setData({
          isLoading: false,
          isRefreshing: false
        });
        wx.showToast({
          title: res.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (e) {
      console.error('加载帖子失败:', e);
      this.setData({
        isLoading: false,
        isRefreshing: false
      });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    }
  },

  // 处理帖子数据
  processPosts(posts) {
    return posts.map(post => {
      // 计算卡片图片高度:宽度固定为列宽,高度 = 宽度 * aspectRatio
      // pow(x, 0.4) 压缩极端比例,让瀑布流更整齐
      const cardWidth = this.data.columnWidth; // 已经是 px
      const rawRatio = post.aspectRatio || 1;
      const safeRatio = Math.min(Math.max(rawRatio, 0.6), 1.8);
      const compressedRatio = Math.pow(safeRatio, 0.4);
      const cardHeight = Math.round(cardWidth * compressedRatio);

      // 格式化日期：2024.3.15
      const date = new Date(post.createdAt);
      const _formattedDate = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
      // 点赞数格式化
      const likesInfo = formatLikeCount(post.likes || 0);

      return {
        ...post,
        cardHeight,
        _formattedDate,
        _likesText: likesInfo.text,
        _likesCls: likesInfo.cls
      };
    });
  },

  // 瀑布流分配算法
  distributeToColumns(posts, reset) {
    const textHeight = this.data.textHeight; // 已经是 px
    const leftPosts = reset ? [] : [...this.data.leftPosts];
    const rightPosts = reset ? [] : [...this.data.rightPosts];

    let leftHeight = reset ? 0 : this.getColumnHeight('left');
    let rightHeight = reset ? 0 : this.getColumnHeight('right');

    posts.forEach((post, index) => {
      // 根据之前的数据跳过已分配的
      if (!reset) {
        const existingInLeft = leftPosts.find(p => p.id === post.id);
        const existingInRight = rightPosts.find(p => p.id === post.id);
        if (existingInLeft || existingInRight) return;
      }

      // 分配到较短的列
      if (leftHeight <= rightHeight) {
        leftPosts.push(post);
        leftHeight += post.cardHeight + textHeight;
      } else {
        rightPosts.push(post);
        rightHeight += post.cardHeight + textHeight;
      }
    });

    return { leftPosts, rightPosts };
  },

  // 获取列当前高度(估算)
  getColumnHeight(column) {
    const textHeight = this.data.textHeight;
    const posts = column === 'left' ? this.data.leftPosts : this.data.rightPosts;
    return posts.reduce((sum, post) => sum + post.cardHeight + textHeight, 0);
  },

  // 刷新帖子状态(点赞等)
  async refreshPostsStatus() {
    // 简单处理:重新加载当前页
    this.setData({ page: 1 });
    this.loadPosts(true);
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 搜索确认
  onSearchConfirm() {
    this.loadPosts(true);
  },

  // 清空搜索
  clearSearch() {
    this.setData({
      searchKeyword: ''
    });
    this.loadPosts(true);
  },

  // 排序下拉菜单
  onSortToggle() {
    this.setData({ sortMenuShow: !this.data.sortMenuShow });
  },

  onSortSelect(e) {
    const sort = e.currentTarget.dataset.sort;
    if (sort === this.data.sortType) {
      this.setData({ sortMenuShow: false });
      return;
    }
    this.setData({
      sortType: sort,
      sortMenuShow: false
    });
    this.loadPosts(true);
  },

  // 点击空白关闭下拉
  onContentTap() {
    if (this.data.sortMenuShow) {
      this.setData({ sortMenuShow: false });
    }
  },

  // 地点标签点击
  onLocationTap(e) {
    const location = e.currentTarget.dataset.location;
    const newLocation = this.data.selectedLocation === location ? '' : location;

    this.setData({
      selectedLocation: newLocation
    });
    this.loadPosts(true);
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ isRefreshing: true });
    this.loadPosts(true);
  },

  // 加载更多
  loadMore() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadPosts(false);
    }
  },

  // 跳转到详情
  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    const post = e.currentTarget.dataset.post;
    if (!post) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
      return;
    }
    // 捕获：图片 rect、标题描述 rect
    const query = wx.createSelectorQuery().in(this);
    query.select('#card-img-' + id).boundingClientRect();
    query.select('#card-title-' + id).boundingClientRect();
    query.select('#card-desc-' + id).boundingClientRect();
    query.exec(rects => {
      const [imgRect, titleRect, descRect] = rects;
      app.globalData._indexCardRect = imgRect ? { left: imgRect.left, top: imgRect.top, width: imgRect.width, height: imgRect.height } : null;
      app.globalData._indexCardUrl = post.coverUrl || (post.photos && post.photos[0] && post.photos[0].imageUrl) || '';
      app.globalData._indexAvatarUrl = post.authorAvatar || '';
      app.globalData._indexTextRects = {
        title: titleRect || null,
        desc: descRect || null
      };
      app.globalData._indexTitleText = post.title || '';
      app.globalData._indexDescText = post.description || '';
      wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
    });
  },

  // 点赞（乐观更新：立即响应，后台同步）
  onLikeTap(e) {
    console.log('[like] dataset:', JSON.stringify(e.currentTarget.dataset));

    const { id, index: indexStr, column } = e.currentTarget.dataset;
    const index = parseInt(indexStr, 10);
    console.log('[like] id:', id, 'index:', index, 'column:', column);
    const postsKey = column === 'left' ? 'leftPosts' : 'rightPosts';
    const posts = this.data[postsKey];
    const post = posts[index];
    console.log('[like] post:', post ? post.id : 'NOT FOUND', 'liked before:', post && post.liked);
    if (!post) return;

    const wasLiked = !!post.liked;
    const wasLikes = post.likes || 0;
    const nowLiked = !wasLiked;
    const nowLikes = wasLiked ? wasLikes - 1 : wasLikes + 1;
    const nowLikesInfo = formatLikeCount(nowLikes);
    console.log('[like] nowLiked:', nowLiked, 'nowLikes:', nowLikes);

    // 立即更新 UI（乐观翻转）
    const updatedPosts = posts.map(p => {
      if (p.id === id) return { ...p, liked: nowLiked, likes: nowLikes, _likesText: nowLikesInfo.text, _likesCls: nowLikesInfo.cls };
      return p;
    });
    this.setData({ [postsKey]: updatedPosts });
    console.log('[like] setData done, checking UI...');
    console.log('[like] leftPosts[0] after setData:', this.data.leftPosts[0] && this.data.leftPosts[0].liked);

    // 后台调用云函数
    postApi.likePost(id).then(res => {
      if (!res.success) throw new Error('api failed');
      const finalPosts = this.data[postsKey].map(p => {
        if (p.id === id) return { ...p, liked: res.liked, likes: res.likes, _likesText: formatLikeCount(res.likes).text, _likesCls: formatLikeCount(res.likes).cls };
        return p;
      });
      this.setData({ [postsKey]: finalPosts });
    }).catch(() => {
      // 失败回滚
      const rolledBack = this.data[postsKey].map(p => {
        if (p.id === id) return { ...p, liked: wasLiked, likes: wasLikes, _likesText: formatLikeCount(wasLikes).text, _likesCls: formatLikeCount(wasLikes).cls };
        return p;
      });
      this.setData({ [postsKey]: rolledBack });
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  }
});
