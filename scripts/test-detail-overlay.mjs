#!/usr/bin/env node
/**
 * 详情浮层自动化验收：写入 30 条测试评论后验证
 */
import automator from 'miniprogram-automator';

const PROJECT = '/Users/kode4meljf/.qclaw/workspace/hometown-photowall/miniprogram';
const DEV_SEED_KEY = 'photowall-dev-seed';
const WS = process.env.WX_AUTO_WS || 'ws://127.0.0.1:9420';

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getOverlayData(page) {
  const overlay = await page.$('post-detail-overlay');
  if (overlay) return overlay.data();
  return null;
}

async function main() {
  let miniProgram;
  try {
    miniProgram = await automator.connect({ wsEndpoint: WS });
    record('连接开发者工具', true, WS);

    let page = await miniProgram.currentPage().catch(() => null);
    if (!page || !String(page.path || '').includes('index/index')) {
      page = await miniProgram.reLaunch('/pages/index/index');
    }
    await sleep(3500);

    const pageData = await page.data();
    const first = pageData.leftPosts?.[0] || pageData.rightPosts?.[0];
    if (!first?.id) {
      record('获取测试帖子', false, '首页无帖子');
      return;
    }
    record('获取测试帖子', true, first.id);

    const seedRes = await miniProgram.evaluate(function (payload) {
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
    record(
      '写入 30 条测试评论',
      seedRes?.success === true && seedRes?.data?.inserted === 30,
      seedRes?.message || JSON.stringify(seedRes?.data || seedRes)
    );

    const card = await page.$('.photo-card');
    if (card) await card.tap();
    else {
      await miniProgram.evaluate(function (id) {
        var p = getCurrentPages().pop();
        p.setData({
          detailPostId: id,
          detailOpen: true,
          detailCoverUrl: '',
          detailAspectRatio: 1,
          detailCardPhotoCount: 3,
        });
      }, first.id);
    }
    await sleep(5000);

    const overlayData = await getOverlayData(page);
    if (!overlayData) {
      record('读取详情浮层数据', false);
      return;
    }

    record('loading=false', overlayData.loading === false, `loading=${overlayData.loading}`);
    record('swiperShown=true', overlayData.swiperShown === true);
    record(
      '评论总数>=30',
      (overlayData.post?.commentsCount || 0) >= 30,
      `commentsCount=${overlayData.post?.commentsCount}`
    );
    record(
      '首屏主评论>=15',
      (overlayData.post?.comments?.length || 0) >= 15,
      `top=${overlayData.post?.comments?.length || 0}`
    );
    record(
      '评论模块文案',
      (overlayData.commentsCountText || '').includes('30') ||
        Number(overlayData.commentsCountText) >= 30,
      overlayData.commentsCountText
    );

    const imageSlot = await page.$('post-detail-overlay >>> .image-section');
    if (imageSlot) {
      await imageSlot.tap();
      await sleep(900);
      const afterTap = await getOverlayData(page);
      record(
        '点击图片进入预览',
        afterTap?.isPreviewMode === true,
        `isPreviewMode=${afterTap?.isPreviewMode}`
      );
    } else {
      record('点击图片进入预览', overlayData.isPreviewMode === true, '组件内选择器未命中，跳过 DOM 点击');
    }

    const bottomInData = overlayData.shellReady && overlayData.post;
    record('底栏数据就绪', !!bottomInData);
  } catch (e) {
    record('自动化执行', false, e.message || String(e));
  } finally {
    if (miniProgram) {
      try {
        await miniProgram.close();
      } catch (_) {}
    }
  }

  const pass = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.log('---');
  console.log(`模拟器验收：${pass} 通过，${fail} 失败`);
  process.exit(fail ? 1 : 0);
}

main();
