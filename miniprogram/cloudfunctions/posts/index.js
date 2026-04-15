// cloudfunctions/posts/index.js - 帖子（posts）云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const postsCollection = db.collection('posts');

// 获取所有帖子（用于加载地点列表等）
async function getPosts(params = {}) {
  const { limit = 100 } = params;
  try {
    const result = await postsCollection
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return { success: true, data: result.data };
  } catch (e) {
    console.error('获取帖子列表失败:', e);
    return { success: false, message: '获取失败', data: [] };
  }
}

// 创建帖子（上传页调用）
async function createPost(data, openId) {
  const { title, description, location, photos = [] } = data;
  if (!title || !title.trim()) {
    return { success: false, message: '标题不能为空' };
  }
  try {
    const result = await postsCollection.add({
      data: {
        title: title.trim(),
        description: description ? description.trim() : '',
        location: location ? location.trim() : '',
        photos,         // [{imageUrl, width, height, order}]
        authorId: openId,
        likes: 0,
        views: 0,
        likedUsers: [],
        createdAt: db.serverDate(),
        updatedAt: db.serverDate()
      }
    });
    return { success: true, data: { id: result._id } };
  } catch (e) {
    console.error('创建帖子失败:', e);
    return { success: false, message: '发布失败' };
  }
}

exports.main = async (event, context) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  switch (action) {
    case 'list':
      return await getPosts(data);
    case 'create':
      return await createPost(data, openId);
    default:
      return { success: false, message: '未知操作' };
  }
};
