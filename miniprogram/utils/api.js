// utils/api.js - 云开发版本 API 封装

const callFunction = (name, action, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data: { action, data },
      success: (res) => {
        resolve(res.result);
      },
      fail: (err) => {
        console.error('[API] callFunction fail:', name, action, err);
        reject(err);
      }
    });
  });
};

// 上传图片到云存储，返回 fileID
const uploadImage = (filePath) => {
  return new Promise((resolve, reject) => {
    const cloudPath = `photos/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
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
    return callFunction('auth', 'getCurrentUser');
  },

  updateUserProfile(params = {}) {
    return callFunction('auth', 'updateUserProfile', params);
  },

  deleteAccount() {
    return callFunction('auth', 'deleteAccount');
  }
};

const postApi = {
  getPosts(params = {}) {
    return callFunction('posts', 'list', params);
  },

  getPostDetail(id) {
    return callFunction('posts', 'detail', { id });
  },

  createPost(data) {
    return callFunction('posts', 'create', data);
  },

  resubmitPost(postId, data) {
    return callFunction('posts', 'resubmit', { postId, ...data });
  },

  deletePost(id) {
    return callFunction('posts', 'delete', { id });
  },

  likePost(id) {
    return callFunction('posts', 'like', { id });
  },

  addComment(postId, content, parentId = null, replyTo = null, replyToAuthor = '') {
    return callFunction('posts', 'comment', { postId, content, parentId, replyTo, replyToAuthor });
  },

  toggleCommentLike(commentId) {
    return callFunction('posts', 'toggleCommentLike', { commentId });
  },

  getCommentReplies(commentId, offset = 0, limit = 10) {
    return callFunction('posts', 'getCommentReplies', { commentId, offset, limit });
  },

  getMoreComments(postId, offset = 0, limit = 10) {
    return callFunction('posts', 'moreComments', { postId, offset, limit });
  },

  getMyWorks(params = {}) {
    return callFunction('posts', 'myWorks', params);
  },

  getMyLiked(params = {}) {
    return callFunction('posts', 'myLiked', params);
  },

  getMyComments(params = {}) {
    return callFunction('posts', 'myComments', params);
  },

  getReceivedComments(params = {}) {
    return callFunction('posts', 'receivedComments', params);
  },

  getLocations() {
    return callFunction('posts', 'locations');
  },

  updatePost(id, updates) {
    return callFunction('posts', 'update', { id, updates });
  }
};

const statsApi = {
  getDashboard() {
    return callFunction('stats', 'getDashboard');
  }
};

const signinApi = {
  getSigninInfo() {
    return callFunction('signin', 'getSigninInfo');
  },

  checkin() {
    return callFunction('signin', 'checkin');
  }
};

const feedbackApi = {
  submit(data) {
    return callFunction('feedback', 'submit', data);
  },

  report(data) {
    return callFunction('feedback', 'report', data);
  },
};

module.exports = {
  callFunction,
  uploadImage,
  userApi,
  postApi,
  statsApi,
  signinApi,
  feedbackApi,
};
