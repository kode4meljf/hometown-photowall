// miniprogram/custom-tab-bar/index.js
Component({
  data: {
    selected: 0,
    hidden: false,
    list: [
      {
        text: '首页',
        iconPath: '/assets/icons/home.png',
        selectedIconPath: '/assets/icons/home-active.png',
        pagePath: '/pages/index/index'
      },
      {
        text: '发布',
        iconPath: '',
        selectedIconPath: '',
        pagePath: ''
      },
      {
        text: '我的',
        iconPath: '/assets/icons/profile.png',
        selectedIconPath: '/assets/icons/profile-active.png',
        pagePath: '/pages/profile/profile/profile'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];

      if (index === 1) {
        // 中间发布按钮：打开上传页
        wx.navigateTo({ url: '/pages/upload/upload' });
        return;
      }

      if (index === this.data.selected) return;

      this.setData({ selected: index });
      wx.switchTab({ url: item.pagePath });
    }
  }
});
