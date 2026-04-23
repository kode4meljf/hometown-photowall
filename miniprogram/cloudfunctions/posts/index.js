// cloudfunctions/photos/index.js - 照片相关云函数（posts 集合版）
// 已删除 category 相关代码

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const postsCollection = db.collection('posts');
const commentsCollection = db.collection('comments');
const usersCollection = db.collection('users');

// 实例级内存缓存：cloud:// → tempURL（TTL 15min，函数实例重启自动清空）
const _memAvatarCache = {};
const _memAvatarTime = {};
const MEM_CACHE_TTL = 15 * 60 * 1000;

// 解析单条头像 URL：只走 L1 内存缓存，miss 时直接 getTempFileURL
async function resolveAvatarUrl(cloudUrl) {
  if (!cloudUrl) return '/assets/icons/default-avatar.png';
  if (!cloudUrl.startsWith('cloud://')) return cloudUrl;
  const now = Date.now();
  if (_memAvatarCache[cloudUrl] && (now - _memAvatarTime[cloudUrl]) < MEM_CACHE_TTL) {
    return _memAvatarCache[cloudUrl];
  }
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: [cloudUrl] });
    const tempUrl = urlRes.fileList?.[0]?.tempFileURL || cloudUrl;
    _memAvatarCache[cloudUrl] = tempUrl;
    _memAvatarTime[cloudUrl] = now;
    return tempUrl;
  } catch (_) {
    return cloudUrl;
  }
}

// 批量解析头像 URL
async function resolveAvatarUrls(cloudUrlMap) {
  const result = {};
  const now = Date.now();
  const toFetch = [];

  for (const [openid, cloudUrl] of Object.entries(cloudUrlMap)) {
    if (!cloudUrl) { result[openid] = '/assets/icons/default-avatar.png'; continue; }
    if (_memAvatarCache[cloudUrl] && (now - _memAvatarTime[cloudUrl]) < MEM_CACHE_TTL) {
      result[openid] = _memAvatarCache[cloudUrl];
    } else {
      toFetch.push({ openid, cloudUrl });
    }
  }

  if (toFetch.length === 0) return result;

  const cloudToFetch = [...new Set(toFetch.map(x => x.cloudUrl))];
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: cloudToFetch });
    const urlMap = {};
    (urlRes.fileList || []).forEach(item => {
      if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
    });
    for (const { openid, cloudUrl } of toFetch) {
      const tempUrl = urlMap[cloudUrl] || cloudUrl;
      result[openid] = tempUrl;
      _memAvatarCache[cloudUrl] = tempUrl;
      _memAvatarTime[cloudUrl] = now;
    }
  } catch (err) {
    console.error('[resolveAvatarUrls] getTempFileURL error:', err);
    toFetch.forEach(({ openid, cloudUrl }) => { result[openid] = cloudUrl; });
  }

  return result;
}

// 转换云存储 URL 为临时访问链接（通用方法）
async function getTempUrl(fileID) {
  if (!fileID || !fileID.startsWith('cloud://')) {
    return fileID;
  }
  try {
    const result = await cloud.getTempFileURL({
      fileList: [fileID]
    });
    return result.fileList[0]?.tempFileURL || fileID;
  } catch (e) {
    console.error('获取临时链接失败:', e);
    return fileID;
  }
}

// 转换单个对象的云存储 URL（imageUrl、avatar 等字段）
async function convertCloudUrls(obj) {
  if (!obj) return obj;

  const cloudFields = ['imageUrl', 'avatar', 'authorAvatar', 'coverUrl', 'thumbnail'];
  for (const field of cloudFields) {
    if (obj[field] && typeof obj[field] === 'string' && obj[field].startsWith('cloud://')) {
      try {
        obj[field] = await getTempUrl(obj[field]);
      } catch (e) {
        console.error(`转换 ${field} 失败:`, e);
      }
    }
  }

  // 递归处理 comments 数组
  if (Array.isArray(obj.comments)) {
    await Promise.all(obj.comments.map(c => convertCloudUrls(c)));
  }

  return obj;
}

// 批量转换数组中所有对象的云存储 URL
async function convertCloudUrlsInArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return Promise.all(arr.map(item => convertCloudUrls(item)));
}

// 统一 posts 集合字段 → 前端兼容字段（适配 photos 的字段名）
function normalizePost(post) {
  // posts 集合：photos = [{imageUrl, width, height, order}]
  // 取第一张图作为列表展示图
  const firstPhoto = (post.photos && post.photos.length > 0) ? post.photos[0] : null;
  return {
    ...post,
    id: post._id,
    imageUrl: firstPhoto ? firstPhoto.imageUrl : '',
    // aspectRatio = height / width（供瀑布流用）
    // 添加 clamp 防止极端值（width=0 或旧帖子无数据）
    aspectRatio: (() => {
      if (!firstPhoto || !firstPhoto.width || !firstPhoto.height) return 1;
      const r = firstPhoto.height / firstPhoto.width;
      if (!isFinite(r) || isNaN(r)) return 1;
      return Math.min(Math.max(r, 0.3), 3.0); // 限制在 0.3~3.0 范围
    })(),
    // posts 集合无 author 字段，通过 authorId 在外层 resolve 后注入
    // posts 集合无 authorAvatar 字段，通过 authorId 在外层 resolve 后注入
    // posts 集合的 photos 数组透传给前端（detail 页多图展示用）
  };
}

exports.main = async (event, context) => {
  const { action, data } = event;

  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  switch (action) {
    case 'list':
      return await getPosts(data, openId);
    case 'detail':
      return await getPostDetail(data.id, openId);
    case 'create':
      return await uploadPhoto(data, openId);
    case 'delete':
      return await deletePhoto(data.id, openId);
    case 'like':
      return await likePhoto(data.id, openId);
    case 'comment':
      return await addComment(data, openId);
    case 'timeline':
      return await getTimeline(openId);
    case 'locations':
      return await getLocations();
    case 'stats':
      return await getStats();
    case 'fixCommentAvatars':
      return await fixCommentAvatars();
    case 'myWorks':
      return await getMyWorks(openId, data);
    case 'myLiked':
      return await getMyLiked(openId, data);
    case 'moreComments':
      return await getMoreComments(data, openId);
    default:
      return { success: false, message: '未知操作' };
  }
};

// 获取照片列表（读 posts 集合）
async function getPosts(params, openId) {
  const { location, keyword, sort = 'latest', page = 1, pageSize = 20 } = params;

  try {
    const conditions = {};
    if (location) conditions.location = location;
    if (keyword) {
      conditions.title = db.RegExp({ regexp: keyword, options: 'i' });
    }

    const orderBy = sort === 'likes' ? 'likes' : sort === 'views' ? 'views' : 'createdAt';

    // 查询总数
    const totalResult = await postsCollection.where(conditions).count();
    const total = totalResult.total;

    // 分页数据
    const result = await postsCollection
      .where(conditions)
      .orderBy(orderBy, 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    // 统一字段
    let posts = result.data.map(post => ({
      ...normalizePost(post),
      liked: openId && (post.likedUsers || []).includes(openId)
    }));

    // 批量获取作者头像+昵称
    const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))];
    if (authorIds.length > 0) {
      const authorAvatarMap = {};
      const authorNicknameMap = {};
      try {
        const userRes = await usersCollection
          .where({ _openid: _.in(authorIds) })
          .field({ _openid: true, avatar: true, nickname: true })
          .get();
        userRes.data.forEach(u => {
          if (u.avatar) authorAvatarMap[u._openid] = u.avatar;
          if (u.nickname) authorNicknameMap[u._openid] = u.nickname;
        });
      } catch (e) {}

      const resolvedAvatars = await resolveAvatarUrls(authorAvatarMap);

      posts.forEach(post => {
        if (resolvedAvatars[post.authorId]) {
          post.authorAvatar = resolvedAvatars[post.authorId];
        }
        if (authorNicknameMap[post.authorId]) {
          post.author = authorNicknameMap[post.authorId];
        }
      });
    }

    // 转换云存储 URL
    posts = await convertCloudUrlsInArray(posts);

    return {
      success: true,
      data: {
        posts,
        hasMore: page * pageSize < total,
        total
      }
    };
  } catch (e) {
    console.error('获取照片列表失败:', e);
    return { success: false, message: '获取失败' };
  }
}

// 获取照片详情（读 posts 集合）
async function getPostDetail(id, openId) {
  try {
    // 浏览量 +1
    await postsCollection.doc(id).update({
      data: { views: _.inc(1) }
    }).catch(() => {});

    const postResult = await postsCollection.doc(id).get();
    const post = postResult.data;

    // 检查点赞状态
    post.liked = openId && (post.likedUsers || []).includes(openId);

    // 统一字段
    Object.assign(post, normalizePost(post));

    // 转换照片云存储 URL
    await convertCloudUrls(post);

    // posts.photos 是多图数组，逐个转换
    if (Array.isArray(post.photos)) {
      for (const photo of post.photos) {
        if (photo.imageUrl && photo.imageUrl.startsWith('cloud://')) {
          try {
            photo.imageUrl = await getTempUrl(photo.imageUrl);
          } catch (e) {}
        }
      }
    }

    // 批量获取作者头像+昵称
    const authorAvatarMap = {};
    const authorNicknameMap = {};
    if (post.authorId) {
      try {
        const userRes = await usersCollection
          .where({ _openid: post.authorId })
          .field({ _openid: true, avatar: true, nickname: true })
          .get();
        if (userRes.data[0]) {
          if (userRes.data[0].avatar) authorAvatarMap[post.authorId] = userRes.data[0].avatar;
          if (userRes.data[0].nickname) authorNicknameMap[post.authorId] = userRes.data[0].nickname;
        }
      } catch (e) {}
    }
    const resolvedAvatars = await resolveAvatarUrls(authorAvatarMap);
    if (resolvedAvatars[post.authorId]) post.authorAvatar = resolvedAvatars[post.authorId];
    if (authorNicknameMap[post.authorId]) post.author = authorNicknameMap[post.authorId];

    // 评论列表
    const commentsData = await getCommentsWithAuthors(id, 0, 20);

    return {
      success: true,
      data: {
        ...post,
        comments: commentsData.comments,
        commentsCount: commentsData.total,
        hasMore: commentsData.hasMore
      }
    };
  } catch (e) {
    console.error('获取照片详情失败:', e);
    return { success: false, message: '获取失败' };
  }
}

// 查询评论并实时解析作者头像
async function getCommentsWithAuthors(photoId, offset = 0, limit = 10) {
  try {
    const countResult = await commentsCollection.where({ photoId }).count();
    const total = countResult.total;

    const commentsResult = await commentsCollection
      .where({ photoId })
      .orderBy('createdAt', 'asc')
      .skip(offset)
      .limit(limit)
      .get();

    const comments = commentsResult.data.map((c) => {
      c.id = c._id;
      return c;
    });

    const authorIds = [...new Set(comments.map(c => c.authorId).filter(Boolean))];

    let authorAvatarMap = {};
    if (authorIds.length > 0) {
      try {
        const usersRes = await usersCollection
          .where({ _openid: _.in(authorIds) })
          .field({ _openid: true, avatar: true })
          .get();
        usersRes.data.forEach(u => {
          if (!u.avatar) return;
          authorAvatarMap[u._openid] = u.avatar;
        });
      } catch (e) {
        console.error('[getCommentsWithAuthors] users query error:', e);
      }
    }

    const resolved = await resolveAvatarUrls(authorAvatarMap);

    comments.forEach(c => {
      const resolvedAvatar = resolved[c.authorId];
      c.authorAvatar = resolvedAvatar || '/assets/icons/default-avatar.png';
    });

    return { comments, hasMore: offset + limit < total, total };
  } catch (e) {
    console.error('查询评论失败:', e);
    return { comments: [], hasMore: false, total: 0 };
  }
}

// 获取更多评论（分页加载）
async function getMoreComments(data, openId) {
  try {
    const { photoId, offset = 0, limit = 10 } = data;
    const result = await getCommentsWithAuthors(photoId, offset, limit);

    return {
      success: true,
      data: {
        comments: result.comments,
        hasMore: result.hasMore
      }
    };
  } catch (e) {
    console.error('获取更多评论失败:', e);
    return { success: false, message: '加载失败' };
  }
}

// 上传照片（写入 posts 集合）
async function uploadPhoto(data, openId) {
  try {
    // 获取作者信息
    let authorNickname = '匿名用户';
    let authorAvatar = '';
    try {
      const userResult = await usersCollection.where({ _openid: openId }).get();
      if (userResult.data.length > 0) {
        authorNickname = userResult.data[0].nickname || '匿名用户';
        authorAvatar = userResult.data[0].avatar || '';
      }
    } catch (e) {
      console.error('获取作者信息失败:', e);
    }

    // posts 集合直接存 imageUrl（云存储 fileID，读取时转换）
    // photos = [{imageUrl, width, height, order}] 来自上传页
    const photos = (data.photos || []).map((p, idx) => ({
      imageUrl: p.imageUrl || '',
      width: parseInt(p.width) || 1,
      height: parseInt(p.height) || 1,
      order: p.order !== undefined ? p.order : idx
    }));

    const addData = {
      title: data.title,
      description: data.description || '',
      location: data.location || '',
      photos,
      author: authorNickname,
      authorId: openId,
      authorAvatar,
      likes: 0,
      views: 0,
      likedUsers: [],
      createdAt: db.serverDate()
    };
    return { success: true, data: { id: result._id } };
  } catch (e) {
    console.error('[uploadPhoto] 失败:', e.message, e.stack);
    return { success: false, message: '上传失败: ' + e.message };
  }
}

// 删除照片（从 posts 集合删除）
async function deletePhoto(id, openId) {
  try {
    const post = await postsCollection.doc(id).get();
    if (post.data.authorId !== openId) {
      return { success: false, message: '无权删除' };
    }

    await postsCollection.doc(id).remove();
    await commentsCollection.where({ photoId: id }).remove();

    return { success: true };
  } catch (e) {
    console.error('删除照片失败:', e);
    return { success: false, message: '删除失败' };
  }
}

// 点赞（posts 集合）
async function likePhoto(id, openId) {
  try {
    const post = await postsCollection.doc(id).get();
    const likedUsers = post.data.likedUsers || [];
    const hasLiked = likedUsers.includes(openId);

    if (hasLiked) {
      const newLikes = Math.max(0, post.data.likes - 1);
      await postsCollection.doc(id).update({
        data: {
          likes: newLikes,
          likedUsers: _.pull(openId)
        }
      });
      return { success: true, liked: false, likes: newLikes };
    } else {
      await postsCollection.doc(id).update({
        data: {
          likes: _.inc(1),
          likedUsers: _.push(openId)
        }
      });
      return { success: true, liked: true, likes: post.data.likes + 1 };
    }
  } catch (e) {
    console.error('点赞失败:', e);
    return { success: false, message: '操作失败' };
  }
}

// 添加评论（photoId 对应 posts._id）
async function addComment(data, openId) {
  try {
    let authorNickname = '匿名用户';
    try {
      const userResult = await usersCollection.where({ _openid: openId }).get();
      if (userResult.data.length > 0) {
        authorNickname = userResult.data[0].nickname || '匿名用户';
      }
    } catch (e) {}

    const result = await commentsCollection.add({
      data: {
        photoId: data.photoId,
        content: data.content,
        author: authorNickname,
        authorId: openId,
        createdAt: db.serverDate()
      }
    });

    return {
      success: true,
      data: {
        id: result._id,
        content: data.content,
        author: authorNickname,
        createdAt: new Date()
      }
    };
  } catch (e) {
    console.error('添加评论失败:', e);
    return { success: false, message: '评论失败' };
  }
}

// 获取时间线（读 posts 集合）
async function getTimeline(openId) {
  try {
    const result = await postsCollection
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    let posts = result.data.map(post => ({
      ...normalizePost(post),
      liked: openId && (post.likedUsers || []).includes(openId)
    }));

    // 批量获取作者头像+昵称
    const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))];
    if (authorIds.length > 0) {
      const authorAvatarMap = {};
      const authorNicknameMap = {};
      try {
        const userRes = await usersCollection
          .where({ _openid: _.in(authorIds) })
          .field({ _openid: true, avatar: true, nickname: true })
          .get();
        userRes.data.forEach(u => {
          if (u.avatar) authorAvatarMap[u._openid] = u.avatar;
          if (u.nickname) authorNicknameMap[u._openid] = u.nickname;
        });
      } catch (e) {}

      const resolvedAvatars = await resolveAvatarUrls(authorAvatarMap);

      posts.forEach(post => {
        if (resolvedAvatars[post.authorId]) {
          post.authorAvatar = resolvedAvatars[post.authorId];
        }
        if (authorNicknameMap[post.authorId]) {
          post.author = authorNicknameMap[post.authorId];
        }
      });
    }

    // 转换云存储 URL
    posts = await convertCloudUrlsInArray(posts);

    const timeline = {};
    posts.forEach(post => {
      const year = new Date(post.createdAt).getFullYear();
      if (!timeline[year]) {
        timeline[year] = { year, photos: [] };
      }
      timeline[year].photos.push(post);
    });

    return {
      success: true,
      data: Object.values(timeline).sort((a, b) => b.year - a.year)
    };
  } catch (e) {
    console.error('获取时间线失败:', e);
    return { success: false, message: '获取失败' };
  }
}

// 获取地点列表（从 posts 集合）
async function getLocations() {
  try {
    const result = await postsCollection
      .where({ location: _.neq('') })
      .field({ location: true })
      .get();

    const locations = [...new Set(result.data.map(p => p.location).filter(l => l))];
    return { success: true, data: locations };
  } catch (e) {
    return { success: false, data: [] };
  }
}

// 获取统计数据（posts 集合）
async function getStats() {
  try {
    const [postCount, userCount] = await Promise.all([
      postsCollection.count(),
      db.collection('users').count()
    ]);

    const likesResult = await postsCollection.field({ likes: true }).get();
    const totalLikes = likesResult.data.reduce((sum, p) => sum + (p.likes || 0), 0);

    const commentsCount = await commentsCollection.count();

    return {
      success: true,
      data: {
        totalPhotos: postCount.total,
        totalUsers: userCount.total,
        totalLikes,
        totalComments: commentsCount.total
      }
    };
  } catch (e) {
    console.error('获取统计失败:', e);
    return { success: false, data: {} };
  }
}

// 获取我的作品（读 posts 集合）
async function getMyWorks(openId, params = {}) {
  const { page = 1, pageSize = 20 } = params;
  try {
    const countResult = await postsCollection.where({ authorId: openId }).count();
    const total = countResult.total;

    const result = await postsCollection
      .where({ authorId: openId })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let posts = result.data.map(post => ({
      ...normalizePost(post),
      liked: (post.likedUsers || []).includes(openId)
    }));

    posts = await convertCloudUrlsInArray(posts);

    return { success: true, data: { posts, hasMore: page * pageSize < total, total } };
  } catch (e) {
    console.error('获取我的作品失败:', e);
    return { success: false, data: { posts: [], hasMore: false, total: 0 } };
  }
}

// 获取我赞过的照片（读 posts 集合）
async function getMyLiked(openId, params = {}) {
  const { page = 1, pageSize = 20 } = params;
  try {
    const countResult = await postsCollection
      .where({ likedUsers: _.elemMatch(_.eq(openId)) })
      .count();
    const total = countResult.total;

    const result = await postsCollection
      .where({ likedUsers: _.elemMatch(_.eq(openId)) })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let posts = result.data.map(post => ({
      ...normalizePost(post),
      liked: true
    }));

    posts = await convertCloudUrlsInArray(posts);

    // 批量获取作者头像+昵称
    const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))];
    if (authorIds.length > 0) {
      const authorAvatarMap = {};
      const authorNicknameMap = {};
      try {
        const userRes = await usersCollection
          .where({ _openid: _.in(authorIds) })
          .field({ _openid: true, avatar: true, nickname: true })
          .get();
        userRes.data.forEach(u => {
          if (u.avatar) authorAvatarMap[u._openid] = u.avatar;
          if (u.nickname) authorNicknameMap[u._openid] = u.nickname;
        });
      } catch (e) {}

      const resolvedAvatars = await resolveAvatarUrls(authorAvatarMap);

      posts.forEach(post => {
        if (resolvedAvatars[post.authorId]) {
          post.authorAvatar = resolvedAvatars[post.authorId];
        }
        if (authorNicknameMap[post.authorId]) {
          post.authorNickname = authorNicknameMap[post.authorId];
        }
      });
    }

    return { success: true, data: { posts, hasMore: page * pageSize < total, total } };
  } catch (e) {
    console.error('获取赞过的照片失败:', e);
    return { success: false, data: { posts: [], hasMore: false, total: 0 } };
  }
}

// 一次性迁移：修复旧评论缺失的 authorAvatar
async function fixCommentAvatars() {
  let fixed = 0;
  let batch = 0;
  try {
    while (true) {
      const allComments = await commentsCollection
        .where({ authorAvatar: '' })
        .limit(20)
        .field({ _id: true, authorId: true })
        .get();

      if (allComments.data.length === 0) break;

      const openids = [...new Set(allComments.data.map(c => c.authorId).filter(Boolean))];
      let userMap = {};
      if (openids.length > 0) {
        const users = await usersCollection
          .where({ _openid: _.in(openids) })
          .field({ _openid: true, avatar: true })
          .get();
        users.data.forEach(u => { userMap[u._openid] = u.avatar || ''; });
      }

      await Promise.all(allComments.data.map(async (c) => {
        const avatar = userMap[c.authorId] || '';
        if (avatar) {
          if (avatar.startsWith('cloud://')) {
            try {
              const urlRes = await cloud.getTempFileURL({ fileList: [avatar] });
              await commentsCollection.doc(c._id).update({
                data: { authorAvatar: urlRes.fileList?.[0]?.tempFileURL || avatar }
              });
            } catch (_) {
              await commentsCollection.doc(c._id).update({ data: { authorAvatar: avatar } });
            }
          } else {
            await commentsCollection.doc(c._id).update({ data: { authorAvatar: avatar } });
          }
          fixed++;
        }
      }));

      batch++;
      if (batch >= 50) break;
    }
    return { success: true, fixed };
  } catch (e) {
    console.error('[fixCommentAvatars] failed:', e);
    return { success: false, message: e.message };
  }
}
