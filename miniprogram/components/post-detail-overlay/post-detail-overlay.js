const {
  aspectFillCenter,
  rectToStyle,
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
        this._enter();
      } else {
        this._resetState();
      }
    },
  },

  methods: {
    noop() {},

    _resetState() {
      clearTimeout(this._enterTimer);
      clearTimeout(this._exitTimer);
      this._closing = false;
      this._flyPhase = '';
      this._dismissStart = null;
      this._dismissMode = null;
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
      });
    },

    _measureTargets(callback) {
      const q = wx.createSelectorQuery().in(this);
      q.select('#image-slot').boundingClientRect();
      q.select('#title-slot').boundingClientRect();
      q.exec((res) => {
        callback({
          image: res[0],
          title: res[1],
        });
      });
    },

    _enter() {
      const { imgRect, titleRect, coverUrl, titleText, descText, aspectRatio } =
        this.properties;
      const imgAR = aspectRatio > 0 ? aspectRatio : 1;
      const startImg = aspectFillCenter(imgRect, imgAR) || imgRect;
      const nav = getNavBarLayout();
      const imageSlotHeight = Math.round(this._windowWidth * 4 / 3);

      this._flyPhase = 'enter';
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
        heroTitleStyle: titleRect ? rectToStyle(titleRect) : 'opacity:0;',
        coverUrl,
        titleText,
        descText,
        panelTransformStyle: '',
        maskStyle: '',
        scrollLocked: false,
        panelDragging: false,
        panelChromeStyle: '',
      });

      this.loadPost();

      wx.nextTick(() => {
        this._measureTargets((targets) => {
          if (!targets.image) {
            const top = nav.navBarHeight;
            targets.image = {
              left: 0,
              top,
              width: this._windowWidth,
              height: imageSlotHeight,
            };
          }
          if (!targets.title && (titleText || descText)) {
            targets.title = {
              left: 12,
              top: targets.image.top + targets.image.height + 10,
              width: this._windowWidth - 24,
              height: 44,
            };
          }
          this._targetImageRect = targets.image;
          this._targetTitleRect = targets.title;

          this.setData({ maskShow: true, maskStyle: 'background: rgba(0, 0, 0, 0.38);' });
          setTimeout(() => {
            this.setData({
              flyAnimating: true,
              heroImgStyle: rectToStyle(targets.image),
              heroTitleStyle:
                targets.title && (titleText || descText)
                  ? rectToStyle(targets.title)
                  : 'opacity:0;',
            });
          }, 32);

          this._enterTimer = setTimeout(() => {
            if (this._flyPhase === 'enter' && !this.data.flyDone) {
              this._finishEnter();
            }
          }, ANIM_MS + 80);
        });
      });
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
      if (this.data.flyDone) return;
      this._flyPhase = '';
      this.setData({
        flyDone: true,
        flyAnimating: false,
        contentReveal: true,
      });
    },

    _exit(cb) {
      if (this._closing) return;
      this._closing = true;
      clearTimeout(this._enterTimer);

      const { imgRect, titleRect, aspectRatio, titleText, descText } = this.properties;
      const imgAR = aspectRatio > 0 ? aspectRatio : 1;
      const endImg = aspectFillCenter(imgRect, imgAR) || imgRect;

      this._flyPhase = 'exit';
      this._exitCallback = cb;

      this.setData({
        contentReveal: false,
        flyDone: false,
        flyAnimating: true,
        panelTransformStyle: '',
        panelDragging: false,
        panelChromeStyle: '',
        maskStyle: '',
        heroImgStyle: this._targetImageRect
          ? rectToStyle(this._targetImageRect)
          : this.data.heroImgStyle,
        heroTitleStyle:
          this._targetTitleRect && (titleText || descText)
            ? rectToStyle(this._targetTitleRect)
            : 'opacity:0;',
      });

      wx.nextTick(() => {
        setTimeout(() => {
          this.setData({
            maskShow: false,
            heroImgStyle: endImg ? rectToStyle(endImg) : '',
            heroTitleStyle: titleRect ? rectToStyle(titleRect) : 'opacity:0;',
          });
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
