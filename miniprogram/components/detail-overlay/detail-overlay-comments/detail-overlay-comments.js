const { relayDataset } = require('../relay');

Component({
  properties: {
    post: { type: Object, value: null },
    loading: { type: Boolean, value: true },
    contentReveal: { type: Boolean, value: false },
    panelExitChrome: { type: Boolean, value: false },
    canAdminDelete: { type: Boolean, value: false },
    highlightCommentId: { type: String, value: '' },
    commentsCountText: { type: String, value: '0' },
    deleteBtnPressed: { type: Boolean, value: false },
    reportBtnPressed: { type: Boolean, value: false },
    commentsLoading: { type: Boolean, value: false },
    hasMoreComments: { type: Boolean, value: true },
  },

  methods: {
    noop() {},
    onDeleteBtnTouchStart() {
      this.triggerEvent('deletebtntouchstart');
    },
    onDeleteBtnTouchEnd() {
      this.triggerEvent('deletebtntouchend');
    },
    onReportBtnTouchStart() {
      this.triggerEvent('reportbtntouchstart');
    },
    onReportBtnTouchEnd() {
      this.triggerEvent('reportbtntouchend');
    },
    onDeletePost: relayDataset('deletepost'),
    onReportPostTap: relayDataset('reportposttap'),
    handleReplyTap: relayDataset('replytap'),
    onDeleteCommentTap: relayDataset('deletecommenttap'),
    onReportCommentTap: relayDataset('reportcommenttap'),
    toggleCommentLike: relayDataset('togglecommentlike'),
    expandReplies: relayDataset('expandreplies'),
    collapseReplies: relayDataset('collapsereplies'),
  },
});
