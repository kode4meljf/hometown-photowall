// pages/profile/signin/signin.js
const { signinApi } = require('../../../utils/api');

function buildProgressDots(streakDays, signedToday) {
  const dots = [];
  if (streakDays >= 7) {
    for (let i = 0; i < 7; i++) {
      dots.push({ cls: i === 6 ? 'done current' : 'done' });
    }
    return dots;
  }

  const currentIndex = signedToday
    ? Math.max(0, Math.min(streakDays - 1, 6))
    : Math.min(streakDays, 6);

  for (let i = 0; i < 7; i++) {
    let cls = '';
    if (signedToday) {
      if (i < streakDays) cls = 'done';
      if (i === currentIndex && streakDays > 0) cls = cls ? `${cls} current` : 'current';
    } else {
      if (i < streakDays) cls = 'done';
      if (i === currentIndex) cls = cls ? `${cls} current` : 'current';
    }
    dots.push({ cls: cls.trim() });
  }
  return dots;
}

function buildProgressCaption(streakDays) {
  if (streakDays >= 7) return '已解锁连续 7 天 +2 次奖励';
  if (streakDays >= 4) {
    const left = 7 - streakDays;
    return left > 0
      ? `再签 ${left} 天解锁「连续 7 天 +2 次」`
      : '已解锁连续 7 天 +2 次奖励';
  }
  const left = 4 - streakDays;
  return `再签 ${left} 天解锁「连续 4 天 +1 次」`;
}

function buildTodayRewardText(streakDays, signedToday) {
  const nextStreak = signedToday ? streakDays : streakDays + 1;
  let reward = 1;
  if (nextStreak === 4) reward += 1;
  if (nextStreak === 7) reward += 2;
  return `+${reward} 次`;
}

function applySigninView(data) {
  const streakDays = data.streakDays || 0;
  const signedToday = !!data.signedToday;
  return {
    ...data,
    progressDots: buildProgressDots(streakDays, signedToday),
    progressCaption: buildProgressCaption(streakDays),
    todayRewardText: buildTodayRewardText(streakDays, signedToday),
    todayRewardLabel: signedToday ? '今日已获得' : '签到可得',
    bonus4Active: streakDays >= 4,
    bonus7Active: streakDays >= 7,
  };
}

const SIGNIN_CACHE_KEY = 'signin_cache_v1';

Page({
  data: {
    pageReady: false,
    streakDays: 0,
    credits: 0,
    todayText: '',
    todayWeekday: '',
    signedToday: false,
    weekDays: [],
    checkingIn: false,
    progressDots: [],
    progressCaption: '',
    todayRewardText: '+1 次',
    todayRewardLabel: '签到可得',
    bonus4Active: false,
    bonus7Active: false,
  },

  onLoad() {
    this._initTodayText();
    this._hydrateFromCache();
    this.loadSigninData();
  },

  onShow() {
    if (this._loaded) {
      this.loadSigninData(true);
    }
  },

  _todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  },

  _hydrateFromCache() {
    try {
      const cache = wx.getStorageSync(SIGNIN_CACHE_KEY);
      if (!cache || cache.date !== this._todayKey()) return;
      this.setData(
        applySigninView({
          streakDays: cache.streakDays,
          credits: cache.credits,
          signedToday: cache.signedToday,
          weekDays: cache.weekDays || [],
        })
      );
      this.setData({ pageReady: true });
    } catch (e) {
      // ignore
    }
  },

  _saveCache(payload) {
    try {
      wx.setStorageSync(SIGNIN_CACHE_KEY, {
        date: this._todayKey(),
        streakDays: payload.streakDays,
        credits: payload.credits,
        signedToday: payload.signedToday,
        weekDays: payload.weekDays,
      });
    } catch (e) {
      // ignore
    }
  },

  _initTodayText() {
    const now = new Date();
    const todayText = `${now.getMonth() + 1}月${now.getDate()}日`;
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    this.setData({
      todayText,
      todayWeekday: weekdays[now.getDay()],
    });
  },

  async loadSigninData(silent = false) {
    try {
      const res = await signinApi.getSigninInfo();
      if (res.success) {
        const weekDays = (res.data.weekDays || []).map((item) => ({
          ...item,
          dayNum: parseInt(item.date.split('-')[2], 10),
        }));
        const view = applySigninView({
          streakDays: res.data.streak,
          credits: res.data.credits || 0,
          signedToday: res.data.signedToday,
          weekDays,
        });
        this._loaded = true;
        this._saveCache(view);
        this.setData({ ...view, pageReady: true });
      } else {
        console.error('获取签到信息失败:', res.message);
        if (!silent) {
          this.setData({ pageReady: true });
        }
      }
    } catch (e) {
      console.error('loadSigninData error:', e);
      if (!silent) {
        this.setData({ pageReady: true });
      }
    }
  },

  async onCheckinTap() {
    if (this.data.signedToday || this.data.checkingIn) return;

    this.setData({ checkingIn: true });
    try {
      const res = await signinApi.checkin();
      if (res.success) {
        const streakDays = res.data.streak;
        const signedToday = true;
        this.setData(
          applySigninView({
            streakDays,
            credits: res.data.credits ?? this.data.credits,
            signedToday,
            weekDays: this.data.weekDays,
          })
        );
        this.setData({ pageReady: true });
        this._saveCache({
          streakDays,
          credits: res.data.credits ?? this.data.credits,
          signedToday: true,
          weekDays: this.data.weekDays,
        });
        wx.showToast({ title: res.data.message, icon: 'none' });
        this.loadSigninData();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (e) {
      console.error('checkin error:', e);
      wx.showToast({ title: '签到失败', icon: 'none' });
    } finally {
      this.setData({ checkingIn: false });
    }
  },
});
