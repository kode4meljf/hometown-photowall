// cloudfunctions/auth/index.js - 认证云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const usersCollection = db.collection('users');

exports.main = async (event, context) => {
  const { action } = event;
  const data = event.data || {};
  // 兼容两种传参方式：data 内嵌 或直接在 event 顶层
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
    // 检查用户名是否存在
    const existUser = await usersCollection.where({ username }).get();
    if (existUser.data.length > 0) {
      return { success: false, message: '用户名已存在' };
    }

    // 检查是否是第一个用户（自动成为管理员）
    const userCount = await usersCollection.count();
    const role = userCount.total === 0 ? 'admin' : 'user';

    // 创建用户 - 云函数中必须手动添加 _openid
    const result = await usersCollection.add({
      data: {
        _openid: openId,  // 必须手动添加
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
          avatar: ''  // 新用户无头像
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
    const result = await usersCollection.where({
      username,
      password
    }).get();

    if (result.data.length === 0) {
      return { success: false, message: '用户名或密码错误' };
    }

    const user = result.data[0];

    // 转换头像 URL（如果是云存储地址）
    let avatar = user.avatar || '';
    if (avatar && avatar.startsWith('cloud://')) {
      try {
        const urlResult = await cloud.getTempFileURL({
          fileList: [avatar]
        });
        if (urlResult.fileList && urlResult.fileList[0] && urlResult.fileList[0].tempFileURL) {
          avatar = urlResult.fileList[0].tempFileURL;
        }
      } catch (e) {
        console.error('转换头像URL失败:', e);
      }
    }

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
    const result = await usersCollection.where({
      _openid: openId
    }).get();

    if (result.data.length === 0) {
      return { success: true, data: null };
    }

    const user = result.data[0];
    
    // 转换头像 URL（如果是云存储地址）
    let avatar = user.avatar || '';
    if (avatar && avatar.startsWith('cloud://')) {
      try {
        const urlResult = await cloud.getTempFileURL({
          fileList: [avatar]
        });
        if (urlResult.fileList && urlResult.fileList[0] && urlResult.fileList[0].tempFileURL) {
          avatar = urlResult.fileList[0].tempFileURL;
        }
      } catch (e) {
        console.error('转换头像URL失败:', e);
      }
    }

    return {
      success: true,
      data: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
        avatar: avatar
      }
    };
  } catch (e) {
    console.error('获取用户失败:', e);
    return { success: false, data: null };
  }
}

// 更新用户信息（头像、昵称等）
async function handleUpdateUserInfo(avatar, nickname, openId) {
  try {
    
    // 查找用户
    const userResult = await usersCollection.where({
      _openid: openId
    }).get();
    
    if (userResult.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }
    const userId = userResult.data[0]._id;
    const updateData = {};
    if (avatar) {
      updateData.avatar = avatar;
    }
    if (nickname) {
      updateData.nickname = nickname;
    }
    updateData.updatedAt = db.serverDate();

    // 更新用户信息
    const updateResult = await usersCollection.doc(userId).update({
      data: updateData
    });

    return {
      success: true,
      data: {
        avatar: updatedUser.data.avatar || avatar,
        nickname: updatedUser.data.nickname || nickname
      }
    };
  } catch (e) {
    console.error('更新用户信息失败:', e);
    return { success: false, message: '更新失败' };
  }
}