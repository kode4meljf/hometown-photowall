// pages/signin/signin.js
const { callFunction } = require('../../../utils/api');

Page({
  data: {
    streakDays: 0,
    credits: 0,
    todayText: '',
    todayWeekday: '',
    signedToday: false,
    weekDays: [],
  },

  onLoad() {
    const now = new Date();
    const todayText = `${now.getMonth() + 1}月${now.getDate()}日`;
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const todayWeekday = weekdays[now.getDay()];
    this.setData({ todayText, todayWeekday });
    this.loadSigninData();
  },

  onShow() {
    this.loadSigninData();
  },

  async loadSigninData() {
    try {
      const res = await callFunction('signin', 'getSigninInfo');
      if (res.success) {
        const weekDays = (res.data.weekDays || []).map(item => ({
          ...item,
          dayNum: parseInt(item.date.split('-')[2], 10),
        }));
        this.setData({
          streakDays: res.data.streak,
          credits: res.data.credits || 0,
          signedToday: res.data.signedToday,
          weekDays,
        });
      } else {
        console.error('获取签到信息失败:', res.message);
      }
    } catch (e) {
      console.error('loadSigninData error:', e);
    }
  },

  async onCheckinTap() {
    if (this.data.signedToday) return;

    try {
      const res = await callFunction('signin', 'checkin');
      if (res.success) {
        this.setData({
          signedToday: true,
          streakDays: res.data.streak,
          credits: res.data.credits || this.data.credits,
        });
        wx.showToast({ title: res.data.message, icon: 'none' });
        this.loadSigninData();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (e) {
      console.error('checkin error:', e);
      wx.showToast({ title: '签到失败', icon: 'none' });
    }
  },
});