/**
 * 账号身份：authorId / likedUsers 统一使用 users._id
 */

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || '';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

async function findUserByOpenId(db, openId) {
  if (!openId) return null;
  const res = await db.collection('users').where({ _openid: openId }).limit(1).get();
  return res.data[0] || null;
}

async function findUserById(db, userId) {
  if (!userId) return null;
  try {
    const res = await db.collection('users').doc(userId).get();
    return res.data || null;
  } catch (e) {
    return null;
  }
}

async function findUserByPhone(db, phone) {
  if (!phone) return null;
  const res = await db.collection('users').where({ phone }).limit(1).get();
  return res.data[0] || null;
}

/** @returns {{ openId, userId, user, isAdmin }} */
async function resolveActor(db, openId) {
  const user = await findUserByOpenId(db, openId);
  return {
    openId: openId || '',
    userId: user ? user._id : null,
    user,
    isAdmin: !!(user && user.role === 'admin')
  };
}

function isAuthor(authorId, actor) {
  return !!(authorId && actor && actor.userId && authorId === actor.userId);
}

function isLikedBy(likedUsers, actor) {
  if (!likedUsers || !likedUsers.length || !actor || !actor.userId) return false;
  return likedUsers.includes(actor.userId);
}

function writeAuthorId(actor) {
  return actor && actor.userId ? actor.userId : null;
}

function writeLikeId(actor) {
  return writeAuthorId(actor);
}

function authorOwnerWhere(db, actor) {
  if (!actor || !actor.userId) return { authorId: '__none__' };
  return { authorId: actor.userId };
}

async function getPhoneFromCode(cloud, phoneCode) {
  if (!phoneCode) {
    throw new Error('缺少手机号授权码');
  }
  try {
    const res = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode });
    if (res.errCode !== undefined && res.errCode !== 0) {
      throw new Error(res.errMsg || `获取手机号失败(${res.errCode})`);
    }
    const info = res.phoneInfo || res.phone_info || res;
    const phone = info.phoneNumber || info.purePhoneNumber;
    if (!phone) {
      throw new Error('无法获取手机号');
    }
    return phone;
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes('-604101') || msg.includes('no permission')) {
      throw new Error('云函数未开通手机号权限，请重新部署 auth');
    }
    if (msg.includes('40029') || msg.includes('invalid code')) {
      throw new Error('授权已过期，请重新点击获取手机号');
    }
    if (msg.includes('-3') || msg.includes('system error')) {
      throw new Error('微信服务繁忙，请稍后再试');
    }
    throw e;
  }
}

async function resolveAuthorsMap(db, authorIds) {
  const _ = db.command;
  const avatarMap = {};
  const nicknameMap = {};
  const unique = [...new Set((authorIds || []).filter(Boolean))];
  if (unique.length === 0) {
    return { avatarMap, nicknameMap };
  }

  try {
    const res = await db.collection('users')
      .where({ _id: _.in(unique) })
      .field({ _id: true, avatar: true, nickname: true })
      .get();
    res.data.forEach((u) => {
      if (u.avatar) avatarMap[u._id] = u.avatar;
      if (u.nickname) nicknameMap[u._id] = u.nickname;
    });
  } catch (e) {
    console.error('[resolveAuthorsMap] failed:', e);
  }

  return { avatarMap, nicknameMap };
}

function applyAuthorToPosts(posts, avatarMap, nicknameMap) {
  posts.forEach((post) => {
    if (avatarMap[post.authorId]) post.authorAvatar = avatarMap[post.authorId];
    if (nicknameMap[post.authorId]) post.author = nicknameMap[post.authorId];
  });
}

/** 合并账号：把 source 用户的内容迁到 target，并删除 source */
async function mergeUserAccounts(db, targetUser, sourceUser, newOpenId) {
  const users = db.collection('users');
  const posts = db.collection('posts');
  const comments = db.collection('post_comments');
  const targetId = targetUser._id;
  const sourceId = sourceUser._id;

  const moveAuthor = async (collection) => {
    const res = await collection.where({ authorId: sourceId }).limit(100).get();
    for (const doc of res.data) {
      await collection.doc(doc._id).update({ data: { authorId: targetId } });
    }
  };

  await moveAuthor(posts);
  await moveAuthor(comments);

  const mergedCredits = (targetUser.credits || 0) + (sourceUser.credits || 0);
  await users.doc(targetId).update({
    data: {
      _openid: newOpenId,
      credits: mergedCredits,
      updatedAt: db.serverDate()
    }
  });

  if (sourceId !== targetId) {
    await users.doc(sourceId).remove();
  }

  return findUserById(db, targetId);
}

module.exports = {
  maskPhone,
  findUserByOpenId,
  findUserById,
  findUserByPhone,
  resolveActor,
  isAuthor,
  isLikedBy,
  writeAuthorId,
  writeLikeId,
  authorOwnerWhere,
  getPhoneFromCode,
  resolveAuthorsMap,
  applyAuthorToPosts,
  mergeUserAccounts
};
