const {
  PHASE,
  ANIM_MS,
  SHELL_SCALE_MS,
  CARD_EXIT_HANDOFF_RATIO,
} = require('../../utils/heroController');
const { formatLikeCount } = require('../../utils/util');
const { getDetailSlotHeight } = require('../../utils/heroLayout');
const { rectToStyle } = require('../../utils/heroLayout');
const { getNavBarLayout } = require('../../utils/navBarLayout');
const postDetailBehavior = require('../../behaviors/post-detail-behavior');
const postPreviewBehavior = require('../../behaviors/post-preview-behavior');
const postDismissBehavior = require('../../behaviors/post-dismiss-behavior');
const heroMediaBehavior = require('../../behaviors/hero-media-behavior');

Component({
  behaviors: [
    postDetailBehavior,
    postPreviewBehavior,
    postDismissBehavior,
    heroMediaBehavior,
  ],

  properties: {
    visible: { type: Boolean, value: false },
    postId: { type: String, value: '' },
    coverUrl: { type: String, value: '' },
    titleText: { type: String, value: '' },
    descText: { type: String, value: '' },
    imgRect: { type: Object, value: null },
    fullCardRect: { type: Object, value: null },
    cardSlotHeight: { type: Number, value: 0 },
    titleRect: { type: Object, value: null },
    aspectRatio: { type: Number, value: 1 },
    authorAvatar: { type: String, value: '' },
    authorName: { type: String, value: '' },
    cardLikes: { type: Number, value: 0 },
    cardCommentsCount: { type: Number, value: 0 },
    cardLiked: { type: Boolean, value: false },
    cardDate: { type: String, value: '' },
    cardPhotoCount: { type: Number, value: 1 },
    postAuthorId: { type: String, value: '' },
  },

  data: {
    heroTitleStyle: '',
    maskShow: false,
    panelShow: false,
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
      this._emojiPanelHeight =
        Math.round(sys.windowHeight * 0.36) + (sys.safeArea?.insetBottom || 0);
      this._indexAvatarUrl = this.properties.authorAvatar;
      this._slotMirrorReady = false;
      this._initDismissLayout();
    },
  },

  observers: {
    visible(v) {
      if (v) {
        this.postId = this.properties.postId;
        this._slotMirrorReady = false;
        this._scheduleHeroEnter();
      } else {
        this._resetState();
      }
    },
    post(p) {
      if (!p) return;
      const photoCount = p.photos?.length > 0 ? p.photos.length : 1;
      const segments = [];
      for (let i = 0; i < Math.min(photoCount, 12); i++) segments.push(i);
      const commentsCountText = formatLikeCount(
        p.commentsCount != null ? p.commentsCount : 0
      ).text;
      this.setData({ photoCount, skeletonSegments: segments, commentsCountText });
      if (
        this.data.heroPhase === PHASE.DOCKED &&
        !this._handoffStarted &&
        p.photos &&
        p.photos.length > 0 &&
        !p._shellPreview
      ) {
        this._heroTryHandoff();
      }
    },
  },

  methods: {
    noop() {},

    _feedLayer(opacity, animate = true, duration = ANIM_MS) {
      this.triggerEvent('feedlayer', { opacity, animate, duration });
    },

    _onHeroFlyStart() {
      this.triggerEvent('herofly');
    },

    _onDetailExitStart(fullCardRect) {
      this.triggerEvent('cardrestore', {
        duration: SHELL_SCALE_MS,
        fullCardRect: fullCardRect || this.properties.fullCardRect || null,
        handoffRatio: CARD_EXIT_HANDOFF_RATIO,
      });
    },

    /** 首页卡片已有字段，点击即拼骨架 post */
    _buildShellPost() {
      const titleParts = [];
      if (this.properties.titleText) titleParts.push(this.properties.titleText);
      if (this.properties.descText) titleParts.push(this.properties.descText);
      const cover = this.properties.coverUrl || '';
      const commentsCountText = formatLikeCount(
        this.properties.cardCommentsCount || 0
      ).text;
      const post = {
        id: this.properties.postId,
        author: this.properties.authorName || '',
        authorAvatar:
          this.properties.authorAvatar || '/assets/icons/default-avatar.png',
        titleDesc: titleParts.join(' '),
        date: this.properties.cardDate || '',
        photos: [],
        comments: [],
        likes: this.properties.cardLikes || 0,
        liked: !!this.properties.cardLiked,
        shares: 0,
        commentsCount: this.properties.cardCommentsCount || 0,
        _shellPreview: true,
      };
      const canDelete = this._canDeleteHint(this.properties.postAuthorId);
      this.setData({ commentsCountText, canDelete });
      return post;
    },

    _titleFlyStyle(rect, opacity, fadeMs = 0) {
      if (!rect) return 'opacity:0;';
      const op = `opacity:${opacity};`;
      const tr = fadeMs ? `transition:opacity ${fadeMs}ms ease;` : '';
      return `${rectToStyle(rect)}${op}${tr}`;
    },

    _preloadCover(url) {
      if (!url) return;
      wx.getImageInfo({
        src: url,
        success: () => {},
        fail: () => {},
      });
    },

    _resetState() {
      this._heroResetMedia();
      this._closing = false;
      this._dismissStart = null;
      this._dismissMode = null;
      this._dismissExit = false;
      this._slotMirrorReady = false;
      this.setData({
        heroTitleStyle: '',
        maskShow: false,
        panelShow: false,
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
      if (typeof this._feedLayer === 'function') {
        this._feedLayer(1, false);
      }
    },

    onPhotoLoad(e) {
      const { width, height } = e.detail;
      const index = Number(e.currentTarget.dataset.index);
      if (width && height) {
        this._imgNaturalW = width;
        this._imgNaturalH = height;
        if (index === this.data.currentPhotoIndex) {
          const winW = this._windowWidth || wx.getSystemInfoSync().windowWidth;
          const imageSlotHeight = getDetailSlotHeight(winW, height / width);
          if (imageSlotHeight !== this.data.imageSlotHeight) {
            this.setData({ imageSlotHeight });
          }
        }
      }
      this.onHeroPhotoLoad(e);
    },

    _exit(cb) {
      this._heroExit(cb);
    },

    onBack() {
      if (this.data.isPreviewMode) {
        this.exitPreview();
        return;
      }
      this._heroExit(() => {
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
      this._heroExit(() => {
        this.triggerEvent('close', { deleted: true });
      });
    },
  },
});
