// utils/util.js - 工具函数

const formatRegisterTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  return `${year}年${month}月${day}日 ${hour}时`;
};

const formatDateTime = (dateStr) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const showToast = (title, icon = 'none', duration = 2000) => {
  wx.showToast({ title, icon, duration });
};

const showSuccess = (title) => {
  wx.showToast({ title, icon: 'success' });
};

const showLoading = (title = '加载中...') => {
  wx.showLoading({ title, mask: true });
};

const hideLoading = () => {
  wx.hideLoading();
};

/** 标题/描述/图片等内容安全未通过 */
const { mapApiErrorMessage } = require('./apiErrors');

const showContentAuditModal = (content, code) => {
  let title = '内容未通过审核';
  if (code === 'image_block') title = '图片未通过审核';
  else if (code === 'text_block') title = '文字未通过审核';
  else if (code === 'post_rejected') title = '作品未通过审核';
  wx.showModal({
    title,
    content: content || '请修改后重试',
    showCancel: false,
    confirmText: '我知道了',
  });
};

const isContentAuditFailure = (res) => {
  if (!res) return false;
  if (res.code === 'image_block' || res.code === 'text_block') return true;
  const msg = res.message || '';
  return /不符合规范|内容安全|87014|risky content/i.test(msg);
};

const formatLikeCount = (num) => {
  if (!num || num < 0) return { text: '0', cls: '' };
  if (num >= 100000000) return { text: (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿', cls: 'huge' };
  if (num >= 10000) return { text: (num / 10000).toFixed(1).replace(/\.0$/, '') + '万', cls: 'large' };
  return { text: num.toString(), cls: '' };
};

/** 展示用数字文本；WXS filters.formatCount 须保持相同规则 */
const formatCountText = (num) => formatLikeCount(num).text;

const formatCompactNum = formatCountText;

function formatPostCountTexts(post) {
  if (!post) {
    return { commentsCountText: '0', likesCountText: '0', sharesCountText: '0' };
  }
  const commentsCount = post.commentsCount != null
    ? post.commentsCount
    : (post.comments ? post.comments.length : 0);
  return {
    commentsCountText: formatCountText(commentsCount),
    likesCountText: formatCountText(post.likes || 0),
    sharesCountText: formatCountText(post.shares || 0),
  };
}

module.exports = {
  formatDateTime,
  formatRegisterTime,
  showToast,
  showSuccess,
  showLoading,
  hideLoading,
  showContentAuditModal,
  isContentAuditFailure,
  formatLikeCount,
  formatCountText,
  formatCompactNum,
  formatPostCountTexts,
  mapApiErrorMessage,
};
