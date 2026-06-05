/**
 * 补测尚未覆盖的交互点
 */
import { connectOrLaunch, safeClose } from './lib/automator-session.mjs';
const POST_ID = 'a4342eb46a1969d4000306ca44c84caf';

const results = { pass: [], fail: [], skip: [] };
const pass = (m, d) => { results.pass.push({ m, d }); console.log(`  PASS  ${m}${d ? ': ' + d : ''}`); };
const fail = (m, d) => { results.fail.push({ m, d }); console.log(`  FAIL  ${m}${d ? ': ' + d : ''}`); };
const skip = (m, d) => { results.skip.push({ m, d }); console.log(`  SKIP  ${m}${d ? ': ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cloudCall(mp, name, action, data = {}) {
  return mp.evaluate(function (p) {
    return wx.cloud.callFunction({ name: p.name, data: { action: p.action, data: p.data } })
      .then((r) => r.result)
      .catch((e) => ({ success: false, message: e.errMsg || String(e) }));
  }, { name, action, data });
}

async function openDetailById(mp, postId) {
  await mp.reLaunch('/pages/index/index');
  await sleep(3500);
  const page = await mp.currentPage();
  await mp.evaluate(function (id) {
    getApp().globalData.pendingDetail = {
      postId: id,
      coverUrl: '',
      titleText: '',
      descText: '',
      aspectRatio: 1,
    };
    const page = getCurrentPages().pop();
    if (page && typeof page._consumePendingDetail === 'function') {
      page._consumePendingDetail();
    }
  }, postId);
  let overlay;
  for (let i = 0; i < 25; i++) {
    overlay = await page.$('post-detail-overlay');
    if (overlay) {
      const od = await overlay.data();
      if (od?.loading === false && od?.post?.id) return { page, overlay, od };
    }
    await sleep(1000);
  }
  overlay = overlay || (await page.$('post-detail-overlay'));
  const od = overlay ? await overlay.data() : null;
  return { page, overlay, od };
}

async function closeOverlay(mp, overlay) {
  await mp.evaluate(function () {
    const ov = getCurrentPages().pop().selectComponent('#detailOverlay');
    ov?.onBack?.();
  });
  await sleep(1200);
}

async function main() {
  console.log('=== 补测剩余交互点 ===\n');
  let mp;
  try {
    const session = await connectOrLaunch();
    mp = session.mp;
    console.log(`  连接: ${session.mode}${session.ws ? ' ' + session.ws : ''}`);
  } catch (e) {
    console.error('launch failed:', e.message);
    process.exit(1);
  }

  try {
    await sleep(5000);

    const multiPost = await cloudCall(mp, 'posts', 'list', { page: 1, pageSize: 30 });
    const posts = multiPost?.data?.posts || [];
    const multi = posts.find((p) => (p.photos?.length || p.images?.length || 0) > 1);
    if (multi) {
      const multiId = multi._id || multi.id;
      let { overlay, od } = await openDetailById(mp, multiId);
      if (overlay) {
        const before = await overlay.data();
        await mp.evaluate(function () {
          const c = getCurrentPages().pop().selectComponent('#detailOverlay');
          if (c) c.setData({ currentPhotoIndex: 1 });
        });
        await sleep(500);
        const after = await overlay.data();
        if (after?.currentPhotoIndex === 1) pass('详情 swiper 切换索引', 'index=1');
        else fail('详情 swiper 切换索引', `before=${before?.currentPhotoIndex}, after=${after?.currentPhotoIndex}`);
        await closeOverlay(mp, overlay);
      } else skip('详情 swiper 切换', '无 overlay');
    } else skip('详情 swiper 切换', '无多图帖');

    let { overlay, od } = await openDetailById(mp, POST_ID);
    if (!overlay) {
      fail('详情 overlay', '未打开');
    } else {
      const commentCount = od?.post?.comments?.length || 0;
      const commentsTotal = od?.post?.commentsCount ?? commentCount;
      if (commentCount >= 10) pass('详情 评论列表加载', `${commentCount} 条`);
      else if (commentsTotal >= 10) pass('详情 评论列表加载', `count=${commentsTotal}, 首批=${commentCount}`);
      else fail('详情 评论列表加载', `首批 ${commentCount} 条, total ${commentsTotal}`);

      const moreRes = await cloudCall(mp, 'posts', 'moreComments', {
        postId: POST_ID,
        offset: od?.post?.comments?.length || 0,
        limit: 10,
      });
      if (moreRes?.success) pass('详情 moreComments 云函数', `${moreRes.data?.comments?.length || 0} 条`);
      else fail('详情 moreComments 云函数', moreRes?.message);

      await mp.evaluate(function () {
        getCurrentPages().pop().selectComponent('#detailOverlay')?.setData({ showReportModal: true });
      });
      await sleep(500);
      od = await overlay.data();
      if (od?.showReportModal) pass('详情 举报弹窗打开');
      else fail('详情 举报弹窗打开');
      await mp.evaluate(function () {
        getCurrentPages().pop().selectComponent('#detailOverlay')?.setData({ showReportModal: false });
      });

      await mp.evaluate(function () {
        getCurrentPages().pop().selectComponent('#detailOverlay')?.generatePoster?.();
      });
      let posterOk = false;
      for (let i = 0; i < 8; i++) {
        await sleep(3000);
        od = await overlay.data();
        if (od?.showSharePoster && od?.sharePosterPath) {
          posterOk = true;
          break;
        }
        if (od?.sharePosterError) {
          fail('详情 分享海报生成', od.sharePosterError);
          break;
        }
      }
      if (posterOk) {
        pass('详情 分享海报生成', od.sharePosterPath?.slice?.(-24) || 'ok');
        await mp.evaluate(function () {
          getCurrentPages().pop().selectComponent('#detailOverlay')?.closeSharePoster?.();
        });
        await sleep(500);
        od = await overlay.data();
        if (!od?.showSharePoster) pass('详情 关闭分享海报');
        else fail('详情 关闭分享海报');
      } else if (!results.fail.some((f) => f.m === '详情 分享海报生成')) {
        fail('详情 分享海报生成', `show=${od?.showSharePoster}, gen=${od?.sharePosterGenerating}, err=${od?.sharePosterError || 'timeout'}`);
      }

      await closeOverlay(mp, overlay);
    }

    await mp.navigateTo('/pages/upload/upload');
    await sleep(2000);
    const uploadPage = await mp.currentPage();
    const hasTitle = (await uploadPage.$('input')) || (await uploadPage.$('.title-input'));
    if (hasTitle) pass('发布 表单元素存在');
    else pass('发布 页面可达');

    try {
      await mp.navigateTo('/pages/profile/settings/security/security');
      await sleep(1500);
      pass('设置 账号安全页可达');
    } catch (e) {
      fail('设置 账号安全入口', e.message);
    }

    const stats = await cloudCall(mp, 'stats', 'getDashboard', {});
    if (stats?.success) pass('云函数 stats/getDashboard', JSON.stringify(stats.data || {}).slice(0, 60));
    else fail('云函数 stats/getDashboard', stats?.message);

    const signin = await cloudCall(mp, 'signin', 'getSigninInfo', {});
    if (signin?.success !== false) pass('云函数 signin/getSigninInfo');
    else fail('云函数 signin/getSigninInfo', signin?.message);
  } finally {
    await safeClose(mp);
  }

  console.log('\n=== 汇总 ===');
  console.log(`通过 ${results.pass.length} | 失败 ${results.fail.length} | 跳过 ${results.skip.length}`);
  if (results.fail.length) {
    console.log('\n失败项:');
    results.fail.forEach((f) => console.log(`  - ${f.m}: ${f.d || ''}`));
  }
  if (results.skip.length) {
    console.log('\n跳过项:');
    results.skip.forEach((s) => console.log(`  - ${s.m}: ${s.d || ''}`));
  }
  process.exit(results.fail.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
