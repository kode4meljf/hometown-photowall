const { db, _, postsCollection, commentsCollection } = require('../ctx');
const identity = require('../common/identity');
const { POST_STATUS, POST_STATUS_LIST, normalizePostStatus } = require('../common/postStatus');
const { normalizePostForClient: normalizePost } = require('../common/postHelpers');
const { getActor, canViewPost } = require('../lib/access');
const { normalizePagePagination, escapeRegExp } = require('../lib/pagination');
const { getCommentsWithAuthors } = require('../lib/commentsQuery');

async function getPosts(params, openId) {
  try {
    const actor = await getActor(openId);
    const { location, keyword, sort = 'latest' } = params;
    const { page, pageSize } = normalizePagePagination(params);
    const conditions = { status: POST_STATUS.RELEASED };
    if (location) conditions.location = location;
    const keywordTrimmed = (keyword || '').trim();
    if (keywordTrimmed) {
      conditions.title = db.RegExp({
        regexp: escapeRegExp(keywordTrimmed),
        options: 'i',
      });
    }

    const orderBy = sort === 'likes' ? 'likes' : sort === 'views' ? 'views' : 'createdAt';

    const totalResult = await postsCollection.where(conditions).count();
    const total = totalResult.total;

    const result = await postsCollection
      .where(conditions)
      .orderBy(orderBy, 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let posts = result.data.map((post) => ({
      ...normalizePost(post),
      liked: identity.isLikedBy(post.likedUsers, actor),
    }));

    const authorIds = [...new Set(posts.map((p) => p.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, authorIds);
    identity.applyAuthorToPosts(posts, avatarMap, nicknameMap);

    return {
      success: true,
      data: {
        posts,
        hasMore: page * pageSize < total,
        total,
      },
    };
  } catch (e) {
    console.error('获取照片列表失败:', e);
    return { success: false, message: '获取失败' };
  }
}

async function getPostDetail(id, openId) {
  const actor = await getActor(openId);
  try {
    const postResult = await postsCollection.doc(id).get();
    const post = postResult.data;
    if (!post) {
      return { success: false, message: '作品不存在或不可见' };
    }
    if (!canViewPost(post, actor)) {
      return { success: false, message: '作品不存在或不可见' };
    }

    await postsCollection.doc(id).update({
      data: { views: _.inc(1) },
    }).catch(() => {});

    post.liked = identity.isLikedBy(post.likedUsers, actor);
    Object.assign(post, normalizePost(post));

    if (post.authorId) {
      const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, [post.authorId]);
      if (avatarMap[post.authorId]) post.authorAvatar = avatarMap[post.authorId];
      if (nicknameMap[post.authorId]) post.author = nicknameMap[post.authorId];
    }

    const commentsData = await getCommentsWithAuthors(id, 0, 20, openId);
    let allCommentsCount = 0;
    try {
      const cntRes = await commentsCollection.where({ postId: id }).count();
      allCommentsCount = cntRes.total || 0;
    } catch (e) {
      // ignore count failure
    }

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
        canDelete,
      },
    };
  } catch (e) {
    console.error('获取照片详情失败:', e);
    return { success: false, message: '获取失败' };
  }
}

async function getLocations() {
  try {
    const result = await postsCollection
      .where({
        location: _.neq(''),
        status: POST_STATUS.RELEASED,
      })
      .field({ location: true })
      .limit(100)
      .get();

    const locations = [...new Set(result.data.map((p) => p.location).filter((l) => l))];
    return { success: true, data: locations };
  } catch (e) {
    return { success: false, data: [] };
  }
}

async function getMyWorks(openId, params = {}) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '未登录', data: { posts: [], hasMore: false, total: 0 } };
  }
  const { status } = params;
  const { page, pageSize } = normalizePagePagination(params);
  const whereCond = { ...identity.authorOwnerWhere(db, actor) };
  if (status && POST_STATUS_LIST.includes(status)) {
    if (status === POST_STATUS.REJECTED) {
      whereCond.status = _.in([POST_STATUS.REJECTED, 'failed']);
    } else {
      whereCond.status = status;
    }
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

    const posts = result.data.map((post) => ({
      ...normalizePost({ ...post, status: normalizePostStatus(post.status) }),
      liked: identity.isLikedBy(post.likedUsers, actor),
    }));

    return { success: true, data: { posts, hasMore: page * pageSize < total, total } };
  } catch (e) {
    console.error('获取我的作品失败:', e);
    return { success: false, data: { posts: [], hasMore: false, total: 0 } };
  }
}

async function getMyLiked(openId, params = {}) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '未登录', data: { posts: [], hasMore: false, total: 0 } };
  }
  const { page, pageSize } = normalizePagePagination(params);
  const userId = actor.userId;
  try {
    const countResult = await postsCollection
      .where({ likedUsers: userId, status: POST_STATUS.RELEASED })
      .count();
    const total = countResult.total;

    const result = await postsCollection
      .where({ likedUsers: userId, status: POST_STATUS.RELEASED })
      .orderBy('createdAt', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let posts = result.data.map((post) => ({
      ...normalizePost(post),
      liked: true,
    }));

    const authorIds = [...new Set(posts.map((p) => p.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, authorIds);
    posts.forEach((post) => {
      if (avatarMap[post.authorId]) post.authorAvatar = avatarMap[post.authorId];
      if (nicknameMap[post.authorId]) post.authorNickname = nicknameMap[post.authorId];
    });

    return { success: true, data: { posts, hasMore: page * pageSize < total, total } };
  } catch (e) {
    console.error('获取赞过的照片失败:', e);
    return { success: false, data: { posts: [], hasMore: false, total: 0 } };
  }
}

module.exports = {
  getPosts,
  getPostDetail,
  getLocations,
  getMyWorks,
  getMyLiked,
};
