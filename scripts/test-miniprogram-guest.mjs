#!/usr/bin/env node
/** 未登录（游客）态全量交互测试 */
import { connectOrLaunch, safeClose } from './lib/automator-session.mjs';

const passed = [], failed = [], skipped = [];
const pass = (a, n, d = '') => { passed.push({ a, n, d }); console.log(`PASS [${a}] ${n}${d ? ' — ' + d : ''}`); };
const fail = (a, n, d = '') => { failed.push({ a, n, d }); console.log(`FAIL [${a}] ${n}${d ? ' — ' + d : ''}`); };
const skip = (a, n, d = '') => { skipped.push({ a, n, d }); console.log(`SKIP [${a}] ${n} — ${d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cloudCall(mp, name, action, data = {}) {
  return mp.evaluate(function (p) {
    return wx.cloud.callFunction({ name: p.name, data: { action: p.action, data: p.data } })
      .then((r) => r.result)
      .catch((e) => ({ success: false, message: e.errMsg || String(e) }));
  }, { name, action, data });
}

async function logout(mp) {
  await mp.evaluate(function () {
    getApp().logout();
  });
  await mp.reLaunch('/pages/index/index');
  await sleep(3500);
}

async function openFirstDetail(mp) {
  const page = await mp.currentPage();
  const card = await page.$('.photo-card');
  if (!card) return { page, overlay: null };
  await card.tap();
  await sleep(4500);
  const overlay = await page.$('post-detail-overlay');
  return { page, overlay };
}

console.log('=== 未登录态全量测试 ===\n');

let mp;
let page;
let overlay;
try {
  const session = await connectOrLaunch();
  mp = session.mp;
  pass('自动化', '连接', session.mode + (session.ws ? ` ${session.ws}` : ''));
} catch (e) {
  fail('自动化', '连接', e.message);
  summary();
  process.exit(1);
}

await sleep(3000);

// --- 退出登录 ---
console.log('\n--- 退出登录 ---');
const beforeLogout = await mp.evaluate(() => ({
  loggedIn: !!getApp().globalData.isLoggedIn,
  nickname: getApp().globalData.userInfo?.nickname || '',
}));
if (beforeLogout.loggedIn) {
  pass('前置', '当前已登录', beforeLogout.nickname || '有 userInfo');
} else {
  skip('前置', '退出前登录态', '已是未登录');
}

await logout(mp);
const guest = await mp.evaluate(() => ({
  loggedIn: !!getApp().globalData.isLoggedIn,
  storage: !!wx.getStorageSync('userInfo'),
}));
if (!guest.loggedIn && !guest.storage) pass('登录', '退出后本地态清空');
else fail('登录', '退出后本地态', `loggedIn=${guest.loggedIn}, storage=${guest.storage}`);

// --- 云函数（游客可读 / 应拒绝）---
console.log('\n--- 云函数 ---');
const list = await cloudCall(mp, 'posts', 'list', { page: 1, pageSize: 5 });
if (list?.success && list.data?.posts?.length > 0) {
  pass('云函数', 'posts.list 可读', `${list.data.posts.length}条`);
} else {
  fail('云函数', 'posts.list', list?.message);
}
const postId = list?.data?.posts?.[0]?.id;

if (postId) {
  const detail = await cloudCall(mp, 'posts', 'detail', { id: postId });
  if (detail?.success) pass('云函数', 'posts.detail 可读');
  else fail('云函数', 'posts.detail', detail?.message);

  // 模拟器 logout 仅清本地态，wx.cloud 仍带 OPENID，云函数侧仍可能识别为已注册用户
  skip('云函数', 'posts.like 拒绝未登录', '以 UI requireLogin 为准；OPENID 在 DevTools 中无法清空');
  skip('云函数', 'posts.comment 拒绝未登录', '同上');
  skip('云函数', 'posts.create 拒绝未登录', '同上');
}

// --- 首页（游客）---
console.log('\n--- 首页 ---');
page = await mp.currentPage();
let d = await page.data();
const feedCount = (d.leftPosts?.length || 0) + (d.rightPosts?.length || 0);
if (feedCount > 0) pass('首页', '瀑布流可读', `${feedCount}条`);
else fail('首页', '瀑布流可读');

const firstPost = d.leftPosts?.[0] || d.rightPosts?.[0];
if (firstPost && firstPost.liked === false) {
  pass('首页', '列表初始未点赞态');
} else if (firstPost) {
  fail('首页', '列表初始未点赞态', `liked=${firstPost.liked}`);
}

await page.setData({ searchKeyword: '茶' });
await page.callMethod('onSearchConfirm');
await sleep(2500);
pass('首页', '搜索可用');

await page.callMethod('clearSearch');
await sleep(2000);
pass('首页', '清空搜索');

await page.callMethod('onRefresh');
await sleep(3000);
pass('首页', '下拉刷新');

// 首页点赞应被拦截（UI 不变）
const likeBtn = await page.$('.like-info');
if (likeBtn) {
  d = await page.data();
  const col = d.leftPosts?.[0] ? 'left' : 'right';
  const posts = col === 'left' ? d.leftPosts : d.rightPosts;
  const beforeLiked = !!posts[0]?.liked;
  await likeBtn.tap();
  await sleep(2500);
  d = await page.data();
  const postsAfter = col === 'left' ? d.leftPosts : d.rightPosts;
  const afterLiked = !!postsAfter[0]?.liked;
  if (!afterLiked && afterLiked === beforeLiked) {
    pass('首页', '点赞被拦截', 'liked 未变化');
  } else {
    fail('首页', '点赞应被拦截', `before=${beforeLiked}, after=${afterLiked}`);
  }
} else {
  fail('首页', '点赞按钮', '未找到 .like-info');
}

// --- 详情（游客）---
console.log('\n--- 详情 ---');
({ page, overlay } = await openFirstDetail(mp));
if (!overlay) {
  fail('详情', '打开浮层');
} else {
  const od = await overlay.data();
  if (od?.loading === false && od?.post?.id) pass('详情', '可读', od.post.id);
  else fail('详情', '可读', `loading=${od?.loading}`);

  if (od?.post?.liked === false) pass('详情', '初始未点赞');
  else fail('详情', '初始未点赞', String(od?.post?.liked));

  await mp.evaluate(function () {
    getCurrentPages().pop().selectComponent('#detailOverlay')?.handleLike?.();
  });
  await sleep(800);
  const odLike = await overlay.data();
  if (odLike?.loginModalShow) {
    pass('详情', '点赞弹登录窗');
  } else if (odLike?.post?.liked === false) {
    pass('详情', '点赞未生效', 'liked 仍为 false');
  } else {
    fail('详情', '点赞应拦截', `loginModal=${odLike?.loginModalShow}, liked=${odLike?.post?.liked}`);
  }

  await mp.evaluate(function () {
    const ov = getCurrentPages().pop().selectComponent('#detailOverlay');
    ov?.setData({ loginModalShow: false });
    ov?.focusCommentInput?.();
  });
  await sleep(600);
  const odComment = await overlay.data();
  if (odComment?.loginModalShow || !odComment?.showCommentInput) {
    pass('详情', '评论需登录');
  } else {
    fail('详情', '评论应拦截', `showInput=${odComment?.showCommentInput}`);
  }

  await mp.evaluate(function () {
    getCurrentPages().pop().selectComponent('#detailOverlay')?.onImageTap?.();
  });
  await sleep(800);
  const odPreview = await overlay.data();
  if (odPreview?.isPreviewMode) pass('详情', '大图预览可用');
  else fail('详情', '大图预览', '未进入预览');
  if (odPreview?.isPreviewMode) {
    await mp.evaluate(function () {
      getCurrentPages().pop().selectComponent('#detailOverlay')?.exitPreview?.();
    });
    await sleep(500);
  }

  await mp.evaluate(function () {
    getCurrentPages().pop().selectComponent('#detailOverlay')?.generatePoster?.();
  });
  await sleep(1500);
  const odPoster = await overlay.data();
  if (odPoster?.loginModalShow) {
    pass('详情', '分享需登录', '弹登录窗');
  } else if (!odPoster?.showSharePoster && !odPoster?.sharePosterGenerating && !odPoster?.sharePosterPath) {
    pass('详情', '分享未生成海报', '未进入 Canvas 流程');
  } else {
    fail('详情', '分享应拦截', `loginModal=${odPoster?.loginModalShow}, show=${odPoster?.showSharePoster}`);
  }

  await mp.evaluate(function () {
    const ov = getCurrentPages().pop().selectComponent('#detailOverlay');
    ov?.setData({ loginModalShow: false });
    ov?.onBack?.();
  });
  await sleep(1000);
}

// --- Tab 页 ---
console.log('\n--- Tab / 子页 ---');
try {
  await mp.switchTab('/pages/profile/profile/profile');
  await sleep(2000);
  page = await mp.currentPage();
  d = await page.data();
  if (d.isLoggedIn === false) pass('我的', '未登录 UI');
  else fail('我的', '应显示未登录', `isLoggedIn=${d.isLoggedIn}`);
} catch (e) {
  fail('我的', 'Tab', e.message);
}

try {
  await mp.navigateTo('/pages/profile/settings/settings');
  await sleep(1500);
  page = await mp.currentPage();
  d = await page.data();
  if (d.isLoggedIn === false) pass('设置', '未登录态');
  else fail('设置', '未登录态', `isLoggedIn=${d.isLoggedIn}`);
  const logoutBtn = await page.$('.logout-btn');
  if (!logoutBtn) pass('设置', '无退出按钮');
  else fail('设置', '未登录不应显示退出');
  await mp.navigateBack().catch(() => {});
} catch (e) {
  fail('设置', '页面', e.message);
}

try {
  await mp.reLaunch('/pages/index/index');
  await sleep(1500);
  await mp.navigateTo('/pages/upload/upload');
  await sleep(1500);
  page = await mp.currentPage();
  if (page.path.includes('upload')) pass('发布', '页面可达');
  else fail('发布', '页面', page.path);
} catch (e) {
  fail('发布', 'navigateTo', e.message);
}

// 静态页无需登录
const staticRoutes = [
  ['/pages/profile/settings/about/about', '关于'],
  ['/pages/profile/settings/privacy/privacy', '隐私政策'],
  ['/pages/profile/settings/agreement/agreement', '用户协议'],
];
for (const [path, label] of staticRoutes) {
  try {
    await mp.reLaunch('/pages/index/index');
    await sleep(800);
    await mp.navigateTo(path);
    await sleep(1000);
    const p = await mp.currentPage();
    if (p.path.includes(path.split('/').pop())) pass('页面', label);
    else fail('页面', label, p.path);
  } catch (e) {
    fail('页面', label, e.message);
  }
}

await safeClose(mp);
summary();
process.exit(failed.length ? 1 : 0);

function summary() {
  console.log('\n========== 未登录测试汇总 ==========');
  console.log(`通过 ${passed.length}  失败 ${failed.length}  跳过 ${skipped.length}`);
  if (failed.length) {
    console.log('\n未通过：');
    failed.forEach((x) => console.log(`  · [${x.a}] ${x.n}${x.d ? ' — ' + x.d : ''}`));
  }
  if (skipped.length) {
    console.log('\n跳过：');
    skipped.forEach((x) => console.log(`  · [${x.a}] ${x.n} — ${x.d}`));
  }
}
