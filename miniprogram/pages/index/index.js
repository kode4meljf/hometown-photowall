// pages/index/index.js - 新设计：标签组筛选 + 自定义 TabBar
const { photoApi } = require('../../utils/api');

const COLUMN_GAP = 16; // 列间距 rpx
const CARD_PADDING = 40; // 卡片左右内边距总和 rpx

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
    selectedLocation: '', // 空表示不过滤
    locations: [],
    searchKeyword: '',
    
    // TabBar
    activeTab: 'home',
    
    // 系统信息
    windowWidth: 375,
    columnWidth: 170, // 单列宽度 rpx
  },

  onLoad() {
    this.initSystemInfo();
    this.loadLocations();
    this.loadPosts(true);
  },

  onShow() {
    // 从其他页面返回时刷新点赞状态
    if (this.data.posts.length > 0) {
      this.refreshPostsStatus();
    }
  },

  // 初始化系统信息
  initSystemInfo() {
    const sysInfo = wx.getSystemInfoSync();
    const windowWidth = sysInfo.windowWidth;
    // 计算列宽： (屏幕宽度 - 左右边距40 - 中间间隙16) / 2
    const columnWidth = (windowWidth - 40 - 8) / 2;
    
    this.setData({
      windowWidth,
      columnWidth: columnWidth * (750 / windowWidth), // 转为 rpx
    });
  },

  // 加载地点列表
  async loadLocations() {
    try {
      const res = await photoApi.getLocations();
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
        
        // 处理数据：计算卡片高度、格式化日期
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
      // 计算卡片图片高度：宽度固定为列宽，高度 = 宽度 * aspectRatio
      const cardWidth = this.data.columnWidth;
      const cardHeight = Math.round(cardWidth * (post.aspectRatio || 1));
      
      // 格式化日期：2024.3.15
      const date = new Date(post.createdAt);
      const _formattedDate = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
      
      return {
        ...post,
        cardHeight,
        _formattedDate
      };
    });
  },

  // 瀑布流分配算法
  distributeToColumns(posts, reset) {
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
        leftHeight += post.cardHeight + 200; // 200rpx 估算文字区域高度
      } else {
        rightPosts.push(post);
        rightHeight += post.cardHeight + 200;
      }
    });
    
    return { leftPosts, rightPosts };
  },

  // 获取列当前高度（估算）
  getColumnHeight(column) {
    const posts = column === 'left' ? this.data.leftPosts : this.data.rightPosts;
    return posts.reduce((sum, post) => sum + post.cardHeight + 200, 0);
  },

  // 刷新帖子状态（点赞等）
  async refreshPostsStatus() {
    // 简单处理：重新加载当前页
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

  // 排序标签点击
  onSortTap(e) {
    const sort = e.currentTarget.dataset.sort;
    if (this.data.sortType === sort) return; // 已选中，不操作
    
    this.setData({
      sortType: sort
    });
    this.loadPosts(true);
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
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  // 点赞
  async onLikeTap(e) {
    e.stopPropagation();
    
    const { id, index, column } = e.currentTarget.dataset;
    
    try {
      const res = await photoApi.likePhoto(id);
      
      if (res.success) {
        // 更新本地数据
        const postsKey = column === 'left' ? 'leftPosts' : 'rightPosts';
        const posts = this.data[postsKey];
        const post = posts[index];
        
        if (post) {
          post.liked = res.liked;
          post.likes = res.likes;
          
          this.setData({
            [postsKey]: posts
          });
        }
        
        // 同步更新主列表
        const allPosts = this.data.posts.map(p => {
          if (p.id === id) {
            return { ...p, liked: res.liked, likes: res.likes };
          }
          return p;
        });
        
        this.setData({ posts: allPosts });
      }
    } catch (e) {
      console.error('点赞失败:', e);
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      });
    }
  },

  // TabBar 切换
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    
    if (tab === this.data.activeTab) return;
    
    if (tab === 'profile') {
      wx.switchTab({
        url: '/pages/profile/profile'
      });
    }
    // home 就是当前页，无需跳转
  },

  // 去上传页
  goToUpload() {
    wx.navigateTo({
      url: '/pages/upload/upload'
    });
  }
});
