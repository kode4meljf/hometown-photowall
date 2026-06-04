Component({
  properties: {
    shellReady: { type: Boolean, value: false },
    post: { type: Object, value: null },
    panelExitChrome: { type: Boolean, value: false },
    likesCountText: { type: String, value: '0' },
    commentsCountText: { type: String, value: '0' },
  },

  methods: {
    focusCommentInput() {
      this.triggerEvent('focuscomment');
    },
    handleLike() {
      this.triggerEvent('like');
    },
  },
});
