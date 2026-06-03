// pages/profile/settings/feedback/feedback.js
const { feedbackApi } = require('../../../../utils/api');
const { showLoading, hideLoading, showToast } = require('../../../../utils/util');

Page({
  data: {
    content: '',
    contact: '',
    submitting: false,
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

  async onSubmit() {
    if (this.data.submitting) return;

    const content = (this.data.content || '').trim();
    const contact = (this.data.contact || '').trim();

    if (!content) {
      showToast('请输入反馈内容');
      return;
    }
    if (content.length < 5) {
      showToast('反馈内容至少 5 个字');
      return;
    }

    this.setData({ submitting: true });
    showLoading('提交中...');

    try {
      const res = await feedbackApi.submit({ content, contact });
      hideLoading();
      if (res.success) {
        showToast('反馈已提交，感谢你的建议');
        this.setData({ content: '', contact: '' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        showToast(res.message || '提交失败');
      }
    } catch (e) {
      hideLoading();
      showToast('提交失败，请稍后重试');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
