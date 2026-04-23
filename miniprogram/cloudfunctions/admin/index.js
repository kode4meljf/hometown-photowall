// cloudfunctions/admin/index.js - 管理员云函数（posts 集合版）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  // 验证管理员权限
  try {
    const userResult = await db.collection('users').where({
      _openid: openId
    }).get();

    if (userResult.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const user = userResult.data[0];

    if (user.role !== 'admin') {
      return { success: false, message: '无权限访问' };
    }
  } catch (e) {
    console.error('Permission check failed:', e);
    return { success: false, message: '权限验证失败' };
  }

  switch (action) {
    case 'getPhotos':
      return await getAllPhotos(data);
    case 'deletePhoto':
      return await deletePhoto(data.id);
    case 'getUsers':
      return await getUsers();
    case 'getStats':
      return await getAdminStats();
    default:
      return { success: false, message: '未知操作' };
  }
};

// 获取所有照片（读 posts 集合）
async function getAllPhotos(params = {}) {
  try {
    const { page = 1, pageSize = 100 } = params;
    const result = await db.collection('posts')
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const photos = await Promise.all(result.data.map(async photo => {
      const commentCount = await db.collection('comments')
        .where({ photoId: photo._id })
        .count();
      return {
        ...photo,
        id: photo._id,
        commentCount: commentCount.total
      };
    }));

    return { success: true, data: { photos } };
  } catch (e) {
    console.error('获取照片失败:', e);
    return { success: false, message: '获取失败' };
  }
}

// 删除照片（从 posts 集合删除）
async function deletePhoto(id) {
  try {
    await db.collection('posts').doc(id).remove();
    await db.collection('comments').where({ photoId: id }).remove();
    return { success: true };
  } catch (e) {
    console.error('删除照片失败:', e);
    return { success: false, message: '删除失败' };
  }
}

// 获取用户列表
async function getUsers() {
  try {
    const usersResult = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const users = await Promise.all(usersResult.data.map(async user => {
      const photoCount = await db.collection('posts')
        .where({ authorId: user._openid })
        .count();

      const commentCount = await db.collection('comments')
        .where({ authorId: user._openid })
        .count();

      return {
        id: user._id,
        openid: user._openid,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
        photoCount: photoCount.total,
        commentCount: commentCount.total,
        createdAt: user.createdAt
      };
    }));

    return { success: true, data: users };
  } catch (e) {
    console.error('获取用户失败:', e);
    return { success: false, message: '获取失败' };
  }
}

// 获取管理员统计数据（posts 集合）
async function getAdminStats() {
  try {
    const [postCount, userCount, commentCount] = await Promise.all([
      db.collection('posts').count(),
      db.collection('users').count(),
      db.collection('comments').count()
    ]);

    const likesResult = await db.collection('posts')
      .field({ likes: true })
      .get();
    const totalLikes = likesResult.data.reduce((sum, p) => sum + (p.likes || 0), 0);

    return {
      success: true,
      data: {
        totalPhotos: postCount.total,
        totalUsers: userCount.total,
        totalComments: commentCount.total,
        totalLikes
      }
    };
  } catch (e) {
    console.error('获取统计失败:', e);
    return { success: false, data: {} };
  }
}
