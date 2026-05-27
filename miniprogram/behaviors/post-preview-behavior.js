const { postApi } = require('../utils/api');

const PREVIEW_DIR_LOCK_PX = 8;
const PREVIEW_VERTICAL_EXIT_RATIO = 0.12;

/**
 * 全屏图片预览（从 detail 页提炼，供首页浮层使用）
 */
module.exports = Behavior({
  data: {
    isPreviewMode: false,
    previewTransform: 'translate(0px, 0px) scale(1, 1)',
    previewBgBlack: true,
    previewAnimating: false,
    previewOpacity: 1,
    previewAnimClass: '',
    overlayOpacity: 0,
    previewBgStyle: '',
    previewDismissDragging: false,
    bottomBarVisible: false,
    showLikeAnim: false,
  },

  methods: {
    _aspectFitLayout(containerW, containerH, imgAR) {
      const containerAR = containerW / containerH;
      let visW;
      let visH;
      if (imgAR > containerAR) {
        visW = containerW;
        visH = containerW / imgAR;
      } else {
        visH = containerH;
        visW = containerH * imgAR;
      }
      return {
        visW,
        visH,
        offsetX: (containerW - visW) / 2,
        offsetY: (containerH - visH) / 2,
      };
    },

    _getDist(t0, t1) {
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    },

    _getTransformValues() {
      const sx = this._currentScale !== undefined ? this._currentScale : 1;
      const sy = this._currentSy !== undefined ? this._currentSy : sx;
      return { tx: this._currentTx || 0, ty: this._currentTy || 0, sx, sy };
    },

    _applyPreviewTransform(tx, ty, sx, sy) {
      this._currentTx = tx;
      this._currentTy = ty;
      this._currentScale = sx;
      this._currentSy = sy;
      this.setData({
        previewTransform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`,
      });
    },

    onPhotoLoad(e) {
      const { width, height } = e.detail;
      if (!width || !height) return;
      this._imgNaturalW = width;
      this._imgNaturalH = height;
    },

    onImageTap() {
      if (!this.data.flyDone || this.data.loading || this.data.isPreviewMode) return;
      this.enterPreview();
    },

    onPreviewSwiperChange(e) {
      this.setData({ currentPhotoIndex: e.detail.current });
      this._showIndexBadge();
    },

    enterPreview() {
      if (!this.data.post) return;

      let imgAR =
        this._imgNaturalW && this._imgNaturalH
          ? this._imgNaturalW / this._imgNaturalH
          : null;

      this.setData({
        isPreviewMode: true,
        previewBgBlack: true,
        previewAnimating: false,
        previewTransform: 'translate(0px, 0px) scale(1, 1)',
        previewOpacity: 0,
        bottomBarVisible: false,
        overlayOpacity: 0,
        previewBgStyle: 'background:#121212;',
        previewDismissDragging: false,
      });

      wx.createSelectorQuery()
        .in(this)
        .selectAll('.photo-image')
        .boundingClientRect((rects) => {
          const rectY = (rects && rects[this.data.currentPhotoIndex]) || (rects && rects[0]);
          if (!rectY) {
            this.setData({
              bottomBarVisible: true,
              previewOpacity: 1,
              previewTransform: 'translate(0px, 0px) scale(1, 1)',
            });
            return;
          }

          if (!imgAR) imgAR = rectY.width / rectY.height;
          this._rectY = rectY;

          const yLayout = this._aspectFitLayout(rectY.width, rectY.height, imgAR);
          const yVisW = yLayout.visW;
          const yVisH = yLayout.visH;
          const yCenterX = rectY.left + yLayout.offsetX + yVisW / 2;
          const yCenterY = rectY.top + yLayout.offsetY + yVisH / 2;

          const screenW = this._windowWidth || wx.getSystemInfoSync().windowWidth;
          const screenH = this._windowHeight || wx.getSystemInfoSync().windowHeight;
          const qLayout = this._aspectFitLayout(screenW, screenH, imgAR);
          const qVisW = qLayout.visW;
          const qVisH = qLayout.visH;
          const qVisOffsetX = qLayout.offsetX;
          const qVisOffsetY = qLayout.offsetY;

          const startSx = yVisW / qVisW;
          const startSy = yVisH / qVisH;
          const startTx = yCenterX - (qVisOffsetX + qVisW / 2) * startSx;
          const startTy = yCenterY - (qVisOffsetY + qVisH / 2) * startSy;

          this._flipParams = {
            startTx,
            startTy,
            startSx,
            startSy,
            endTx: 0,
            endTy: 0,
            endSx: 1,
            endSy: 1,
          };

          this._exitRequested = false;
          this._previewAnimating = true;
          this._currentTx = startTx;
          this._currentTy = startTy;
          this._currentScale = startSx;
          this._currentSy = startSy;

          this.setData({
            previewTransform: `translate(${startTx.toFixed(2)}px, ${startTy.toFixed(2)}px) scale(${startSx.toFixed(4)}, ${startSy.toFixed(4)})`,
          });

          wx.nextTick(() => {
            this.setData({ previewOpacity: 1 });
            setTimeout(() => {
              this._currentTx = 0;
              this._currentTy = 0;
              this._currentScale = 1;
              this._currentSy = 1;
              this.setData({
                previewTransform: 'translate(0px, 0px) scale(1, 1)',
                previewAnimClass: 'animating-enter',
              });
              setTimeout(() => {
                if (this._exitRequested) return;
                this.setData({
                  bottomBarVisible: true,
                  previewAnimClass: '',
                  previewAnimating: false,
                });
                this._previewAnimating = false;
              }, 360);
            }, 16);
          });
        })
        .exec();
    },

    exitPreview() {
      const rectY = this._rectY;
      const flipParams = this._flipParams;

      if (!rectY || !flipParams) {
        this.setData({
          isPreviewMode: false,
          previewAnimating: false,
          previewBgBlack: false,
          previewBgStyle: '',
          previewDismissDragging: false,
        });
        return;
      }

      this._previewAnimating = true;
      this._exitRequested = true;

      const curTx = this._currentTx || 0;
      const curTy = this._currentTy || 0;
      const curSx = this._currentScale || 1;
      const curSy = this._currentSy || curSx;
      const { endTx, endTy, endSx, endSy } = flipParams;

      this.setData({
        previewAnimClass: '',
        previewTransform: `translate(${curTx.toFixed(2)}px, ${curTy.toFixed(2)}px) scale(${curSx.toFixed(4)}, ${curSy.toFixed(4)})`,
        bottomBarVisible: false,
      });

      wx.nextTick(() => {
        this._currentTx = endTx;
        this._currentTy = endTy;
        this._currentScale = endSx;
        this._currentSy = endSy;
        this.setData({
          previewTransform: `translate(${endTx.toFixed(2)}px, ${endTy.toFixed(2)}px) scale(${endSx.toFixed(4)}, ${endSy.toFixed(4)})`,
          previewAnimClass: 'animating-exit',
        });

        setTimeout(() => {
          this.setData({
            previewTransform: `translate(${endTx.toFixed(2)}px, ${endTy.toFixed(2)}px) scale(${endSx.toFixed(4)}, ${endSy.toFixed(4)})`,
            previewAnimClass: '',
          });
          setTimeout(() => {
            this.setData({
              isPreviewMode: false,
              previewOpacity: 1,
              previewBgBlack: false,
              previewBgStyle: '',
              previewDismissDragging: false,
            });
            this._previewAnimating = false;
            this._currentTx = 0;
            this._currentTy = 0;
            this._currentScale = 1;
            this._currentSy = 1;
            this._rectY = null;
            this._flipParams = null;
            this._exitRequested = false;
          }, 16);
        }, 300);
      });
    },

    _applyVerticalDismissVisual(dy) {
      const h = this._windowHeight || 667;
      const progress = Math.min(Math.abs(dy) / (h * 0.38), 1);
      const scale = 1 - progress * 0.1;
      const bgAlpha = Math.max(0, 1 - progress * 0.92);
      this._applyPreviewTransform(0, dy, scale, scale);
      this.setData({
        previewDismissDragging: true,
        previewBgStyle: `background: rgba(18, 18, 18, ${bgAlpha.toFixed(3)});`,
        bottomBarVisible: false,
      });
    },

    _resetVerticalDismissPreview(animate) {
      this.setData({
        previewDismissDragging: false,
        previewAnimating: !!animate,
        previewBgStyle: 'background:#121212;',
        bottomBarVisible: true,
      });
      this._applyPreviewTransform(0, 0, 1, 1);
      if (animate) {
        setTimeout(() => this.setData({ previewAnimating: false }), 300);
      }
    },

    onPreviewTouchStart(e) {
      const t = e.touches;
      this._touchStartTime = Date.now();
      this._hasMoved = false;

      if (this._previewAnimating) return;

      const { tx, ty, sx, sy } = this._getTransformValues();
      this._startTx = tx;
      this._startTy = ty;
      this._startSx = sx;
      this._startSy = sy;

      if (t.length === 2) {
        this._gestureState = 'pinch';
        this._pinchStartDist = this._getDist(t[0], t[1]);
        this._pinchStartCenter = {
          x: (t[0].clientX + t[1].clientX) / 2,
          y: (t[0].clientY + t[1].clientY) / 2,
        };
      } else if (t.length === 1) {
        this._gestureState = 'single';
        this._touchStart = { x: t[0].clientX, y: t[0].clientY };
        const windowHeight = this._windowHeight;
        const bottomBarH = this._bottomBarH;
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
        this._applyPreviewTransform(newTx, newTy, scale, sy);
      } else if (t.length === 1 && (this._gestureState === 'single' || this._gestureState === 'pan' || this._gestureState === 'vertical-dismiss')) {
        if (this._gestureState === 'in-bottom') return;
        const dx = t[0].clientX - this._touchStart.x;
        const dy = t[0].clientY - this._touchStart.y;

        if (Math.abs(dx) > PREVIEW_DIR_LOCK_PX || Math.abs(dy) > PREVIEW_DIR_LOCK_PX) {
          this._hasMoved = true;

          if (this._startSx > 1.05) {
            this._gestureState = 'pan';
            this._applyPreviewTransform(
              this._startTx + dx,
              this._startTy + dy,
              this._startSx,
              this._startSy
            );
            return;
          }

          if (this._gestureState === 'single') {
            if (Math.abs(dy) > Math.abs(dx)) {
              this._gestureState = 'vertical-dismiss';
            } else {
              this._gestureState = 'horizontal';
              return;
            }
          }

          if (this._gestureState === 'vertical-dismiss') {
            this._applyVerticalDismissVisual(dy);
          }
        }
      }
    },

    onPreviewTouchEnd(e) {
      const touchY = e.changedTouches?.[0]?.clientY ?? 0;
      const bottomBarTop = this._windowHeight - this._bottomBarH;
      const startedInBottom = this._gestureState === 'in-bottom';
      const endedInBottom = touchY >= bottomBarTop;
      if (startedInBottom || endedInBottom) return;

      const { ty, sx, sy } = this._getTransformValues();
      const dt = Date.now() - this._touchStartTime;

      if (this._gestureState === 'vertical-dismiss') {
        const threshold = (this._windowHeight || 667) * PREVIEW_VERTICAL_EXIT_RATIO;
        if (Math.abs(ty) >= threshold) {
          this.exitPreview();
        } else {
          this._resetVerticalDismissPreview(true);
        }
        return;
      }

      if (!this._hasMoved && dt < 250) {
        const now = Date.now();
        if (now - (this._lastTapTime || 0) < 300) {
          this._onPreviewDoubleTap();
          this._lastTapTime = 0;
          return;
        }
        this._lastTapTime = now;
        this._singleTapTimer = setTimeout(() => {
          this._lastTapTime = 0;
          this.exitPreview();
        }, 300);
        return;
      }

      if (sx < 1.0 && this._gestureState === 'pinch') {
        this.exitPreview();
        return;
      }

      if (this._gestureState === 'pinch') {
        this.setData({ previewAnimating: true });
        this._applyPreviewTransform(0, 0, 1, 1);
        setTimeout(() => this.setData({ previewAnimating: false }), 300);
      }
    },

    _onPreviewDoubleTap() {
      if (this._singleTapTimer) {
        clearTimeout(this._singleTapTimer);
        this._singleTapTimer = null;
      }
      this.handlePreviewLike();
    },

    async handlePreviewLike() {
      if (!this._ensureLogin()) return;
      try {
        const res = await postApi.likePost(this._getPostId());
        if (res.success) {
          const post = this.data.post;
          post.likes = res.likes;
          post.liked = res.liked;
          this.setData({ post, showLikeAnim: true });
          this._likedChanged = true;
          setTimeout(() => this.setData({ showLikeAnim: false }), 600);
        }
      } catch (e) {
        // ignore
      }
    },

    async downloadPreviewImage() {
      const post = this.data.post;
      if (!post || !post.photos) return;
      const photo = post.photos[this.data.currentPhotoIndex];
      if (!photo?.imageUrl) return;
      wx.showLoading({ title: '保存中' });
      try {
        const res = await wx.cloud.downloadFile({ fileID: photo.imageUrl });
        await wx.saveImageToPhotosAlbum({ filePath: res.tempFilePath });
        wx.showToast({ title: '已保存', icon: 'success' });
      } catch (e) {
        wx.showToast({ title: '保存失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },
  },
});
