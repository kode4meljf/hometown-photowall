// cloudfunctions/adminApi/index.js - Web 管理后台云函数
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const identity = require('./common/identity');

const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'hometown_admin_token_secret';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function httpResponse(result, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(result)
  };
}

function parseEvent(event) {
  if (!event.httpMethod) {
    return {
      isHttp: false,
      action: event.action,
      data: event.data || {}
    };
  }

  if (event.httpMethod === 'OPTIONS') {
    return { isHttp: true, isOptions: true };
  }

  let body = {};
  try {
    body = event.body
      ? (typeof event.body === 'string' ? JSON.parse(event.body) : event.body)
      : {};
  } catch (e) {
    return { isHttp: true, parseError: true };
  }

  return {
    isHttp: true,
    action: body.action,
    data: body.data || {}
  };
}

function signToken(userId) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${userId}:${exp}`;
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64');
}

function verifyToken(token) {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 3) return null;
    const sig = parts.pop();
    const exp = Number(parts.pop());
    const userId = parts.join(':');
    const payload = `${userId}:${exp}`;
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    if (sig !== expected || Date.now() > exp) return null;
    return userId;
  } catch (e) {
    return null;
  }
}

async function resolveImageUrl(url) {
  if (!url || !url.startsWith('cloud://')) return url || '';
  try {
    const result = await cloud.getTempFileURL({ fileList: [url] });
    return (result.fileList && result.fileList[0] && result.fileList[0].tempFileURL) || url;
  } catch (e) {
    return url;
  }
}

function normalizePost(post) {
  const firstPhoto = (post.photos && post.photos.length > 0) ? post.photos[0] : null;
  return {
    ...post,
    id: post._id,
    imageUrl: firstPhoto ? firstPhoto.imageUrl : (post.imageUrl || ''),
    category: post.category || post.tag || '-',
    likes: post.likes || 0,
    views: post.views || 0
  };
}

async function verifyAdmin(payload, wxContext) {
  const token = payload.data && payload.data.adminToken;
  if (token) {
    const userId = verifyToken(token);
    if (!userId) {
      return { ok: false, message: '登录已过期，请重新登录' };
    }
    const user = await identity.findUserById(db, userId);
    if (!user || user.role !== 'admin') {
      return { ok: false, message: '无权限访问' };
    }
    return { ok: true, user };
  }

  const openId = wxContext.OPENID;
  if (!openId) {
    return { ok: false, message: '未登录' };
  }
  const actor = await identity.resolveActor(db, openId);
  if (!actor.isAdmin) {
    return { ok: false, message: '无权限访问' };
  }
  return { ok: true, user: actor.user };
}

async function handleLogin(username, password) {
  if (!username || !password) {
    return { success: false, message: '请输入用户名和密码' };
  }
  try {
    const result = await db.collection('users').where({ username, password }).limit(1).get();
    if (result.data.length === 0) {
      return { success: false, message: '用户名或密码错误' };
    }
    const user = result.data[0];
    if (user.role !== 'admin') {
      return { success: false, message: '需要管理员权限' };
    }
    const token = signToken(user._id);
    return {
      success: true,
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          nickname: user.nickname,
          role: user.role
        }
      }
    };
  } catch (e) {
    console.error('[adminApi] login failed:', e);
    return { success: false, message: '登录失败' };
  }
}

async function handleVerifySession(adminToken) {
  const userId = verifyToken(adminToken);
  if (!userId) {
    return { success: true, data: null };
  }
  const user = await identity.findUserById(db, userId);
  if (!user || user.role !== 'admin') {
    return { success: true, data: null };
  }
  return {
    success: true,
    data: {
      id: user._id,
      username: user.username,
      nickname: user.nickname,
      role: user.role
    }
  };
}

async function getAllPhotos(params = {}) {
  try {
    const { page = 1, pageSize = 50 } = params;
    const [totalResult, listResult] = await Promise.all([
      db.collection('posts').count(),
      db.collection('posts')
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
    ]);

    const posts = listResult.data.map(normalizePost);
    const authorIds = [...new Set(posts.map((p) => p.authorId).filter(Boolean))];
    const { nicknameMap } = await identity.resolveAuthorsMap(db, authorIds);
    identity.applyAuthorToPosts(posts, {}, nicknameMap);

    const photos = await Promise.all(posts.map(async (photo) => {
      const [imageUrl, commentCount] = await Promise.all([
        resolveImageUrl(photo.imageUrl),
        db.collection('post_comments').where({ postId: photo.id }).count()
      ]);
      return {
        ...photo,
        imageUrl,
        author: photo.author || '未知用户',
        commentCount: commentCount.total
      };
    }));

    return {
      success: true,
      data: {
        photos,
        total: totalResult.total,
        page,
        pageSize
      }
    };
  } catch (e) {
    console.error('[adminApi] getPhotos failed:', e);
    return { success: false, message: '获取照片失败' };
  }
}

async function deletePost(id) {
  if (!id) {
    return { success: false, message: '缺少照片 ID' };
  }
  try {
    await db.collection('posts').doc(id).remove();
    await db.collection('post_comments').where({ postId: id }).remove();
    return { success: true, message: '删除成功' };
  } catch (e) {
    console.error('[adminApi] deletePost failed:', e);
    return { success: false, message: '删除失败' };
  }
}

async function getUsers() {
  try {
    const usersResult = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const users = await Promise.all(usersResult.data.map(async (user) => {
      const [photoCount, commentCount] = await Promise.all([
        db.collection('posts').where({ authorId: user._id }).count(),
        db.collection('post_comments').where({ authorId: user._id }).count()
      ]);
      return {
        id: user._id,
        username: user.username || '',
        nickname: user.nickname || '未命名',
        role: user.role || 'user',
        photoCount: photoCount.total,
        commentCount: commentCount.total,
        createdAt: user.createdAt
      };
    }));

    return { success: true, data: users };
  } catch (e) {
    console.error('[adminApi] getUsers failed:', e);
    return { success: false, message: '获取用户失败' };
  }
}

async function getAdminStats() {
  try {
    const [postCount, userCount, commentCount] = await Promise.all([
      db.collection('posts').count(),
      db.collection('users').count(),
      db.collection('post_comments').count()
    ]);

    const postsResult = await db.collection('posts')
      .field({ likes: true, views: true })
      .limit(1000)
      .get();
    const totalLikes = postsResult.data.reduce((sum, p) => sum + (p.likes || 0), 0);
    const totalViews = postsResult.data.reduce((sum, p) => sum + (p.views || 0), 0);

    return {
      success: true,
      data: {
        totalPhotos: postCount.total,
        totalUsers: userCount.total,
        totalComments: commentCount.total,
        totalLikes,
        totalViews
      }
    };
  } catch (e) {
    console.error('[adminApi] getStats failed:', e);
    return { success: false, data: {} };
  }
}

async function dispatch(payload, wxContext) {
  const { action, data } = payload;

  switch (action) {
    case 'login':
      return await handleLogin(data.username, data.password);
    case 'verifySession':
      return await handleVerifySession(data.adminToken);
    default: {
      const auth = await verifyAdmin(payload, wxContext);
      if (!auth.ok) {
        return { success: false, message: auth.message };
      }
      switch (action) {
        case 'getPhotos':
          return await getAllPhotos(data);
        case 'deletePost':
          return await deletePost(data.id);
        case 'getUsers':
          return await getUsers();
        case 'getStats':
          return await getAdminStats();
        default:
          return { success: false, message: '未知操作' };
      }
    }
  }
}

exports.main = async (event, context) => {
  const parsed = parseEvent(event);

  if (parsed.isOptions) {
    return httpResponse({ success: true });
  }
  if (parsed.parseError) {
    return httpResponse({ success: false, message: '请求格式错误' }, 400);
  }

  const wxContext = cloud.getWXContext();
  const result = await dispatch(
    { action: parsed.action, data: parsed.data },
    wxContext
  );

  if (parsed.isHttp) {
    return httpResponse(result);
  }
  return result;
};
