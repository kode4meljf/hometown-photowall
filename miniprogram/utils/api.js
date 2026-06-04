// utils/api.js - 云开发版本 API 封装

const invokeCloud = (name, action, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data: { action, data },
      success: (res) => {
        resolve(res.result);
      },
      fail: (err) => {
        console.error('[invokeCloud] fail:', name, action, err);
        reject(err);
      },
    });
  });
};

// 上传图片到云存储，返回 fileID；路径为 {cloudDir}/{userId}/... 供服务端校验归属
const uploadImage = (filePath, cloudDir = 'photos') => {
  return new Promise((resolve, reject) => {
    const app = typeof getApp === 'function' ? getApp() : null;
    const userId = app && app.globalData && app.globalData.userInfo && app.globalData.userInfo.id;
    if (!userId) {
      reject(new Error('请先登录'));
      return;
    }
    const cloudPath = `${cloudDir}/${userId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => {
        resolve(res.fileID);
      },
      fail: (err) => {
        console.error('[uploadImage] 上传失败:', err);
        reject(err);
      }
    });
  });
};

const userApi = {
  getCurrentUser() {
    return invokeCloud('auth', 'getCurrentUser');
  },

  updateUserProfile(params = {}) {
    return invokeCloud('auth', 'updateUserProfile', params);
  },

  deleteAccount() {
    return invokeCloud('auth', 'deleteAccount');
  }
};

const postApi = {
  getPosts(params = {}) {
    return invokeCloud('posts', 'list', params);
  },

  getPostDetail(id) {
    return invokeCloud('posts', 'detail', { id });
  },

  getShareQrCode(params = {}) {
    return invokeCloud('posts', 'getShareQrCode', params);
  },

  recordShare(postId) {
    return invokeCloud('posts', 'recordShare', { postId });
  },

  createPost(data) {
    return invokeCloud('posts', 'create', data);
  },

  resubmitPost(postId, data) {
    return invokeCloud('posts', 'resubmit', { postId, ...data });
  },

  deletePost(id) {
    return invokeCloud('posts', 'delete', { id });
  },

  deleteComment(commentId) {
    return invokeCloud('posts', 'deleteComment', { commentId });
  },

  likePost(id) {
    return invokeCloud('posts', 'like', { id });
  },

  addComment(postId, content, parentId = null, replyTo = null, replyToAuthor = '') {
    return invokeCloud('posts', 'comment', { postId, content, parentId, replyTo, replyToAuthor });
  },

  toggleCommentLike(commentId) {
    return invokeCloud('posts', 'toggleCommentLike', { commentId });
  },

  getCommentReplies(commentId, offset = 0, limit = 10) {
    return invokeCloud('posts', 'getCommentReplies', { commentId, offset, limit });
  },

  getMoreComments(postId, offset = 0, limit = 10) {
    return invokeCloud('posts', 'moreComments', { postId, offset, limit });
  },

  getMyWorks(params = {}) {
    return invokeCloud('posts', 'myWorks', params);
  },

  getMyLiked(params = {}) {
    return invokeCloud('posts', 'myLiked', params);
  },

  getMyComments(params = {}) {
    return invokeCloud('posts', 'myComments', params);
  },

  getReceivedComments(params = {}) {
    return invokeCloud('posts', 'receivedComments', params);
  },

  getLocations() {
    return invokeCloud('posts', 'locations');
  },

  updatePost(id, updates) {
    return invokeCloud('posts', 'update', { id, updates });
  }
};

const statsApi = {
  getDashboard() {
    return invokeCloud('stats', 'getDashboard');
  }
};

const signinApi = {
  getSigninInfo() {
    return invokeCloud('signin', 'getSigninInfo');
  },

  checkin() {
    return invokeCloud('signin', 'checkin');
  }
};

const feedbackApi = {
  submit(data) {
    return invokeCloud('feedback', 'submit', data);
  },

  report(data) {
    return invokeCloud('feedback', 'report', data);
  },
};

module.exports = {
  invokeCloud,
  uploadImage,
  userApi,
  postApi,
  statsApi,
  signinApi,
  feedbackApi,
};
