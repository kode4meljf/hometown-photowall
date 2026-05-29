// pages/comments/comments.js
const { postApi } = require('../../../utils/api.js');

Page({
  data: {
    activeTab: 'sent',       // 我发出的（默认）
    currentIndex: 0,         // swiper 当前索引
    // 发出评论
    sentList: [],
    sentOffset: 0,
    sentHasMore: true,
    sentLoading: false,
    sentRefreshing: false,   // 下拉刷新状态
    // 收到评论
    receivedList: [],
    receivedOffset: 0,
    receivedHasMore: true,
    receivedLoading: false,
    receivedRefreshing: false,  // 下拉刷新状态
    receivedTotal: 0,
    receivedNew: 0,
  },

  FIRST_LIMIT: 10,  // 第一次加载条数
  MORE_LIMIT: 20,   // 后续加载条数

  onLoad() {
    this.loadSent();
  },

  // 点击 Tab 切换
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    const index = tab === 'sent' ? 0 : 1;
    this.setData({ activeTab: tab, currentIndex: index });
    if (tab === 'received' && this.data.receivedList.length === 0) {
      this.loadReceived();
    } else if (tab === 'sent' && this.data.sentList.length === 0) {
      this.loadSent();
    }
  },

  // Swiper 滑动切换
  onSwiperChange(e) {
    const index = e.detail.current;
    const tab = index === 0 ? 'sent' : 'received';
    this.setData({ activeTab: tab, currentIndex: index });
    if (tab === 'received' && this.data.receivedList.length === 0) {
      this.loadReceived();
    } else if (tab === 'sent' && this.data.sentList.length === 0) {
      this.loadSent();
    }
  },

  // 获取当前应使用的 limit
  _getLimit(list) {
    return list.length === 0 ? this.FIRST_LIMIT : this.MORE_LIMIT;
  },

  // 发出评论
  loadSent() {
    if (this.data.sentLoading || !this.data.sentHasMore) return;
    this.setData({ sentLoading: true });
    const limit = this._getLimit(this.data.sentList);
    postApi.getMyComments({ offset: this.data.sentOffset, limit })
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
        } else {
          wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        }
      })
      .catch(err => {
        console.error('loadSent err', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      })
      .finally(() => this.setData({ sentLoading: false }));
  },

  // 收到评论
  loadReceived() {
    if (this.data.receivedLoading || !this.data.receivedHasMore) return;
    this.setData({ receivedLoading: true });
    const limit = this._getLimit(this.data.receivedList);
    postApi.getReceivedComments({ offset: this.data.receivedOffset, limit })
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
        } else {
          wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        }
      })
      .catch(err => {
        console.error('loadReceived err', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      })
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

  // 下拉刷新 - 我发出的
  onSentRefresh() {
    this.setData({ sentRefreshing: true, sentOffset: 0, sentHasMore: true });
    this.loadSent();
    // 300ms 后关闭刷新动画（数据加载完成后）
    setTimeout(() => {
      this.setData({ sentRefreshing: false });
    }, 300);
  },

  // 下拉刷新 - 我收到的
  onReceivedRefresh() {
    this.setData({ receivedRefreshing: true, receivedOffset: 0, receivedHasMore: true });
    this.loadReceived();
    setTimeout(() => {
      this.setData({ receivedRefreshing: false });
    }, 300);
  },

  // 点击进入帖子详情
  goToDetail(e) {
    const postId = e.currentTarget.dataset.postid;
    if (!postId) return;
    const { openPostDetail } = require('../../../utils/openPostDetail');
    const list =
      this.data.activeTab === 'sent' ? this.data.sentList : this.data.receivedList;
    const item = list.find((c) => c.postId === postId);
    openPostDetail(
      item
        ? {
            id: postId,
            postThumb: item.postThumb,
            postTitle: item.postTitle,
          }
        : { id: postId }
    );
  },
});
