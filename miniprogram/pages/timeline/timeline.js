// pages/timeline/timeline.js
const { photoApi } = require('../../utils/api');
const { formatDate } = require('../../utils/util');

Page({
  data: {
    timeline: [],
    loading: false
  },

  onLoad() {
    this.loadTimeline();
  },

  onShow() {
    // TabBar 切换时不自动刷新
  },

  onPullDownRefresh() {
    this.loadTimeline().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadTimeline() {
    this.setData({ loading: true });
    try {
      const res = await photoApi.getTimeline();
      if (res.success) {
        const timeline = res.data.map(item => ({
          year: item.year,
          photos: item.photos.map(p => ({
            ...p,
            id: p._id,
            imageUrl: p.imageUrl.startsWith('http') || p.imageUrl.startsWith('cloud://')
              ? p.imageUrl
              : `http://localhost:3000${p.imageUrl}`,
            date: formatDate(p.createdAt)
          }))
        }));
        this.setData({ timeline, loading: false });
      }
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
    }
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  }
});
