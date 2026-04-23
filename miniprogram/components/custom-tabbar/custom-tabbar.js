// components/custom-tabbar/custom-tabbar.js
Component({
  properties: {
    current: {
      type: Number,
      value: 0
    }
  },

  methods: {
    switchTab(e) {
      const tab = e.currentTarget.dataset.tab;
      const current = this.data.current;

      console.log('[tabbar] switchTab clicked, tab=', tab, 'typeof=', typeof tab, 'current=', current, 'typeof=', typeof current);

      // tab 来自 dataset（可能是字符串），current 来自 property（Number）
      // 统一转字符串比较
      if (String(tab) === String(current)) return;

      if (Number(tab) === 0) {
        console.log('[tabbar] redirectTo index');
        wx.redirectTo({ url: '/pages/index/index' });
      } else if (Number(tab) === 1) {
        console.log('[tabbar] redirectTo profile');
        wx.redirectTo({ url: '/pages/profile/profile' });
      }
    },

    goToUpload() {
      wx.navigateTo({
        url: '/pages/upload/upload'
      });
    }
  }
});