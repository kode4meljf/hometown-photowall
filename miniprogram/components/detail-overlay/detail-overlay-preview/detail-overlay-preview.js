const { relayTouch, relayDataset } = require('../relay');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    previewBgBlack: { type: Boolean, value: true },
    previewTransform: { type: String, value: 'translate(0px, 0px) scale(1, 1)' },
    previewBgStyle: { type: String, value: '' },
    previewAnimClass: { type: String, value: '' },
    previewOpacity: { type: Number, value: 1 },
    overlayOpacity: { type: Number, value: 0 },
    previewDismissDragging: { type: Boolean, value: false },
    previewTouchCapture: { type: Boolean, value: false },
    bottomBarVisible: { type: Boolean, value: false },
    showLikeAnim: { type: Boolean, value: false },
    previewProgressStyle: { type: String, value: '' },
    previewProgressVisible: { type: Boolean, value: false },
    currentPhotoIndex: { type: Number, value: 0 },
    indexBadgeVisible: { type: Boolean, value: false },
    post: { type: Object, value: null },
  },

  methods: {
    onPreviewTouchStart: relayTouch('touchstart'),
    onPreviewTouchMove: relayTouch('touchmove'),
    onPreviewTouchEnd: relayTouch('touchend'),
    onPreviewSwiperChange(e) {
      this.triggerEvent('swiperchange', e.detail);
    },
    onPreviewPhotoLoad(e) {
      this.triggerEvent('photoload', {
        index: e.currentTarget.dataset.index,
        width: e.detail.width,
        height: e.detail.height,
      });
    },
    exitPreview() {
      this.triggerEvent('exit');
    },
    downloadPreviewImage() {
      this.triggerEvent('download');
    },
  },
});
