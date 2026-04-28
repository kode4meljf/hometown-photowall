// pages/comments/comments.js
const api = require('../../utils/api.js');

Page({
  data: {
    activeTab: 'sent',       // 我发出的（默认）
    currentIndex: 0,         // swiper index
    // 发出评论
    sentList: [],
    sentOffset: 0,
    sentHasMore: true,
    sentLoading: false,
    // 收到评论
    receivedList: [],
    receivedOffset: 0,
    receivedHasMore: true,
    receivedLoading: false,
    receivedTotal: 0,
    receivedNew: 0,
  },

  LIMIT: 20,

  onLoad() {
    this.loadSent();
  },

  // 点击 Tab 切换
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    const index = tab === 'sent' ? 0 : 1;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab, currentIndex: index });
    if (tab === 'received' && this.data.receivedList.length === 0) {
      this.loadReceived();
    } else if (tab === 'sent' && this.data.sentList.length === 0) {
      this.loadSent();
    }
  },

  // swiper 滑动切换
  onSwiperChange(e) {
    const index = e.detail.current;
    const tab = index === 0 ? 'sent' : 'received';
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'received' && this.data.receivedList.length === 0) {
      this.loadReceived();
    } else if (tab === 'sent' && this.data.sentList.length === 0) {
      this.loadSent();
    }
  },

  // 发出评论
  loadSent() {
    if (this.data.sentLoading || !this.data.sentHasMore) return;
    this.setData({ sentLoading: true });
    api.getMyComments({ offset: this.data.sentOffset, limit: this.LIMIT })
      .then(res => {
        if (res.success) {
          const { comments, hasMore } = res.data;
          const list = this.data.sentOffset === 0
            ? comments
            : [...this.data.sentList, ...comments];
          this.setData({
            sentList: list,
            sentOffset: this.data.sentOffset + (comments ? comments.length : 0),
            sentHasMore: hasMore,
          });
        }
      })
      .catch(err => console.error('loadSent err', err))
      .finally(() => this.setData({ sentLoading: false }));
  },

  // 收到评论
  loadReceived() {
    if (this.data.receivedLoading || !this.data.receivedHasMore) return;
    this.setData({ receivedLoading: true });
    api.getReceivedComments({ offset: this.data.receivedOffset, limit: this.LIMIT })
      .then(res => {
        if (res.success) {
          const { comments, hasMore, total, newCount } = res.data;
          const list = this.data.receivedOffset === 0
            ? comments
            : [...this.data.receivedList, ...comments];
          this.setData({
            receivedList: list,
            receivedOffset: this.data.receivedOffset + (comments ? comments.length : 0),
            receivedHasMore: hasMore,
            receivedTotal: total !== undefined ? total : this.data.receivedTotal,
            receivedNew: newCount !== undefined ? newCount : this.data.receivedNew,
          });
        }
      })
      .catch(err => console.error('loadReceived err', err))
      .finally(() => this.setData({ receivedLoading: false }));
  },

  // 触底加载
  onReachBottom() {
    if (this.data.activeTab === 'received') {
      this.loadReceived();
    } else {
      this.loadSent();
    }
  },

  // 点击进入帖子详情
  goToDetail(e) {
    const postId = e.currentTarget.dataset.postid;
    if (!postId) return;
    wx.navigateTo({ url: `/pages/detail/detail?id=${postId}` });
  },
});
