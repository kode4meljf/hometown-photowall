#!/usr/bin/env node
/** 写入 30 条评论 + 详情浮层数据层验收（单次连接） */
import WebSocket from 'ws';
import automator from 'miniprogram-automator';

const DEV_SEED_KEY = 'photowall-dev-seed';
const PORTS = [9420];

async function probe(p) {
  return new Promise((r) => {
    const ws = new WebSocket(`ws://127.0.0.1:${p}`);
    const t = setTimeout(() => { ws.terminate(); r(false); }, 600);
    ws.on('open', () => { clearTimeout(t); ws.close(); r(true); });
    ws.on('error', () => { clearTimeout(t); r(false); });
  });
}

let ws;
for (const p of PORTS) {
  if (await probe(p)) { ws = `ws://127.0.0.1:${p}`; break; }
}
if (!ws) { console.error('无自动化端口，请先在开发者工具打开本项目并开启自动化'); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (n, ok, d = '') => { results.push({ n, ok, d }); console.log(`${ok?'PASS':'FAIL'} ${n}${d?` — ${d}`:''}`); };

const mp = await automator.connect({ wsEndpoint: ws });
record('连接', true, ws);
const page = await mp.currentPage();
const d = await page.data();
const first = d.leftPosts?.[0] || d.rightPosts?.[0];
record('首页帖子', !!first?.id, first?.id);

const seed = await mp.evaluate(function (pl) {
  return wx.cloud.callFunction({
    name: 'posts',
    data: { action: 'seedTestComments', data: { postId: pl.postId, devKey: pl.devKey } },
  }).then((r) => r.result);
}, { postId: first.id, devKey: DEV_SEED_KEY });
record('写入30条(18主+12回复)', seed?.success && seed.data?.inserted === 30, JSON.stringify(seed?.data));

const card = await page.$('.photo-card');
if (card) await card.tap();
await sleep(5000);

const overlay = await page.$('post-detail-overlay');
const od = overlay ? await overlay.data() : null;
record('loading=false', od?.loading === false);
record('swiperShown', od?.swiperShown === true);
record('commentsCount=30', od?.post?.commentsCount === 30, String(od?.post?.commentsCount));
record('首屏18条主评', od?.post?.comments?.length === 18, String(od?.post?.comments?.length));
record('评论文案30', od?.commentsCountText === '30', od?.commentsCountText);

if (overlay) {
  await mp.evaluate(function () {
    const pages = getCurrentPages();
    const page = pages[pages.length - 1];
    const ov = getCurrentPages().pop().selectComponent('#detailOverlay');
    if (ov && typeof ov.onImageTap === 'function') ov.onImageTap();
  });
  await sleep(800);
  const od2 = await overlay.data();
  record('点图进预览', od2?.isPreviewMode === true);
}

await mp.close();
const ok = results.filter((x) => x.ok).length;
console.log('---', `${ok}/${results.length} 通过`);
process.exit(ok === results.length ? 0 : 1);
