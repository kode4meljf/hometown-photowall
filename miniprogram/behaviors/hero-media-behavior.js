/**
 * 详情进入：抖音式壳子先放大（卡片数据预填），仅 swiper 图区后 handoff
 */
const {
  PHASE,
  ANIM_MS,
  SHELL_SCALE_MS,
  HANDOFF_MS,
  resolveLayout,
  resolveFullCardRect,
} = require('../utils/heroController');
const { getNavBarLayout } = require('../utils/navBarLayout');

function panelEnterFromCard(cardRect, windowWidth, windowHeight) {
  if (!cardRect || !windowWidth || !windowHeight) return '';
  const sx = cardRect.width / windowWidth;
  const sy = cardRect.height / windowHeight;
  return `transform:translate(${cardRect.left}px,${cardRect.top}px) scale(${sx},${sy});transform-origin:left top;`;
}

function panelEnterToFull(ms) {
  return `transform:translate(0,0) scale(1,1);transition:transform ${ms}ms cubic-bezier(0.25,0.1,0.25,1);`;
}

function panelExitToCard(cardRect, windowWidth, windowHeight, ms) {
  if (!cardRect || !windowWidth || !windowHeight) return '';
  const sx = cardRect.width / windowWidth;
  const sy = cardRect.height / windowHeight;
  return `transform:translate(${cardRect.left}px,${cardRect.top}px) scale(${sx},${sy});transform-origin:left top;transition:transform ${ms}ms cubic-bezier(0.25,0.1,0.25,1);`;
}

module.exports = Behavior({
  data: {
    heroPhase: PHASE.IDLE,
    heroVisible: false,
    heroMediaStyle: '',
    heroMediaMode: 'aspectFit',
    heroAnimating: false,
    slotFitStyle: '',
    slotMediaVisible: false,
    swiperShown: false,
    swiperRevealOpacity: 0,
    shellReady: false,
    shellScaling: false,
    heroFadingOut: false,
    heroCoverOpacity: 1,
    heroDim: 0,
    mediaSkeleton: false,
    photoCount: 1,
    skeletonSegments: [0],
    contentReveal: false,
    panelExiting: false,
    panelExitChrome: false,
  },

  methods: {
    _heroResetMedia() {
      clearTimeout(this._enterSchedule);
      clearTimeout(this._enterTimer);
      clearTimeout(this._enterFallbackTimer);
      clearTimeout(this._exitTimer);
      clearTimeout(this._handoffTimer);
      clearTimeout(this._heroFadeTimer);
      clearTimeout(this._shellScaleTimer);
      this._heroLayout = null;
      this._heroPhase = PHASE.IDLE;
      this._slotMirrorReady = false;
      this._handoffStarted = false;
      this.setData({
        heroPhase: PHASE.IDLE,
        heroVisible: false,
        heroMediaStyle: '',
        heroMediaMode: 'aspectFit',
        heroAnimating: false,
        slotFitStyle: '',
        slotMediaVisible: false,
        swiperShown: false,
        swiperRevealOpacity: 0,
        shellReady: false,
        shellScaling: false,
        heroFadingOut: false,
        heroCoverOpacity: 1,
        heroDim: 0,
        mediaSkeleton: false,
        photoCount: 1,
        skeletonSegments: [0],
        contentReveal: false,
        panelExiting: false,
        panelExitChrome: false,
        heroTitleStyle: '',
      });
    },

    _resolveExitFullCardRect() {
      const full = this.properties.fullCardRect;
      if (full && full.width > 0 && full.height > 0) return full;
      const slotH = this.properties.cardSlotHeight;
      const imgRect =
        this.properties.imgRect ||
        (this._heroLayout && this._heroLayout.cardRect);
      return resolveFullCardRect(imgRect, slotH);
    },

    _photoCountFromPost(post) {
      const n = post?.photos?.length;
      return n > 0 ? n : 1;
    },

    _segmentsForCount(n) {
      const len = Math.min(Math.max(n, 1), 12);
      return Array.from({ length: len }, (_, i) => i);
    },

    _scheduleHeroEnter() {
      clearTimeout(this._enterSchedule);
      const run = (attempt) => {
        if (!this.properties.visible) return;
        if (this.properties.imgRect || attempt >= 3) {
          this._heroEnter();
          return;
        }
        this._enterSchedule = setTimeout(() => run(attempt + 1), 16);
      };
      wx.nextTick(() => run(0));
    },

    /** 点击即出骨架壳：整页从卡片位放大，无飞行 hero */
    _heroEnter() {
      clearTimeout(this._enterTimer);
      clearTimeout(this._enterFallbackTimer);
      clearTimeout(this._shellScaleTimer);
      const { imgRect, coverUrl, aspectRatio } = this.properties;
      const nav = getNavBarLayout();
      const layout = resolveLayout(
        this._windowWidth,
        nav,
        imgRect,
        aspectRatio
      );
      this._heroLayout = layout;
      this._heroPhase = PHASE.DOCKED;
      this._indexAvatarUrl = this.properties.authorAvatar;
      this._navLayout = nav;
      this._handoffStarted = false;

      const shellPost =
        typeof this._buildShellPost === 'function' ? this._buildShellPost() : null;
      const photoCount = Math.min(
        Math.max(this.properties.cardPhotoCount || 1, 1),
        12
      );

      if (typeof this._onHeroFlyStart === 'function') {
        this._onHeroFlyStart();
      }
      if (typeof this._feedLayer === 'function') {
        this._feedLayer(0, true);
      }
      this._preloadCover(coverUrl);
      this.loadPost();

      const enterFrom = panelEnterFromCard(
        layout.cardRect,
        this._windowWidth,
        this._windowHeight
      );

      this.setData({
        panelShow: true,
        shellReady: true,
        shellScaling: true,
        heroVisible: false,
        heroPhase: PHASE.DOCKED,
        heroAnimating: false,
        heroMediaMode: 'aspectFit',
        heroMediaStyle: '',
        heroTitleStyle: '',
        slotFitStyle: layout.slotFitStyle,
        slotMediaVisible: false,
        swiperShown: false,
        swiperRevealOpacity: 0,
        mediaSkeleton: true,
        photoCount,
        skeletonSegments: this._segmentsForCount(photoCount),
        contentReveal: true,
        maskShow: true,
        maskStyle: 'background: rgba(0, 0, 0, 0.38);',
        headerPaddingTop: nav.paddingTop,
        headerBarHeight: nav.barHeight,
        navBarHeight: nav.navBarHeight,
        headerPaddingRight: nav.paddingRight,
        imageSlotHeight: layout.imageSlotHeight,
        panelTransformStyle: '',
        panelChromeStyle: enterFrom,
        scrollLocked: false,
        panelDragging: false,
        post: shellPost,
        loading: true,
      });

      wx.nextTick(() => {
        this.setData({
          panelChromeStyle: panelEnterToFull(SHELL_SCALE_MS),
        });
      });

      this._shellScaleTimer = setTimeout(() => {
        if (this.properties.visible) {
          this.setData({ shellScaling: false, panelChromeStyle: '' });
        }
      }, SHELL_SCALE_MS + 48);
    },

    _heroBeginHandoff() {
      if (this._heroPhase !== PHASE.DOCKED) return;
      if (!this.data.post) return;
      this._heroTryHandoff();
    },

    onSlotMirrorLoad() {
      this._slotMirrorReady = true;
    },

    onHeroPhotoLoad(e) {
      const idx = e.currentTarget.dataset.index;
      if (idx !== 0 && idx !== '0') return;
      if (
        this._heroPhase === PHASE.DOCKED ||
        this._heroPhase === PHASE.HANDOFF
      ) {
        this._heroCompleteHandoff();
      }
    },

    _heroTryHandoff() {
      if (this._handoffStarted) return;
      if (!this.data.post) return;
      if (this._heroPhase !== PHASE.DOCKED && this._heroPhase !== PHASE.HANDOFF) {
        return;
      }
      this._handoffStarted = true;
      this._heroPhase = PHASE.HANDOFF;
      this.setData({
        heroPhase: PHASE.HANDOFF,
        swiperShown: true,
        swiperRevealOpacity: 0,
        mediaSkeleton: true,
      });
      wx.nextTick(() => {
        this.setData({
          swiperRevealOpacity: 1,
        });
      });
    },

    _heroCompleteHandoff() {
      clearTimeout(this._handoffTimer);
      if (this._heroPhase === PHASE.DETAIL || this._heroPhase === PHASE.IDLE) {
        return;
      }
      this._heroPhase = PHASE.DETAIL;
      this.setData({
        heroPhase: PHASE.DETAIL,
        heroVisible: false,
        heroMediaStyle: '',
        swiperShown: true,
        swiperRevealOpacity: 1,
        mediaSkeleton: false,
        slotMediaVisible: false,
      });
    },

    onHeroTransitionEnd() {
      if (this._heroPhase === PHASE.EXITING && this._closing) {
        this._heroFinishExit();
      }
    },

    /** 退出：整卡 rect 缩回 + 详情 chrome 先藏，末段首页卡承接 */
    _heroExit(cb) {
      if (this._closing) return;
      this._closing = true;
      clearTimeout(this._enterTimer);
      clearTimeout(this._handoffTimer);
      clearTimeout(this._shellScaleTimer);
      clearTimeout(this._exitTimer);

      this._exitCallback = cb;
      this._heroPhase = PHASE.EXITING;
      this._dismissExit = false;

      const fullCardRect = this._resolveExitFullCardRect();

      if (typeof this._onDetailExitStart === 'function') {
        this._onDetailExitStart(fullCardRect);
      }
      if (typeof this._feedLayer === 'function') {
        this._feedLayer(1, true, SHELL_SCALE_MS);
      }

      const exitTo = panelExitToCard(
        fullCardRect,
        this._windowWidth,
        this._windowHeight,
        SHELL_SCALE_MS
      );

      this.setData({
        heroPhase: PHASE.EXITING,
        heroVisible: false,
        heroTitleStyle: '',
        panelExiting: true,
        panelExitChrome: true,
        panelDragging: false,
        panelTransformStyle: '',
        shellScaling: true,
        panelChromeStyle:
          'transform:translate(0,0) scale(1,1);transform-origin:left top;',
        maskShow: true,
        maskStyle: 'background: rgba(0, 0, 0, 0.38);',
        scrollLocked: true,
      });

      wx.nextTick(() => {
        const patch = {
          maskStyle: `background: rgba(0, 0, 0, 0); transition: background ${SHELL_SCALE_MS}ms ease;`,
        };
        if (exitTo) patch.panelChromeStyle = exitTo;
        this.setData(patch);
      });

      this._exitTimer = setTimeout(() => {
        if (this._heroPhase === PHASE.EXITING) {
          this._heroFinishExit();
        }
      }, SHELL_SCALE_MS + 48);
    },

    onPanelTransitionEnd(e) {
      const prop = e.detail && e.detail.propertyName;
      if (prop && prop !== 'transform') return;
      if (this._heroPhase === PHASE.EXITING && this._closing) {
        this._heroFinishExit();
      }
    },

    _heroFinishExit() {
      if (this._heroPhase !== PHASE.EXITING) return;
      clearTimeout(this._exitTimer);
      this._heroPhase = PHASE.IDLE;
      if (typeof this._feedLayer === 'function') {
        this._feedLayer(1, false);
      }
      this.setData({
        maskShow: false,
        maskStyle: '',
        heroVisible: false,
        panelShow: false,
        shellReady: false,
        shellScaling: false,
        panelChromeStyle: '',
        panelExiting: false,
        panelExitChrome: false,
        swiperShown: false,
        mediaSkeleton: false,
      });
      const cb = this._exitCallback;
      this._exitCallback = null;
      this._closing = false;
      if (typeof cb === 'function') cb();
    },
  },
});
