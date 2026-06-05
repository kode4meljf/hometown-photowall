#!/usr/bin/env node
import automator from 'miniprogram-automator';

const DEV_SEED_KEY = 'photowall-dev-seed';
const WS = process.env.WX_AUTO_WS || 'ws://127.0.0.1:9420';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)
    ),
  ]);
}

const mp = await automator.connect({ wsEndpoint: WS });
console.log('connected', WS);

const page = await withTimeout(mp.currentPage(), 20000, 'currentPage');
console.log('page', page.path);
await sleep(2000);

const d = await page.data();
const first = d.leftPosts?.[0] || d.rightPosts?.[0];
if (!first?.id) {
  console.error('no post');
  process.exit(1);
}
console.log('post', first.id);

const seedRes = await mp.evaluate(function (payload) {
  return wx.cloud
    .callFunction({
      name: 'posts',
      data: {
        action: 'seedTestComments',
        data: { postId: payload.postId, devKey: payload.devKey },
      },
    })
    .then(function (res) {
      return res.result;
    });
}, { postId: first.id, devKey: DEV_SEED_KEY });
console.log('seed', JSON.stringify(seedRes));

const detail = await mp.evaluate(function (postId) {
  return wx.cloud
    .callFunction({
      name: 'posts',
      data: { action: 'detail', data: { id: postId } },
    })
    .then(function (res) {
      return res.result;
    });
}, first.id);
console.log(
  'detail',
  'commentsCount=',
  detail?.data?.commentsCount,
  'top=',
  detail?.data?.comments?.length,
  'hasMore=',
  detail?.data?.hasMore
);

await mp.close();
