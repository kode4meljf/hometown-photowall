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

const formatLikeCount = (num) => {
  if (!num || num < 0) return { text: '0', cls: '' };
  if (num >= 100000000) return { text: (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿', cls: 'huge' };
  if (num >= 10000) return { text: (num / 10000).toFixed(1).replace(/\.0$/, '') + '万', cls: 'large' };
  return { text: num.toString(), cls: '' };
};

// 与 formatLikeCount 规则一致，仅返回展示文本（统计页等）
const formatCompactNum = (num) => formatLikeCount(num).text;

module.exports = {
  formatDateTime,
  formatRegisterTime,
  showToast,
  showSuccess,
  showLoading,
  hideLoading,
  formatLikeCount,
  formatCompactNum,
};
