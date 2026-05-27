/** 自定义顶栏：与胶囊按钮同一行 */
function getNavBarLayout() {
  const sys = wx.getSystemInfoSync();
  let paddingTop = (sys.statusBarHeight || 20) + 4;
  let barHeight = 32;
  let navBarHeight = paddingTop + barHeight + 8;
  let paddingRight = 96;

  try {
    const menu = wx.getMenuButtonBoundingClientRect();
    if (menu && menu.top > 0 && menu.height > 0) {
      paddingTop = menu.top;
      barHeight = menu.height;
      // 胶囊行下方留白，避免头像与分割线贴叠
      navBarHeight = menu.bottom + 14;
      paddingRight = Math.max(sys.windowWidth - menu.left + 8, 12);
    }
  } catch (e) {
    // 使用默认值
  }

  return { paddingTop, barHeight, navBarHeight, paddingRight, statusBarHeight: sys.statusBarHeight || 20 };
}

module.exports = { getNavBarLayout };
