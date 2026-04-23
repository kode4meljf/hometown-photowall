// utils/api.js - 云开发版本 API 封装

// 云函数调用封装
const callFunction = (name, action, data = {}) => {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data: { action, data },
      success: (res) => resolve(res.result),
      fail: reject
    });
  });
};

// 上传图片到云存储
// 返回 fileID（cloud://...），读取时由云函数转换为临时链接
const uploadImage = (filePath) => {
  return new Promise((resolve, reject) => {
    const cloudPath = `photos/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => {
        // 直接返回 fileID，不转临时链接（临时链接有效期约 2 小时）
        resolve(res.fileID);
      },
      fail: reject
    });
  });
};

// 照片相关 API
const photoApi = {
  // 获取照片列表
  getPhotos(params = {}) {
    return callFunction('photos', 'list', params);
  },

  // 获取帖子列表（posts 集合，同 photos 逻辑）
  getPosts(params = {}) {
    return callFunction('photos', 'list', params);
  },

  // 获取照片详情
  getPhoto(id) {
    return callFunction('photos', 'detail', { id });
  },

  // 上传照片
  async uploadPhoto(filePath, formData) {
    // 先上传图片到云存储
    const fileID = await uploadImage(filePath);
    
    // 再保存照片信息
    return callFunction('photos', 'upload', {
      ...formData,
      imageUrl: fileID
    });
  },

  // 删除照片
  deletePhoto(id) {
    return callFunction('photos', 'delete', { id });
  },

  // 点赞
  likePhoto(id) {
    return callFunction('photos', 'like', { id });
  },

  // 添加评论
  addComment(photoId, content) {
    return callFunction('photos', 'comment', { photoId, content });
  },

  // 获取时间线
  getTimeline() {
    return callFunction('photos', 'timeline');
  },

  // 获取地点列表
  getLocations() {
    return callFunction('photos', 'locations');
  },

  // 获取分类列表
  getCategories() {
    return callFunction('photos', 'categories');
  },

  // 获取统计数据
  getStats() {
    return callFunction('photos', 'stats');
  },

  // 获取我的作品
  getMyWorks(params = {}) {
    return callFunction('photos', 'myWorks', params);
  },

  // 获取更多评论（分页）
  getMoreComments(photoId, offset = 0, limit = 10) {
    return callFunction('photos', 'moreComments', { photoId, offset, limit });
  },

  // 获取我赞过的照片
  getLikedPhotos(params = {}) {
    return callFunction('photos', 'myLiked', params);
  },

  // 更新照片标题
  updatePhoto(id, updates) {
    return callFunction('photos', 'update', { id, updates });
  }
};

// 管理员 API
const adminApi = {
  // 获取所有照片
  getPhotos(params = {}) {
    return callFunction('admin', 'getPhotos', params);
  },

  // 获取用户列表
  getUsers() {
    return callFunction('admin', 'getUsers');
  },

  // 删除照片
  deletePhoto(id) {
    return callFunction('admin', 'deletePhoto', { id });
  },

  // 获取管理员统计数据
  getStats() {
    return callFunction('admin', 'getStats');
  }
};

// 初始化数据 API（仅调试用）
const seedApi = {
  initData() {
    return callFunction('seed', 'main');
  }
};

// 用户 API
const userApi = {
  // 获取当前用户信息
  getCurrentUser() {
    return callFunction('auth', 'getCurrentUser');
  },

  // 更新用户信息（头像、昵称）
  updateUserInfo(avatar, nickname) {
    return callFunction('auth', 'updateUserInfo', { avatar, nickname });
  }
};

// 帖子 API（posts 云函数）
const postApi = {
  // 获取所有帖子
  getPosts(params = {}) {
    return callFunction('posts', 'list', params);
  },

  // 创建帖子
  createPost(data) {
    return callFunction('posts', 'create', data);
  }
};

module.exports = {
  callFunction,
  uploadImage,
  photoApi,
  adminApi,
  seedApi,
  userApi,
  postApi
};
