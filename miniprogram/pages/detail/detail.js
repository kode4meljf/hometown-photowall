// pages/detail/detail.js - 中心点 FLIP 动画（支持任意图片宽高比 + scale 缩放）
const { postApi } = require('../../utils/api');
const { showLoading, hideLoading, showToast, showSuccess, formatDateTime, formatLikeCount } = require('../../utils/util');
const app = getApp();

Page({
  data: {
    post: null,
    loading: true,
    commentContent: '',
    canDelete: false,
    showCommentInput: false,
    showEmojiPanel: false,
    sendDisabled: true,
    commentsLoading: false,
    hasMoreComments: false,
    headerPaddingTop: 0,
    photoMode: 'aspectFit',
    photoStyle: '',
    // 回复相关
    replyToId: null,   // 当前回复的评论id（用于显示›被回复人）
    replyToAuthor: '', // 当前回复的评论作者名
    parentId: null,    // 顶级评论ID（云函数用）
highlightCommentId: null,  // 滚动定位时高亮的评论ID
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
    indexBadgeVisible: false,
    shareSheetVisible: false,
    inputRowBottom: 0,  // 键盘高度动态调整
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
          authorAvatar: c.authorAvatar || '/assets/icons/default-avatar.png',
          // 顶级评论的回复时间
          replies: (c.replies || []).map(r => ({
            ...r,
            time: formatDateTime(r.createdAt),
            authorAvatar: r.authorAvatar || '/assets/icons/default-avatar.png'
          })),
          // 如果有更多回复未加载完，标记 hasMore
          _repliesHasMore: (c.repliesCount || 0) > (c.replies || []).length
        }));
        post.authorAvatar = post.authorAvatar || '/assets/icons/default-avatar.png';
        const canDelete = app.globalData.userInfo &&
          (app.globalData.userInfo.id === post.authorId ||
           app.globalData.userInfo.role === 'admin' ||
           app.globalData.userInfo._id === post.authorId);
        const hasMoreComments = res.data.hasMore || false;
        const commentsCountText = formatLikeCount(post.commentsCount || 0).text;
        this.setData({ post, canDelete, loading: false, hasMoreComments, commentsCountText, currentPhotoIndex: 0 });
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
    this._scrollTop = e.detail.scrollTop;
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

  focusCommentInput() {
    this.setData({
      showCommentInput: true,
      showEmojiPanel: false,
      sendDisabled: true,
      replyToId: null,
      replyToAuthor: '',
      parentId: null,
      commentContent: '',
    });
  },

  hideCommentInput() {
    this.setData({
      showCommentInput: false,
      showEmojiPanel: false,
      replyToId: null,
      replyToAuthor: '',
      parentId: null,
      commentContent: '',
      inputRowBottom: 0,
    });
  },

  // 监听键盘高度变化，动态调整输入区底部padding
  _onKeyboardHeightChange(e) {
    this.setData({ inputRowBottom: e.detail.height });
  },
  toggleEmojiPanel() { this.setData({ showEmojiPanel: !this.data.showEmojiPanel }); },

  handleShare() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },

  showShareSheet() {
    this.setData({ shareSheetVisible: true });
  },

  hideShareSheet() {
    this.setData({ shareSheetVisible: false });
  },

  shareToFriend() {
    this.setData({ shareSheetVisible: false });
    setTimeout(() => {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] });
      const post = this.data.post;
      if (post) {
        this.setData({ 'post.shares': (post.shares || 0) + 1 });
        wx.cloud.callFunction({ name: 'posts', data: { action: 'incrementShares', id: post._id } }).catch(() => {});
      }
    }, 300);
  },

  shareToMoments() {
    this.setData({ shareSheetVisible: false });
    setTimeout(() => {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareTimeline'] });
      const post = this.data.post;
      if (post) {
        this.setData({ 'post.shares': (post.shares || 0) + 1 });
        wx.cloud.callFunction({ name: 'posts', data: { action: 'incrementShares', id: post._id } }).catch(() => {});
      }
    }, 300);
  },

  async generatePoster() {
    this.setData({ shareSheetVisible: false });
    const post = this.data.post;
    if (!post) return;
    showLoading('生成海报中…');

    try {
      const sysInfo = wx.getSystemInfoSync();
      const dpr = sysInfo.pixelRatio || 2;

      // 9:16 poster = 405×720px (rpx)
      const pw = 405, ph = 720;
      const canvasW = pw * dpr, canvasH = ph * dpr;

      const ctx = wx.createCanvasContext('poster-canvas', this);
      ctx.scale(dpr, dpr);

      // ── 1. 白色背景 ──
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pw, ph);

      // ── 2. 顶部渐变色条 ──
      const topGrad = ctx.createLinearGradient(0, 0, pw, 0);
      topGrad.addColorStop(0, '#ff4444');
      topGrad.addColorStop(0.5, '#ff6b6b');
      topGrad.addColorStop(1, '#ff9a3c');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, pw, 6);

      // ── 3. 照片（cover 填充，保持宽高比） ──
      const imageUrl = post.coverUrl || post.imageUrl;
      if (imageUrl) {
        // 云存储 URL 需要先转换 https
        let httpsUrl = imageUrl;
        if (imageUrl.startsWith('cloud://')) {
          try {
            const res = await wx.cloud.getTempFileURL({ fileList: [imageUrl] });
            if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
              httpsUrl = res.fileList[0].tempFileURL;
            }
          } catch (e) {}
        }

        await new Promise((resolve, reject) => {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, pw, ph);
          ctx.clip();
          wx.downloadFile({
            url: httpsUrl,
            success: (res) => {
              if (res.statusCode === 200 && res.tempFilePath) {
                ctx.drawImage(res.tempFilePath, 0, 0, pw, ph);
              }
              ctx.restore();
              resolve();
            },
            fail: () => { ctx.restore(); resolve(); }
          });
        });
      }

      // ── 4. 底部白色渐变遮罩 ──
      const botGrad = ctx.createLinearGradient(0, ph * 0.55, 0, ph);
      botGrad.addColorStop(0, 'rgba(255,255,255,0)');
      botGrad.addColorStop(0.3, 'rgba(255,255,255,0.85)');
      botGrad.addColorStop(1, '#ffffff');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, 0, pw, ph);

      // ── 5. 点赞数角标（右上角毛玻璃卡片） ──
      const likes = post.likes || 0;
      const likesText = `❤️ ${likes > 9999 ? '9999+' : likes}`;
      ctx.font = 'bold 20rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
      const likesW = 120, likesH = 52;
      const likesX = pw - likesW - 22, likesY = 22;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.roundRect || ctx.arc;
      _roundRect(ctx, likesX, likesY, likesW, likesH, 14);
      ctx.fill();
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 20rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(likesText, likesX + likesW / 2, likesY + likesH / 2);

      // ── 6. 地点标签（红色胶囊） ──
      const location = post.location || '';
      if (location) {
        ctx.font = '500 20rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
        const locText = '📍 ' + location;
        const locW = ctx.measureText ? ctx.measureText(locText).width + 28 : 100;
        const locH = 44;
        const locX = 32, locY = ph - 300;
        ctx.fillStyle = '#ff4444';
        _roundRect(ctx, locX, locY, Math.max(locW, 80), locH, 22);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '500 20rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(locText, locX + 14, locY + locH / 2);
      }

      // ── 7. 标题文字 ──
      const title = (post.title || post.description || '').trim();
      if (title) {
        ctx.fillStyle = '#1b1b1b';
        ctx.font = 'bold 28rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const titleX = 32, titleY = ph - 240;
        const titleMaxW = pw - 64;
        _drawMultiLineText(ctx, title, titleX, titleY, titleMaxW, 40, 4);
      }

      // ── 8. 底部信息栏：QR码占位 + 来源 ──
      const footerY = ph - 90;

      // 小程序码白底卡片
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.1)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      _roundRect(ctx, 32, footerY - 10, 100, 100, 12);
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // QR 码格子图标（用方块模拟）
      ctx.fillStyle = '#1b1b1b';
      const qrSz = 60, qrX = 32 + 20, qrY = footerY + 10;
      const cell = qrSz / 7;
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          if ((i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) === false && (i + j) % 3 === 0) {
            ctx.fillRect(qrX + i * cell, qrY + j * cell, cell, cell);
          }
        }
      }
      ctx.fillStyle = '#888888';
      ctx.font = '18rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('扫码查看', 82, footerY + 105);

      // 来源文字
      ctx.fillStyle = '#1b1b1b';
      ctx.font = 'bold 22rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('故乡照片墙', pw - 32, footerY + 5);
      ctx.fillStyle = '#999999';
      ctx.font = '18rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
      ctx.fillText('记录家乡的美好瞬间', pw - 32, footerY + 36);

      // 长按保存提示
      ctx.fillStyle = '#bbbbbb';
      ctx.font = '16rpx -apple-system, BlinkMacSystemFont, PingFang SC, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('长按图片 → 保存到相册', pw / 2, ph - 14);

      ctx.draw(false, async () => {
        try {
          hideLoading();
          const res = await wx.canvasToTempFilePath({
            canvasId: 'poster-canvas',
            x: 0, y: 0,
            width: pw, height: ph,
            destWidth: pw * 3,
            destHeight: ph * 3,
            fileType: 'png',
            quality: 1,
          }, this);
          if (res.tempFilePath) {
            wx.previewImage({
              urls: [res.tempFilePath],
              current: res.tempFilePath,
              success: () => {},
              fail: () => showToast('预览失败'),
            });
          }
        } catch (e) {
          hideLoading();
          showToast('生成失败');
        }
      });
    } catch (e) {
      hideLoading();
      showToast('生成失败');
    }
  },

  copyLink() {
    const post = this.data.post;
    if (!post) return;
    const link = `/pages/detail/detail?id=${post._id}`;
    wx.setClipboardData({
      data: link,
      success: () => showToast('链接已复制'),
      fail: () => showToast('复制失败')
    });
    this.setData({ shareSheetVisible: false });
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

  // ========== 评论点赞/回复 ==========

  // 点赞/取消点赞评论（顶层评论）
  async toggleCommentLike(e) {
    if (!app.checkLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return; }
    const commentId = e.currentTarget.dataset.id;
    if (!commentId) return;
    try {
      const res = await postApi.toggleCommentLike(commentId);
      if (res.success) {
        this._updateCommentLike(commentId, res.liked, res.likes);
      }
    } catch (e) { showToast('操作失败'); }
  },

  // 更新本地评论的点赞状态（通用：处理顶层评论和回复，不触发重新排序）
  _updateCommentLike(commentId, liked, likes) {
    const post = this.data.post;
    if (!post || !post.comments) return;
    // 先在顶级评论里找
    const topComment = post.comments.find(c => c.id === commentId);
    if (topComment) {
      topComment.liked = liked;
      topComment.likes = likes;
      this.setData({ post });
      return;
    }
    // 不在顶级里 → 在 B 级回复里找
    for (const c of post.comments) {
      if (c.replies) {
        const reply = c.replies.find(r => r.id === commentId);
        if (reply) {
          reply.liked = liked;
          reply.likes = likes;
          this.setData({ post });
          return;
        }
      }
    }
  },

  // 点击回复按钮：设置回复目标 + 预填 @xxx
  handleReplyTap(e) {
    const { id, author, replyId } = e.currentTarget.dataset;
    if (!id) return;
    if (replyId) {
      // 回复B级评论：parentId = 顶级评论id（A._id），replyTo = B._id（显示›被回复人）
      this.setData({
        replyToId: replyId,      // 被回复的评论ID（用于显示›被回复人）
        replyToAuthor: author || '',
        parentId: id,            // 顶级评论ID（云函数按此字段查子评论）
        showCommentInput: true,
        commentContent: ''
      });
    } else {
      // 回复顶级评论A：parentId 和 replyTo 都设为 A._id
      this.setData({
        replyToId: id,
        replyToAuthor: '',
        parentId: id,
        showCommentInput: true,
        commentContent: ''
      });
    }
  },

  // 取消回复
  // 空操作，阻止事件冒泡
  noop() {},

  cancelReply() {
    this.setData({ replyToId: null, replyToAuthor: '', parentId: null, commentContent: '' });
  },

  // 点击 ›被回复人 滚动定位到原评论
  scrollToComment(e) {
    const targetId = e.currentTarget.dataset.id;
    if (!targetId) return;
    // 找到目标顶级评论
    const comments = this.data.post?.comments || [];
    const targetComment = comments.find(c => c.id === targetId);
    if (!targetComment) return;

    // 高亮目标评论（临时 yellow 背景，2s 后消退）
    this.setData({ highlightCommentId: targetId });
    clearTimeout(this._highlightTimer);
    this._highlightTimer = setTimeout(() => {
      this.setData({ highlightCommentId: null });
    }, 2000);

    // 使用 wx.createSelectorQuery 获取目标评论的位置，然后滚动
    const query = wx.createSelectorQuery().in(this);
    query.select('#comment-' + targetId).boundingClientRect((rect) => {
      if (!rect) return;
      query.select('.detail-scroll').scrollOffset((scrollRes) => {
        const currentScrollTop = scrollRes?.scrollTop || 0;
        // 计算目标滚动位置：当前滚动 + 目标元素顶部 - 一个小偏移量（避开紧贴顶部）
        const targetScrollTop = currentScrollTop + rect.top - 20;
        // 使用 scroll-view 的 scroll-top 属性（通过 data 属性驱动）
        this.setData({ commentScrollTop: targetScrollTop });
        // 200ms 后清除，让 scroll-top 回到自动模式
        clearTimeout(this._commentScrollTimer);
        this._commentScrollTimer = setTimeout(() => {
          this.setData({ commentScrollTop: 0 });
        }, 300);
      }).exec();
    }).exec();
  },

  // 展开/收起更多回复（分批：3→10→10）
  async expandReplies(e) {
    const commentId = e.currentTarget.dataset.id;
    if (!commentId) return;
    const post = this.data.post;
    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) return;

    // 「展开N条回复」按钮（收起后恢复）：恢复收起前的已加载内容，不调接口
    if (comment._everExpandedOnce && !comment._repliesExpanded) {
      comment._repliesExpanded = true;
      this.setData({ post });
      return;
    }

    // 展开更多：继续加载下一批回复
    comment._repliesLoading = true;
    this.setData({ post });
    try {
      const currentCount = comment.replies ? comment.replies.length : 0;
      // 批次策略：初始3条 → 第一次展开加载7条(凑满10) → 之后每次10条
      let limit;
      if (currentCount === 0) {
        limit = 3;
      } else if (currentCount < 10) {
        limit = 10 - currentCount; // 凑满10
      } else {
        limit = 10; // 之后每次10
      }
      const res = await postApi.getCommentReplies(commentId, currentCount, limit);
      if (res.success && res.data?.replies) {
        const newReplies = res.data.replies.map(r => ({
          ...r,
          time: formatDateTime(r.createdAt),
          authorAvatar: r.authorAvatar || '/assets/icons/default-avatar.png'
        }));
        const thePost = this.data.post;
        const theComment = thePost.comments.find(c => c.id === commentId);
        if (theComment) {
          theComment.replies = [...(theComment.replies || []), ...newReplies];
          theComment._repliesLoading = false;
          theComment._repliesHasMore = res.data.hasMore;
          theComment._repliesExpanded = true;
          theComment._everExpandedOnce = true;
          this.setData({ post: thePost });
        }
      }
    } catch (e) {
      const thePost = this.data.post;
      const theComment = thePost.comments.find(c => c.id === commentId);
      if (theComment) { theComment._repliesLoading = false; this.setData({ post: thePost }); }
      showToast('加载失败');
    }
  },

  // 收起全部回复（仅在全部加载完毕后可点击）
  collapseReplies(e) {
    const commentId = e.currentTarget.dataset.id;
    if (!commentId) return;
    const post = this.data.post;
    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) return;
    comment._repliesExpanded = false;
    this.setData({ post });
  },

  onCommentInput(e) {
    const value = e.detail.value;
    this.setData({ commentContent: value, sendDisabled: !value.trim() });
  },

  async submitComment() {
    if (!app.checkLogin()) { wx.navigateTo({ url: '/pages/login/login' }); return; }
    const content = this.data.commentContent.trim();
    if (!content) { showToast('请输入评论内容'); return; }
    // 去掉自动补的 @author 前缀（用户可能没删）
    const cleanContent = content.replace(/^@[^\s]+\s/, '').trim();
    if (!cleanContent) { showToast('请输入评论内容'); return; }
    try {
      showLoading('发送中...');
      const parentId = this.data.parentId || null;
      const replyTo = this.data.replyToId || null;   // 回复目标评论ID（用于显示›被回复人）
      const replyToAuthor = this.data.replyToAuthor || '';
      const res = await postApi.addComment(this.postId, cleanContent, parentId, replyTo, replyToAuthor);
      hideLoading();
      if (res.success) {
        showSuccess(parentId ? '回复成功' : '评论成功');
        this.setData({ commentContent: '', showCommentInput: false, showEmojiPanel: false, sendDisabled: true, replyToId: null, replyToAuthor: '', parentId: null });
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

// ── 海报绘制辅助函数 ──

// 圆角矩形（兼容旧版微信 canvas API）
function _roundRect(ctx, x, y, w, h, r) {
  if (ctx.beginPath && ctx.closePath) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}

// 多行文字（自动换行 + 截断）
function _drawMultiLineText(ctx, text, x, y, maxW, lineH, maxLines) {
  if (!ctx.measureText) return;
  let line = '';
  let lineCount = 0;
  for (let i = 0; i < text.length; i++) {
    const testLine = line + text[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxW && line.length > 0) {
      if (lineCount >= maxLines - 1) {
        // 最后一行打省略号
        let shortLine = line;
        while (ctx.measureText(shortLine + '…').width > maxW && shortLine.length > 0) {
          shortLine = shortLine.slice(0, -1);
        }
        ctx.fillText(shortLine + '…', x, y + lineCount * lineH);
        return;
      }
      ctx.fillText(line, x, y + lineCount * lineH);
      line = text[i];
      lineCount++;
    } else {
      line = testLine;
    }
  }
  if (lineCount < maxLines && line) {
    ctx.fillText(line, x, y + lineCount * lineH);
  }
}
