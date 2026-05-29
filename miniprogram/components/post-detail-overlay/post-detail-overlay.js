const {
  aspectFillCenter,
  aspectFitCenter,
  rectToStyle,
  flyTransformStyle,
  rectToSlotLocal,
  getDetailSlotHeight,
  getDetailImageRect,
} = require('../../utils/heroLayout');
const { getNavBarLayout } = require('../../utils/navBarLayout');
const postDetailBehavior = require('../../behaviors/post-detail-behavior');
const postPreviewBehavior = require('../../behaviors/post-preview-behavior');
const postDismissBehavior = require('../../behaviors/post-dismiss-behavior');

const ANIM_MS = 420;

Component({
  behaviors: [postDetailBehavior, postPreviewBehavior, postDismissBehavior],

  properties: {
    visible: { type: Boolean, value: false },
    postId: { type: String, value: '' },
    coverUrl: { type: String, value: '' },
    titleText: { type: String, value: '' },
    descText: { type: String, value: '' },
    imgRect: { type: Object, value: null },
    titleRect: { type: Object, value: null },
    aspectRatio: { type: Number, value: 1 },
    authorAvatar: { type: String, value: '' },
    authorName: { type: String, value: '' },
  },

  data: {
    heroImgStyle: '',
    heroTitleStyle: '',
    flyDone: false,
    flyAnimating: false,
    maskShow: false,
    panelShow: false,
    contentReveal: false,
    headerPaddingTop: 48,
    headerBarHeight: 32,
    navBarHeight: 88,
    headerPaddingRight: 96,
    imageSlotHeight: 300,
    scrollClass: 'panel-scroll',
    handoffDone: false,
    flyImageMode: 'aspectFit',
  },

  lifetimes: {
    attached() {
      const sys = wx.getSystemInfoSync();
      this._windowWidth = sys.windowWidth;
      this._windowHeight = sys.windowHeight;
      this._bottomBarH =
        (84 / 750) * sys.windowWidth + (sys.safeArea?.insetBottom || 0);
      this._indexAvatarUrl = this.properties.authorAvatar;
      this._initDismissLayout();
    },
  },

  observers: {
    visible(v) {
      if (v) {
        this.postId = this.properties.postId;
        this._scheduleEnter();
      } else {
        this._resetState();
      }
    },
  },

  methods: {
    noop() {},

    _feedLayer(opacity, animate = true) {
      this.triggerEvent('feedlayer', { opacity, animate, duration: ANIM_MS });
    },

    _scheduleEnter() {
      clearTimeout(this._enterSchedule);
      const run = (attempt) => {
        if (!this.properties.visible) return;
        const hasRect = !!this.properties.imgRect;
        if (hasRect || attempt >= 3) {
          this._enter();
          return;
        }
        this._enterSchedule = setTimeout(() => run(attempt + 1), 16);
      };
      wx.nextTick(() => run(0));
    },

    /** 标题只在卡片原位淡入淡出，不跟图做位移动画（避免白底块与图不同步） */
    _titleFlyStyle(rect, opacity, fadeMs = 0) {
      if (!rect) return 'opacity:0;';
      const op = `opacity:${opacity};`;
      const tr = fadeMs ? `transition:opacity ${fadeMs}ms ease;` : '';
      return `${rectToStyle(rect)}${op}${tr}`;
    },

    _resetState() {
      clearTimeout(this._enterSchedule);
      clearTimeout(this._enterTimer);
      clearTimeout(this._enterFallbackTimer);
      clearTimeout(this._exitTimer);
      clearTimeout(this._handoffTimer);
      this._closing = false;
      this._flyPhase = '';
      this._dismissStart = null;
      this._dismissMode = null;
      this._dismissExit = false;
      this.setData({
        flyDone: false,
        flyAnimating: false,
        maskShow: false,
        panelShow: false,
        contentReveal: false,
        heroImgStyle: '',
        heroTitleStyle: '',
        post: null,
        loading: true,
        scrollLocked: false,
        panelDragging: false,
        panelTransformStyle: '',
        panelChromeStyle: '',
        maskStyle: '',
        isPreviewMode: false,
        previewAnimClass: '',
        previewTransform: 'translate(0px, 0px) scale(1, 1)',
        previewBgStyle: '',
        previewDismissDragging: false,
        handoffDone: false,
        slotCoverStyle: '',
        flyImageMode: 'aspectFit',
      });
      this._feedLayer(1, false);
    },

    _resolveFlyEndRects(slotRect, imgAR, nav) {
      const slot =
        slotRect ||
        getDetailImageRect(this._windowWidth, nav.navBarHeight, imgAR);
      const fit = aspectFitCenter(slot, imgAR) || slot;
      return {
        slotRect: slot,
        fitRect: fit,
        slotCoverStyle: rectToSlotLocal(fit, slot),
      };
    },

    _preloadCover(url) {
      if (!url) return;
      wx.getImageInfo({
        src: url,
        success: () => {},
        fail: () => {},
      });
    },

    _enter() {
      clearTimeout(this._enterTimer);
      clearTimeout(this._enterFallbackTimer);
      const { imgRect, titleRect, coverUrl, titleText, descText, aspectRatio } =
        this.properties;
      const imgAR = aspectRatio > 0 ? aspectRatio : 1;
      const nav = getNavBarLayout();
      const slotFallback = getDetailImageRect(
        this._windowWidth,
        nav.navBarHeight,
        imgAR
      );
      const startImg =
        (imgRect && (aspectFillCenter(imgRect, imgAR) || imgRect)) ||
        aspectFitCenter(slotFallback, imgAR) ||
        slotFallback;
      const imageSlotHeight = getDetailSlotHeight(this._windowWidth, imgAR);

      this._flyPhase = 'enter';
      this._startFlyRect = startImg;
      this._indexAvatarUrl = this.properties.authorAvatar;
      this._navLayout = nav;

      this.setData({
        panelShow: true,
        flyDone: false,
        flyAnimating: false,
        contentReveal: false,
        maskShow: false,
        headerPaddingTop: nav.paddingTop,
        headerBarHeight: nav.barHeight,
        navBarHeight: nav.navBarHeight,
        headerPaddingRight: nav.paddingRight,
        imageSlotHeight,
        heroImgStyle: startImg ? rectToStyle(startImg) : '',
        heroTitleStyle: this._titleFlyStyle(titleRect, 1),
        coverUrl,
        titleText,
        descText,
        panelTransformStyle: '',
        maskStyle: '',
        scrollLocked: false,
        panelDragging: false,
        panelChromeStyle: '',
        handoffDone: false,
        flyImageMode: 'aspectFit',
      });
      this._feedLayer(1, false);

      this._preloadCover(coverUrl);
      this.loadPost();

      wx.nextTick(() => {
        const { slotRect, fitRect } = this._resolveFlyEndRects(null, imgAR, nav);
        this._targetSlotRect = slotRect;
        this._targetImageRect = fitRect;

        this.setData({
          maskShow: true,
          maskStyle: 'background: rgba(0, 0, 0, 0.38);',
        });
        setTimeout(() => {
          this.setData({
            flyAnimating: true,
            heroImgStyle: flyTransformStyle(startImg, fitRect),
          });
          this._feedLayer(0, true);
          if (titleRect && (titleText || descText)) {
            wx.nextTick(() => {
              this.setData({
                heroTitleStyle: this._titleFlyStyle(titleRect, 0, 220),
              });
            });
          }

          this._enterTimer = setTimeout(() => {
            if (this._flyPhase === 'enter' && !this.data.flyDone) {
              this._finishEnter();
            }
          }, ANIM_MS + 80);
        }, 32);
      });

      this._enterFallbackTimer = setTimeout(() => {
        if (this.properties.visible && !this.data.flyDone) {
          this._finishEnter();
        }
      }, ANIM_MS + 200);
    },

    onFlyTransitionEnd() {
      if (this._flyPhase === 'enter' && !this.data.flyDone) {
        this._finishEnter();
      } else if (this._flyPhase === 'exit' && this._closing) {
        this._finishExit();
      }
    },

    _finishEnter() {
      clearTimeout(this._enterTimer);
      clearTimeout(this._enterFallbackTimer);
      if (this.data.flyDone) return;
      this._flyPhase = '';
      this.setData({
        flyDone: true,
        flyAnimating: false,
        contentReveal: true,
        handoffDone: true,
        heroImgStyle: '',
        heroTitleStyle: '',
      });
    },

    _completeCoverHandoff() {
      if (!this.data.flyDone || this.data.handoffDone) return;
      clearTimeout(this._handoffTimer);
      this.setData({ handoffDone: true });
    },

    onPhotoLoad(e) {
      if (!this.data.flyDone) return;
      const idx = e.currentTarget.dataset.index;
      if (idx === 0 || idx === '0') {
        this._completeCoverHandoff();
      }
    },

    _exit(cb) {
      if (this._closing) return;
      this._closing = true;
      clearTimeout(this._enterTimer);

      const { imgRect, titleRect, aspectRatio, titleText, descText } = this.properties;
      const fromRect = this._targetImageRect || this._startFlyRect;
      const endCard = imgRect || this._startFlyRect;

      this._flyPhase = 'exit';
      this._exitCallback = cb;
      if (!this._dismissExit) {
        this._feedLayer(0, false);
      }
      this._dismissExit = false;

      this.setData({
        contentReveal: false,
        flyDone: false,
        handoffDone: false,
        flyAnimating: false,
        flyImageMode: 'aspectFill',
        panelTransformStyle: '',
        panelDragging: false,
        panelChromeStyle: '',
        maskShow: true,
        maskStyle: 'background: rgba(0, 0, 0, 0.38);',
        heroImgStyle: fromRect ? rectToStyle(fromRect) : '',
        heroTitleStyle:
          titleRect && (titleText || descText)
            ? this._titleFlyStyle(titleRect, 0)
            : 'opacity:0;',
      });

      wx.nextTick(() => {
        setTimeout(() => {
          this.setData({
            maskShow: true,
            maskStyle: 'background: rgba(0, 0, 0, 0.38);',
            flyAnimating: true,
            heroImgStyle:
              fromRect && endCard
                ? flyTransformStyle(fromRect, endCard, false)
                : '',
          });
          this._feedLayer(1, true);
          if (titleRect && (titleText || descText)) {
            this.setData({ heroTitleStyle: this._titleFlyStyle(titleRect, 0) });
            wx.nextTick(() => {
              this.setData({
                heroTitleStyle: this._titleFlyStyle(titleRect, 1, 260),
              });
            });
          }
        }, 32);

        this._exitTimer = setTimeout(() => {
          if (this._flyPhase === 'exit') {
            this._finishExit();
          }
        }, ANIM_MS + 80);
      });
    },

    _finishExit() {
      clearTimeout(this._exitTimer);
      this._flyPhase = '';
      this._feedLayer(1, false);
      this.setData({ maskShow: false, maskStyle: '' });
      const cb = this._exitCallback;
      this._exitCallback = null;
      this._closing = false;
      if (typeof cb === 'function') cb();
    },

    onBack() {
      if (this.data.isPreviewMode) {
        this.exitPreview();
        return;
      }
      this._exit(() => {
        this.triggerEvent('close', { likedChanged: !!this._likedChanged });
      });
    },

    onMaskTap() {
      this.onBack();
    },

    onScrollToLower() {
      this._tryLoadMore();
    },

    _onPostDeleted() {
      this._exit(() => {
        this.triggerEvent('close', { deleted: true });
      });
    },
  },
});
