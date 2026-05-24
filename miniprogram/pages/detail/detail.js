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
    deleteBtnPressed: false,
    showCommentInput: false,
    loginModalShow: false,
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
    // 进入动画（首页→详情 FLIP）
    enterAnimImageUrl: '',   // FLIP 使用的图片 URL（来自首页传递）
    enterAnimActive: false,  // 是否显示进入动画层
    enterAnimTransform: 'translate(0px,0px) scale(1,1)',
    enterAnimClass: '',
    enterAnimOpacity: 1,
    // 预览动画
    previewAnimClass: '',
    overlayOpacity: 0,
    yPageVisible: true,
    showLikeAnim: false,
    canGoPrev: false,
    canGoNext: false,
    currentPhotoIndex: 0,
    indexBadgeVisible: false,
    inputRowBottom: 0,  // 键盘高度动态调整
  },

  // 私有状态
  _rectY: null,       // Y 图片元素屏幕位置（含 scroll offset）
  _flipParams: null,   // 进入动画参数，供退出动画反向使用
  _imgNaturalW: 0,     // 图片原始宽度（onPhotoLoad 获取）
  _imgNaturalH: 0,     // 图片原始高度
  _indexCardRect: null, // 首页→详情 FLIP 起点 rect（由首页传入）
  _indexCardUrl: '',    // 首页卡片图片 URL

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
      // 接收首页传来的卡片 rect 数据（通过 globalData）
      const app = getApp();
      this._indexCardRect = app.globalData._indexCardRect || null;
      this._indexCardUrl = app.globalData._indexCardUrl || '';
      this._indexAvatarUrl = app.globalData._indexAvatarUrl || '';
      this._indexTextRects = app.globalData._indexTextRects || null;
      this._indexTitleText = app.globalData._indexTitleText || '';
      this._indexDescText = app.globalData._indexDescText || '';
      app.globalData._indexCardRect = null;
      app.globalData._indexCardUrl = '';
      app.globalData._indexAvatarUrl = '';
      app.globalData._indexTextRects = null;
      app.globalData._indexTitleText = '';
      app.globalData._indexDescText = '';
      // 立即触发动画层（不等待 API），使 detail-shell 在动画期间保持隐藏
      this._playEnterAnim();
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
          _hasReplies: (c.repliesCount || 0) > 0 || (c.replies && c.replies.length > 0),
          _repliesHasMore: (c.repliesCount || 0) > (c.replies || []).length
        }));
        post.authorAvatar = post.authorAvatar || '/assets/icons/default-avatar.png';
        // 头像复用：优先用首页传入的 URL（避免云存储 403 导致头像空白）
        if (this._indexAvatarUrl) {
          post.authorAvatar = this._indexAvatarUrl;
        }
        const canDelete = !!post.canDelete;
        const hasMoreComments = res.data.hasMore || false;
        const commentsCountText = formatLikeCount(post.commentsCount || 0).text;
        this.setData({ post, canDelete, loading: false, hasMoreComments, commentsCountText, currentPhotoIndex: 0 });
        this._updateNavState();
        // 动画已在 onLoad 时触发，无需再次调用
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

  // ========== 首页→详情 FLIP 动画 ==========
  // 时序：
  //   1. loadPost 完成后，检查是否有 _indexCardRect
  //   2. 有则显示进入动画层（opacity=0，在卡片位置），加载图片
  //   3. 图片加载后（onImageLoad），计算 Y 起点 aspectFit 布局 + Q 终点 aspectFit 布局
  //   4. nextTick opacity=1 显示，然后设终点触发 350ms 弹簧 transition
  //   5. 动画结束后隐藏动画层，显示真实页面
  _playEnterAnim() {
    var self = this;
    if (!this._indexCardRect) return;
    // 注意：不检查 this.data.post，因为动画在 onLoad 时触发时 API 尚未返回

    var rect = this._indexCardRect;  // { left, top, width, height }
    var post = this.data.post;
    // post 可能在 onLoad 时为 null（API 尚未返回），此时从 globalData 获取图片 URL
    var firstPhoto = post ? (post.photos && post.photos[0]) : null;
    if (!firstPhoto) {
      // 无 post 数据时，用 globalData 兜底获取图片 URL 和宽高比
      var imgUrl = this._indexCardUrl;
      if (!imgUrl) return;
      // aspectRatio 未知，设为 1（按正方形处理）
      var imgAR = 1;
    } else {
      var imgUrl = this._indexCardUrl || firstPhoto.imageUrl || post.imageUrl || post.coverUrl;
      var imgAR = post.aspectRatio || 1;
    }
    var titleText = this._indexTitleText || '';
    var descText = this._indexDescText || '';
    if (imgAR <= 0) imgAR = 1;

    // Phase 1: 显示动画层，opacity=0（在正确位置之前先隐藏）
    this.setData({
      enterAnimImageUrl: imgUrl,
      enterAnimActive: true,
      enterAnimTransform: 'translate(0px,0px) scale(1,1)',
      enterAnimClass: '',
      enterAnimOpacity: 0,
      enterAnimTitleText: titleText,
      enterAnimDescText: descText,
      enterAnimTextTransform: 'translate(0px,0px)',
      enterAnimTextClass: ''
    });

    // 等 DOM 更新后计算坐标并执行动画
    wx.nextTick(function() {
      // 读取动画层 image 的实际 boundingClientRect（它的宽是屏幕宽，Y起点从这里算）
      self._measureAnimImage(function(animImgRect) {
        if (!animImgRect) {
          // 兜底：无法测量，直接显示页面
          self.setData({ enterAnimActive: false });
          return;
        }

        // 计算 Y 起点布局（卡片 rect 在首页的 aspectFill 效果 → 等效 aspectFit 中心点）
        // 卡片 rect 是 aspectFill 容器（已知宽高），图片在里面等比填充
        // 由于 aspectFill 裁切，容器的中心 = 图片可见区域的中心（容器的中心对齐图片可见区域中心）
        // 所以直接用 rect 的中心点作为 Y 的 aspectFit 中心
        var yLayout = self._aspectFitLayout(rect.width, rect.height, imgAR);
        var yVisW = yLayout.visW, yVisH = yLayout.visH;
        var yCenterX = rect.left + yLayout.offsetX + yVisW / 2;
        var yCenterY = rect.top + yLayout.offsetY + yVisH / 2;

        // 计算 Q 终点布局（屏幕宽，图片等比缩放居中）
        var screenW = self._windowWidth || wx.getSystemInfoSync().windowWidth;
        var screenH = self._windowHeight || wx.getSystemInfoSync().windowHeight;
        var qLayout = self._aspectFitLayout(screenW, screenH, imgAR);
        var qVisW = qLayout.visW, qVisH = qLayout.visH;
        var qCenterX = qLayout.offsetX + qVisW / 2;
        var qCenterY = qLayout.offsetY + qVisH / 2;

        // 起点 transform：以动画层容器（screenW×screenH）的左上角为原点，scale+translate 使图片中心对齐 Y
        var startSx = yVisW / qVisW;
        var startSy = yVisH / qVisH;
        var startTx = yCenterX - qCenterX * startSx;
        var startTy = yCenterY - qCenterY * startSy;

        // Phase 2: 设 transform 为 Y 起点（opacity 仍为 0，看不见）
        self._currentTx = startTx; self._currentTy = startTy;
        self._currentScale = startSx; self._currentSy = startSy;
        self.setData({
          enterAnimTransform: 'translate(' + startTx.toFixed(2) + 'px, ' + startTy.toFixed(2) + 'px) scale(' + startSx.toFixed(4) + ', ' + startSy.toFixed(4) + ')'
        });

        // Phase 3: nextTick opacity=1（在 Y 位置可见），然后触发弹簧动画到终点
        wx.nextTick(function() {
          self.setData({ enterAnimOpacity: 1 });
          setTimeout(function() {
            self._currentTx = 0; self._currentTy = 0;
            self._currentScale = 1; self._currentSy = 1;
            self.setData({
              enterAnimTransform: 'translate(0px, 0px) scale(1, 1)',
              enterAnimClass: 'animating-enter'
            });

            // 350ms 弹簧 + buffer 后收尾
            setTimeout(function() {
              self.setData({ enterAnimActive: false, enterAnimClass: '', enterAnimTextClass: '' });
              // 骨架屏随真实内容一起显示（setData loading:false 时已消失）
            }, 380);
          }, 16);
        });
      });
    });
  },

  _measureAnimImage(callback) {
    // 动画 image 填满屏幕，计算它相对于屏幕的 aspectFit 区域
    // 实际上 image 填满了 screenW×H，我们想要图片实际显示的边界
    // 但 image 是 cover 模式（填满），我们的 FLIP 用的是 image element 本身
    // 这里 measure 动画层 image 的 boundingClientRect 即可
    wx.createSelectorQuery().in(this).select('.enter-anim-image').boundingClientRect(function(rect) {
      callback(rect);
    }).exec();
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
    if (!this._ensureLogin()) return;
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

  // 标准触底加载（兜底方案，scroll-view 滚动失效时启用）
  onReachBottom() {
    this._tryLoadMore();
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

  onDeleteBtnTouchStart() {
    this.setData({ deleteBtnPressed: true });
  },

  onDeleteBtnTouchEnd() {
    if (this.data.deleteBtnPressed) {
      this.setData({ deleteBtnPressed: false });
    }
  },

  onDeletePost() {
    const post = this.data.post;
    if (!post || !this.data.canDelete) return;
    const id = post.id || post._id;
    if (!id) return;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定要删除这条作品吗？',
      confirmColor: '#e02020',
      success: async (res) => {
        if (!res.confirm) return;
        showLoading('删除中...');
        try {
          const result = await postApi.deletePost(id);
          hideLoading();
          if (result.success) {
            showSuccess('已删除');
            setTimeout(() => wx.navigateBack(), 400);
          } else {
            showToast(result.message || '删除失败');
          }
        } catch (e) {
          hideLoading();
          console.error('[onDeletePost]', e);
          showToast('删除失败');
        }
      }
    });
  },

  _ensureLogin() {
    if (app.checkLogin()) return true;
    this.setData({ loginModalShow: true });
    return false;
  },

  onLoginModalClose() {
    this.setData({ loginModalShow: false });
  },

  onLoginSuccess() {
    this.setData({ loginModalShow: false });
  },

  focusCommentInput() {
    if (!this._ensureLogin()) return;
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
    // 触发分享菜单（原生右上角三点菜单，含「分享给朋友」「分享到朋友圈」）
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  },
  async generatePoster() {
    const post = this.data.post;
    if (!post) return;
    showLoading('生成海报中…');

    try {
      // Canvas 2D API: get node first
      const canvas = await new Promise((resolve, reject) => {
        wx.createSelectorQuery().in(this)
          .select('#poster-canvas')
          .node({ resizable: false }, (res) => {
            if (res && res.node) resolve(res.node);
            else reject(new Error('canvas node not found'));
          }).exec();
      });
      const ctx = canvas.getContext('2d');

      // 9:16 poster = 405×720 CSS px, DPR×3 for physical px export
      const pw = 405, ph = 720;
      canvas.width = pw * 3;
      canvas.height = ph * 3;

      // ---- Canvas 2D helpers ----
      function drawRoundRect(cx, x, y, w, h, r) {
        cx.beginPath();
        cx.moveTo(x + r, y);
        cx.lineTo(x + w - r, y);
        cx.arcTo(x + w, y, x + w, y + r, r);
        cx.lineTo(x + w, y + h - r);
        cx.arcTo(x + w, y + h, x + w - r, y + h, r);
        cx.lineTo(x + r, y + h);
        cx.arcTo(x, y + h, x, y + h - r, r);
        cx.lineTo(x, y + r);
        cx.arcTo(x, y, x + r, y, r);
        cx.closePath();
        cx.fill();
      }

      function drawMultiLine(cx, text, x, y, maxW, lineH, maxLines) {
        if (!cx.measureText) return;
        const chars = text.split('');
        let line = '', lineYs = [];
        for (let i = 0; i < chars.length; i++) {
          const test = line + chars[i];
          if (cx.measureText(test).width > maxW && i > 0) {
            if (lineYs.length >= maxLines - 1) { line += '…'; break; }
            lineYs.push(y + lineYs.length * lineH);
            line = chars[i];
          } else { line = test; }
        }
        lineYs.push(y + lineYs.length * lineH);
        cx.save();
        cx.beginPath();
        cx.rect(x, y, maxW, lineYs[lineYs.length - 1] + lineH - y + 10);
        cx.clip();
        for (let i = 0; i < lineYs.length; i++) {
          cx.fillText(i === lineYs.length - 1 ? line : line, x, lineYs[i]);
        }
        cx.restore();
      }

      // 1. 白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. 照片区 cover 填充 (360px CSS → 1080px 物理)
      const PHOTO_H = 360 * 3;
      const imageUrl = post.coverUrl || post.imageUrl;
      if (imageUrl) {
        let httpsUrl = imageUrl;
        if (imageUrl.startsWith('cloud://')) {
          try {
            const res = await wx.cloud.getTempFileURL({ fileList: [imageUrl] });
            if (res.fileList && res.fileList[0]) httpsUrl = res.fileList[0].tempFileURL || httpsUrl;
          } catch (e) {}
        }
        const tmp = await new Promise((resolve) => {
          wx.downloadFile({
            url: httpsUrl,
            success: (r) => { if (r.statusCode === 200) resolve(r.tempFilePath); else resolve(null); },
            fail: () => resolve(null)
          });
        });
        if (tmp) {
          const img = canvas.createImage();
          await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; img.src = tmp; });
          if (img.width && img.height) {
            const photoW = pw * 3;
            const imgH = Math.round(photoW * img.height / img.width);
            const srcY = Math.max(0, Math.round((imgH - PHOTO_H) / 2));
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, photoW, PHOTO_H);
            ctx.clip();
            ctx.drawImage(img, 0, srcY, photoW, imgH, 0, 0, photoW, PHOTO_H);
            ctx.restore();
          }
        }
      }

      // 3. 照片底部渐变遮罩
      const gradFade = ctx.createLinearGradient(0, PHOTO_H - 100 * 3, 0, PHOTO_H);
      gradFade.addColorStop(0, 'rgba(255,255,255,0)');
      gradFade.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = gradFade;
      ctx.fillRect(0, PHOTO_H - 100 * 3, pw * 3, 100 * 3);

      // 4. 角标（右上角）
      const totalPhotos = post.photos && post.photos.length || 1;
      const currentIdx = (post.currentPhotoIndex || 0) + 1;
      const badgeText = currentIdx + ' / ' + totalPhotos;
      const badgeW = 50 * 3, badgeH = 24 * 3;
      const badgeX = pw * 3 - badgeW - 12 * 3, badgeY = 12 * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 10 * 3);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold ' + (10 * 3) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);

      // 5. 地点标签（红色胶囊，左下角）
      const location = post.location || '';
      if (location) {
        ctx.font = '500 ' + (10 * 3) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
        const locW = Math.min(ctx.measureText(location).width + 20 * 3, 200 * 3);
        const locH = 28 * 3, locX = 14 * 3, locY = PHOTO_H - locH - 12 * 3;
        ctx.fillStyle = '#ff4444';
        drawRoundRect(ctx, locX, locY, Math.max(locW, 80 * 3), locH, 14 * 3);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(location, locX + 10 * 3, locY + locH / 2);
      }

      // 6. 底部白色信息区（顶部圆角 18px）
      const CARD_Y = PHOTO_H, CARD_R = 18 * 3, CARD_W = pw * 3, CARD_H2 = ph * 3 - CARD_Y;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, CARD_Y, CARD_W, CARD_H2);
      ctx.beginPath();
      ctx.moveTo(CARD_R, CARD_Y);
      ctx.lineTo(CARD_W - CARD_R, CARD_Y);
      ctx.arcTo(CARD_W, CARD_Y, CARD_W, CARD_Y + CARD_R, CARD_R);
      ctx.lineTo(CARD_W, CARD_Y + CARD_H2 - CARD_R);
      ctx.arcTo(CARD_W, CARD_Y + CARD_H2, CARD_W - CARD_R, CARD_Y + CARD_H2, CARD_R);
      ctx.lineTo(CARD_R, CARD_Y + CARD_H2);
      ctx.arcTo(0, CARD_Y + CARD_H2, 0, CARD_Y + CARD_H2 - CARD_R, CARD_R);
      ctx.lineTo(0, CARD_Y + CARD_R);
      ctx.arcTo(0, CARD_Y, CARD_R, CARD_Y, CARD_R);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.09)';
      ctx.shadowBlur = 30 * 3; ctx.shadowOffsetY = -6 * 3;
      ctx.fill();
      ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      // 7. 标题（bold 17px）
      const title = (post.title || post.description || '').trim();
      if (title) {
        ctx.fillStyle = '#1b1b1b';
        ctx.font = 'bold ' + (17 * 3) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        drawMultiLine(ctx, title, 22 * 3, CARD_Y + 20 * 3, (pw - 44) * 3, 24 * 3, 4);
      }

      // 8. 分隔线
      const DIVIDER_Y = CARD_Y + 84 * 3;
      ctx.fillStyle = '#f3f3f3';
      ctx.fillRect(22 * 3, DIVIDER_Y, (pw - 44) * 3, 3);

      // 9. 作者区 + 点赞
      const FOOTER_Y = DIVIDER_Y + 14 * 3;
      const AVATAR_SIZE = 36 * 3;
      const authorName = post.author || '匿名';
      const postDate = post.date || '';
      const likes = post.likes || 0;

      let avatarUrl = post.authorAvatar || '/assets/icons/default-avatar.png';
      if (avatarUrl.startsWith('cloud://')) {
        try {
          const res = await wx.cloud.getTempFileURL({ fileList: [avatarUrl] });
          if (res.fileList && res.fileList[0]) avatarUrl = res.fileList[0].tempFileURL || avatarUrl;
        } catch (e) {}
      }
      const avaTmp = await new Promise((resolve) => {
        wx.downloadFile({
          url: avatarUrl,
          success: (r) => { if (r.statusCode === 200) resolve(r.tempFilePath); else resolve(null); },
          fail: () => resolve(null)
        });
      });
      if (avaTmp) {
        const avaImg = canvas.createImage();
        await new Promise((resolve) => { avaImg.onload = resolve; avaImg.onerror = resolve; avaImg.src = avaTmp; });
        if (avaImg.width && avaImg.height) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(22 * 3 + AVATAR_SIZE / 2, FOOTER_Y + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(avaImg, 22 * 3, FOOTER_Y, AVATAR_SIZE, AVATAR_SIZE);
          ctx.restore();
        }
      }

      ctx.fillStyle = '#1b1b1b';
      ctx.font = '600 ' + (13 * 3) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(authorName, 22 * 3 + AVATAR_SIZE + 9 * 3, FOOTER_Y + 2 * 3);
      ctx.fillStyle = '#888888';
      ctx.font = (11 * 3) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(postDate, 22 * 3 + AVATAR_SIZE + 9 * 3, FOOTER_Y + 20 * 3);

      const hx = pw * 3 - 22 * 3, hy = FOOTER_Y + AVATAR_SIZE / 2;
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.moveTo(hx - 18 * 3, hy);
      ctx.bezierCurveTo(hx - 18 * 3, hy - 8 * 3, hx - 26 * 3, hy - 8 * 3, hx - 26 * 3, hy - 2 * 3);
      ctx.bezierCurveTo(hx - 26 * 3, hy + 6 * 3, hx - 18 * 3, hy + 10 * 3, hx - 18 * 3, hy + 10 * 3);
      ctx.bezierCurveTo(hx - 18 * 3, hy + 10 * 3, hx - 10 * 3, hy + 6 * 3, hx - 10 * 3, hy - 2 * 3);
      ctx.bezierCurveTo(hx - 10 * 3, hy - 8 * 3, hx - 18 * 3, hy - 8 * 3, hx - 18 * 3, hy);
      ctx.fill();
      ctx.fillStyle = '#ff4444';
      ctx.font = '600 ' + (13 * 3) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(String(likes), hx - 28 * 3, hy);

      // 10. 底部提示
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.font = (11 * 3) + 'px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('长按图片 → 保存到相册', pw * 3 / 2, ph * 3 - 22 * 3);

      // 导出
      const res = await wx.canvasToTempFilePath({
        canvasId: 'poster-canvas',
        destWidth: pw * 3, destHeight: ph * 3,
        fileType: 'png', quality: 1,
      }, this);
      hideLoading();
      if (res.tempFilePath) {
        wx.previewImage({ urls: [res.tempFilePath], current: res.tempFilePath });
      } else {
        showToast('生成失败');
      }
    } catch (e) {
      hideLoading();
      showToast('生成失败');
    }
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
    if (!this._ensureLogin()) return;
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
    if (!this._ensureLogin()) return;
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
    if (!this._ensureLogin()) return;
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
    if (!this._ensureLogin()) return;
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
