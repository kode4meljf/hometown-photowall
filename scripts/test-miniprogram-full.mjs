#!/usr/bin/env node
/** 小程序核心功能冒烟测试（单次 launch，约 3-5 分钟） */
import automator from 'miniprogram-automator';
import fs from 'fs';

const PROJECT = '/Users/kode4meljf/.qclaw/workspace/hometown-photowall/miniprogram';
const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const passed = [], failed = [], skipped = [];
const pass = (a, n, d = '') => { passed.push({ a, n, d }); console.log(`PASS [${a}] ${n}${d ? ' — ' + d : ''}`); };
const fail = (a, n, d = '') => { failed.push({ a, n, d }); console.log(`FAIL [${a}] ${n}${d ? ' — ' + d : ''}`); };
const skip = (a, n, d = '') => { skipped.push({ a, n, d }); console.log(`SKIP [${a}] ${n} — ${d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cloudCall(mp, name, action, data = {}) {
  return mp.evaluate(function (p) {
    return wx.cloud.callFunction({ name: p.name, data: { action: p.action, data: p.data } })
      .then((r) => r.result).catch((e) => ({ success: false, message: e.errMsg || String(e) }));
  }, { name, action, data });
}

console.log('=== 老根茶村 · 全功能冒烟测试 ===\n');

// 静态
const root = PROJECT;
const bh = fs.readFileSync(`${root}/behaviors/post-detail-behavior.js`, 'utf8');
if (/loading:\s*false/.test(bh)) pass('静态', 'loadPost loading=false'); else fail('静态', 'loadPost loading=false');
const wxss = fs.readFileSync(`${root}/components/post-detail-overlay/post-detail-overlay.wxss`, 'utf8');
if (/overlay-login-modal[\s\S]*pointer-events:\s*none/.test(wxss)) pass('静态', '登录蒙层穿透'); else fail('静态', '登录蒙层穿透');

console.log('\n--- 启动开发者工具自动化 ---');
let mp;
try {
  mp = await automator.launch({ projectPath: PROJECT, cliPath: CLI, trustProject: true, timeout: 180000 });
  pass('自动化', 'launch 连接');
} catch (e) {
  fail('自动化', 'launch 连接', e.message);
  printSummary(); process.exit(1);
}

const page0 = await Promise.race([mp.currentPage(), sleep(45000).then(() => { throw new Error('currentPage timeout'); })]);
pass('自动化', '模拟器首页', page0.path);

// 云函数
console.log('\n--- 云函数 ---');
const list = await cloudCall(mp, 'posts', 'list', { page: 1, pageSize: 10 });
const postId = list?.data?.posts?.[0]?.id;
if (list?.success && list.data.posts.length > 0) pass('云函数', 'posts.list', `${list.data.posts.length}条`);
else fail('云函数', 'posts.list', list?.message);

const loc = await cloudCall(mp, 'posts', 'locations');
if (loc?.success && Array.isArray(loc.data)) pass('云函数', 'posts.locations', `${loc.data.length}个`);
else fail('云函数', 'posts.locations');

if (postId) {
  const detail = await cloudCall(mp, 'posts', 'detail', { id: postId });
  if (detail?.success) pass('云函数', 'posts.detail', `评论${detail.data.commentsCount}`);
  else fail('云函数', 'posts.detail', detail?.message);

  const more = await cloudCall(mp, 'posts', 'moreComments', { postId, offset: 0, limit: 10 });
  if (more?.success) pass('云函数', 'posts.moreComments');
  else fail('云函数', 'posts.moreComments', more?.message);

  const qr = await cloudCall(mp, 'posts', 'getShareQrCode', { postId });
  if (qr?.success && qr.data?.qrBase64) pass('云函数', 'posts.getShareQrCode');
  else fail('云函数', 'posts.getShareQrCode', qr?.message);
}

const login = await mp.evaluate(() => ({
  loggedIn: !!(getApp().globalData?.userInfo?.id),
}));
if (login.loggedIn) {
  for (const [action, label] of [
    ['getCurrentUser', 'auth.getCurrentUser'],
    ['myWorks', 'posts.myWorks'],
    ['myLiked', 'posts.myLiked'],
    ['myComments', 'posts.myComments'],
  ]) {
    const fn = action === 'getCurrentUser' ? cloudCall(mp, 'auth', action) : cloudCall(mp, 'posts', action, { page: 1, pageSize: 5, offset: 0, limit: 5 });
    const r = await fn;
    if (r?.success) pass('云函数', label); else fail('云函数', label, r?.message);
  }
  const stats = await cloudCall(mp, 'stats', 'getDashboard');
  if (stats?.success) pass('云函数', 'stats.getDashboard'); else fail('云函数', 'stats.getDashboard', stats?.message);
  const signin = await cloudCall(mp, 'signin', 'getSigninInfo');
  if (signin?.success) pass('云函数', 'signin.getSigninInfo'); else fail('云函数', 'signin.getSigninInfo', signin?.message);
} else {
  skip('云函数', '需登录接口', '模拟器未登录，跳过 auth/myWorks/myLiked/stats/signin 等');
}

// 首页 + 详情
console.log('\n--- 首页/详情 ---');
await mp.reLaunch('/pages/index/index');
await sleep(3000);
const page = await mp.currentPage();
const d = await page.data();
if ((d.leftPosts?.length || 0) + (d.rightPosts?.length || 0) > 0) pass('首页', '瀑布流'); else fail('首页', '瀑布流');

const card = await page.$('.photo-card');
if (card) { await card.tap(); pass('首页', '点击帖子'); } else fail('首页', '点击帖子');

await sleep(4500);
const overlay = await page.$('post-detail-overlay');
const od = overlay ? await overlay.data() : null;
if (od?.loading === false) pass('详情', 'loading=false'); else fail('详情', 'loading=false', String(od?.loading));
if (od?.swiperShown) pass('详情', 'swiperShown'); else fail('详情', 'swiperShown');
if (od?.post?.commentsCount >= 0) pass('详情', '评论数', String(od.post.commentsCount)); else fail('详情', '评论数');
if ((od?.post?.comments?.length || 0) > 0) pass('详情', '评论列表', `${od.post.comments.length}条`); else if (od?.post?.commentsCount === 0) pass('详情', '评论列表', '0条'); else fail('详情', '评论列表');

await mp.evaluate(function () { getCurrentPages().pop().selectComponent('#detailOverlay')?.onImageTap?.(); });
await sleep(800);
const od2 = overlay ? await overlay.data() : null;
if (od2?.isPreviewMode) pass('详情', '大图预览'); else fail('详情', '大图预览');
if (od2?.isPreviewMode) await mp.evaluate(function () { getCurrentPages().pop().selectComponent('#detailOverlay')?.exitPreview?.(); });
await mp.evaluate(function () { getCurrentPages().pop().selectComponent('#detailOverlay')?.onBack?.(); });
await sleep(1000);

// 子页面（限时）
console.log('\n--- 页面路由 ---');
const routes = [
  ['switchTab', '/pages/profile/profile/profile', '我的'],
  ['switchTab', '/pages/index/index', '首页 Tab'],
  ['navigateTo', '/pages/upload/upload', '发布'],
  ['navigateTo', '/pages/profile/settings/settings', '设置'],
  ['navigateTo', '/pages/profile/settings/about/about', '关于'],
  ['navigateTo', '/pages/profile/settings/privacy/privacy', '隐私政策'],
  ['navigateTo', '/pages/profile/settings/agreement/agreement', '用户协议'],
  ['navigateTo', '/pages/profile/settings/feedback/feedback', '意见反馈'],
  ['navigateTo', '/pages/profile/signin/signin', '签到'],
  ['navigateTo', '/pages/profile/stats/stats', '数据看板'],
];
for (const [method, path, label] of routes) {
  try {
    if (method === 'switchTab') await Promise.race([mp.switchTab(path), sleep(20000).then(() => { throw new Error('timeout'); })]);
    else {
      await mp.reLaunch('/pages/index/index');
      await sleep(1000);
      await Promise.race([mp.navigateTo(path), sleep(20000).then(() => { throw new Error('timeout'); })]);
    }
    await sleep(800);
    const p = await mp.currentPage();
    pass('页面', label, p?.path);
    if (method === 'navigateTo') await mp.navigateBack().catch(() => {});
  } catch (e) {
    fail('页面', label, e.message);
  }
}

await mp.close();
printSummary();
process.exit(failed.length ? 1 : 0);

function printSummary() {
  console.log('\n========== 汇总 ==========');
  console.log(`通过 ${passed.length}  失败 ${failed.length}  跳过 ${skipped.length}`);
  if (failed.length) {
    console.log('\n未通过项：');
    failed.forEach((x) => console.log(`  · [${x.a}] ${x.n}${x.d ? ' — ' + x.d : ''}`));
  }
}
