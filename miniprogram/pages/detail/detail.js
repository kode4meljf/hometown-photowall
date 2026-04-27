// pages/detail/detail.js - 中心点 FLIP 动画（支持任意图片宽高比 + scale 缩放）
const { postApi } = require('../../utils/api');
const { showLoading, hideLoading, showToast, showSuccess, formatDateTime } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    post: null,
    loading: true,
    commentContent: '',
    canDelete: false,
    showCommentInput: false,
    commentsLoading: false,
    hasMoreComments: false,
    headerPaddingTop: 0,
    photoMode: 'aspectFit',
    photoStyle: '',
    // 全屏预览状态
    isPreviewMode: false,
    previewTransform: 'translate(0px, 0px) scale(1, 1)',
    previewBgBlack: false,
    bottomBarVisible: false,
    previewAnimating: false,
    previewOpacity: 1,
    previewAnimClass: '',   // 控制 transition 曲线：'animating-enter' | 'animating-exit' | ''
    overlayOpacity: 0,
    yPageVisible: true,
    showLikeAnim: false,
    canGoPrev: false,
    canGoNext: false,
    currentPhotoIndex: 0,
    indexBadgeVisible: false
  },

  // 私有状态
  _rectY: null,       // Y 图片元素屏幕位置（含 scroll offset）
  _flipParams: null,   // 进入动画参数，供退出动画反向使用
  _imgNaturalW: 0,     // 图片原始宽度（onPhotoLoad 获取）
  _imgNaturalH: 0,     // 图片原始高度

  onLoad(options) {
    this.postId = options.id;
    wx.getSystemInfo({
      success: (info) => {
        this._windowHeight = info.windowHeight;
        this._windowWidth = info.windowWidth;
        this._statusBarHeight = info.statusBarHeight || 0;
        this._sysInfo = info;
        // 缓存底部栏高度，避免每次手势事件重复计算
        this._bottomBarH = (84 / 750) * info.windowWidth + (info.safeArea?.insetBottom || 0);
        this.setData({ headerPaddingTop: (info.statusBarHeight || 0) + 16 });
      }
    });
    if (this.postId) {
      this.loadPost();
      this._loadPhotoList();
    } else {
      showToast('照片ID不存在');
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  async loadPost() {
    this.setData({ loading: true });
    try {
      const res = await postApi.getPostDetail(this.postId);
      if (res.data?.comments?.length) {
      }
      if (res.success && res.data) {
        const post = res.data;
        post.date = formatDateTime(post.createdAt);
        // 拼接标题+描述
        const titleParts = [];
        if (post.title) titleParts.push(post.title);
        if (post.description) titleParts.push(post.description);
        post.titleDesc = titleParts.join(' ');
        // 兼容旧帖子：无 photos 数组时，用 imageUrl 构造单图数组
        if (!post.photos || post.photos.length === 0) {
          post.photos = [{ imageUrl: post.imageUrl || '', width: 1, height: 1, order: 0 }];
        }
        post.comments = (post.comments || []).map(c => ({
          ...c,
          time: formatDateTime(c.createdAt),
          authorAvatar: c.authorAvatar || '/assets/icons/default-avatar.png'
        }));
        post.authorAvatar = post.authorAvatar || '/assets/icons/default-avatar.png';
        const canDelete = app.globalData.userInfo &&
          (app.globalData.userInfo.id === post.authorId ||
           app.globalData.userInfo.role === 'admin' ||
           app.globalData.userInfo._id === post.authorId);
        const hasMoreComments = res.data.hasMore || false;
        this.setData({ post, canDelete, loading: false, hasMoreComments, currentPhotoIndex: 0 });
        this._updateNavState();
      } else {
        showToast(res.message || '加载失败');
        this.setData({ loading: false });
      }
    } catch (e) {
      showToast('加载失败');
      this.setData({ loading: false });
    }
  },

  async _loadPhotoList() {
    try {
      const res = await postApi.getPosts({ page: 1, pageSize: 100 });
      if (res.success) {
        this._postList = res.data.posts || [];
        this._currentIndex = this._postList.findIndex(p => p._id === this.postId);
        this._updateNavState();
      }
    } catch (e) {}
  },

  _updateNavState() {
    if (!this._postList) return;
    this.setData({
      canGoPrev: this._currentIndex > 0,
      canGoNext: this._currentIndex < this._postList.length - 1
    });
  },

  // 图片加载完成：存储真实宽高，用于 FLIP 计算
  onPhotoLoad(e) {
    const { width, height } = e.detail;
    if (!width || !height) return;
    this._imgNaturalW = width;
    this._imgNaturalH = height;
    this.setData({
      photoMode: 'aspectFit',
      photoStyle: 'background:#F7F7F7;'
    });
  },

  // 多图轮播切换
  onSwiperChange(e) {
    this.setData({ currentPhotoIndex: e.detail.current });
    this._showIndexBadge();
  },

  // 预览模式轮播切换
  onPreviewSwiperChange(e) {
    this.setData({ currentPhotoIndex: e.detail.current });
    this._showIndexBadge();
  },

  // 右上角文字指示器：渐现 → 1.5s后渐隐
  _showIndexBadge() {
    if (this._badgeTimer) clearTimeout(this._badgeTimer);
    this.setData({ indexBadgeVisible: true });
    this._badgeTimer = setTimeout(() => {
      this.setData({ indexBadgeVisible: false });
    }, 1500);
  },

  // ========== aspectFit 布局计算 ==========
  // 给定容器尺寸和图片宽高比，返回 aspectFit 下图片的视觉尺寸和居中偏移
  _aspectFitLayout(containerW, containerH, imgAR) {
    const containerAR = containerW / containerH;
    var visW, visH;
    if (imgAR > containerAR) {
      // 宽图：宽度撑满，高度按比例缩放
      visW = containerW;
      visH = containerW / imgAR;
    } else {
      // 高图：高度撑满，宽度按比例缩放
      visH = containerH;
      visW = containerH * imgAR;
    }
    return {
      visW: visW,
      visH: visH,
      offsetX: (containerW - visW) / 2,  // 居中水平偏移
      offsetY: (containerH - visH) / 2   // 居中垂直偏移
    };
  },

  // ========== 全屏预览（CSS transition 弹簧曲线） ==========
  //
  // 时序（修复频闪）：
  //   Phase 1: 显示预览层，但 opacity=0（不可见，位置待设）
  //   Phase 2: boundingClientRect 回调后，设 transform 为 Y 起点位置
  //   Phase 3: wx.nextTick 后 opacity=1 显示（在正确位置）
  //   Phase 4: 设 transform 为 Q 终点 → CSS transition 启动（弹簧曲线）
  //
  // 退出时：
  //   读当前 transform → 清 transition → 设 Y 终点 → CSS transition 启动
  //
  enterPreview() {
    var self = this;
    if (!self.data.post) return;

    var imgAR = (self._imgNaturalW && self._imgNaturalH)
      ? self._imgNaturalW / self._imgNaturalH
      : null;

    // Phase 1: 显示预览层，但 opacity=0（此时 transform 未知，先隐藏）
    self.setData({
      isPreviewMode: true,
      previewBgBlack: true,
      previewAnimating: false,
      previewTransform: 'translate(0px, 0px) scale(1, 1)',
      previewOpacity: 0,   // 隐藏，修复频闪
      bottomBarVisible: false,
      overlayOpacity: 0
    });

    // 测量 Y 图片元素屏幕位置
    wx.createSelectorQuery().in(self).select('.photo-image').boundingClientRect(function(rectY) {
      if (!rectY) {
        self.setData({ bottomBarVisible: true, previewOpacity: 1, previewTransform: 'translate(0px, 0px) scale(1, 1)' });
        return;
      }

      if (!imgAR) imgAR = rectY.width / rectY.height;

      self._rectY = rectY;

      // Y 视觉布局
      var yLayout = self._aspectFitLayout(rectY.width, rectY.height, imgAR);
      var yVisW = yLayout.visW, yVisH = yLayout.visH;
      var yCenterX = rectY.left + yLayout.offsetX + yVisW / 2;
      var yCenterY = rectY.top + yLayout.offsetY + yVisH / 2;

      // Q 视觉布局
      var screenW = self._windowWidth || wx.getSystemInfoSync().windowWidth;
      var screenH = self._windowHeight || wx.getSystemInfoSync().windowHeight;
      var qLayout = self._aspectFitLayout(screenW, screenH, imgAR);
      var qVisW = qLayout.visW, qVisH = qLayout.visH;
      var qVisOffsetX = qLayout.offsetX, qVisOffsetY = qLayout.offsetY;
      var qCenterX = qVisOffsetX + qVisW / 2;
      var qCenterY = qVisOffsetY + qVisH / 2;

      // 起点：scale 到 Y 视觉尺寸，translate 中心对齐 Y 中心
      var startSx = yVisW / qVisW;
      var startSy = yVisH / qVisH;
      var startTx = yCenterX - (qVisOffsetX + qVisW / 2) * startSx;
      var startTy = yCenterY - (qVisOffsetY + qVisH / 2) * startSy;

      // 终点：identity（Q 自然居中）
      var endTx = 0, endTy = 0, endSx = 1, endSy = 1;

      // 存储供退出使用
      self._flipParams = {
        startTx: startTx, startTy: startTy, startSx: startSx, startSy: startSy,
        endTx: endTx, endTy: endTy, endSx: endSx, endSy: endSy,
        yCenterX: yCenterX, yCenterY: yCenterY,
        qCenterX: qCenterX, qCenterY: qCenterY,
        qVisOffsetX: qVisOffsetX, qVisOffsetY: qVisOffsetY,
        qVisW: qVisW, qVisH: qVisH
      };



      self._exitRequested = false;
      self._animating = true;

      // Phase 2: 设 transform 为 Y 起点（opacity 仍为 0，看不见）
      self._currentTx = startTx; self._currentTy = startTy; self._currentScale = startSx; self._currentSy = startSy;
      self.setData({
        previewTransform: 'translate(' + startTx.toFixed(2) + 'px, ' + startTy.toFixed(2) + 'px) scale(' + startSx.toFixed(4) + ', ' + startSy.toFixed(4) + ')'
      });

      // Phase 3: nextTick 后 opacity=1 显示（在正确位置），然后设终点触发 transition
      wx.nextTick(function() {
        // Phase 3B: 显示（在 Y 位置）
        self.setData({ previewOpacity: 1 });

        // Phase 4: 设终点 + 触发弹簧 transition
        setTimeout(function() {
          self._currentTx = 0; self._currentTy = 0; self._currentScale = 1; self._currentSy = 1;
          self.setData({
            previewTransform: 'translate(0px, 0px) scale(1, 1)',
            previewAnimClass: 'animating-enter'
          });

          // 弹簧动画时长（CSS transition 350ms）后收尾
          setTimeout(function() {
            if (self._exitRequested) return;
            self.setData({
              bottomBarVisible: true,
              previewAnimClass: '',
              previewAnimating: false
            });
            self._animating = false;
          }, 360);
        }, 16);
      });
    }).exec();
  },

  // ========== 退出全屏预览（CSS transition 弹簧曲线） ==========
  //
  // 时序：
  //   1. 退出锁设上（防止进入打断）
  //   2. 读取当前 transform
  //   3. 清 transition → 设当前状态（固定在当前位置）
  //   4. 设 Y 终点 transform → CSS spring transition 启动
  //   5. 动画结束后隐藏预览层，显示 Y 页面
  //
  exitPreview() {
    var self = this;
    var rectY = self._rectY;
    var flipParams = self._flipParams;

    if (!rectY || !flipParams) {
      self.setData({ isPreviewMode: false, previewAnimating: false, previewBgBlack: false, yPageVisible: true });
      return;
    }

    // 进入退出动画锁，防止 _applyTransform 干扰
    this._animating = true;
    this._exitRequested = true;
    this._exitRequested = true;

    // 读取当前 transform（优先同步变量，setData 批处理可能延迟）
    var curTx = this._currentTx || 0;
    var curTy = this._currentTy || 0;
    var curSx = this._currentScale || 1;
    var curSy = this._currentSy || curSx;

    // 退出终点 = 进入起点（Y 视觉位置）
    var endTx = flipParams.startTx;
    var endTy = flipParams.startTy;
    var endSx = flipParams.startSx;
    var endSy = flipParams.startSy;



    // Step 1: 清 transition → 固定在当前位置
    this.setData({
      previewAnimClass: '',
      previewTransform: 'translate(' + curTx.toFixed(2) + 'px, ' + curTy.toFixed(2) + 'px) scale(' + curSx.toFixed(4) + ', ' + curSy.toFixed(4) + ')',
      bottomBarVisible: false
    });

    // Step 2: nextTick 后设终点 → CSS spring transition 启动
    wx.nextTick(function() {
      self._currentTx = endTx; self._currentTy = endTy; self._currentScale = endSx; self._currentSy = endSy;
      self.setData({
        previewTransform: 'translate(' + endTx.toFixed(2) + 'px, ' + endTy.toFixed(2) + 'px) scale(' + endSx.toFixed(4) + ', ' + endSy.toFixed(4) + ')',
        previewAnimClass: 'animating-exit'   // 触发 .animating-exit 样式（280ms spring）
      });

      // 弹簧动画时长（CSS transition 280ms + buffer）后收尾
      setTimeout(function() {
        self.setData({
          previewTransform: 'translate(' + endTx.toFixed(2) + 'px, ' + endTy.toFixed(2) + 'px) scale(' + endSx.toFixed(4) + ', ' + endSy.toFixed(4) + ')',
          previewAnimClass: ''
        });

        setTimeout(function() {
          self.setData({
            isPreviewMode: false,
            previewOpacity: 1,
            yPageVisible: true,
            previewBgBlack: false
          });
          self._animating = false;
          self._currentTx = 0; self._currentTy = 0; self._currentScale = 1; self._currentSy = 1;
          self._rectY = null;
          self._flipParams = null;
        }, 16);
      }, 300);
    });
  },

  // ========== 手势交互 ==========
  _getTransformValues() {
    // 优先用同步变量，setData 批处理时字符串可能未更新
    const sx = (this._currentScale !== undefined) ? this._currentScale : 1;
    const sy = (this._currentSy !== undefined) ? this._currentSy : sx;
    return { tx: this._currentTx || 0, ty: this._currentTy || 0, sx, sy };
  },

  _applyTransform(tx, ty, sx, sy) {
    this._currentTx = tx;
    this._currentTy = ty;
    this._currentScale = sx;
    this._currentSy = sy;
    this.setData({ previewTransform: 'translate(' + tx + 'px, ' + ty + 'px) scale(' + sx + ', ' + sy + ')' });
  },

  onPreviewTouchStart(e) {
    const t = e.touches;
    this._touchStartTime = Date.now();
    this._hasMoved = false;

    if (this._animating) return;

    const { tx, ty, sx, sy } = this._getTransformValues();
    this._startTx = tx; this._startTy = ty; this._startSx = sx; this._startSy = sy;

    if (t.length === 2) {
      this._gestureState = 'pinch';
      this._pinchStartDist = this._getDist(t[0], t[1]);
      this._pinchStartCenter = {
        x: (t[0].clientX + t[1].clientX) / 2,
        y: (t[0].clientY + t[1].clientY) / 2
      };
    } else if (t.length === 1) {
      this._gestureState = 'single';
      this._touchStart = { x: t[0].clientX, y: t[0].clientY };
      this._pullStartTouchY = t[0].clientY;

      // 起点在底部栏内 → 标记，跳过滑动退出检测
      var windowHeight = this._windowHeight;
      var bottomBarH = this._bottomBarH;
      if (!windowHeight || bottomBarH === undefined) {
        const sysInfo = wx.getSystemInfoSync();
        windowHeight = sysInfo.windowHeight;
        bottomBarH = (84 / 750) * sysInfo.windowWidth + (sysInfo.safeArea?.insetBottom || 0);
      }
      if (t[0].clientY >= windowHeight - bottomBarH) {
        this._gestureState = 'in-bottom';
      }
    }
  },

  onPreviewTouchMove(e) {
    const t = e.touches;

    if (this._gestureState === 'pinch' && t.length >= 2) {
      const dist = this._getDist(t[0], t[1]);
      let scale = this._startSx * (dist / this._pinchStartDist);
      scale = Math.max(0.3, Math.min(scale, 4));
      const sy = Math.max(0.3, Math.min(scale, 4));

      const cx = (t[0].clientX + t[1].clientX) / 2;
      const cy = (t[0].clientY + t[1].clientY) / 2;

      const pinchX = this._pinchStartCenter.x;
      const pinchY = this._pinchStartCenter.y;
      const scaleRatio = scale / this._startSx;
      const newTx = pinchX - (pinchX - this._startTx) * scaleRatio + (cx - pinchX);
      const newTy = pinchY - (pinchY - this._startTy) * scaleRatio + (cy - pinchY);

      this._applyTransform(newTx, newTy, scale, sy);
    } else if (t.length === 1 && (this._gestureState === 'single' || this._gestureState === 'pan')) {
      const dx = t[0].clientX - this._touchStart.x;
      const dy = t[0].clientY - this._touchStart.y;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        this._hasMoved = true;
        const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

        if (this._startSx > 1.05) {
          this._gestureState = 'pan';
          this._applyTransform(this._startTx + dx, this._startTy + dy, this._startSx, this._startSy);
        } else {
          if (angle <= 45) {
            // 水平滑动 → 直接退出，不拖动
            this.exitPreview();
            return;
          } else {
            // 垂直滑动 → 直接退出，不拖动
            this.exitPreview();
            return;
          }
        }
      }
    }
  },

  onPreviewTouchEnd(e) {
    const touchY = e.changedTouches?.[0]?.clientY ?? 0;
    // 使用 onLoad 缓存的值，兜底用 getSystemInfoSync
    var windowHeight = this._windowHeight;
    var bottomBarH = this._bottomBarH;
    if (!windowHeight || bottomBarH === undefined) {
      const sysInfo = wx.getSystemInfoSync();
      windowHeight = sysInfo.windowHeight;
      bottomBarH = (84 / 750) * sysInfo.windowWidth + (sysInfo.safeArea?.insetBottom || 0);
    }
    var bottomBarTop = windowHeight - bottomBarH;
    var touchStartY = this._touchStart?.y ?? 0;
    var startedInBottom = this._gestureState === 'in-bottom';
    var endedInBottom = touchY >= bottomBarTop;

    // 起点或终点在底部栏 → 跳过滑动退出（由栏内按钮处理）
    if (startedInBottom || endedInBottom) return;

    const { tx, ty, sx, sy } = this._getTransformValues();
    const dt = Date.now() - this._touchStartTime;

    if (!this._hasMoved && dt < 250) {
      const now = Date.now();
      if (now - (this._lastTapTime || 0) < 300) {
        this._onDoubleTap();
        this._lastTapTime = 0;
        return;
      } else {
        this._lastTapTime = now;
        this._singleTapTimer = setTimeout(() => {
          this._lastTapTime = 0;
          this.exitPreview();
        }, 300);
        return;
      }
    }

    // pinch 缩小到 < 1x → 退出全屏
    if (sx < 1.0 && this._gestureState === 'pinch') {
      this.exitPreview();
      return;
    }

    // pinch 放大后松手 → 回弹到 1x（唯一需要恢复动画的场景）
    if (this._gestureState === 'pinch') {
      this.setData({ previewAnimating: true });
      this._applyTransform(0, 0, 1, 1);
      setTimeout(() => { this.setData({ previewAnimating: false }); }, 300);
      return;
    }

    // 水平滑动切换照片（未达到退出阈值时触发）
    if (this._gestureState === 'horizontal') {
      const threshold = (this._windowWidth || 375) * 0.25;
      if (tx > threshold && this.data.canGoPrev) {
        this._switchPhoto(-1);
      } else if (tx < -threshold && this.data.canGoNext) {
        this._switchPhoto(1);
      }
    }
  },

  _switchPhoto(delta) {
    if (!this._postList || this._postList.length === 0) return;

    const newIndex = this._currentIndex + delta;
    if (newIndex < 0 || newIndex >= this._postList.length) {
      this._animating = true;
      this.setData({ previewAnimating: true });
      this._applyTransform(0, 0, 1, 1);
      setTimeout(() => {
        this._animating = false;
        this.setData({ previewAnimating: false });
      }, 300);
      return;
    }

    const direction = delta > 0 ? -1 : 1;

    this._animating = true;
    this.setData({ previewAnimating: true });
    this._applyTransform(direction * this._windowWidth, 0, 1, 1);

    setTimeout(() => {
      this._currentIndex = newIndex;
      this.postId = this._postList[newIndex]._id;
      this.loadPost().then(() => {
        this._applyTransform(-direction * this._windowWidth, 0, 1, 1);
        this.setData({ previewAnimating: true });
        setTimeout(() => {
          this._applyTransform(0, 0, 1, 1);
          setTimeout(() => {
            this._animating = false;
            this.setData({ previewAnimating: false });
          }, 300);
        }, 20);
      });
    }, 200);
  },

  _onDoubleTap() {
    if (this._singleTapTimer) {
      clearTimeout(this._singleTapTimer);
      this._singleTapTimer = null;
    }
    this.handlePreviewLike();
  },

  async handlePreviewLike() {
    if (!app.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    try {
      const res = await postApi.likePost(this.postId);
      if (res.success) {
        const post = this.data.post;
        post.likes = res.likes;
        post.liked = res.liked;
        this.setData({ post, showLikeAnim: true });
        this._likedChanged = true;
        setTimeout(() => this.setData({ showLikeAnim: false }), 600);
      }
    } catch (e) {}
  },

  onCommentScroll(e) {
    const { scrollTop, scrollHeight } = e.detail;
    const clientHeight = e.detail.clientHeight || this._windowHeight || 600;
    if (scrollHeight - scrollTop - clientHeight < 300) {
      this._tryLoadMore();
    }
  },

  _tryLoadMore() {
    if (this.data.commentsLoading || !this.data.hasMoreComments) return;
    this.loadMoreComments();
  },

  async loadMoreComments() {
    if (this.data.commentsLoading || !this.data.hasMoreComments) return;
    const offset = this.data.post?.comments?.length || 0;
    this.setData({ commentsLoading: true });
    try {
      const res = await postApi.getMoreComments(this.data.post._id, offset);
      if (res.success) {
        const newComments = (res.data.comments || []).map(c => ({
          ...c,
          time: formatDateTime(c.createdAt),
          authorAvatar: c.authorAvatar || '/assets/icons/default-avatar.png'
        }));
        const post = this.data.post;
        post.comments = [...(post.comments || []), ...newComments];
        this.setData({ post, hasMoreComments: res.data.hasMore, commentsLoading: false });
      } else {
        this.setData({ commentsLoading: false });
      }
    } catch (e) {
      this.setData({ commentsLoading: false });
    }
  },

  _getDist(t0, t1) {
    const dx = t0.clientX - t1.clientX;
    const dy = t0.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // ========== 原有功能 ==========

  goBack() { wx.navigateBack(); },

  focusCommentInput() { this.setData({ showCommentInput: true }); },
  hideCommentInput() { this.setData({ showCommentInput: false }); },

  handleShare() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  onShareAppMessage() {
    const post = this.data.post;
    if (post) {
      this.setData({ 'post.shares': (post.shares || 0) + 1 });
      // 云端计数（静默，不阻塞分享）
      wx.cloud.callFunction({ name: 'posts', data: { action: 'incrementShares', id: post._id } }).catch(() => {});
    }
    return {
      title: post?.title || '故乡照片墙',
      path: `/pages/detail/detail?id=${post?._id}`,
      imageUrl: post?.coverUrl || post?.imageUrl
    };
  },

  onShareTimeline() {
    const post = this.data.post;
    if (post) {
      this.setData({ 'post.shares': (post.shares || 0) + 1 });
      wx.cloud.callFunction({ name: 'posts', data: { action: 'incrementShares', id: post._id } }).catch(() => {});
    }
    return {
      title: post?.title || '故乡照片墙',
      query: `id=${post?._id}`,
      imageUrl: post?.coverUrl || post?.imageUrl
    };
  },

  async downloadImage() {
    if (this._singleTapTimer) {
      clearTimeout(this._singleTapTimer);
      this._singleTapTimer = null;
    }
    if (!this.data.post) return;

    showLoading('下载中...');
    const photos = this.data.post.photos || [];
    const idx = this.data.currentPhotoIndex || 0;
    let url = (photos[idx] && photos[idx].imageUrl) || this.data.post.imageUrl;

    if (url.startsWith('cloud://')) {
      try {
        const tempRes = await wx.cloud.getTempFileURL({ fileList: [url] });
        url = tempRes.fileList?.[0]?.tempFileURL || url;
      } catch (e) {
        console.error('[downloadImage] getTempFileURL failed:', e);
      }
    }

    wx.downloadFile({
      url,
      success: async (res) => {
        if (res.statusCode === 200 && res.tempFilePath) {
          try {
            await wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath });
            hideLoading();
            showSuccess('保存成功');
          } catch (e) {
            hideLoading();
            showToast(e.errMsg?.includes('auth') ? '请授权保存相册权限' : '保存失败');
          }
        } else {
          hideLoading();
          showToast('下载失败，状态码：' + res.statusCode);
        }
      },
      fail: (err) => {
        hideLoading();
        showToast('下载失败：' + (err?.errMsg || String(err)));
      }
    });
  },

  async handleLike() {
    if (!app.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    try {
      const res = await postApi.likePost(this.postId);
      if (res.success) {
        const post = this.data.post;
        post.likes = res.likes;
        post.liked = res.liked;
        this.setData({ post });
        this._likedChanged = true;
      }
    } catch (e) {
      showToast('操作失败');
    }
  },

  onCommentInput(e) { this.setData({ commentContent: e.detail.value }); },

  async submitComment() {
    if (!app.checkLogin()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const content = this.data.commentContent.trim();
    if (!content) { showToast('请输入评论内容'); return; }
    try {
      showLoading('发送中...');
      const res = await postApi.addComment(this.postId, content);
      hideLoading();
      if (res.success) {
        showSuccess('评论成功');
        this.setData({ commentContent: '', showCommentInput: false });
        this.loadPost();
      } else {
        showToast(res.message || '评论失败');
      }
    } catch (e) {
      hideLoading();
      showToast('评论失败');
    }
  },

  onUnload() {
    if (this._likedChanged) {
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage && prevPage.onNeedRefresh) {
        prevPage.onNeedRefresh();
      }
    }
  }
});
