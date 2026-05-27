const DISMISS_THRESHOLD = 0.28;
const DIRECTION_LOCK_PX = 10;
const MAX_SCALE_SHRINK = 0.08;

/**
 * 非图片区横向拖拽关闭详情浮层
 */
module.exports = Behavior({
  data: {
    scrollLocked: false,
    panelDragging: false,
    panelTransformStyle: '',
    panelChromeStyle: '',
    maskStyle: '',
  },

  methods: {
    _initDismissLayout() {
      const w = this._windowWidth || 375;
      this._dismissThresholdPx = w * DISMISS_THRESHOLD;
      // 按屏宽比例估算物理圆角（约 iPhone 390pt 宽对应 47px）
      const corner = Math.round((w / 390) * 47);
      this._screenCornerRadius = Math.max(36, Math.min(corner, 56));
    },

    _getDragProgress(dx) {
      const w = this._windowWidth || 375;
      return Math.min(Math.abs(dx) / w, 1);
    },

    /** 拖拽时圆角随位移快速趋近屏幕物理圆角 */
    _getPanelCornerRadius(progress) {
      const maxR = this._screenCornerRadius || 44;
      const t = Math.min(1, progress / 0.12);
      return Math.round(maxR * (0.22 + 0.78 * t));
    },

    _applyPanelDragVisual(dx, dy, progress) {
      const scale = 1 - progress * MAX_SCALE_SHRINK;
      const maskAlpha = Math.max(0, 0.38 * (1 - progress * 1.1));
      const radius = this._getPanelCornerRadius(progress);
      this.setData({
        panelTransformStyle: `transform: translate3d(${dx}px, ${dy}px, 0) scale(${scale});`,
        panelChromeStyle: `border-radius: ${radius}px; overflow: hidden;`,
        maskStyle: `background: rgba(0, 0, 0, ${maskAlpha.toFixed(3)});`,
      });
    },

    _canDismissGesture() {
      return (
        this.data.flyDone &&
        !this.data.isPreviewMode &&
        !this._closing &&
        !this.data.showCommentInput
      );
    },

    onDismissTouchStart(e) {
      if (!this._canDismissGesture()) return;
      const t = e.touches[0];
      if (!t) return;
      this._dismissStart = { x: t.clientX, y: t.clientY };
      this._dismissMode = 'pending';
      this._dismissDragX = 0;
      this._dismissDragY = 0;
    },

    onDismissTouchMove(e) {
      if (!this._dismissStart || !this._canDismissGesture()) return;
      const t = e.touches[0];
      if (!t) return;

      const dx = t.clientX - this._dismissStart.x;
      const dy = t.clientY - this._dismissStart.y;

      if (this._dismissMode === 'pending') {
        if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
        if (Math.abs(dx) <= Math.abs(dy)) {
          this._dismissMode = 'scroll';
          return;
        }
        this._dismissMode = 'drag';
        this.setData({ scrollLocked: true, panelDragging: true });
        this._applyPanelDragVisual(dx, dy, this._getDragProgress(dx));
        return;
      }

      if (this._dismissMode !== 'drag') return;

      this._dismissDragX = dx;
      this._dismissDragY = dy;
      this._applyPanelDragVisual(dx, dy, this._getDragProgress(dx));
    },

    onDismissTouchEnd() {
      if (!this._dismissStart) return;

      if (this._dismissMode === 'drag') {
        const dx = this._dismissDragX || 0;
        if (Math.abs(dx) >= this._dismissThresholdPx) {
          this._closeByDismissDrag();
        } else {
          this._resetPanelDrag(true);
        }
      }

      this._dismissStart = null;
      this._dismissMode = null;
      this._dismissDragX = 0;
      this._dismissDragY = 0;

      if (this.data.scrollLocked) {
        this.setData({ scrollLocked: false });
      }
    },

    _resetPanelDrag(animate) {
      const ease = '280ms cubic-bezier(0.25, 0.1, 0.25, 1)';
      const transformTransition = animate ? `transition: transform ${ease};` : '';
      const chromeTransition = animate
        ? `transition: border-radius ${ease}; overflow: hidden;`
        : '';
      this.setData({
        panelDragging: false,
        panelTransformStyle: `transform: translate3d(0, 0, 0) scale(1); ${transformTransition}`,
        panelChromeStyle: animate ? `border-radius: 0; ${chromeTransition}` : '',
        maskStyle: 'background: rgba(0, 0, 0, 0.38);',
      });
      if (animate) {
        setTimeout(() => {
          if (!this.data.panelDragging) {
            this.setData({ panelTransformStyle: '', panelChromeStyle: '' });
          }
        }, 300);
      }
    },

    _applyDefaultMask() {
      this.setData({
        maskStyle: this.data.maskShow ? 'background: rgba(0, 0, 0, 0.38);' : '',
      });
    },

    _closeByDismissDrag() {
      this.setData({
        panelDragging: false,
        panelTransformStyle: '',
        panelChromeStyle: '',
        maskStyle: '',
        scrollLocked: false,
      });
      if (typeof this._exit === 'function') {
        this._exit(() => {
          this.triggerEvent('close', { likedChanged: !!this._likedChanged });
        });
      }
    },
  },
});
