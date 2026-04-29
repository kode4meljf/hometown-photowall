// pages/signin/signin.js
const app = getApp();

Page({
  data: {
    streakDays: 0,
    todayText: '',
    todayWeekday: '',
    signedToday: false,
    weekDays: [],
    weekDayStates: {},
  },

  onLoad() {
    this.initData();
  },

  onShow() {
    this.loadSigninData();
  },

  initData() {
    const now = new Date();
    const todayText = `${now.getMonth() + 1}月${now.getDate()}日`;
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const todayWeekday = weekdays[now.getDay()];

    const weekDays = [];
    const weekDayStates = {};
    const dayOfWeek = now.getDay(); // 0=周日

    // 构建本周7天（周一到周日）
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dayNum = d.getDate();
      const dayLabel = weekdays[d.getDay()].replace('周', '');
      const dateStr = `${d.getMonth() + 1}月${dayNum}日`;

      // 演示数据：假设周一周二已签到（用 dayOfWeek 模拟）
      const isChecked = d.getDay() === 1 || d.getDay() === 2; // 周一、周二已签
      const isToday = d.toDateString() === now.toDateString();

      weekDays.push({
        day: dayNum,
        label: dayLabel,
        dateStr,
        isToday,
      });
      weekDayStates[dayNum] = isChecked ? 'checked' : '';
    }

    // 演示：streakDays 模拟
    const streakDays = 7;

    this.setData({
      todayText,
      todayWeekday,
      weekDays,
      weekDayStates,
      streakDays,
      signedToday: true, // 演示：今天已签到
    });
  },

  loadSigninData() {
    // TODO: 从云函数/数据库加载真实签到数据
    // 需在 auth 或独立云函数中实现：
    // - 获取用户连续签到天数 streakDays
    // - 获取今日是否已签到 signedToday
    // - 获取本周7天签到状态 weekDayStates
  },

  onCheckinTap() {
    if (this.data.signedToday) return;

    // TODO: 调用云函数签到
    // wx.cloud.callFunction({ name: 'signin', data: { action: 'checkin' } })
    //   .then(res => { ... });
  },
});