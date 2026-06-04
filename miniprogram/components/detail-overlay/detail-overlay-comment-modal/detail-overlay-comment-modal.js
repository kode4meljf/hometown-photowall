const { relayInput, relayDetail, relayDataset } = require('../relay');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    replyToAuthor: { type: String, value: '' },
    commentContent: { type: String, value: '' },
    commentFocus: { type: Boolean, value: false },
    showEmojiPanel: { type: Boolean, value: false },
    commentBottomInset: { type: Number, value: 0 },
    emojiPanelEmojis: { type: Array, value: [] },
    quickEmojis: { type: Array, value: [] },
    sendDisabled: { type: Boolean, value: true },
  },

  methods: {
    noop() {},
    hideCommentInput() {
      this.triggerEvent('close');
    },
    onCommentInput: relayInput('input'),
    submitComment() {
      this.triggerEvent('submit');
    },
    toggleEmojiPanel() {
      this.triggerEvent('toggleemoji');
    },
    onQuickEmojiTap: relayDataset('quickemoji'),
    onKeyboardHeightChange: relayDetail('keyboardheight'),
    onCommentInputFocus: relayDetail('focus'),
    onCommentInputBlur: relayDetail('blur'),
  },
});
