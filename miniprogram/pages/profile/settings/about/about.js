// pages/profile/settings/about/about.js
Page({
  onLoad() {
    wx.setNavigationBarTitle({ title: '关于我们' });
  },

  goAgreement() {
    wx.navigateTo({ url: '/pages/profile/settings/agreement/agreement' });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/profile/settings/privacy/privacy' });
  },
});
