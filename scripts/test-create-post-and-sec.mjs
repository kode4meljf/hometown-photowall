#!/usr/bin/env node
/**
 * 轻量发帖 + 内容安全独立测试
 * 依赖 posts 云函数 devCreateTestPost / devTestContentSecurity / devCleanupTestPosts
 */
import { connectOrLaunch, safeClose } from './lib/automator-session.mjs';

const DEV_KEY = 'photowall-dev-seed';
const POST_ID = 'a4342eb46a1969d4000306ca44c84caf';
const SERVICE_MSG = '内容安全服务暂不可用';
const passed = [];
const failed = [];
const skipped = [];

const pass = (a, n, d = '') => {
  passed.push({ a, n, d });
  console.log(`PASS [${a}] ${n}${d ? ' — ' + d : ''}`);
};
const fail = (a, n, d = '') => {
  failed.push({ a, n, d });
  console.log(`FAIL [${a}] ${n}${d ? ' — ' + d : ''}`);
};
const skip = (a, n, d = '') => {
  skipped.push({ a, n, d });
  console.log(`SKIP [${a}] ${n} — ${d}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cloudCall(mp, name, action, data = {}) {
  return mp.evaluate(function (p) {
    return wx.cloud.callFunction({ name: p.name, data: { action: p.action, data: p.data } })
      .then((r) => r.result)
      .catch((e) => ({ success: false, message: e.errMsg || String(e) }));
  }, { name, action, data });
}

function isSecUnavailable(msg = '') {
  return msg.includes('内容安全') || msg.includes(SERVICE_MSG);
}

function classifySecCheck(check) {
  const { name, pass: ok, message = '' } = check;
  if (ok) return { type: 'pass', detail: message || 'ok' };
  if (isSecUnavailable(message)) return { type: 'skip', detail: message };
  if (name.startsWith('create_reject')) return { type: 'fail', detail: message };
  return { type: 'fail', detail: message || '未通过' };
}

console.log('=== 轻量发帖 & 内容安全测试 ===\n');

let mp;
try {
  const session = await connectOrLaunch();
  mp = session.mp;
  pass('自动化', '连接', session.mode + (session.ws ? ` ${session.ws}` : ''));
} catch (e) {
  fail('自动化', '连接', e.message);
  summary();
  process.exit(1);
}

await sleep(4000);

const user = await cloudCall(mp, 'auth', 'getCurrentUser', {});
if (!user?.success || !user.data?.id) {
  fail('前置', '登录态', user?.message || '未登录');
  await safeClose(mp);
  summary();
  process.exit(1);
}
pass('前置', '已登录', user.data.nickname || user.data.id);

// --- 内容安全独立测试 ---
console.log('\n--- 内容安全 API ---');
const secRes = await cloudCall(mp, 'posts', 'devTestContentSecurity', { devKey: DEV_KEY });
if (secRes?.message === '未知操作') {
  fail('内容安全', 'devTestContentSecurity', '云函数未部署，请先上传 posts');
} else if (!secRes?.success) {
  fail('内容安全', 'devTestContentSecurity', secRes?.message);
} else {
  pass('内容安全', 'devTestContentSecurity 可达', `openId=${secRes.data.openIdPresent}`);
  for (const check of secRes.data.checks || []) {
    const verdict = classifySecCheck(check);
    const label = check.name;
    if (verdict.type === 'pass') pass('内容安全', label, verdict.detail);
    else if (verdict.type === 'skip') skip('内容安全', label, verdict.detail);
    else fail('内容安全', label, verdict.detail);
  }
}

// --- 评论链路内容安全（业务入口） ---
console.log('\n--- 评论内容安全 ---');
const commentText = `自动化评论 ${Date.now()}`;
const commentRes = await cloudCall(mp, 'posts', 'comment', { postId: POST_ID, content: commentText });
if (commentRes?.success && commentRes.data?.id) {
  pass('评论', '合规评论发表', commentRes.data.id);
  const del = await cloudCall(mp, 'posts', 'deleteComment', { commentId: commentRes.data.id });
  if (del?.success) pass('评论', '删除测试评论');
  else fail('评论', '删除测试评论', del?.message);
} else if (isSecUnavailable(commentRes?.message || '')) {
  skip('评论', '合规评论发表', commentRes?.message);
} else if (commentRes?.message === '未知操作') {
  fail('评论', 'comment', '云函数未部署');
} else {
  fail('评论', '合规评论发表', commentRes?.message);
}

// --- 轻量创建帖子 ---
console.log('\n--- 轻量创建帖子 ---');
await cloudCall(mp, 'posts', 'devCleanupTestPosts', { devKey: DEV_KEY });

const createRes = await cloudCall(mp, 'posts', 'devCreateTestPost', { devKey: DEV_KEY });
if (createRes?.message === '未知操作') {
  fail('发帖', 'devCreateTestPost', '云函数未部署');
} else if (createRes?.success && createRes.data?.id) {
  const postId = createRes.data.id;
  pass('发帖', 'createPost 全流程', `${postId} status=${createRes.data.status || 'released'}`);

  const detail = await cloudCall(mp, 'posts', 'detail', { id: postId });
  if (detail?.success && detail.data?.title?.includes('[auto-test-post]')) {
    pass('发帖', 'detail 可读', detail.data.title.slice(0, 40));
  } else {
    fail('发帖', 'detail 可读', detail?.message || '标题不匹配');
  }

  const cleanup = await cloudCall(mp, 'posts', 'devCleanupTestPosts', { devKey: DEV_KEY });
  if (cleanup?.success && cleanup.data?.removed >= 1) {
    pass('发帖', '清理测试帖', `removed=${cleanup.data.removed}`);
  } else {
    fail('发帖', '清理测试帖', JSON.stringify(cleanup));
  }
} else if (isSecUnavailable(createRes?.message || '')) {
  skip('发帖', 'createPost 全流程', createRes?.message);
} else {
  fail('发帖', 'createPost 全流程', createRes?.message);
}

await safeClose(mp);
summary();
process.exit(failed.length ? 1 : 0);

function summary() {
  console.log('\n========== 汇总 ==========');
  console.log(`通过 ${passed.length}  失败 ${failed.length}  跳过 ${skipped.length}`);
  if (failed.length) {
    console.log('\n失败：');
    failed.forEach((x) => console.log(`  · [${x.a}] ${x.n}${x.d ? ' — ' + x.d : ''}`));
  }
  if (skipped.length) {
    console.log('\n跳过（多为内容安全 API 环境限制）：');
    skipped.forEach((x) => console.log(`  · [${x.a}] ${x.n} — ${x.d}`));
  }
}
