// cloudfunctions/photos/index.js - 照片相关云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const photosCollection = db.collection('photos');
const commentsCollection = db.collection('comments');
const usersCollection = db.collection('users');

// 实例级内存缓存：cloud:// → tempURL（TTL 15min，函数实例重启自动清空）
const _memAvatarCache = {};
const _memAvatarTime = {};
const MEM_CACHE_TTL = 15 * 60 * 1000;

// 解析单条头像 URL：只走 L1 内存缓存，miss 时直接 getTempFileURL
// ⚠️ 不再存 L2（tempURL 有 ~2h 时效，过期后 403，持久化无意义）
async function resolveAvatarUrl(cloudUrl) {
  if (!cloudUrl) return '/assets/icons/default-avatar.png';
  if (!cloudUrl.startsWith('cloud://')) return cloudUrl;
  const now = Date.now();
  // L1：内存缓存
  if (_memAvatarCache[cloudUrl] && (now - _memAvatarTime[cloudUrl]) < MEM_CACHE_TTL) {
    return _memAvatarCache[cloudUrl];
  }
  // 实时获取（不写库，避免过期 tempURL 被持久化后 403）
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

// 批量解析头像 URL（所有评论列表用）：L1 内存缓存 → 实时 getTempFileURL（不再写库，tempURL ~2h 时效）
async function resolveAvatarUrls(cloudUrlMap) {
  const result = {};
  const now = Date.now();
  const toFetch = [];

  // L1：内存缓存命中
  for (const [openid, cloudUrl] of Object.entries(cloudUrlMap)) {
    if (!cloudUrl) { result[openid] = '/assets/icons/default-avatar.png'; continue; }
    if (_memAvatarCache[cloudUrl] && (now - _memAvatarTime[cloudUrl]) < MEM_CACHE_TTL) {
      result[openid] = _memAvatarCache[cloudUrl];
    } else {
      toFetch.push({ openid, cloudUrl });
    }
  }

  if (toFetch.length === 0) return result;

  // L3：批量 getTempFileURL
  const cloudToFetch = [...new Set(toFetch.map(x => x.cloudUrl))];
  try {
    const urlRes = await cloud.getTempFileURL({ fileList: cloudToFetch });
    const urlMap = {};
    (urlRes.fileList || []).forEach(item => {
      if (item.tempFileURL) urlMap[item.fileID] = item.tempFileURL;
    });
    // 写入内存缓存 + 填结果
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

// 批量转换对象中的云存储 URL（通用方法）
// 支持转换：imageUrl, avatar, authorAvatar, coverUrl, thumbnail 及 comments 数组
async function convertCloudUrls(obj) {
  if (!obj) return obj;

  // 单个对象上需要检查的字段
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

// 批量转换数组中所有对象的云存储 URL（通用方法）
async function convertCloudUrlsInArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return Promise.all(arr.map(item => convertCloudUrls(item)));
}

// 批量转换图片 URL（已废弃，使用 convertCloudUrlsInArray 替代）
async function processPhotos(photos) {
  return convertCloudUrlsInArray(photos);
}

exports.main = async (event, context) => {
  const { action, data } = event;
  
  // 获取用户 openid（新版云函数必须用这种方式）
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  switch (action) {
    case 'list':
      return await getPhotos(data, openId);
    case 'detail':
      return await getPhotoDetail(data.id, openId);
    case 'upload':
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
    case 'categories':
      return await getCategories();
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

// 获取照片列表
async function getPhotos(params, openId) {
  const { location, category, keyword, sort = 'latest', page = 1, pageSize = 20 } = params;
  
  try {
    const conditions = {};
    if (location) conditions.location = location;
    if (category) conditions.category = category;
    if (keyword) {
      conditions.title = db.RegExp({ regexp: keyword, options: 'i' });
    }

    const orderBy = sort === 'likes' ? 'likes' : sort === 'views' ? 'views' : 'createdAt';

    // 查询总数
    const totalResult = await photosCollection.where(conditions).count();
    const total = totalResult.total;

    // 分页数据
    const result = await photosCollection
      .where(conditions)
      .orderBy(orderBy, 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let photos = result.data.map(photo => ({
      ...photo,
      liked: openId && (photo.likedUsers || []).includes(openId)
    }));

    photos = await processPhotos(photos);

    return {
      success: true,
      data: {
        photos,
        hasMore: page * pageSize < total,
        total
      }
    };
  } catch (e) {
    console.error('获取照片列表失败:', e);
    return { success: false, message: '获取失败' };
  }
}

// 获取照片详情
async function getPhotoDetail(id, openId) {
  try {
    await photosCollection.doc(id).update({
      data: { views: _.inc(1) }
    }).catch(() => {});

    const photoResult = await photosCollection.doc(id).get();
    const photo = photoResult.data;

    // 检查点赞状态
    photo.liked = openId && (photo.likedUsers || []).includes(openId);

    // 转换照片自身的云存储 URL（imageUrl, thumbnail 等）
    await convertCloudUrls(photo);

    // 批量获取作者头像（三层缓存，按 authorId 查 users 表）
    const authorAvatarMap = {};
    if (photo.authorId) {
      try {
        const userRes = await usersCollection
          .where({ _openid: photo.authorId })
          .field({ _openid: true, avatar: true })
          .limit(1).get();
        if (userRes.data[0]?.avatar) {
          authorAvatarMap[photo.authorId] = userRes.data[0].avatar;
        }
      } catch (e) {}
    }
    const resolvedAvatars = await resolveAvatarUrls(authorAvatarMap);
    if (resolvedAvatars[photo.authorId]) {
      photo.authorAvatar = resolvedAvatars[photo.authorId];
    }

    // 评论列表（三层缓存解析每条评论的头像）
    const commentsData = await getCommentsWithAuthors(id, 0, 20);

    return {
      success: true,
      data: {
        ...photo,
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

// 查询评论并实时解析作者头像（三层缓存 + 按 authorId 批量查询 users 表）
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

    // 收集去重 authorId，批量查 users 表
    const authorIds = [...new Set(comments.map(c => c.authorId).filter(Boolean))];

    let authorAvatarMap = {};
    if (authorIds.length > 0) {
      try {
        const usersRes = await usersCollection
          .where({ _openid: _.in(authorIds) })
          .field({ _openid: true, avatar: true })
          .get();
        usersRes.data.forEach(u => {
          // avatar 为空（空字符串或 null/undefined）不写进 map，避免 resolveAvatarUrls 对空值走兜底
          if (!u.avatar) return;
          authorAvatarMap[u._openid] = u.avatar;
        });
      } catch (e) {
        console.error('[getCommentsWithAuthors] users query error:', e);
      }
    } else {
    }

    // 批量解析头像 URL
    const resolved = await resolveAvatarUrls(authorAvatarMap);

    // 注入解析后的头像到每条评论
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
    
    // 使用优化的评论查询方法
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

// 上传照片
async function uploadPhoto(data, openId) {
  try {
    // 获取作者信息
    let authorAvatar = '';
    try {
      const userResult = await usersCollection.where({ _openid: openId }).get();
      if (userResult.data.length > 0) {
        authorAvatar = userResult.data[0].avatar || '';
      }
    } catch (e) {
      console.error('获取作者头像失败:', e);
    }

    // 保存到数据库（存储 fileID，读取时通过 convertCloudUrls 转换）
    const result = await photosCollection.add({
      data: {
        title: data.title,
        description: data.description || '',
        imageUrl: data.imageUrl,
        location: data.location || '',
        category: data.category || '风景',
        author: data.author || '匿名用户',
        authorId: openId,
        authorAvatar: authorAvatar,
        aspectRatio: parseFloat(data.aspectRatio) || 1,  // 高宽比（height/width）瀑布流用，默认 1
        likes: 0,
        views: 0,
        likedUsers: [],
        createdAt: db.serverDate()
      }
    });

    return { success: true, data: { id: result._id } };
  } catch (e) {
    console.error('上传照片失败:', e);
    return { success: false, message: '上传失败' };
  }
}

// 删除照片
async function deletePhoto(id, openId) {
  try {
    const photo = await photosCollection.doc(id).get();
    if (photo.data.authorId !== openId) {
      return { success: false, message: '无权删除' };
    }

    await photosCollection.doc(id).remove();
    await commentsCollection.where({ photoId: id }).remove();

    return { success: true };
  } catch (e) {
    console.error('删除照片失败:', e);
    return { success: false, message: '删除失败' };
  }
}

// 点赞
async function likePhoto(id, openId) {
  try {
    const photo = await photosCollection.doc(id).get();
    const likedUsers = photo.data.likedUsers || [];
    const hasLiked = likedUsers.includes(openId);

    if (hasLiked) {
      // 只有 likes > 0 才减，防止负数
      const newLikes = Math.max(0, photo.data.likes - 1);
      await photosCollection.doc(id).update({
        data: {
          likes: newLikes,
          likedUsers: _.pull(openId)
        }
      });
      return { success: true, liked: false, likes: newLikes };
    } else {
      await photosCollection.doc(id).update({
        data: {
          likes: _.inc(1),
          likedUsers: _.push(openId)
        }
      });
      return { success: true, liked: true, likes: photo.data.likes + 1 };
    }
  } catch (e) {
    console.error('点赞失败:', e);
    return { success: false, message: '操作失败' };
  }
}

// 添加评论
async function addComment(data, openId) {
  try {
    // 只查 users 表拿 nickname（头像通过 authorId 在 getCommentsWithAuthors 里统一解析）
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
        // 不存 authorAvatar，查询时通过 authorId → users → 三层缓存实时解析
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

// 获取时间线
async function getTimeline(openId) {
  try {
    const result = await photosCollection
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const photos = result.data.map(photo => ({
      ...photo,
      liked: openId && (photo.likedUsers || []).includes(openId)
    }));

    const timeline = {};
    photos.forEach(photo => {
      const year = new Date(photo.createdAt).getFullYear();
      if (!timeline[year]) {
        timeline[year] = { year, photos: [] };
      }
      timeline[year].photos.push(photo);
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

// 获取地点列表
async function getLocations() {
  try {
    const result = await photosCollection
      .where({ location: _.neq('') })
      .field({ location: true })
      .get();
    
    const locations = [...new Set(result.data.map(p => p.location).filter(l => l))];
    return { success: true, data: locations };
  } catch (e) {
    return { success: false, data: [] };
  }
}

// 获取分类列表
async function getCategories() {
  const categories = [
    { id: 1, name: '风景', icon: '🏞️', color: '#4CAF50' },
    { id: 2, name: '人物', icon: '👥', color: '#2196F3' },
    { id: 3, name: '建筑', icon: '🏠', color: '#FF9800' },
    { id: 4, name: '美食', icon: '🍜', color: '#E91E63' },
    { id: 5, name: '民俗', icon: '🎭', color: '#9C27B0' },
    { id: 6, name: '变迁', icon: '📸', color: '#607D8B' }
  ];
  return { success: true, data: categories };
}

// 获取统计数据
async function getStats() {
  try {
    const [photoCount, userCount] = await Promise.all([
      photosCollection.count(),
      db.collection('users').count()
    ]);

    const likesResult = await photosCollection.field({ likes: true }).get();
    const totalLikes = likesResult.data.reduce((sum, p) => sum + (p.likes || 0), 0);

    const commentsCount = await commentsCollection.count();

    return {
      success: true,
      data: {
        totalPhotos: photoCount.total,
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

// 获取我的作品
async function getMyWorks(openId, params = {}) {
  const { page = 1, pageSize = 20 } = params;
  try {
    // 查询总数
    const countResult = await photosCollection.where({ authorId: openId }).count();
    const total = countResult.total;

    const result = await photosCollection
      .where({ authorId: openId })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const photos = result.data.map(photo => ({
      ...photo,
      liked: (photo.likedUsers || []).includes(openId)
    }));

    return { success: true, data: { photos, hasMore: page * pageSize < total, total } };
  } catch (e) {
    console.error('获取我的作品失败:', e);
    return { success: false, data: { photos: [], hasMore: false, total: 0 } };
  }
}

// 获取我赞过的照片
async function getMyLiked(openId, params = {}) {
  const { page = 1, pageSize = 20 } = params;
  try {
    // 查询总数
    const countResult = await photosCollection
      .where({ likedUsers: _.elemMatch(_.eq(openId)) })
      .count();
    const total = countResult.total;

    const result = await photosCollection
      .where({
        likedUsers: _.elemMatch(_.eq(openId))
      })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const photos = result.data.map(photo => ({
      ...photo,
      liked: true
    }));

    return { success: true, data: { photos, hasMore: page * pageSize < total, total } };
  } catch (e) {
    console.error('获取赞过的照片失败:', e);
    return { success: false, data: { photos: [], hasMore: false, total: 0 } };
  }
}

// 一次性迁移：修复旧评论缺失的 authorAvatar（从 users 表补全）
async function fixCommentAvatars() {
  let fixed = 0;
  let batch = 0;
  try {
    // 分批处理，每次最多 20 条（云函数限制）
    while (true) {
      const allComments = await commentsCollection
        .where({ authorAvatar: '' })   // avatar 为空（无此字段或空字符串）
        .limit(20)
        .field({ _id: true, authorId: true })
        .get();

      if (allComments.data.length === 0) break;

      // 收集涉及的 authorId，批量查 users 表
      const openids = [...new Set(allComments.data.map(c => c.authorId).filter(Boolean))];
      let userMap = {};
      if (openids.length > 0) {
        const users = await usersCollection
          .where({ _openid: _.in(openids) })
          .field({ _openid: true, avatar: true })
          .get();
        users.data.forEach(u => { userMap[u._openid] = u.avatar || ''; });
      }

      // 逐条更新
      await Promise.all(allComments.data.map(async (c) => {
        const avatar = userMap[c.authorId] || '';
        if (avatar) {
          // cloud:// 转临时链接
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
      if (batch >= 50) break;   // 安全上限，防止死循环
    }
    return { success: true, fixed };
  } catch (e) {
    console.error('[fixCommentAvatars] failed:', e);
    return { success: false, message: e.message };
  }
}