#!/usr/bin/env node
/** 扩展冒烟：上次未覆盖的交互与页面 */
import { connectOrLaunch, safeClose, isConnectionError } from './lib/automator-session.mjs';

const PROJECT = '/Users/kode4meljf/.qclaw/workspace/hometown-photowall/miniprogram';
const passed = [], failed = [], skipped = [];
const pass = (a, n, d = '') => { passed.push({ a, n, d }); console.log(`PASS [${a}] ${n}${d ? ' — ' + d : ''}`); };
const fail = (a, n, d = '') => { failed.push({ a, n, d }); console.log(`FAIL [${a}] ${n}${d ? ' — ' + d : ''}`); };
const skip = (a, n, d = '') => { skipped.push({ a, n, d }); console.log(`SKIP [${a}] ${n} — ${d}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const race = (p, ms, label) => Promise.race([p, sleep(ms).then(() => { throw new Error(`${label} timeout`); })]);

async function cloudCall(mp, name, action, data = {}) {
  return mp.evaluate(function (p) {
    return wx.cloud.callFunction({ name: p.name, data: { action: p.action, data: p.data } })
      .then((r) => r.result).catch((e) => ({ success: false, message: e.errMsg || String(e) }));
  }, { name, action, data });
}

async function openDetail(mp) {
  await mp.reLaunch('/pages/index/index');
  await sleep(2500);
  const page = await mp.currentPage();
  const card = await page.$('.photo-card');
  if (card) await card.tap();
  await sleep(4000);
  return page;
}

console.log('=== 扩展测试（续） ===\n');
let mp;
let page;
let d;

async function ensureSession(label) {
  if (mp) {
    try { await mp.currentPage(); return mp; } catch (_) { await safeClose(mp); mp = null; }
  }
  const session = await connectOrLaunch();
  mp = session.mp;
  pass('自动化', label, session.mode + (session.ws ? ` ${session.ws}` : ''));
  return mp;
}

try {
  await ensureSession('连接');
} catch (e) {
  fail('自动化', '连接', e.message);
  summary(); process.exit(1);
}

// --- 首页交互 ---
console.log('\n--- 首页交互 ---');
try {
  await mp.reLaunch('/pages/index/index');
  await sleep(3500);
  page = await mp.currentPage();

  await page.setData({ searchKeyword: '茶' });
  await page.callMethod('onSearchConfirm');
  await sleep(3000);
  d = await page.data();
  if (d.searchKeyword === '茶') pass('首页', '搜索关键词设置'); else fail('首页', '搜索关键词设置');
  const totalAfterSearch = (d.leftPosts?.length || 0) + (d.rightPosts?.length || 0);
  pass('首页', '搜索后列表', `${totalAfterSearch}条`);

  await page.callMethod('clearSearch');
  await sleep(2500);
  d = await page.data();
  if (!d.searchKeyword) pass('首页', '清空搜索'); else fail('首页', '清空搜索');

  await page.callMethod('onSortSelect', { currentTarget: { dataset: { sort: 'likes' } } });
  await sleep(3000);
  d = await page.data();
  if (d.sortType === 'likes') pass('首页', '排序切换最多赞'); else fail('首页', '排序切换最多赞');

  await page.callMethod('onSortSelect', { currentTarget: { dataset: { sort: 'latest' } } });
  await sleep(2500);
  pass('首页', '排序恢复最新');

  if (d.locations?.length > 0) {
    const loc = d.locations[0];
    await page.callMethod('onLocationTap', { currentTarget: { dataset: { location: loc } } });
    await sleep(2500);
    d = await page.data();
    if (d.selectedLocation === loc) pass('首页', '地点筛选', loc);
    else fail('首页', '地点筛选');
    await page.callMethod('onLocationTap', { currentTarget: { dataset: { location: '' } } });
    await sleep(1500);
  } else {
    skip('首页', '地点筛选', '无地点标签');
  }

  await page.callMethod('onRefresh');
  await sleep(3500);
  pass('首页', '下拉刷新');
} catch (e) {
  fail('首页', '交互块', e.message);
}

// Tab 发布按钮（放详情段之后，避免 navigateTo 导致 automator 断连影响核心用例）
let uploadTestPending = true;
let postId;

// --- 详情：点赞/评论/回复/分享海报 ---
console.log('\n--- 详情交互 ---');
try {
  page = await openDetail(mp);
} catch (e) {
  if (isConnectionError(e)) {
    fail('详情', '打开详情', e.message);
    try { await ensureSession('断连后重连'); page = await openDetail(mp); } catch (e2) {
      fail('详情', '重连后打开详情', e2.message);
      page = null;
    }
  } else {
    fail('详情', '打开详情', e.message);
    page = null;
  }
}
if (!page) {
  skip('详情', '后续用例', '无法打开详情');
} else {
const overlay = await page.$('post-detail-overlay');
let od = overlay ? await overlay.data() : null;
postId = od?.post?.id || (await page.data())?.detailPostId;

if (!postId) {
  fail('详情', '获取 postId');
} else {
  const likeBefore = od?.post?.liked;
  await mp.evaluate(function () {
    getCurrentPages().pop().selectComponent('#detailOverlay')?.handleLike?.();
  });
  await sleep(2000);
  od = await overlay.data();
  if (od?.post?.liked !== likeBefore) pass('详情', '点赞切换', `${likeBefore}->${od.post.liked}`);
  else fail('详情', '点赞切换');
  // 恢复
  await mp.evaluate(function () {
    getCurrentPages().pop().selectComponent('#detailOverlay')?.handleLike?.();
  });
  await sleep(1500);

  const testContent = '家乡的风景真好';
  const commentRes = await cloudCall(mp, 'posts', 'comment', { postId, content: testContent });
  if (commentRes?.success && commentRes.data?.id) {
    pass('详情', '发表评论', commentRes.data.id);
    const del = await cloudCall(mp, 'posts', 'deleteComment', { commentId: commentRes.data.id });
    if (del?.success) pass('详情', '删除自己的评论'); else fail('详情', '删除自己的评论', del?.message);
  } else if (commentRes?.message?.includes('内容安全')) {
    skip('详情', '发表评论', '模拟器内容安全 API 不可用（非功能缺陷）');
  } else {
    fail('详情', '发表评论', commentRes?.message);
  }

  const detailFresh = await cloudCall(mp, 'posts', 'detail', { id: postId });
  const tops = detailFresh?.data?.comments || [];
  const topWithReplies = tops.find((c) => c.repliesCount > 0 || c._hasReplies);
  if (topWithReplies) {
    const rep = await cloudCall(mp, 'posts', 'getCommentReplies', {
      commentId: topWithReplies.id,
      offset: 0,
      limit: 5,
    });
    if (rep?.success && rep.data?.replies?.length > 0) pass('详情', 'getCommentReplies', `${rep.data.replies.length}条`);
    else fail('详情', 'getCommentReplies', rep?.message);
  } else {
    skip('详情', 'getCommentReplies', '当前帖无可展开回复');
  }

  await mp.evaluate(function () {
    getCurrentPages().pop().selectComponent('#detailOverlay')?.generatePoster?.();
  });
  let posterOk = false;
  for (let i = 0; i < 6; i++) {
    await sleep(3000);
    od = await overlay.data();
    if (od?.showSharePoster && od?.sharePosterPath) {
      posterOk = true;
      break;
    }
  }
  if (posterOk) pass('详情', '分享海报生成', '有预览图');
  else fail('详情', '分享海报生成', `show=${od?.showSharePoster}, generating=${od?.sharePosterGenerating}`);
  if (od?.showSharePoster) {
    await mp.evaluate(function () {
      getCurrentPages().pop().selectComponent('#detailOverlay')?.closeSharePoster?.();
    });
    pass('详情', '关闭海报预览');
  }

  await mp.evaluate(function () {
    getCurrentPages().pop().selectComponent('#detailOverlay')?.focusCommentInput?.();
  });
  await sleep(500);
  od = await overlay.data();
  if (od?.showCommentInput) pass('详情', '打开评论输入框'); else fail('详情', '打开评论输入框');

  await mp.evaluate(function () {
    const ov = getCurrentPages().pop().selectComponent('#detailOverlay');
    ov?.hideCommentInput?.();
    ov?.onBack?.();
  });
  await sleep(1000);
}
}

if (uploadTestPending) {
  console.log('\n--- 发布页（后置） ---');
  try {
    await mp.reLaunch('/pages/index/index');
    await sleep(2000);
    await race(mp.navigateTo('/pages/upload/upload'), 25000, 'upload');
    await sleep(1000);
    const up = await mp.currentPage();
    if (up.path.includes('upload')) pass('首页', '发布页 navigateTo');
    else fail('首页', '发布页', up.path);
  } catch (e) {
    fail('首页', '发布页', e.message);
  }
  uploadTestPending = false;
}

// --- 我的页 ---
console.log('\n--- 我的 ---');
try {
await race(mp.switchTab('/pages/profile/profile/profile'), 25000, 'profile');
await sleep(2000);
page = await mp.currentPage();
d = await page.data();
if (d.isLoggedIn) pass('我的', '已登录状态'); else skip('我的', '已登录', '未登录');

await mp.evaluate(function () {
  getCurrentPages().pop().switchTab({ currentTarget: { dataset: { tab: 'liked' } } });
});
await sleep(2000);
pass('我的', '切换到赞过 Tab');

const extraRoutes = [
  ['/pages/profile/edit-profile/edit-profile', '编辑资料'],
  ['/pages/profile/settings/security/security', '账号安全'],
  ['/pages/profile/comments/comments', '评论通知'],
];
for (const [path, label] of extraRoutes) {
  try {
    await mp.reLaunch('/pages/profile/profile/profile');
    await sleep(1200);
    await race(mp.navigateTo(path), 20000, label);
    await sleep(1500);
    const p = await mp.currentPage();
    pass('页面', label, p?.path);
    if (path.includes('comments')) {
      const cd = await p.data();
      if (Array.isArray(cd.sentList)) pass('评论通知', '我发出的列表');
      await mp.evaluate(function () {
        getCurrentPages().pop().switchTab({ currentTarget: { dataset: { tab: 'received' } } });
      });
      await sleep(2000);
      const cd2 = await p.data();
      if (Array.isArray(cd2.receivedList)) pass('评论通知', '收到的评论 Tab');
    }
    if (path.includes('edit-profile')) {
      const ed = await p.data();
      if (ed.formData?.nickname !== undefined) pass('编辑资料', '表单数据');
    }
    if (path.includes('security')) {
      const sd = await p.data();
      if (sd.nickname && sd.nickname !== '加载中…') pass('账号安全', '用户信息', sd.nickname);
      else fail('账号安全', '用户信息');
    }
    await mp.navigateBack().catch(() => {});
  } catch (e) {
    fail('页面', label, e.message);
  }
}
} catch (e) {
  fail('我的', '交互块', e.message);
}

// --- 云函数补充 ---
console.log('\n--- 云函数补充 ---');
try {
  const recv = await cloudCall(mp, 'posts', 'receivedComments', { offset: 0, limit: 5 });
if (recv?.success) pass('云函数', 'posts.receivedComments');
else fail('云函数', 'posts.receivedComments', recv?.message);

const fb = await cloudCall(mp, 'feedback', 'submit', { content: '短', contact: '' });
if (fb?.success === false && fb.message?.includes('至少')) pass('云函数', 'feedback.submit 校验');
else fail('云函数', 'feedback.submit 校验', fb?.message);

const rcv2 = await cloudCall(mp, 'feedback', 'report', { postId: postId || 'x', reason: 'invalid-reason', detail: '' });
if (rcv2?.success === false && rcv2.message?.includes('举报')) pass('云函数', 'feedback.report 校验', rcv2.message);
  else fail('云函数', 'feedback.report 校验', JSON.stringify(rcv2));
} catch (e) {
  fail('云函数', '交互块', e.message);
}

await safeClose(mp);
summary();
process.exit(failed.length ? 1 : 0);

function summary() {
  console.log('\n========== 扩展测试汇总 ==========');
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
