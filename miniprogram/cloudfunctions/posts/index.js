// cloudfunctions/posts/index.js - 帖子相关云函数

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const postsCollection = db.collection('posts');
const commentsCollection = db.collection('post_comments');
const usersCollection = db.collection('users');
const identity = require('./common/identity');

async function getActor(openId) {
  return identity.resolveActor(db, openId);
}

// [2026-04-25] 移除所有 cloud:// → HTTPS 转换
// 微信小程序 <image> 组件原生支持 cloud:// 协议，框架自动管理签名刷新
// 仅前端 wx.downloadFile 等场景需要 HTTPS，由前端自行转换（见 detail.js）

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
    case 'update': {
      // 加日志看清楚前端到底传了什么
      console.log('[update] event.full:', JSON.stringify(event));
      const { postId, ...rest } = event;
      const payload = { postId, ...event.data };
      console.log('[update] payload:', JSON.stringify(payload));
      console.log('[update] event.data.updates:', JSON.stringify(event.data?.updates));
      console.log('[update] event.data.data:', JSON.stringify(event.data?.data));
      return await updatePost(payload, openId);
    }
    case 'incrementShares':
      return await incrementShares(data, openId);
    case 'toggleCommentLike':
      return await toggleCommentLike(data, openId);
    case 'getCommentReplies':
      return await getCommentReplies(data, openId);
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
  try {
    const actor = await getActor(openId);
    const { location, keyword, sort = 'latest', page = 1, pageSize = 20 } = params;
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
      liked: identity.isLikedBy(post.likedUsers, actor)
    }));

    const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, authorIds);
    identity.applyAuthorToPosts(posts, avatarMap, nicknameMap);

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
  const actor = await getActor(openId);
  try {
    // 浏览量 +1
    await postsCollection.doc(id).update({
      data: { views: _.inc(1) }
    }).catch(() => {});

    const postResult = await postsCollection.doc(id).get();
    const post = postResult.data;

    post.liked = identity.isLikedBy(post.likedUsers, actor);

    Object.assign(post, normalizePost(post));

    if (post.authorId) {
      const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, [post.authorId]);
      if (avatarMap[post.authorId]) post.authorAvatar = avatarMap[post.authorId];
      if (nicknameMap[post.authorId]) post.author = nicknameMap[post.authorId];
    }


    // 评论列表
    const commentsData = await getCommentsWithAuthors(id, 0, 20, openId);
    // 总评论数（含楼中楼回复）
    let allCommentsCount = 0;
    try {
      const cntRes = await commentsCollection.where({ postId: id }).count();
      allCommentsCount = cntRes.total || 0;
    } catch (e) {}

    let canDelete = false;
    if (actor.userId) {
      if (identity.isAuthor(post.authorId, actor) || actor.isAdmin) {
        canDelete = true;
      }
    }

    return {
      success: true,
      data: {
        ...post,
        shares: post.shares || 0,
        comments: commentsData.comments,
        commentsCount: allCommentsCount,
        hasMore: commentsData.hasMore,
        canDelete
      }
    };
  } catch (e) {
    console.error('获取照片详情失败:', e);
    return { success: false, message: '获取失败' };
  }
}

// 查询评论并实时解析作者头像
async function getCommentsWithAuthors(postId, offset = 0, limit = 10, openId) {
  const actor = await getActor(openId);
  try {
    // 只返回一级评论（parentId 为空/null），按热度排序
    const query = { postId, parentId: _.or(_.eq(null), _.exists(false)) };
    console.log('[getCommentsWithAuthors] postId:', postId, 'query:', JSON.stringify(query));
    const countResult = await commentsCollection.where(query).count();
    const total = countResult.total;
    console.log('[getCommentsWithAuthors] total comments:', total);

    const commentsResult = await commentsCollection
      .where(query)
      .orderBy('likes', 'desc')
      .skip(offset)
      .limit(limit)
      .get();

    // 楼中楼：统计每条顶级评论的子评论数
    const topCommentIds = commentsResult.data
      .filter(c => !c.parentId)
      .map(c => c._id);
    let repliesCountMap = {};
    if (topCommentIds.length > 0) {
      // 查顶级评论的直接子评论（B层，全部平级混排）
      const repliesRes = await commentsCollection
        .where({ parentId: _.in(topCommentIds) })
        .field({ parentId: true, likes: true, likedUsers: true, authorId: true, author: true, authorAvatar: true, content: true, createdAt: true, replyTo: true, replyToAuthor: true })
        .get();

      // 按parentId分组，排序（热度likes desc）
      const repliesMap = {};
      repliesRes.data.forEach(r => {
        if (!repliesMap[r.parentId]) repliesMap[r.parentId] = [];
        repliesMap[r.parentId].push(r);
      });
      Object.keys(repliesMap).forEach(pid => {
        repliesMap[pid].sort((a, b) => (b.likes || 0) - (a.likes || 0));
        repliesCountMap[pid] = repliesMap[pid].length;
      });

      // 给每个顶级评论挂上replies数组（首批前3条）+ repliesCount
      commentsResult.data.forEach(c => {
        if (!c.parentId) {
          c.replies = [];
          c.repliesCount = repliesCountMap[c._id] || 0;
          c._hasReplies = (repliesCountMap[c._id] || 0) > 0;
        }
      });
    }

    const comments = commentsResult.data.map((c) => {
      c.id = c._id;
      // likes/likedUsers 默认值兜底
      c.likes = c.likes || 0;
      c.likedUsers = c.likedUsers || [];
      c.liked = identity.isLikedBy(c.likedUsers, actor);
      c.repliesCount = repliesCountMap[c._id] || 0;
      return c;
    });

    const authorIds = [...new Set(comments.map(c => c.authorId).filter(Boolean))];
    const { avatarMap } = await identity.resolveAuthorsMap(db, authorIds);
    comments.forEach(c => {
      c.authorAvatar = avatarMap[c.authorId] || '/assets/icons/default-avatar.png';
    });

    console.log('[getCommentsWithAuthors] returning comments count:', comments.length);
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
    const result = await getCommentsWithAuthors(postId, offset, limit, openId);

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
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  try {
    let authorNickname = '匿名用户';
    let authorAvatar = '';
    if (actor.user) {
      authorNickname = actor.user.nickname || '匿名用户';
      authorAvatar = actor.user.avatar || '';
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
      title: (data.title || '').trim(),
      description: data.description || '',
      location: data.location || '',
      photos,
      author: authorNickname,
      authorId: identity.writeAuthorId(actor),
      authorAvatar,
      likes: 0,
      views: 0,
      likedUsers: [],
      hidden: false,  // 默认可见
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
  const actor = await getActor(openId);
  try {
    console.log('[deletePost] id:', id, 'openId:', openId);
    if (!id) {
      return { success: false, message: '缺少帖子ID' };
    }
    const post = await postsCollection.doc(id).get();
    if (!identity.isAuthor(post.data.authorId, actor) && !actor.isAdmin) {
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
  const actor = await getActor(openId);
  console.log('[updatePost] received data:', JSON.stringify(data), 'openId:', openId);
  try {
    // 兼容三种调用格式：
    // 1. { id, updates } — 标准格式
    // 2. { postId, data: { hidden/title/... } } — profile.js toggleHidePost 调用
    // 3. { postId, hidden: true } — 前端直接传顶层字段
    const postId = data.id || data.postId;
    const updates = data.updates || data.data || (data.hidden !== undefined || data.title !== undefined ? data : undefined);

    if (!postId) {
      return { success: false, message: '缺少帖子ID' };
    }

    // 验证权限
    const post = await postsCollection.doc(postId).get();
    if (!post.data || (!identity.isAuthor(post.data.authorId, actor) && !actor.isAdmin)) {
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
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  const likeId = identity.writeLikeId(actor);
  try {
    const post = await postsCollection.doc(id).get();
    const likedUsers = post.data.likedUsers || [];
    const hasLiked = identity.isLikedBy(likedUsers, actor);

    if (hasLiked) {
      const newLikes = Math.max(0, post.data.likes - 1);
      await postsCollection.doc(id).update({
        data: {
          likes: newLikes,
          likedUsers: _.pull(likeId)
        }
      });
      return { success: true, liked: false, likes: newLikes };
    } else {
      await postsCollection.doc(id).update({
        data: {
          likes: _.inc(1),
          likedUsers: _.push(likeId)
        }
      });
      return { success: true, liked: true, likes: post.data.likes + 1 };
    }
  } catch (e) {
    console.error('[likePost] 失败:', e);
    return { success: false, message: '操作失败' };
  }
}

// 点赞/取消点赞评论
async function toggleCommentLike(data, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  const likeId = identity.writeLikeId(actor);
  try {
    const { commentId } = data;
    if (!commentId) return { success: false, message: '缺少评论ID' };

    const comment = await commentsCollection.doc(commentId).get();
    if (!comment.data) return { success: false, message: '评论不存在' };

    const likedUsers = comment.data.likedUsers || [];
    const hasLiked = identity.isLikedBy(likedUsers, actor);

    if (hasLiked) {
      const newLikes = Math.max(0, (comment.data.likes || 0) - 1);
      await commentsCollection.doc(commentId).update({
        data: {
          likes: newLikes,
          likedUsers: _.pull(likeId)
        }
      });
      return { success: true, liked: false, likes: newLikes };
    } else {
      await commentsCollection.doc(commentId).update({
        data: {
          likes: _.inc(1),
          likedUsers: _.push(likeId)
        }
      });
      return { success: true, liked: true, likes: (comment.data.likes || 0) + 1 };
    }
  } catch (e) {
    console.error('[toggleCommentLike] 失败:', e);
    return { success: false, message: '操作失败' };
  }
}

// 获取某条一级评论的所有回复（用于点击"展开"时加载完整列表）
async function getCommentReplies(data, openId) {
  const actor = await getActor(openId);
  try {
    const { commentId, offset = 0, limit = 10 } = data;
    if (!commentId) return { success: false, message: '缺少评论ID' };

    // 先查总数
    const countRes = await commentsCollection
      .where({ parentId: commentId })
      .count();
    const total = countRes.total;

    const repliesRes = await commentsCollection
      .where({ parentId: commentId })
      .orderBy('likes', 'desc')
      .skip(offset)
      .limit(limit)
      .get();

    const replies = repliesRes.data.map(r => ({
      id: r._id,
      authorId: r.authorId,
      author: r.author || '',
      content: r.content,
      likes: r.likes || 0,
      liked: identity.isLikedBy(r.likedUsers, actor),
      createdAt: r.createdAt,
      replyTo: r.replyTo || null,
      replyToAuthor: r.replyToAuthor || ''
    }));

    const authorIds = [...new Set(replies.map(r => r.authorId).filter(Boolean))];
    const { avatarMap } = await identity.resolveAuthorsMap(db, authorIds);
    replies.forEach(r => {
      r.authorAvatar = avatarMap[r.authorId] || '/assets/icons/default-avatar.png';
    });

    return { success: true, data: { replies, hasMore: offset + replies.length < total, total } };
  } catch (e) {
    console.error('[getCommentReplies] 失败:', e);
    return { success: false, message: '加载失败' };
  }
}

// 添加评论
async function addComment(data, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  try {
    let authorNickname = '匿名用户';
    if (actor.user) {
      authorNickname = actor.user.nickname || '匿名用户';
    }

    const commentData = {
      postId: data.postId,
      content: data.content,
      author: authorNickname,
      authorId: identity.writeAuthorId(actor),
      createdAt: db.serverDate(),
      likes: 0,
      likedUsers: [],
      parentId: data.parentId || null,  // 回复某条评论时传入
      replyTo: data.replyTo || null,      // 被回复的评论ID
      replyToAuthor: ''                   // 默认空；根据被回复评论类型决定是否设置
    };

    console.log('[addComment] ===== START =====');
    console.log('[addComment] data.replyTo:', data.replyTo, 'data.replyToAuthor:', data.replyToAuthor);

    // 如果有 replyTo（回复某条评论），查出被回复评论，判断是否需要设置 replyToAuthor
    if (data.replyTo) {
      try {
        const parentCommentRes = await commentsCollection.doc(data.replyTo).get();
        console.log('[addComment] parentComment found:', JSON.stringify(parentCommentRes.data));
        if (parentCommentRes.data) {
          // 只有被回复的评论本身是子评论时（parentComment.data.replyTo 有值）才有 › 引用
          console.log('[addComment] parentComment.data.replyTo:', parentCommentRes.data.replyTo);
          if (parentCommentRes.data.replyTo) {
            commentData.replyToAuthor = parentCommentRes.data.author;
            console.log('[addComment] SET replyToAuthor =', parentCommentRes.data.author);
          } else {
            console.log('[addComment] parent is top-level comment, keep replyToAuthor = empty');
          }
        }
      } catch (e) {
        console.warn('[addComment] 查被回复评论失败:', e);
      }
    } else {
      console.log('[addComment] no data.replyTo, keep replyToAuthor = empty');
    }
    console.log('[addComment] FINAL commentData.replyToAuthor:', commentData.replyToAuthor);

    const result = await commentsCollection.add({
      data: commentData
    });
    console.log('[addComment] success, commentId:', result._id, 'postId:', data.postId);

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
  const actor = await getActor(openId);
  try {
    const result = await postsCollection
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    let posts = result.data.map(post => ({
      ...normalizePost(post),
      liked: identity.isLikedBy(post.likedUsers, actor)
    }));

    const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, authorIds);
    identity.applyAuthorToPosts(posts, avatarMap, nicknameMap);


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
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '未登录', data: { posts: [], hasMore: false, total: 0 } };
  }
  const { page = 1, pageSize = 20, hidden } = params;
  const whereCond = { ...identity.authorOwnerWhere(db, actor) };
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
      liked: identity.isLikedBy(post.likedUsers, actor)
    }));

    return { success: true, data: { posts, hasMore: page * pageSize < total, total } };
  } catch (e) {
    console.error('获取我的作品失败:', e);
    return { success: false, data: { posts: [], hasMore: false, total: 0 } };
  }
}

// 获取我赞过的照片（读 posts 集合）
async function getMyLiked(openId, params = {}) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '未登录', data: { posts: [], hasMore: false, total: 0 } };
  }
  const { page = 1, pageSize = 20 } = params;
  const userId = actor.userId;
  try {
    const countResult = await postsCollection
      .where({ likedUsers: userId, hidden: false })
      .count();
    const total = countResult.total;

    const result = await postsCollection
      .where({ likedUsers: userId, hidden: false })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let posts = result.data.map(post => ({
      ...normalizePost(post),
      liked: true
    }));


    const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, authorIds);
    posts.forEach(post => {
      if (avatarMap[post.authorId]) post.authorAvatar = avatarMap[post.authorId];
      if (nicknameMap[post.authorId]) post.authorNickname = nicknameMap[post.authorId];
    });

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

      const userIds = [...new Set(allComments.data.map(c => c.authorId).filter(Boolean))];
      let userMap = {};
      if (userIds.length > 0) {
        const users = await usersCollection
          .where({ _id: _.in(userIds) })
          .field({ _id: true, avatar: true })
          .get();
        users.data.forEach(u => { userMap[u._id] = u.avatar || ''; });
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
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '未登录', data: { comments: [], hasMore: false, total: 0 } };
  }
  const { offset = 0, limit = 20 } = params;
  try {
    const query = identity.authorOwnerWhere(db, actor);
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
        .field({ _id: true, photos: true, title: true, authorId: true })
        .get();
      postsRes.data.forEach(p => { postMap[p._id] = p; });
    }

    // 批量解析评论者信息（author、authorAvatar）
    const commenterIds = [...new Set(comments.map(c => c.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, commenterIds);

    comments.forEach(c => {
      const post = postMap[c.postId];
      c.postThumb = post ? (post.photos?.[0]?.imageUrl || '') : '';
      c.postTitle = post ? (post.title || '') : '';
      c.authorAvatar = avatarMap[c.authorId] || c.authorAvatar || '';
      c.author = nicknameMap[c.authorId] || c.author || '';
      c.likes = c.likes || 0;
      c.liked = identity.isLikedBy(c.likedUsers, actor);
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
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '未登录', data: { comments: [], hasMore: false, total: 0, newCount: 0 } };
  }
  const { offset = 0, limit = 20 } = params;
  try {
    const myPostsRes = await postsCollection
      .where(identity.authorOwnerWhere(db, actor))
      .field({ _id: true })
      .get();
    const myPostIds = myPostsRes.data.map(p => p._id).filter(Boolean);

    if (myPostIds.length === 0) {
      return { success: true, data: { comments: [], hasMore: false, total: 0, newCount: 0 } };
    }

    // 只查询一级评论（parentId 为空/null）
    const query = { postId: _.in(myPostIds), parentId: _.or(_.eq(null), _.exists(false)) };
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
        .field({ _id: true, photos: true, title: true })
        .get();
      postsRes.data.forEach(p => { postMap[p._id] = p; });
    }

    const commenterIds = [...new Set(comments.map(c => c.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, commenterIds);

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const newCount = commentsRes.data.filter(c => c.createdAt && c.createdAt > dayAgo).length;

    comments.forEach(c => {
      const post = postMap[c.postId];
      c.postThumb = post ? (post.photos?.[0]?.imageUrl || '') : '';
      c.postTitle = post ? (post.title || '') : '';
      c.authorAvatar = avatarMap[c.authorId] || c.authorAvatar || '';
      c.author = nicknameMap[c.authorId] || c.author || '';
      c.likes = c.likes || 0;
      c.liked = identity.isLikedBy(c.likedUsers, actor);
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
