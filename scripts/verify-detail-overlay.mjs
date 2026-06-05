#!/usr/bin/env node
/**
 * 详情浮层静态验收（无需微信开发者工具）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

const postDetailBehavior = read('miniprogram/behaviors/post-detail-behavior.js');
const postPreviewBehavior = read('miniprogram/behaviors/post-preview-behavior.js');
const commentsWxml = read(
  'miniprogram/components/detail-overlay/detail-overlay-comments/detail-overlay-comments.wxml'
);
const overlayWxml = read('miniprogram/components/post-detail-overlay/post-detail-overlay.wxml');
const overlayWxss = read('miniprogram/components/post-detail-overlay/post-detail-overlay.wxss');
const overlayJs = read('miniprogram/components/post-detail-overlay/post-detail-overlay.js');

// 1. loading 修复
const successBlock = postDetailBehavior.match(
  /this\.setData\(\{[\s\S]*?post: finalPost[\s\S]*?\}\);/
);
check(
  'loadPost 成功时 setData 含 loading: false',
  successBlock && /loading:\s*false/.test(successBlock[0]),
  successBlock ? '' : '未找到成功 setData 块'
);
check(
  'loadPost 无 finally 里单独清 loading 的回归写法',
  !/finally\s*\{[\s\S]*?loading:\s*false/.test(postDetailBehavior)
);

// 2. 评论 / 预览门禁
check('评论列表 wx:if 依赖 !loading', /wx:if="\{\{!loading\}\}"/.test(commentsWxml));
check(
  'onImageTap 在 loading 时 return',
  /onImageTap\(\)[\s\S]*?this\.data\.loading/.test(postPreviewBehavior)
);

// 3. swiper 触摸
check(
  'panel-photo-wrap 默认 pointer-events: none',
  /\.panel-photo-wrap\s*\{[\s\S]*?pointer-events:\s*none/.test(overlayWxss)
);
check(
  'swiper-show 恢复 pointer-events: auto',
  /\.panel-photo-wrap\.swiper-show[\s\S]*?pointer-events:\s*auto/.test(overlayWxss)
);
check('无 panelScrollHeight 残留', !/panelScrollHeight/.test(overlayWxml + overlayJs + postDetailBehavior));

// 4. handoff 链路
check(
  'onPhotoLoad 调用 onHeroPhotoLoad',
  /onPhotoLoad\(e\)[\s\S]*?this\.onHeroPhotoLoad\(e\)/.test(overlayJs)
);
check(
  'loadPost 成功触发 _heroTryHandoff',
  /loadPost[\s\S]*?_heroTryHandoff/.test(postDetailBehavior)
);

// 5. 布局
check(
  'panel-scroll 使用 flex:1 height:0',
  /\.panel-scroll\s*\{[\s\S]*?flex:\s*1[\s\S]*?height:\s*0/.test(overlayWxss)
);
check(
  '底栏在 scroll-view 外',
  overlayWxml.indexOf('</scroll-view>') < overlayWxml.indexOf('detail-overlay-bottom-bar')
);

// 6. 登录蒙层是否可能挡触摸
const loginModalWxss = read('miniprogram/components/login-modal/login-modal.wxss');
check(
  'login-modal 隐藏时 pointer-events: none',
  /\.login-modal-overlay\s*\{[\s\S]*?pointer-events:\s*none/.test(loginModalWxss)
);
const loginWrapBlocks = /\.overlay-login-modal\s*\{[\s\S]*?\}/.exec(overlayWxss);
const loginWrapHasPassThrough =
  loginWrapBlocks && /pointer-events:\s*none/.test(loginWrapBlocks[0]);
check(
  'overlay-login-modal 未挡触摸（pointer-events: none 或等效）',
  loginWrapHasPassThrough,
  '全屏 fixed 容器无 pointer-events:none，可能挡住 swiper/底栏点击'
);

let pass = 0;
let fail = 0;
for (const c of checks) {
  const tag = c.ok ? 'PASS' : 'FAIL';
  console.log(`${tag} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  c.ok ? pass++ : fail++;
}
console.log('---');
console.log(`静态验收 ${pass}/${checks.length} 通过`);
process.exit(fail ? 1 : 0);
