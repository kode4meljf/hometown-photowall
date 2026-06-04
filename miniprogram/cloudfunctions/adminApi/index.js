// cloudfunctions/adminApi/index.js - Web 管理后台云函数
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;
const identity = require('./common/identity');
const pwd = require('./common/password');
const { POST_STATUS, POST_STATUS_LIST } = require('./common/postStatus');
const { normalizePostForAdmin: normalizePost, deleteCloudFiles } = require('./common/postHelpers');

const TOKEN_SECRET = (process.env.ADMIN_TOKEN_SECRET || '').trim();
const TOKEN_SECRET_MIN_LEN = 16;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

function parseCorsOrigins() {
  const raw = (process.env.ADMIN_CORS_ORIGINS || '').trim();
  if (!raw) return DEFAULT_CORS_ORIGINS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const ALLOWED_CORS_ORIGINS = parseCorsOrigins();

const PAGE_SIZE_MAX = 50;
const PAGE_SIZE_DEFAULT = 50;

function normalizePagePagination(params = {}, defaultPageSize = PAGE_SIZE_DEFAULT) {
  const pageRaw = parseInt(params.page, 10);
  const sizeRaw = parseInt(params.pageSize, 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const pageSizeBase = Number.isFinite(sizeRaw) && sizeRaw >= 1 ? sizeRaw : defaultPageSize;
  return { page, pageSize: Math.min(pageSizeBase, PAGE_SIZE_MAX) };
}

async function sumPostsField(field) {
  try {
    const res = await db.collection('posts').aggregate()
      .group({
        _id: null,
        total: $.sum(`$${field}`),
      })
      .end();
    return res.list[0]?.total || 0;
  } catch (e) {
    console.error(`[adminApi] sumPostsField(${field}) failed:`, e);
    return 0;
  }
}

function resolveCorsOrigin(requestOrigin) {
  if (!requestOrigin) return ALLOWED_CORS_ORIGINS[0] || null;
  if (ALLOWED_CORS_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return null;
}

function getRequestOrigin(event) {
  const headers = (event && event.headers) || {};
  return headers.origin || headers.Origin || '';
}

function httpResponse(result, statusCode = 200, requestOrigin) {
  const origin = resolveCorsOrigin(requestOrigin);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return {
    statusCode,
    headers,
    body: JSON.stringify(result),
  };
}

function getTokenSecretError() {
  if (!TOKEN_SECRET) {
    return '未配置 ADMIN_TOKEN_SECRET 环境变量，请在云函数环境变量中设置';
  }
  if (TOKEN_SECRET.length < TOKEN_SECRET_MIN_LEN) {
    return `ADMIN_TOKEN_SECRET 长度不足（至少 ${TOKEN_SECRET_MIN_LEN} 位）`;
  }
  return null;
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
  if (getTokenSecretError()) return null;
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

async function verifyAdmin(payload) {
  const token = payload.data && payload.data.adminToken;
  if (!token) {
    return { ok: false, message: '未登录' };
  }
  const secretErr = getTokenSecretError();
  if (secretErr) {
    console.error('[adminApi] adminToken auth blocked:', secretErr);
    return { ok: false, message: '管理后台认证未就绪，请联系管理员' };
  }
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

async function handleLogin(username, password) {
  const secretErr = getTokenSecretError();
  if (secretErr) {
    console.error('[adminApi] login blocked:', secretErr);
    return { success: false, message: '管理后台认证未就绪，请联系管理员' };
  }
  if (!username || !password) {
    return { success: false, message: '请输入用户名和密码' };
  }
  try {
    const result = await db.collection('users').where({ username }).limit(1).get();
    if (result.data.length === 0) {
      return { success: false, message: '用户名或密码错误' };
    }
    const user = result.data[0];
    const passwordOk = await pwd.verifyPassword(password, user.password);
    if (!passwordOk) {
      return { success: false, message: '用户名或密码错误' };
    }
    if (user.role !== 'admin') {
      return { success: false, message: '需要管理员权限' };
    }
    if (pwd.needsPasswordUpgrade(user.password)) {
      const passwordHash = await pwd.hashPassword(password);
      await db.collection('users').doc(user._id).update({
        data: { password: passwordHash, updatedAt: db.serverDate() },
      });
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

function formatLocation(location) {
  if (!location) return '-';
  if (typeof location === 'string') return location;
  if (typeof location === 'object') {
    if (location.name) return location.name;
    if (location.address) return location.address;
  }
  return '-';
}

function formatCreatedAt(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value.$date) return value.$date;
  try {
    return new Date(value).toISOString();
  } catch (e) {
    return '';
  }
}

async function resolvePostPhotos(post) {
  const normalized = normalizePost(post);
  const rawPhotos = Array.isArray(post.photos) && post.photos.length
    ? [...post.photos].sort((a, b) => (a.order || 0) - (b.order || 0))
    : (normalized.imageUrl ? [{ imageUrl: normalized.imageUrl, order: 0 }] : []);

  return Promise.all(rawPhotos.map(async (item) => ({
    ...item,
    imageUrl: await resolveImageUrl(item.imageUrl)
  })));
}

async function buildPostDetail(post, id) {
  const normalized = normalizePost(post);
  const authorIds = normalized.authorId ? [normalized.authorId] : [];
  const { nicknameMap, avatarMap } = await identity.resolveAuthorsMap(db, authorIds);
  identity.applyAuthorToPosts([normalized], avatarMap, nicknameMap);

  const photos = await resolvePostPhotos(post);
  const commentCount = await db.collection('post_comments').where({ postId: id }).count();

  return {
    id: normalized.id,
    title: normalized.title || '无标题',
    description: normalized.description || normalized.content || '',
    author: normalized.author || '未知用户',
    authorId: normalized.authorId || '',
    location: formatLocation(normalized.location),
    category: normalized.category || '-',
    likes: normalized.likes || 0,
    views: normalized.views || 0,
    commentCount: commentCount.total,
    status: normalized.status,
    mediaTraceIds: normalized.mediaTraceIds || [],
    reviewAdminNote: normalized.reviewAdminNote || '',
    createdAt: formatCreatedAt(normalized.createdAt),
    photos
  };
}

async function getAllPhotos(params = {}) {
  try {
    const { page, pageSize } = normalizePagePagination(params);
    const { status } = params;
    const where = {};
    if (status && status !== 'all' && POST_STATUS_LIST.includes(status)) {
      where.status = status;
    }

    const [totalResult, listResult] = await Promise.all([
      db.collection('posts').where(where).count(),
      db.collection('posts')
        .where(where)
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
    ]);

    const posts = await Promise.all(listResult.data.map(async (rawPost) => {
      const post = normalizePost(rawPost);
      const authorIds = post.authorId ? [post.authorId] : [];
      const { nicknameMap } = await identity.resolveAuthorsMap(db, authorIds);
      identity.applyAuthorToPosts([post], {}, nicknameMap);

      const [resolvedPhotos, commentCount] = await Promise.all([
        resolvePostPhotos(rawPost),
        db.collection('post_comments').where({ postId: post.id }).count()
      ]);
      const coverUrl = resolvedPhotos[0]?.imageUrl || await resolveImageUrl(post.imageUrl);

      return {
        ...post,
        imageUrl: coverUrl,
        description: post.description || post.content || '',
        location: formatLocation(post.location),
        status: post.status,
        mediaTraceIds: post.mediaTraceIds || [],
        reviewAdminNote: post.reviewAdminNote || '',
        createdAt: formatCreatedAt(post.createdAt),
        photos: resolvedPhotos,
        author: post.author || '未知用户',
        commentCount: commentCount.total
      };
    }));

    return {
      success: true,
      data: {
        posts,
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

async function getPostDetail(id) {
  if (!id) {
    return { success: false, message: '缺少帖子 ID' };
  }
  try {
    const postResult = await db.collection('posts').doc(id).get();
    const post = postResult.data;
    if (!post) {
      return { success: false, message: '帖子不存在' };
    }

    return {
      success: true,
      data: await buildPostDetail(post, id)
    };
  } catch (e) {
    console.error('[adminApi] getPostDetail failed:', e);
    return { success: false, message: '获取详情失败' };
  }
}

async function deletePost(id) {
  if (!id) {
    return { success: false, message: '缺少照片 ID' };
  }
  try {
    const postRes = await db.collection('posts').doc(id).get();
    const fileIds = (postRes.data?.photos || [])
      .map((p) => p.imageUrl)
      .filter((url) => url && url.startsWith('cloud://'));
    if (fileIds.length) {
      await deleteCloudFiles(cloud, fileIds);
    }

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

    const [postsAgg, commentsAgg] = await Promise.all([
      db.collection('posts').aggregate()
        .group({ _id: '$authorId', count: $.sum(1) })
        .end(),
      db.collection('post_comments').aggregate()
        .group({ _id: '$authorId', count: $.sum(1) })
        .end(),
    ]);

    const postCountByAuthor = {};
    for (const row of postsAgg.list || []) {
      if (row._id) postCountByAuthor[row._id] = row.count || 0;
    }
    const commentCountByAuthor = {};
    for (const row of commentsAgg.list || []) {
      if (row._id) commentCountByAuthor[row._id] = row.count || 0;
    }

    const users = usersResult.data.map((user) => ({
      id: user._id,
      username: user.username || '',
      nickname: user.nickname || '未命名',
      role: user.role || 'user',
      postCount: postCountByAuthor[user._id] || 0,
      commentCount: commentCountByAuthor[user._id] || 0,
      createdAt: user.createdAt,
    }));

    return { success: true, data: users };
  } catch (e) {
    console.error('[adminApi] getUsers failed:', e);
    return { success: false, message: '获取用户失败' };
  }
}

async function updatePostStatus(id, status, reviewNote) {
  if (!id) {
    return { success: false, message: '缺少帖子 ID' };
  }
  if (!POST_STATUS_LIST.includes(status)) {
    return { success: false, message: '无效的状态' };
  }

  try {
    const postResult = await db.collection('posts').doc(id).get();
    if (!postResult.data) {
      return { success: false, message: '帖子不存在' };
    }

    const patch = { status };
    if (status === POST_STATUS.REJECTED && reviewNote !== undefined) {
      patch.reviewAdminNote = String(reviewNote).trim().slice(0, 500);
    }

    await db.collection('posts').doc(id).update({ data: patch });

    const freshResult = await db.collection('posts').doc(id).get();
    return {
      success: true,
      message: '状态已更新',
      data: await buildPostDetail(freshResult.data, id)
    };
  } catch (e) {
    console.error('[adminApi] updatePostStatus failed:', e);
    return { success: false, message: '更新失败' };
  }
}

async function updatePost(id, updates = {}) {
  if (!id) {
    return { success: false, message: '缺少帖子 ID' };
  }

  const allowedFields = ['title', 'description', 'location'];
  const updateData = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      updateData[field] = String(updates[field]).trim();
    }
  }

  if (updateData.title !== undefined && !updateData.title) {
    return { success: false, message: '标题不能为空' };
  }

  if (Object.keys(updateData).length === 0) {
    return { success: false, message: '没有可更新的字段' };
  }

  try {
    const postResult = await db.collection('posts').doc(id).get();
    if (!postResult.data) {
      return { success: false, message: '帖子不存在' };
    }

    await db.collection('posts').doc(id).update({ data: updateData });

    const freshResult = await db.collection('posts').doc(id).get();
    return {
      success: true,
      message: '更新成功',
      data: await buildPostDetail(freshResult.data, id)
    };
  } catch (e) {
    console.error('[adminApi] updatePost failed:', e);
    return { success: false, message: '更新失败' };
  }
}

async function getAdminStats() {
  try {
    const [postCount, userCount, commentCount, pendingFeedbackCount, reviewingCount] = await Promise.all([
      db.collection('posts').count(),
      db.collection('users').count(),
      db.collection('post_comments').count(),
      db.collection('feedbacks').where({ status: 'pending' }).count(),
      db.collection('posts').where({ status: POST_STATUS.REVIEWING }).count(),
    ]);

    const [totalLikes, totalViews] = await Promise.all([
      sumPostsField('likes'),
      sumPostsField('views'),
    ]);

    return {
      success: true,
      data: {
        totalPosts: postCount.total,
        totalUsers: userCount.total,
        totalComments: commentCount.total,
        totalLikes,
        totalViews,
        pendingFeedbacks: pendingFeedbackCount.total,
        reviewingPosts: reviewingCount.total,
      }
    };
  } catch (e) {
    console.error('[adminApi] getStats failed:', e);
    return { success: false, data: {} };
  }
}

function formatFeedbackItem(raw) {
  const type = raw.type || 'feedback';
  return {
    id: raw._id,
    type,
    postId: raw.postId || '',
    reason: raw.reason || '',
    content: raw.content || '',
    contact: raw.contact || '',
    userId: raw.userId || '',
    authorNickname: raw.authorNickname || '游客',
    status: raw.status || 'pending',
    adminNote: raw.adminNote || '',
    createdAt: formatCreatedAt(raw.createdAt),
    updatedAt: formatCreatedAt(raw.updatedAt),
    resolvedAt: formatCreatedAt(raw.resolvedAt),
  };
}

async function getFeedbacks(params = {}) {
  try {
    const { page, pageSize } = normalizePagePagination(params, 30);
    const { status, type } = params;
    const where = {};
    if (status && status !== 'all') {
      where.status = status;
    }
    if (type && type !== 'all') {
      where.type = type;
    }

    const query = Object.keys(where).length
      ? db.collection('feedbacks').where(where)
      : db.collection('feedbacks');

    const [totalResult, listResult] = await Promise.all([
      query.count(),
      query
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
    ]);

    return {
      success: true,
      data: {
        feedbacks: listResult.data.map(formatFeedbackItem),
        total: totalResult.total,
        page,
        pageSize,
      },
    };
  } catch (e) {
    console.error('[adminApi] getFeedbacks failed:', e);
    return { success: false, message: '获取反馈失败' };
  }
}

async function updateFeedback(id, updates = {}) {
  if (!id) {
    return { success: false, message: '缺少反馈 ID' };
  }

  const status = updates.status;
  const adminNote = updates.adminNote;
  const patch = { updatedAt: db.serverDate() };

  if (status !== undefined) {
    if (!['pending', 'processing', 'resolved'].includes(status)) {
      return { success: false, message: '无效的状态' };
    }
    patch.status = status;
    if (status === 'resolved') {
      patch.resolvedAt = db.serverDate();
    } else {
      patch.resolvedAt = null;
    }
  }

  if (adminNote !== undefined) {
    patch.adminNote = String(adminNote).trim().slice(0, 500);
  }

  if (Object.keys(patch).length <= 1) {
    return { success: false, message: '没有可更新的字段' };
  }

  try {
    const doc = await db.collection('feedbacks').doc(id).get();
    if (!doc.data) {
      return { success: false, message: '反馈不存在' };
    }

    await db.collection('feedbacks').doc(id).update({ data: patch });
    const fresh = await db.collection('feedbacks').doc(id).get();
    return {
      success: true,
      message: '更新成功',
      data: formatFeedbackItem(fresh.data),
    };
  } catch (e) {
    console.error('[adminApi] updateFeedback failed:', e);
    return { success: false, message: '更新失败' };
  }
}

async function dispatch(payload, { isHttp }) {
  const { action, data } = payload;

  if (!isHttp) {
    return { success: false, message: '请通过管理后台访问' };
  }

  switch (action) {
    case 'login':
      return await handleLogin(data.username, data.password);
    case 'verifySession':
      return await handleVerifySession(data.adminToken);
    default: {
      const auth = await verifyAdmin(payload);
      if (!auth.ok) {
        return { success: false, message: auth.message };
      }
      switch (action) {
        case 'getPhotos':
          return await getAllPhotos(data);
        case 'getPostDetail':
          return await getPostDetail(data.id);
        case 'updatePost':
          return await updatePost(data.id, data.updates);
        case 'updatePostStatus':
          return await updatePostStatus(data.id, data.status, data.reviewNote);
        case 'deletePost':
          return await deletePost(data.id);
        case 'getUsers':
          return await getUsers();
        case 'getStats':
          return await getAdminStats();
        case 'getFeedbacks':
          return await getFeedbacks(data);
        case 'updateFeedback':
          return await updateFeedback(data.id, data.updates);
        default:
          return { success: false, message: '未知操作' };
      }
    }
  }
}

exports.main = async (event, context) => {
  try {
    const parsed = parseEvent(event);
    const requestOrigin = getRequestOrigin(event);

    if (parsed.isOptions) {
      if (!resolveCorsOrigin(requestOrigin)) {
        return httpResponse({ success: false, message: '不允许的来源' }, 403, requestOrigin);
      }
      return httpResponse({ success: true }, 200, requestOrigin);
    }
    if (parsed.parseError) {
      return httpResponse({ success: false, message: '请求格式错误' }, 400, requestOrigin);
    }

    const result = await dispatch(
      { action: parsed.action, data: parsed.data },
      { isHttp: !!parsed.isHttp }
    );

    if (parsed.isHttp) {
      return httpResponse(result, 200, requestOrigin);
    }
    return result;
  } catch (e) {
    console.error('[adminApi] unhandled error:', e);
    const message = e && e.message ? e.message : '服务内部错误';
    if (event && event.httpMethod) {
      return httpResponse({ success: false, message }, 500, getRequestOrigin(event));
    }
    return { success: false, message };
  }
};
