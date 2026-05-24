// utils/util.js - 工具函数

// 格式化日期
const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 格式化注册时间（年月日时）
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

// 格式化日期时间
const formatDateTime = (dateStr) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

// 相对时间
const timeAgo = (dateStr) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  if (days < 365) return `${Math.floor(days / 30)}个月前`;
  return `${Math.floor(days / 365)}年前`;
};

// 获取季节主题
const getSeasonTheme = () => {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) {
    return {
      name: '春',
      primaryColor: '#4CAF50',
      bgColor: 'linear-gradient(180deg, #c8e6c9 0%, #a5d6a7 40%, #81c784 70%, #66bb6a 100%)'
    };
  } else if (month >= 6 && month <= 8) {
    return {
      name: '夏',
      primaryColor: '#2196F3',
      bgColor: 'linear-gradient(180deg, #bbdefb 0%, #90caf9 40%, #64b5f6 70%, #42a5f5 100%)'
    };
  } else if (month >= 9 && month <= 11) {
    return {
      name: '秋',
      primaryColor: '#FF9800',
      bgColor: 'linear-gradient(180deg, #ffe0b2 0%, #ffcc80 40%, #ffa726 70%, #ff9800 100%)'
    };
  } else {
    return {
      name: '冬',
      primaryColor: '#607D8B',
      bgColor: 'linear-gradient(180deg, #cfd8dc 0%, #b0bec5 40%, #90a4ae 70%, #78909c 100%)'
    };
  }
};

// Toast 提示
const showToast = (title, icon = 'none', duration = 2000) => {
  wx.showToast({ title, icon, duration });
};

const showSuccess = (title) => {
  wx.showToast({ title, icon: 'success' });
};

const showError = (title) => {
  wx.showToast({ title, icon: 'error' });
};

const showLoading = (title = '加载中...') => {
  wx.showLoading({ title, mask: true });
};

const hideLoading = () => {
  wx.hideLoading();
};

// 确认对话框
const showConfirm = (content, title = '提示') => {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (res) => {
        resolve(res.confirm);
      }
    });
  });
};

// 点赞数格式化（靠右显示，小数原样，大数缩写）
// 0~9999: 原样 | 1万~9999万: X万 | ≥1亿: X亿
// 返回 { text, cls }：text 为显示文本，cls 为字号 class（large/huge/空）
const formatLikeCount = (num) => {
  if (!num || num < 0) return { text: '0', cls: '' };
  if (num >= 100000000) return { text: (num / 100000000).toFixed(1).replace(/\.0$/, '') + '亿', cls: 'huge' };
  if (num >= 10000) return { text: (num / 10000).toFixed(1).replace(/\.0$/, '') + '万', cls: 'large' };
  return { text: num.toString(), cls: '' };
};

module.exports = {
  formatDate,
  formatDateTime,
  formatRegisterTime,
  timeAgo,
  getSeasonTheme,
  showToast,
  showSuccess,
  showError,
  showLoading,
  hideLoading,
  showConfirm,
  formatLikeCount
};
