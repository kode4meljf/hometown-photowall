// pages/index/index.js - 新设计:标签组筛选 + 自定义 TabBar
const { postApi } = require('../../utils/api');
const { formatLikeCount } = require('../../utils/util');
const { getNavBarLayout } = require('../../utils/navBarLayout');
const { cardHandoffScaleAtProgress } = require('../../utils/heroController');
const app = getApp();

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

    // 系统信息
    windowWidth: 375,
    windowHeight: 667,
    columnWidth: 170,
    textHeight: 100,
    navBarInsetTop: 88,
    navPaddingTop: 48,
    navPaddingRight: 96,
    navBarRowHeight: 32,

    // 详情浮层
    detailOpen: false,
    detailPostId: '',
    detailCoverUrl: '',
    detailTitleText: '',
    detailDescText: '',
    detailImgRect: null,
    detailFullCardRect: null,
    detailCardSlotHeight: 0,
    detailTitleRect: null,
    detailAspectRatio: 1,
    detailAuthorAvatar: '',
    detailAuthorName: '',
    detailSlotHold: false,
    detailCardFade: false,
    detailPostAuthorId: '',
    detailCardRestoring: false,
    detailCardHandoff: false,
    detailCardTransformStyle: '',
    feedLayerStyle: '',
  },

  onLoad() {
    this.initSystemInfo();
    this.loadLocations();
    this.loadPosts(true);
  },

  onHide() {
    if (this.data.detailOpen) {
      this.onDetailClose({ detail: {} });
    }
  },

  onShow() {
    this.initSystemInfo();

    setTimeout(() => {
      const tabBar = this.getTabBar && this.getTabBar();
      if (tabBar) {
        tabBar.setData({
          selected: 0,
          hidden: !!this.data.detailOpen,
        });
      }
    }, 0);

    if (app.globalData.homeNeedRefresh) {
      app.globalData.homeNeedRefresh = false;
      this.loadPosts(true);
      return;
    }

    if (this.data.posts.length > 0) {
      this.refreshPostsStatus();
    }

    this._consumePendingDetail();
  },

  _findPostById(id) {
    return (
      this.data.leftPosts.find((p) => p.id === id) ||
      this.data.rightPosts.find((p) => p.id === id) ||
      null
    );
  },

  _consumePendingDetail() {
    const pending = app.globalData.pendingDetail;
    if (!pending || !pending.postId) return;
    app.globalData.pendingDetail = null;

    const id = pending.postId;
    if (this.data.detailOpen && this.data.detailPostId === id) return;

    const inFeed = this._findPostById(id);
    const ar = inFeed?.aspectRatio > 0 ? inFeed.aspectRatio : pending.aspectRatio || 1;

    this.setData(
      {
        detailPostId: id,
        detailCoverUrl: inFeed?.imageUrl || pending.coverUrl || '',
        detailTitleText: inFeed?.title || pending.titleText || '',
        detailDescText: inFeed?.description || pending.descText || '',
        detailImgRect: null,
        detailFullCardRect: null,
        detailCardSlotHeight: inFeed?.slotHeight || 0,
        detailTitleRect: null,
        detailAspectRatio: ar,
        detailAuthorAvatar: inFeed?.authorAvatar || pending.authorAvatar || '',
        detailAuthorName: inFeed?.author || pending.authorName || '',
        detailSlotHold: true,
        detailCardLikes: inFeed?.likes || pending.likes || 0,
        detailCardCommentsCount:
          inFeed?.commentsCount || pending.commentsCount || 0,
        detailCardLiked: !!(inFeed?.liked || pending.liked),
        detailCardDate: inFeed?._formattedDate || pending.cardDate || '',
        detailCardPhotoCount:
          (inFeed?.photos && inFeed.photos.length) ||
          pending.photoCount ||
          1,
        detailPostAuthorId: inFeed?.authorId || pending.authorId || '',
      },
      () => {
        this.setData({ detailOpen: true }, () => {
          this._setTabBarHidden(true);
          if (inFeed) {
            wx.nextTick(() => {
              const query = wx.createSelectorQuery().in(this);
              query.select('#card-' + id).boundingClientRect();
              query.exec((rects) => {
                const fullCardRect = rects && rects[0];
                if (!fullCardRect || !fullCardRect.height) return;
                this.setData({
                  detailFullCardRect: fullCardRect,
                  detailCardSlotHeight: Math.round(fullCardRect.height),
                });
              });
            });
          }
          wx.nextTick(() => {
            this.setData({ detailCardFade: true });
          });
        });
      }
    );
  },

  _setTabBarHidden(hidden) {
    const tabBar = this.getTabBar && this.getTabBar();
    if (tabBar) {
      tabBar.setData({ hidden: !!hidden });
    }
  },

  // 初始化系统信息
  initSystemInfo() {
    const sysInfo = wx.getSystemInfoSync();
    const windowWidth = sysInfo.windowWidth;
    const nav = getNavBarLayout();
    // 计算列宽: (屏幕宽度 - 左右padding 24rpx - 中间gap 12rpx) / 2
    // rpx 转 px: rpx * windowWidth / 750
    const gapPx = 12 * windowWidth / 750;
    const padPx = 12 * windowWidth / 750;
    const columnWidth = (windowWidth - padPx * 2 - gapPx) / 2;
    // 文字区域高度估算 (px)
    const textHeight = 200 * windowWidth / 750;

    this.setData({
      windowWidth,
      windowHeight: sysInfo.windowHeight,
      columnWidth,
      textHeight,
      navBarInsetTop: nav.navBarHeight,
      navPaddingTop: nav.paddingTop,
      navPaddingRight: nav.paddingRight,
      navBarRowHeight: nav.barHeight,
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
        }, () => {
          this._consumePendingDetail();
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
        title: (e && (e.errMsg || e.message)) || '加载失败',
        icon: 'none'
      });
    }
  },

  _getCardContentHeight(post) {
    const hasText = !!(post.title || post.description);
    return hasText
      ? this.data.textHeight
      : Math.round((120 * this.data.windowWidth) / 750);
  },

  _getPostSlotHeight(post) {
    return post.cardHeight + this._getCardContentHeight(post);
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
      const slotHeight = this._getPostSlotHeight({ ...post, cardHeight });

      // 格式化日期：2024.3.15
      const date = new Date(post.createdAt);
      const _formattedDate = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
      // 点赞数格式化
      const likesInfo = formatLikeCount(post.likes || 0);

      return {
        ...post,
        cardHeight,
        slotHeight,
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

  // 打开详情浮层（卡片在首页放大展开，非跳转新页面）
  onCardTap(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.detailOpen && this.data.detailPostId === id) return;
    this.goToDetail(e);
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    const post = e.currentTarget.dataset.post;
    if (!id || !post) return;

    const query = wx.createSelectorQuery().in(this);
    query.select('#card-' + id).boundingClientRect();
    query.select('#card-img-' + id).boundingClientRect();
    query.select('#card-text-' + id).boundingClientRect();
    query.exec((rects) => {
      const [fullCardRect, imgRect, titleRect] = rects;
      const ar = post.aspectRatio > 0 ? post.aspectRatio : 1;
      const slotHeight = post.slotHeight || this._getPostSlotHeight(post);
      const measuredCardHeight =
        fullCardRect && fullCardRect.height > 0
          ? Math.round(fullCardRect.height)
          : slotHeight;
      // 先写入测量矩形，再打开浮层，避免子组件 _enter 时 imgRect 仍为空
      this.setData(
        {
          detailPostId: id,
          detailCoverUrl: post.imageUrl || post.coverUrl || '',
          detailTitleText: post.title || '',
          detailDescText: post.description || '',
          detailImgRect: imgRect || null,
          detailFullCardRect: fullCardRect || null,
          detailCardSlotHeight: measuredCardHeight,
          detailTitleRect: titleRect || null,
          detailAspectRatio: ar,
          detailAuthorAvatar: post.authorAvatar || '',
          detailAuthorName: post.author || '',
          detailSlotHold: true,
          detailCardLikes: post.likes || 0,
          detailCardCommentsCount: post.commentsCount || 0,
          detailCardLiked: !!post.liked,
          detailCardDate: post._formattedDate || '',
          detailCardPhotoCount:
            (post.photos && post.photos.length) || post.photoCount || 1,
          detailPostAuthorId: post.authorId || '',
        },
        () => {
          this.setData({ detailOpen: true }, () => {
            this._setTabBarHidden(true);
            wx.nextTick(() => {
              this.setData({ detailCardFade: true });
            });
          });
        }
      );
    });
  },

  onDetailHeroFly() {
    this.setData({ detailSlotHold: false });
    setTimeout(() => {
      if (this.data.detailOpen) {
        this.setData({ detailCardFade: false });
      }
    }, 120);
  },

  onDetailCardRestore(e) {
    const detail = e.detail || {};
    const duration = detail.duration || 280;
    const handoffRatio =
      typeof detail.handoffRatio === 'number' ? detail.handoffRatio : 0.62;
    const fullCardRect =
      detail.fullCardRect || this.data.detailFullCardRect;
    const winW = this.data.windowWidth;
    const winH = this.data.windowHeight;
    const delay = Math.round(duration * handoffRatio);
    const handoffMs = Math.max(duration - delay, 80);
    const curve = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

    clearTimeout(this._cardHandoffTimer);
    clearTimeout(this._cardRestoreClearTimer);

    this.setData({
      detailCardRestoring: true,
      detailCardHandoff: false,
      detailCardTransformStyle: '',
      detailSlotHold: false,
    });

    this._cardHandoffTimer = setTimeout(() => {
      if (!this.data.detailCardRestoring) return;
      if (!fullCardRect) {
        this.setData({ detailSlotHold: true });
        return;
      }
      const { scaleX, scaleY } = cardHandoffScaleAtProgress(
        fullCardRect,
        winW,
        winH,
        handoffRatio
      );
      const fromStyle = `transform:scale(${scaleX},${scaleY});transform-origin:left top;`;
      this.setData({
        detailSlotHold: true,
        detailCardHandoff: true,
        detailCardTransformStyle: fromStyle,
      });
      wx.nextTick(() => {
        this.setData({
          detailCardTransformStyle: `transform:scale(1,1);transform-origin:left top;transition:transform ${handoffMs}ms ${curve};`,
        });
      });
    }, delay);

    this._cardRestoreClearTimer = setTimeout(() => {
      this.setData({
        detailCardRestoring: false,
        detailCardHandoff: false,
        detailCardTransformStyle: '',
      });
    }, duration + 80);
  },

  onFeedLayer(e) {
    const { opacity, animate, duration } = e.detail || {};
    const ms = duration || 280;
    const curve = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
    const target = Math.min(1, Math.max(0, Number(opacity)));
    if (!animate) {
      this.setData({
        feedLayerStyle: target >= 1 ? '' : `opacity:${target};`,
      });
      return;
    }
    const from = target < 1 ? 1 : 0;
    this.setData({ feedLayerStyle: `opacity:${from};` });
    wx.nextTick(() => {
      this.setData({
        feedLayerStyle: `opacity:${target};transition:opacity ${ms}ms ${curve};`,
      });
    });
  },

  onDetailClose(e) {
    const detail = e.detail || {};
    clearTimeout(this._cardHandoffTimer);
    clearTimeout(this._cardRestoreClearTimer);
    this.setData({
      detailOpen: false,
      detailPostId: '',
      detailImgRect: null,
      detailFullCardRect: null,
      detailCardSlotHeight: 0,
      detailTitleRect: null,
      detailSlotHold: false,
      detailCardFade: false,
      detailCardRestoring: false,
      detailCardHandoff: false,
      detailCardTransformStyle: '',
      feedLayerStyle: '',
    });
    this._setTabBarHidden(false);
    if (detail.deleted) {
      this.loadPosts(true);
      return;
    }
    if (detail.likedChanged) {
      this.refreshPostsStatus();
    }
  },

  // 点赞（乐观更新：立即响应，后台同步）
  onLikeTap(e) {
    const { id, index: indexStr, column } = e.currentTarget.dataset;
    const index = parseInt(indexStr, 10);
    const postsKey = column === 'left' ? 'leftPosts' : 'rightPosts';
    const posts = this.data[postsKey];
    const post = posts[index];
    if (!post) return;

    const wasLiked = !!post.liked;
    const wasLikes = post.likes || 0;
    const nowLiked = !wasLiked;
    const nowLikes = wasLiked ? wasLikes - 1 : wasLikes + 1;
    const nowLikesInfo = formatLikeCount(nowLikes);

    // 立即更新 UI（乐观翻转）
    const updatedPosts = posts.map(p => {
      if (p.id === id) return { ...p, liked: nowLiked, likes: nowLikes, _likesText: nowLikesInfo.text, _likesCls: nowLikesInfo.cls };
      return p;
    });
    this.setData({ [postsKey]: updatedPosts });

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
