// pages/profile/stats/stats.js
const { callFunction } = require('../../../utils/api');
const { formatLikeCount } = require('../../../utils/util');

function formatStatNum(n) {
  const num = Number(n) || 0;
  if (num >= 100000000) {
    return (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  }
  if (num >= 10000) {
    return (num / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return String(num);
}

function formatDelta(n, period) {
  const num = Number(n) || 0;
  if (num <= 0) {
    return { text: `持平 ${period}`, flat: true };
  }
  return { text: `+${formatStatNum(num)} ${period}`, flat: false };
}

function mapDashboard(raw) {
  const p = raw.personal || {};
  const strip = [
    { key: 'works', num: formatStatNum(p.works), lbl: '作品', ...formatDelta(p.deltaWorksMonth, '本月') },
    { key: 'likes', num: formatLikeCount(p.likes).text, lbl: '获赞', ...formatDelta(p.deltaLikesWeek, '本周') },
    { key: 'comments', num: formatStatNum(p.comments), lbl: '评论', ...formatDelta(p.deltaCommentsWeek, '本周') },
    { key: 'views', num: formatStatNum(p.views), lbl: '浏览', ...formatDelta(p.deltaViewsWeek, '本周') },
  ];

  const heroDelta = formatDelta(p.deltaLikesWeek, '本周');
  const monthly = (p.monthly || []).map((m) => ({
    ...m,
    heightStyle: `height:${Math.max(4, m.heightPct * 0.36)}px`,
  }));

  const abilities = (p.abilities || []).map((a) => ({
    ...a,
    widthStyle: `width:${Math.round(a.width)}%`,
  }));

  let platform = null;
  if (raw.platform) {
    const pl = raw.platform;
    platform = {
      rows: [
        {
          name: '平台总作品',
          value: formatStatNum(pl.totalPosts),
          ...formatDelta(pl.deltaPostsMonth, '本月'),
        },
        {
          name: '平台总获赞',
          value: formatStatNum(pl.totalLikes),
          ...formatDelta(pl.deltaLikesMonth, '本月'),
        },
        {
          name: '平台总用户',
          value: formatStatNum(pl.totalUsers),
          ...formatDelta(pl.deltaUsersMonth, '本月'),
        },
      ],
    };
  }

  const chartDelta = formatDelta(p.chartMonthDelta, '本月');

  return {
    isAdmin: !!raw.isAdmin,
    loading: false,
    strip,
    heroLikes: formatLikeCount(p.likes).text,
    heroDeltaText: heroDelta.text.replace(' 本周', ''),
    heroDeltaLabel: '本周新作获赞',
    heroPercentile: p.likesPercentile > 0 ? p.likesPercentile : null,
    monthly,
    chartDeltaText: chartDelta.text,
    chartDeltaFlat: chartDelta.flat,
    abilities,
    platform,
  };
}

Page({
  data: {
    loading: true,
    isAdmin: false,
    strip: [],
    heroLikes: '0',
    heroDeltaText: '',
    heroDeltaLabel: '本周新作获赞',
    heroPercentile: null,
    monthly: [],
    chartDeltaText: '',
    chartDeltaFlat: true,
    abilities: [],
    platform: null,
  },

  onLoad() {
    this.loadStats();
  },

  onShow() {
    if (this._loaded) {
      this.loadStats(true);
    }
  },

  async loadStats(silent = false) {
    if (!silent) {
      this.setData({ loading: true });
    }
    try {
      const res = await callFunction('stats', 'getDashboard');
      if (res.success && res.data) {
        this._loaded = true;
        this.setData(mapDashboard(res.data));
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (e) {
      console.error('loadStats error:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },
});
