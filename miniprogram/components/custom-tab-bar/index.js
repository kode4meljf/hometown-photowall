// components/custom-tab-bar/index.js - TabBar 实现（由根目录 custom-tab-bar 挂载）
module.exports = {
  data: {
    selected: 0,
    hidden: false,
    list: [
      {
        text: '首页',
        iconPath: '/assets/icons/home.png',
        selectedIconPath: '/assets/icons/home-active.png',
        pagePath: '/pages/index/index',
      },
      {
        text: '发布',
        iconPath: '',
        selectedIconPath: '',
        pagePath: '',
      },
      {
        text: '我的',
        iconPath: '/assets/icons/profile.png',
        selectedIconPath: '/assets/icons/profile-active.png',
        pagePath: '/pages/profile/profile/profile',
      },
    ],
  },

  methods: {
    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.list[index];
      if (!item) return;

      if (index === 1) {
        const pages = getCurrentPages();
        const cur = pages[pages.length - 1];
        if (
          cur &&
          cur.route === 'pages/index/index' &&
          cur.data.detailOpen &&
          typeof cur.onDetailClose === 'function'
        ) {
          cur.onDetailClose({ detail: {} });
        }

        wx.navigateTo({
          url: '/pages/upload/upload',
          fail: (err) => {
            console.error('[tabbar] navigateTo upload failed:', err);
            wx.showToast({ title: '无法打开发布页', icon: 'none' });
          },
        });
        return;
      }

      if (index === this.data.selected) return;

      this.setData({ selected: index });
      wx.switchTab({ url: item.pagePath });
    },
  },
};
