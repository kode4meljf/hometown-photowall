// cloudfunctions/auth/index.js - 认证云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const usersCollection = db.collection('users');

// 云函数入口
exports.main = async (event, context) => {
  const { action } = event;
  const data = event.data || {};
  const username = data.username !== undefined ? data.username : event.username;
  const password = data.password !== undefined ? data.password : event.password;
  const nickname = data.nickname !== undefined ? data.nickname : event.nickname;
  const avatar = data.avatar !== undefined ? data.avatar : event.avatar;
  const wxContext = cloud.getWXContext();

  switch (action) {
    case 'register':
      return await handleRegister(username, password, nickname, wxContext.OPENID);
    case 'login':
      return await handleLogin(username, password);
    case 'getCurrentUser':
      return await handleGetCurrentUser(wxContext.OPENID);
    case 'updateUserInfo':
      return await handleUpdateUserInfo(avatar, nickname, wxContext.OPENID);
    case 'updateUserProfile':
      return await handleUpdateUserProfile(event.data || event, wxContext.OPENID);
    default:
      return { success: false, message: '未知操作' };
  }
};

// 注册
async function handleRegister(username, password, nickname, openId) {
  if (!username || !password || !nickname) {
    return { success: false, message: '参数不完整' };
  }

  try {
    const existUser = await usersCollection.where({ username }).get();
    if (existUser.data.length > 0) {
      return { success: false, message: '用户名已存在' };
    }

    const userCount = await usersCollection.count();
    const role = userCount.total === 0 ? 'admin' : 'user';

    const result = await usersCollection.add({
      data: {
        _openid: openId,
        username,
        password,
        nickname,
        role,
        createdAt: db.serverDate()
      }
    });

    return {
      success: true,
      data: {
        user: {
          id: result._id,
          username,
          nickname,
          role,
          avatar: ''
        }
      }
    };
  } catch (e) {
    console.error('注册失败:', e);
    return { success: false, message: '注册失败' };
  }
}

// 登录
async function handleLogin(username, password) {
  if (!username || !password) {
    return { success: false, message: '参数不完整' };
  }

  try {
    const result = await usersCollection.where({ username, password }).get();
    if (result.data.length === 0) {
      return { success: false, message: '用户名或密码错误' };
    }

    const user = result.data[0];
    const avatar = await resolveAvatarUrl(user.avatar);

    return {
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          nickname: user.nickname,
          role: user.role,
          avatar
        }
      }
    };
  } catch (e) {
    console.error('登录失败:', e);
    return { success: false, message: '登录失败' };
  }
}

// 获取当前用户
async function handleGetCurrentUser(openId) {
  try {
    const result = await usersCollection.where({ _openid: openId }).get();
    if (result.data.length === 0) {
      return { success: true, data: null };
    }

    const user = result.data[0];
    const avatar = await resolveAvatarUrl(user.avatar);

    return {
      success: true,
      data: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
        avatar,
        gender: user.gender || 'secret',
        region: user.region || '',
        bio: user.bio || '',
        tags: user.tags || []
      }
    };
  } catch (e) {
    console.error('获取用户失败:', e);
    return { success: false, data: null };
  }
}

// 更新用户信息（头像、昵称）
async function handleUpdateUserInfo(avatar, nickname, openId) {
  try {
    const userResult = await usersCollection.where({ _openid: openId }).get();
    if (userResult.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const userId = userResult.data[0]._id;
    const updateData = {};
    if (avatar) updateData.avatar = avatar;
    if (nickname) updateData.nickname = nickname;
    updateData.updatedAt = db.serverDate();

    await usersCollection.doc(userId).update({ data: updateData });

    return { success: true, data: { avatar, nickname } };
  } catch (e) {
    console.error('更新用户信息失败:', e);
    return { success: false, message: '更新失败' };
  }
}

// 更新完整用户资料
async function handleUpdateUserProfile(params, openId) {
  try {
    const { avatar, nickname, gender, region, bio, tags } = params;

    const userResult = await usersCollection.where({ _openid: openId }).get();
    if (userResult.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const userId = userResult.data[0]._id;
    const updateData = {};
    if (avatar !== undefined) updateData.avatar = avatar;
    if (nickname !== undefined) updateData.nickname = nickname;
    if (gender !== undefined) updateData.gender = gender;
    if (region !== undefined) updateData.region = region;
    if (bio !== undefined) updateData.bio = bio;
    if (tags !== undefined) updateData.tags = tags;
    else updateData.tags = [];
    updateData.updatedAt = db.serverDate();

    try {
      await usersCollection.doc(userId).update({ data: updateData });
    } catch (e) {
      console.error('更新用户资料失败:', e);
      return { success: false, message: '更新失败，请重试' };
    }

    return { success: true, message: '更新成功' };
  } catch (e) {
    console.error('更新用户资料失败:', e);
    return { success: false, message: '更新失败' };
  }
}

// 转换云存储头像为临时链接
async function resolveAvatarUrl(avatar) {
  if (!avatar) return '';
  if (avatar.startsWith('cloud://')) {
    try {
      const result = await cloud.getTempFileURL({ fileList: [avatar] });
      return (result.fileList && result.fileList[0] && result.fileList[0].tempFileURL) || avatar;
    } catch (e) {
      return avatar;
    }
  }
  return avatar;
}
