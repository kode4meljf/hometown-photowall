/**
 * z-index 刻度（低 → 高）
 * 与 app.wxss 中 --z-* 变量保持同步
 *
 * 990  dropdown-mask   作品筛选遮罩
 * 991  dropdown        作品筛选下拉
 * 1000 tab-bar         自定义底栏
 * 9999 page-sheet      页面级底部 sheet 遮罩（头像/作品操作）
 * 10000 modal          通用居中弹窗（登录、编辑作品）
 * 10001 detail-overlay 帖子详情浮层根
 * 10010 detail-comment 详情内评论输入
 * 10011 detail-like    预览双击点赞动画
 * 10020 detail-preview 大图预览 / 举报弹窗
 * 10030 detail-login   详情/预览内登录弹窗
 */

module.exports = {
  DROPDOWN_MASK: 990,
  DROPDOWN: 991,
  TAB_BAR: 1000,
  PAGE_SHEET: 9999,
  MODAL: 10000,
  DETAIL_OVERLAY: 10001,
  DETAIL_COMMENT: 10010,
  DETAIL_LIKE: 10011,
  DETAIL_PREVIEW: 10020,
  DETAIL_LOGIN: 10030,
};
