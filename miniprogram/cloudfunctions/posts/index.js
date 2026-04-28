// cloudfunctions/posts/index.js - 帖子相关云函数

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const postsCollection = db.collection('posts');
const commentsCollection = db.collection('post_comments');
const usersCollection = db.collection('users');

// [2026-04-25] 移除所有 cloud:// → HTTPS 转换
// 微信小程序 <image> 组件原生支持 cloud:// 协议，框架自动管理签名刷新
// 仅前端 wx.downloadFile 等场景需要 HTTPS，由前端自行转换（见 detail.js）

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
      return await createPost(data, openId);
    case 'delete':
      return await deletePost(data.id, openId);
    case 'like':
      return await likePost(data.id, openId);
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
    case 'update':
      return await updatePost(data, openId);
    case 'incrementShares':
      return await incrementShares(data, openId);
    case 'migrateHidden':
      return await migrateHiddenField();
    case 'myComments':
      return await getMyComments(openId, data);
    case 'receivedComments':
      return await getReceivedComments(openId, data);
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

      posts.forEach(post => {
        if (authorAvatarMap[post.authorId]) {
          post.authorAvatar = authorAvatarMap[post.authorId];
        }
        if (authorNicknameMap[post.authorId]) {
          post.author = authorNicknameMap[post.authorId];
        }
      });
    }

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
    if (authorAvatarMap[post.authorId]) post.authorAvatar = authorAvatarMap[post.authorId];
    if (authorNicknameMap[post.authorId]) post.author = authorNicknameMap[post.authorId];

    // 评论列表
    const commentsData = await getCommentsWithAuthors(id, 0, 20);

    return {
      success: true,
      data: {
        ...post,
        shares: post.shares || 0,
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
async function getCommentsWithAuthors(postId, offset = 0, limit = 10) {
  try {
    const query = { postId };
    const countResult = await commentsCollection.where(query).count();
    const total = countResult.total;

    const commentsResult = await commentsCollection
      .where(query)
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

    comments.forEach(c => {
      c.authorAvatar = authorAvatarMap[c.authorId] || '/assets/icons/default-avatar.png';
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
    const { postId, offset = 0, limit = 10 } = data;
    const result = await getCommentsWithAuthors(postId, offset, limit);

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

// 创建帖子（写入 posts 集合）
async function createPost(data, openId) {
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

    const result = await postsCollection.add({ data: addData });
    return { success: true, data: { id: result._id } };
  } catch (e) {
    console.error('[createPost] 失败:', e.message, e.stack);
    return { success: false, message: '发布失败: ' + e.message };
  }
}

// 删除帖子（从 posts 集合删除，同时删除关联评论）
async function deletePost(id, openId) {
  try {
    console.log('[deletePost] id:', id, 'openId:', openId);
    if (!id) {
      return { success: false, message: '缺少帖子ID' };
    }
    const post = await postsCollection.doc(id).get();
    if (post.data.authorId !== openId) {
      return { success: false, message: '无权删除' };
    }

    await postsCollection.doc(id).remove();
    await commentsCollection.where({ postId: id }).remove();

    return { success: true };
  } catch (e) {
    console.error('[deletePost] 失败:', e.message, e.stack);
    return { success: false, message: '删除失败: ' + e.message };
  }
}

// 更新帖子
async function updatePost(data, openId) {
  try {
    // 兼容两种调用格式：
    // 1. { id, updates } — 标准格式
    // 2. { postId, data: { hidden/title/... } } — profile.js toggleHidePost 调用
    const postId = data.id || data.postId;
    const updates = data.updates || data.data;

    if (!postId) {
      return { success: false, message: '缺少帖子ID' };
    }

    // 验证权限
    const post = await postsCollection.doc(postId).get();
    if (!post.data || post.data.authorId !== openId) {
      return { success: false, message: '无权编辑' };
    }

    // 只允许更新特定字段
    const allowedFields = ['title', 'description', 'location', 'hidden'];
    const updateData = {};
    for (const field of allowedFields) {
      if (updates && updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, message: '没有可更新的字段' };
    }

    await postsCollection.doc(postId).update({ data: updateData });
    return { success: true };
  } catch (e) {
    console.error('[updatePost] 失败:', e.message, e.stack);
    return { success: false, message: '更新失败: ' + e.message };
  }
}

// 点赞帖子
async function likePost(id, openId) {
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
    console.error('[likePost] 失败:', e);
    return { success: false, message: '操作失败' };
  }
}

// 添加评论
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
        postId: data.postId,
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

      posts.forEach(post => {
        if (authorAvatarMap[post.authorId]) {
          post.authorAvatar = authorAvatarMap[post.authorId];
        }
        if (authorNicknameMap[post.authorId]) {
          post.author = authorNicknameMap[post.authorId];
        }
      });
    }

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
      .limit(100)
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
  const { page = 1, pageSize = 20, hidden } = params;
  // hidden: true=仅隐藏, false=仅显示, undefined=全部
  const whereCond = { authorId: openId };
  if (hidden !== undefined) {
    whereCond.hidden = hidden;
  }
  try {
    const countResult = await postsCollection.where(whereCond).count();
    const total = countResult.total;

    const result = await postsCollection
      .where(whereCond)
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let posts = result.data.map(post => ({
      ...normalizePost(post),
      liked: (post.likedUsers || []).includes(openId)
    }));

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
      .where({ likedUsers: _.elemMatch(_.eq(openId)), hidden: false })
      .count();
    const total = countResult.total;

    const result = await postsCollection
      .where({ likedUsers: _.elemMatch(_.eq(openId)), hidden: false })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let posts = result.data.map(post => ({
      ...normalizePost(post),
      liked: true
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

      posts.forEach(post => {
        if (authorAvatarMap[post.authorId]) {
          post.authorAvatar = authorAvatarMap[post.authorId];
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
          await commentsCollection.doc(c._id).update({ data: { authorAvatar: avatar } });
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

async function incrementShares(data, openId) {
  try {
    const id = data.id;
    if (!id) return { success: false, message: "缺少帖子ID" };
    await postsCollection.doc(id).update({ data: { shares: _.inc(1) } });
    return { success: true };
  } catch (e) {
    console.error("[incrementShares] failed:", e);
    return { success: false, message: e.message };
  }
}

// 获取我发出的评论
async function getMyComments(openId, params = {}) {
  const { offset = 0, limit = 20 } = params;
  try {
    const query = { authorId: openId };
    const countResult = await commentsCollection.where(query).count();
    const total = countResult.total;

    const commentsRes = await commentsCollection
      .where(query)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(limit)
      .get();

    const comments = commentsRes.data.map(c => {
      c.id = c._id;
      return c;
    });

    // 批量解析帖子信息（thumbnail、title、authorId）
    const postIds = [...new Set(comments.map(c => c.postId).filter(Boolean))];
    let postMap = {};
    if (postIds.length > 0) {
      const postsRes = await postsCollection
        .where({ _id: _.in(postIds) })
        .field({ _id: true, thumbnail: true, title: true, authorId: true })
        .get();
      postsRes.data.forEach(p => { postMap[p._id] = p; });
    }

    // 批量解析评论者信息（author、authorAvatar）
    const commenterIds = [...new Set(comments.map(c => c.authorId).filter(Boolean))];
    let authorMap = {};
    if (commenterIds.length > 0) {
      const usersRes = await usersCollection
        .where({ _openid: _.in(commenterIds) })
        .field({ _openid: true, avatar: true, nickname: true })
        .get();
      usersRes.data.forEach(u => { authorMap[u._openid] = u; });
    }

    comments.forEach(c => {
      const post = postMap[c.postId];
      c.postThumb = post ? (post.thumbnail || '') : '';
      c.postTitle = post ? (post.title || '') : '';
      const author = authorMap[c.authorId];
      c.authorAvatar = author ? (author.avatar || '') : (c.authorAvatar || '');
      c.author = author ? (author.nickname || '') : (c.author || '');
      if (!c.time && c.createdAt) {
        const d = new Date(c.createdAt);
        const M = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        c.time = `${M}-${dd} ${h}:${m}`;
      }
    });


    return { success: true, data: { comments, hasMore: offset + limit < total, total } };
  } catch (e) {
    console.error('[getMyComments] failed:', e);
    return { success: false, data: { comments: [], hasMore: false, total: 0 } };
  }
}

// 获取我收到的评论（别人在我的帖子下的评论）
async function getReceivedComments(openId, params = {}) {
  const { offset = 0, limit = 20 } = params;
  try {
    // 先查我发的所有帖子 ID
    const myPostsRes = await postsCollection
      .where({ authorId: openId })
      .field({ _id: true })
      .get();
    const myPostIds = myPostsRes.data.map(p => p._id).filter(Boolean);

    if (myPostIds.length === 0) {
      return { success: true, data: { comments: [], hasMore: false, total: 0, newCount: 0 } };
    }

    const query = { postId: _.in(myPostIds) };
    const countResult = await commentsCollection.where(query).count();
    const total = countResult.total;

    const commentsRes = await commentsCollection
      .where(query)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(limit)
      .get();

    const comments = commentsRes.data.map(c => {
      c.id = c._id;
      return c;
    });

    // 批量获取帖子信息
    const postIds = [...new Set(comments.map(c => c.postId).filter(Boolean))];
    let postMap = {};
    if (postIds.length > 0) {
      const postsRes = await postsCollection
        .where({ _id: _.in(postIds) })
        .field({ _id: true, thumbnail: true, title: true })
        .get();
      postsRes.data.forEach(p => { postMap[p._id] = p; });
    }

    // 批量获取评论者信息
    const commenterIds = [...new Set(comments.map(c => c.authorId).filter(Boolean))];
    let authorMap = {};
    if (commenterIds.length > 0) {
      const usersRes = await usersCollection
        .where({ _openid: _.in(commenterIds) })
        .field({ _openid: true, avatar: true, nickname: true })
        .get();
      usersRes.data.forEach(u => { authorMap[u._openid] = u; });
    }

    // 新回复数：createdAt > 24h 前的（简化版：按 offset=0 首次加载时计算差值）
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const newCount = commentsRes.data.filter(c => c.createdAt && c.createdAt > dayAgo).length;

    comments.forEach(c => {
      const post = postMap[c.postId];
      c.postThumb = post ? (post.thumbnail || '') : '';
      c.postTitle = post ? (post.title || '') : '';
      const author = authorMap[c.authorId];
      c.authorAvatar = author ? (author.avatar || '') : (c.authorAvatar || '');
      c.author = author ? (author.nickname || '') : (c.author || '');
      if (!c.time && c.createdAt) {
        const d = new Date(c.createdAt);
        const M = (d.getMonth() + 1).toString().padStart(2, '0');
        const dd = d.getDate().toString().padStart(2, '0');
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        c.time = `${M}-${dd} ${h}:${m}`;
      }
    });

    return { success: true, data: { comments, hasMore: offset + limit < total, total, newCount } };
  } catch (e) {
    console.error('[getReceivedComments] failed:', e);
    return { success: false, data: { comments: [], hasMore: false, total: 0, newCount: 0 } };
  }
}
