// pages/profile/settings/feedback/feedback.js
Page({
  data: {
    content: '',
    contact: '',
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '意见反馈' });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  onSubmit() {
    const { content } = this.data;
    if (!content.trim()) {
      wx.showToast({ title: '请输入反馈内容', icon: 'none' });
      return;
    }
    wx.showToast({ title: '反馈已提交，感谢您的建议', icon: 'none' });
    this.setData({ content: '', contact: '' });
  },
});
