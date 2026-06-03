// cloudfunctions/auth/index.js - 认证云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const usersCollection = db.collection('users');
const identity = require('./common/identity');
const sec = require('./common/contentSecurity');

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
      return await handleLogin(username, password, wxContext.OPENID);
    case 'getCurrentUser':
      return await handleGetCurrentUser(wxContext.OPENID);
    case 'updateUserInfo':
      return await handleUpdateUserInfo(avatar, nickname, wxContext.OPENID);
    case 'updateUserProfile':
      return await handleUpdateUserProfile(event.data || event, wxContext.OPENID);
    case 'wechatLogin':
      return await handleWechatLogin(wxContext.OPENID);
    case 'bindPhone':
      return await handleBindPhone(data.phoneCode, wxContext.OPENID);
    case 'phoneLogin':
      return await handlePhoneLogin(data.phoneCode, wxContext.OPENID);
    case 'deleteAccount':
      return await handleDeleteAccount(wxContext.OPENID);
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

    const textCheck = await sec.checkText(cloud, openId, {
      content: nickname,
      scene: sec.SCENE.PROFILE,
      nickname,
    });
    if (!textCheck.ok) {
      return { success: false, message: textCheck.message };
    }

    const result = await usersCollection.add({
      data: {
        _openid: openId,
        username,
        password,
        nickname,
        role: 'user',
        avatar: generateInitialAvatar(nickname),
        credits: 0,
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
          role: 'user',
          avatar: generateInitialAvatar(nickname)
        }
      }
    };
  } catch (e) {
    console.error('注册失败:', e);
    return { success: false, message: '注册失败' };
  }
}

// 登录（用户名密码：同步绑定当前微信 OPENID）
async function handleLogin(username, password, openId) {
  if (!username || !password) {
    return { success: false, message: '参数不完整' };
  }

  try {
    const result = await usersCollection.where({ username, password }).get();
    if (result.data.length === 0) {
      return { success: false, message: '用户名或密码错误' };
    }

    const user = result.data[0];
    if (openId && user._openid !== openId) {
      await usersCollection.doc(user._id).update({
        data: { _openid: openId, updatedAt: db.serverDate() }
      });
      user._openid = openId;
    }
    const avatar = await resolveAvatarUrl(user.avatar);

    return {
      success: true,
      data: {
        user: formatUserForClient(user, avatar)
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
    const avatar = await resolveAvatarUrl(user.avatar || '');

    return {
      success: true,
      data: formatUserForClient(user, avatar)
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

    if (nickname) {
      const textCheck = await sec.checkText(cloud, openId, {
        content: nickname,
        scene: sec.SCENE.PROFILE,
        nickname,
      });
      if (!textCheck.ok) {
        return { success: false, message: textCheck.message };
      }
    }
    if (avatar) {
      const imageCheck = await sec.checkImages(cloud, openId, [avatar], sec.SCENE.PROFILE);
      if (!imageCheck.ok) {
        return { success: false, message: imageCheck.message };
      }
    }

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
    const { avatar, nickname, gender, region, bio } = params;

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
    updateData.updatedAt = db.serverDate();

    const textItems = [];
    if (nickname !== undefined) {
      textItems.push({
        content: nickname,
        scene: sec.SCENE.PROFILE,
        nickname,
      });
    }
    if (bio !== undefined) {
      textItems.push({ content: bio, scene: sec.SCENE.PROFILE, nickname });
    }
    if (textItems.length) {
      const textCheck = await sec.checkTexts(cloud, openId, textItems);
      if (!textCheck.ok) {
        return { success: false, message: textCheck.message };
      }
    }

    if (avatar !== undefined && avatar) {
      const imageCheck = await sec.checkImages(cloud, openId, [avatar], sec.SCENE.PROFILE);
      if (!imageCheck.ok) {
        return { success: false, message: imageCheck.message };
      }
    }

    const updateRes = await usersCollection.doc(userId).update({ data: updateData });

    return { success: true, message: '更新成功', updateStats: updateRes.stats };
  } catch (e) {
    console.error('更新用户资料失败:', e);
    return { success: false, message: '更新失败' };
  }
}

// 微信授权登录（云函数上下文已含 OPENID，无需 code 换 openid）
async function handleWechatLogin(openId) {
  if (!openId) {
    return { success: false, message: '无法获取用户身份' };
  }

  try {
    const existUser = await usersCollection.where({ _openid: openId }).get();
    if (existUser.data.length > 0) {
      const user = existUser.data[0];
      const avatar = await resolveAvatarUrl(user.avatar);
      return {
        success: true,
        data: {
          user: formatUserForClient(user, avatar),
          isNewUser: false
        }
      };
    }

    // 不存在 → 自动创建新账号
    const nickname = '微信用户' + openId.slice(-6);
    const avatar = generateInitialAvatar(nickname);
    const result = await usersCollection.add({
      data: {
        _openid: openId,
        username: '',
        nickname,
        avatar,
        role: 'user',
        credits: 0,
        loginSource: 'wechat',
        email: '',
        createdAt: db.serverDate()
      }
    });

    const newUser = await identity.findUserById(db, result._id);
    return {
      success: true,
      data: {
        user: formatUserForClient(newUser || { _id: result._id, nickname, avatar, role: 'user' }, avatar),
        isNewUser: true
      }
    };
  } catch (e) {
    console.error('微信登录失败:', e);
    return { success: false, message: '微信登录失败' };
  }
}

// 绑定手机号（换微信后可在原账号上绑定；若手机号已属其他账号则合并到原账号）
async function handleBindPhone(phoneCode, openId) {
  if (!openId) {
    return { success: false, message: '未登录' };
  }
  try {
    const phone = await identity.getPhoneFromCode(cloud, phoneCode);
    const currentUser = await identity.findUserByOpenId(db, openId);
    if (!currentUser) {
      return { success: false, message: '请先登录' };
    }

    const existingByPhone = await identity.findUserByPhone(db, phone);
    let finalUser = currentUser;

    if (existingByPhone && existingByPhone._id !== currentUser._id) {
      finalUser = await identity.mergeUserAccounts(db, existingByPhone, currentUser, openId);
      if (!finalUser.phone) {
        await usersCollection.doc(finalUser._id).update({
          data: { phone, phoneBoundAt: db.serverDate(), updatedAt: db.serverDate() }
        });
        finalUser.phone = phone;
      }
    } else if (!currentUser.phone) {
      await usersCollection.doc(currentUser._id).update({
        data: { phone, phoneBoundAt: db.serverDate(), updatedAt: db.serverDate() }
      });
      finalUser = { ...currentUser, phone };
    }

    const avatar = await resolveAvatarUrl(finalUser.avatar);
    return {
      success: true,
      message: '手机号绑定成功',
      data: { user: formatUserForClient(finalUser, avatar) }
    };
  } catch (e) {
    console.error('绑定手机失败:', e);
    return { success: false, message: e.message || '绑定失败' };
  }
}

// 手机号登录（换微信后找回原账号）
async function handlePhoneLogin(phoneCode, openId) {
  if (!openId) {
    return { success: false, message: '无法获取用户身份' };
  }
  try {
    const phone = await identity.getPhoneFromCode(cloud, phoneCode);
    const user = await identity.findUserByPhone(db, phone);
    if (!user) {
      return {
        success: false,
        message: '该手机号尚未绑定。请先用原微信登录，在「账号安全」中绑定手机号'
      };
    }

    const currentByOpenId = await identity.findUserByOpenId(db, openId);
    if (currentByOpenId && currentByOpenId._id !== user._id) {
      await identity.mergeUserAccounts(db, user, currentByOpenId, openId);
    } else if (user._openid !== openId) {
      await usersCollection.doc(user._id).update({
        data: { _openid: openId, updatedAt: db.serverDate() }
      });
      user._openid = openId;
    }

    const freshUser = await identity.findUserById(db, user._id);
    const avatar = await resolveAvatarUrl(freshUser.avatar);
    return {
      success: true,
      data: { user: formatUserForClient(freshUser, avatar) }
    };
  } catch (e) {
    console.error('手机号登录失败:', e);
    return { success: false, message: e.message || '登录失败' };
  }
}

// 注销账号：删除用户记录及其帖子、评论
async function handleDeleteAccount(openId) {
  if (!openId) {
    return { success: false, message: '未登录' };
  }

  try {
    const userResult = await usersCollection.where({ _openid: openId }).get();
    if (userResult.data.length === 0) {
      return { success: false, message: '用户不存在' };
    }

    const user = userResult.data[0];
    const userId = user._id;
    const postsCollection = db.collection('posts');
    const commentsCollection = db.collection('post_comments');

    const posts = await postsCollection.where({ authorId: userId }).get();
    for (const post of posts.data) {
      await commentsCollection.where({ postId: post._id }).remove();
      await postsCollection.doc(post._id).remove();
    }

    await commentsCollection.where({ authorId: userId }).remove();

    const avatar = user.avatar;
    if (avatar && avatar.startsWith('cloud://')) {
      try {
        await cloud.deleteFile({ fileList: [avatar] });
      } catch (e) {
        console.error('删除头像文件失败:', e);
      }
    }

    await usersCollection.doc(user._id).remove();

    return { success: true };
  } catch (e) {
    console.error('注销账号失败:', e);
    return { success: false, message: '注销失败' };
  }
}

// 预定义头像背景色池（6个莫兰迪色）
const AVATAR_COLORS = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿
  '#45B7D1', // 天蓝
  '#96CEB4', // 薄荷绿
  '#F7DC6F', // 暖黄
  '#DDA0DD', // 浅紫
];

// 从昵称提取首字母（英文直接取，汉字取拼音首字母大写）
function getInitial(nickname) {
  if (!nickname) return '?';
  const first = nickname.trim()[0];
  // 英文
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  // 中文：已知常用字做拼音首字母映射
  const pinyinMap = {
    '啊': 'A', '阿': 'A', '爱': 'A', '安': 'A', '暗': 'A',
    '吧': 'B', '不': 'B', '百': 'B', '白': 'B', '北': 'B',
    '成': 'C', '从': 'C', '操': 'C', '存': 'C', '此': 'C',
    '的': 'D', '大': 'D', '东': 'D', '到': 'D', '地': 'D',
    '饿': 'E', '二': 'E', '而': 'E', '儿': 'E', '尔': 'E',
    '发': 'F', '非': 'F', '风': 'F', '飞': 'F', '复': 'F',
    '个': 'G', '过': 'G', '古': 'G', '国': 'G', '广': 'G',
    '好': 'H', '后': 'H', '和': 'H', '胡': 'H', '黄': 'H',
    '几': 'J', '九': 'J', '京': 'J', '加': 'J', '家': 'J',
    '可': 'K', '开': 'K', '看': 'K', '空': 'K', '口': 'K',
    '了': 'L', '来': 'L', '老': 'L', '六': 'L', '李': 'L',
    '吗': 'M', '明': 'M', '没': 'M', '每': 'M', '民': 'M',
    '你': 'N', '南': 'N', '年': 'N', '能': 'N', '呢': 'N',
    '哦': 'O', '欧': 'O', '我': 'W', '五': 'W', '为': 'W',
    '平': 'P', '朋': 'P', '普': 'P', '片': 'P', '配': 'P',
    '去': 'Q', '七': 'Q', '期': 'Q', '其': 'Q', '前': 'Q',
    '人': 'R', '日': 'R', '如': 'R', '然': 'R', '入': 'R',
    '是': 'S', '三': 'S', '上': 'S', '说': 'S', '时': 'S',
    '他': 'T', '天': 'T', '同': 'T', '图': 'T', '土': 'T',
    '五': 'W', '我': 'W', '为': 'W', '无': 'W', '文': 'W',
    '下': 'X', '小': 'X', '向': 'X', '西': 'X', '想': 'X',
    '一': 'Y', '有': 'Y', '也': 'Y', '于': 'Y', '雨': 'Y',
    '在': 'Z', '这': 'Z', '中': 'Z', '张': 'Z', '周': 'Z',
  };
  if (pinyinMap[first]) return pinyinMap[first];
  // 未知汉字：取字符本身（部分Unicode字体可显示）
  return first;
}

// 生成初始头像 URL（initial://协议）
function generateInitialAvatar(nickname) {
  const initial = getInitial(nickname);
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  // 格式：initial://<字母>?color=<颜色>
  return `initial://${initial}?color=${encodeURIComponent(color)}`;
}

function formatUserForClient(user, avatar) {
  if (!user) return null;
  return {
    id: user._id,
    username: user.username || '',
    nickname: user.nickname,
    role: user.role,
    avatar: avatar || user.avatar || '',
    phone: user.phone ? identity.maskPhone(user.phone) : '',
    hasPhone: !!user.phone,
    loginSource: user.loginSource || 'wechat',
    gender: user.gender || 'secret',
    region: user.region || '',
    bio: user.bio || '',
    tags: user.tags || [],
    credits: user.credits || 0,
    createdAt: user.createdAt || ''
  };
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
