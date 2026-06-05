// cloudfunctions/posts/index.js - 帖子相关云函数

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const postsCollection = db.collection('posts');
const commentsCollection = db.collection('post_comments');
const usersCollection = db.collection('users');
const identity = require('./common/identity');
const sec = require('./openApiSecurity');
const { POST_STATUS, POST_STATUS_LIST, isPublicStatus, isUserToggleableStatus, normalizePostStatus } = require('./common/postStatus');
const {
  deleteCloudFiles,
  normalizePostForClient: normalizePost,
  assertActorOwnsCloudFiles,
  assertCloudFilesExist,
  extractCloudFileIds,
  clearPhotosCloudUrls,
} = require('./common/postHelpers');
const { apiError, API_ERROR } = require('./common/apiErrors');
const mediaAudit = require('./common/mediaAudit');

const PAGE_SIZE_MAX = 50;
const PAGE_SIZE_DEFAULT = 20;

function normalizePagePagination(params = {}, defaultPageSize = PAGE_SIZE_DEFAULT) {
  const pageRaw = parseInt(params.page, 10);
  const sizeRaw = parseInt(params.pageSize, 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const pageSizeBase = Number.isFinite(sizeRaw) && sizeRaw >= 1 ? sizeRaw : defaultPageSize;
  return { page, pageSize: Math.min(pageSizeBase, PAGE_SIZE_MAX) };
}

function normalizeOffsetLimit(params = {}, defaults = { offset: 0, limit: 10 }) {
  const offsetRaw = parseInt(params.offset, 10);
  const limitRaw = parseInt(params.limit, 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : defaults.offset;
  const limitBase = Number.isFinite(limitRaw) && limitRaw >= 1 ? limitRaw : defaults.limit;
  return { offset, limit: Math.min(limitBase, PAGE_SIZE_MAX) };
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getActor(openId) {
  return identity.resolveActor(db, openId);
}

function canViewPost(post, actor) {
  if (isPublicStatus(post.status)) return true;
  if (actor.isAdmin) return true;
  if (actor.userId && identity.isAuthor(post.authorId, actor)) return true;
  return false;
}

async function requireReleasedPost(postId, actionLabel) {
  if (!postId) {
    return { ok: false, message: '缺少帖子ID' };
  }
  try {
    const res = await postsCollection.doc(postId).get();
    if (!res.data) {
      return { ok: false, message: '作品不存在' };
    }
    if (!isPublicStatus(res.data.status)) {
      return { ok: false, message: `当前作品不可${actionLabel}` };
    }
    return { ok: true, post: res.data };
  } catch (e) {
    return { ok: false, message: '作品不存在' };
  }
}

async function requireViewablePost(postId, openId) {
  if (!postId) {
    return { ok: false, message: '缺少帖子ID' };
  }
  const actor = await getActor(openId);
  try {
    const res = await postsCollection.doc(postId).get();
    if (!res.data) {
      return { ok: false, message: '作品不存在或不可见' };
    }
    if (!canViewPost(res.data, actor)) {
      return { ok: false, message: '作品不存在或不可见' };
    }
    return { ok: true, post: res.data };
  } catch (e) {
    return { ok: false, message: '作品不存在或不可见' };
  }
}

// [2026-04-25] 移除所有 cloud:// → HTTPS 转换
// 微信小程序 <image> 组件原生支持 cloud:// 协议，框架自动管理签名刷新
// 仅前端 wx.downloadFile 等场景需要 HTTPS，由前端自行转换（见 detail.js）

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
    case 'resubmit':
      return await resubmitPost(data, openId);
    case 'delete':
      return await deletePost(data.id, openId);
    case 'like':
      return await likePost(data.id, openId);
    case 'comment':
      return await addComment(data, openId);
    case 'deleteComment':
      return await deleteComment(data, openId);
    case 'locations':
      return await getLocations();
    case 'myWorks':
      return await getMyWorks(openId, data);
    case 'myLiked':
      return await getMyLiked(openId, data);
    case 'moreComments':
      return await getMoreComments(data, openId);
    case 'update':
      return await updatePost(event.data || {}, openId);
    case 'toggleCommentLike':
      return await toggleCommentLike(data, openId);
    case 'getCommentReplies':
      return await getCommentReplies(data, openId);
    case 'myComments':
      return await getMyComments(openId, data);
    case 'receivedComments':
      return await getReceivedComments(openId, data);
    case 'getShareQrCode':
      return await getShareQrCode(data);
    case 'recordShare':
      return await recordShare(data);
    case 'seedTestComments':
      return await seedTestComments(data);
    case 'devCreateTestPost':
      return await devCreateTestPost(data, openId);
    case 'devCleanupTestPosts':
      return await devCleanupTestPosts(data, openId);
    case 'devTestContentSecurity':
      return await devTestContentSecurity(data, openId);
    default:
      return { success: false, message: '未知操作' };
  }
};

const DEV_SEED_KEY = 'photowall-dev-seed';
const DEV_SEED_MARKER = 'photowall-dev-seed-v1';
const DEV_POST_MARKER = 'photowall-dev-post-v1';
const DEV_MINI_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

function assertDevKey(data) {
  return data && data.devKey === DEV_SEED_KEY;
}

/** 开发/自动化：服务端上传测试图并走完整 createPost（含内容安全） */
async function devCreateTestPost(data, openId) {
  if (!assertDevKey(data)) {
    return { success: false, message: '无权限' };
  }
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  const ts = Date.now();
  let fileID;
  try {
    const up = await cloud.uploadFile({
      cloudPath: `photos/${actor.userId}/dev-autotest-${ts}.jpg`,
      fileContent: DEV_MINI_JPEG,
    });
    fileID = up.fileID;
  } catch (e) {
    return { success: false, message: '测试图片上传失败: ' + e.message };
  }

  const title = (data.title || `[auto-test-post] 家乡测试 ${ts}`).slice(0, 80);
  const result = await createPost({
    title,
    description: data.description || '自动化轻量发帖测试，可删除',
    location: data.location || '茶村',
    photos: [{ imageUrl: fileID, width: 800, height: 600, order: 0 }],
  }, openId);

  if (result.success && result.data && result.data.id) {
    try {
      await postsCollection.doc(result.data.id).update({
        data: { _devSeedBatch: DEV_POST_MARKER },
      });
    } catch (e) {
      console.error('[devCreateTestPost] marker update failed:', e.message);
    }
  }
  return result;
}

/** 开发/自动化：删除带 dev 标记的测试帖 */
async function devCleanupTestPosts(data, openId) {
  if (!assertDevKey(data)) {
    return { success: false, message: '无权限' };
  }
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  try {
    const found = await postsCollection.where({ _devSeedBatch: DEV_POST_MARKER }).limit(50).get();
    let removed = 0;
    for (const doc of found.data) {
      const del = await deletePost(doc._id, openId);
      if (del.success) removed += 1;
    }
    return { success: true, data: { removed, total: found.data.length } };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/** 开发/自动化：独立验证内容安全 API（文本/图片）与发帖前校验 */
async function devTestContentSecurity(data, openId) {
  if (!assertDevKey(data)) {
    return { success: false, message: '无权限' };
  }
  const actor = await getActor(openId);
  const checks = [];

  const pushCheck = (name, result, expectOk = true) => {
    checks.push({
      name,
      ok: result.ok,
      message: result.message || '',
      errcode: result.errcode,
      pass: expectOk ? !!result.ok : !result.ok,
    });
  };

  pushCheck('text_empty', await sec.checkText(cloud, openId, { content: '', scene: sec.SCENE.COMMENT }));
  pushCheck(
    'text_benign_social',
    await sec.checkText(cloud, openId, {
      content: '家乡的茶园风景很好',
      scene: sec.SCENE.SOCIAL,
      title: '测试标题',
    })
  );
  pushCheck(
    'text_benign_comment',
    await sec.checkText(cloud, openId, {
      content: '拍得真好看',
      scene: sec.SCENE.COMMENT,
      nickname: actor.user?.nickname || '测试用户',
    })
  );

  if (actor.userId && openId) {
    let fileID;
    try {
      const up = await cloud.uploadFile({
        cloudPath: `photos/${actor.userId}/dev-sec-${Date.now()}.jpg`,
        fileContent: DEV_MINI_JPEG,
      });
      fileID = up.fileID;
      const img = await sec.checkImages(cloud, openId, [fileID], sec.SCENE.SOCIAL);
      checks.push({
        name: 'image_benign',
        ok: img.ok,
        message: img.message || '',
        pass: !!img.ok,
        needsReview: !!img.needsReview,
      });
    } catch (e) {
      checks.push({
        name: 'image_benign',
        ok: false,
        message: e.message,
        pass: false,
      });
    } finally {
      if (fileID) {
        await cloud.deleteFile({ fileList: [fileID] }).catch(() => {});
      }
    }
  } else {
    checks.push({
      name: 'image_benign',
      ok: false,
      message: '未登录或无 openId',
      pass: false,
      skipped: true,
    });
  }

  const rejectTitle = await createPost(
    { title: '  ', photos: [{ imageUrl: 'cloud://invalid', width: 1, height: 1 }] },
    openId
  );
  checks.push({
    name: 'create_reject_empty_title',
    ok: !rejectTitle.success,
    message: rejectTitle.message || '',
    pass: !rejectTitle.success && (rejectTitle.message || '').includes('标题'),
  });

  const rejectPhotos = await createPost({ title: '测试无图', photos: [] }, openId);
  checks.push({
    name: 'create_reject_no_photos',
    ok: !rejectPhotos.success,
    message: rejectPhotos.message || '',
    pass: !rejectPhotos.success && (rejectPhotos.message || '').includes('图片'),
  });

  return {
    success: true,
    data: {
      openIdPresent: !!openId,
      userId: actor.userId || null,
      checks,
    },
  };
}

/** 开发/自动化测试：为帖子写入 30 条评论（含楼中楼），可重复执行 */
async function seedTestComments(data) {
  const { postId, devKey } = data || {};
  if (devKey !== DEV_SEED_KEY) {
    return { success: false, message: '无权限' };
  }
  if (!postId) {
    return { success: false, message: '缺少 postId' };
  }
  const gate = await requireReleasedPost(postId, '写入测试评论');
  if (!gate.ok) {
    return { success: false, message: gate.message };
  }

  try {
    const oldRes = await commentsCollection
      .where({ postId, _devSeedBatch: DEV_SEED_MARKER })
      .get();
    for (const doc of oldRes.data) {
      await commentsCollection.doc(doc._id).remove();
    }

    const authors = ['阿茶', '老根', '村民甲', '摄影人', '回乡客'];
    const topCount = 18;
    const replyCount = 12;
    const topIds = [];
    const replyIds = [];
    const baseTs = Date.now() - topCount * 120000;

    for (let i = 0; i < topCount; i++) {
      const addRes = await commentsCollection.add({
        data: {
          postId,
          content: `测试主评论 ${i + 1}：这条评论用于详情页验收`,
          author: authors[i % authors.length],
          authorId: `dev_seed_user_${i % authors.length}`,
          createdAt: new Date(baseTs + i * 120000),
          likes: (i * 3) % 17,
          likedUsers: [],
          parentId: null,
          replyTo: null,
          replyToAuthor: '',
          _devSeedBatch: DEV_SEED_MARKER,
        },
      });
      topIds.push(addRes._id);
    }

    for (let i = 0; i < replyCount; i++) {
      const parentId = topIds[i % topIds.length];
      let replyTo = parentId;
      let replyToAuthor = '';
      if (i >= 6 && replyIds.length > 0) {
        replyTo = replyIds[i % replyIds.length];
        replyToAuthor = authors[i % authors.length];
      }
      const addRes = await commentsCollection.add({
        data: {
          postId,
          content: `测试回复 ${i + 1}：同意，拍得很好`,
          author: authors[(i + 2) % authors.length],
          authorId: `dev_seed_reply_${i % authors.length}`,
          createdAt: new Date(baseTs + (topCount + i) * 60000),
          likes: i % 5,
          likedUsers: [],
          parentId,
          replyTo,
          replyToAuthor,
          _devSeedBatch: DEV_SEED_MARKER,
        },
      });
      replyIds.push(addRes._id);
    }

    const cntRes = await commentsCollection.where({ postId }).count();
    return {
      success: true,
      data: {
        inserted: topCount + replyCount,
        totalOnPost: cntRes.total || 0,
        topLevel: topCount,
        replies: replyCount,
      },
    };
  } catch (e) {
    console.error('[seedTestComments]', e);
    return { success: false, message: '写入失败' };
  }
}

// 获取照片列表（读 posts 集合）
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
  ({ offset, limit } = normalizeOffsetLimit({ offset, limit }, { offset: 0, limit: 10 }));
  const actor = await getActor(openId);
  try {
    // 只返回一级评论（parentId 为空/null），按热度排序
    const query = { postId, parentId: _.or(_.eq(null), _.exists(false)) };
    const countResult = await commentsCollection.where(query).count();
    const total = countResult.total;

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
    const gate = await requireViewablePost(postId, openId);
    if (!gate.ok) {
      return { success: false, message: gate.message };
    }
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

function normalizePhotosInput(rawPhotos) {
  return (rawPhotos || []).map((p, idx) => ({
    imageUrl: p.imageUrl || '',
    width: parseInt(p.width, 10) || 1,
    height: parseInt(p.height, 10) || 1,
    order: p.order !== undefined ? p.order : idx,
  })).filter((p) => p.imageUrl);
}

async function rejectExistingPost(postId, addData, fileIds, reason, code) {
  await deleteCloudFiles(cloud, fileIds);
  await postsCollection.doc(postId).update({
    data: {
      status: POST_STATUS.REJECTED,
      photos: clearPhotosCloudUrls(addData.photos),
      imageRemoved: true,
      reviewAdminNote: reason || '',
      rejectedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return apiError(code || API_ERROR.POST_REJECTED, {
    message: reason,
    data: { id: postId, status: POST_STATUS.REJECTED },
  });
}

async function persistRejectedPost(addData, fileIds, reason, code) {
  const data = {
    ...addData,
    status: POST_STATUS.REJECTED,
    photos: clearPhotosCloudUrls(addData.photos),
    imageRemoved: true,
    reviewAdminNote: reason || '',
    rejectedAt: db.serverDate(),
    updatedAt: db.serverDate(),
  };
  const result = await postsCollection.add({ data });
  await deleteCloudFiles(cloud, fileIds);
  return apiError(code || API_ERROR.POST_REJECTED, {
    message: reason,
    data: { id: result._id, status: POST_STATUS.REJECTED },
  });
}

async function validateSubmitPhotos(photos, actor, { previousPost } = {}) {
  const normalized = normalizePhotosInput(photos);
  if (!normalized.length) {
    return { ok: false, response: apiError(API_ERROR.IMAGE_NOT_RESELECTED) };
  }
  const fileIds = normalized.map((p) => p.imageUrl);
  const ownedCheck = assertActorOwnsCloudFiles(fileIds, actor);
  if (!ownedCheck.ok) {
    return {
      ok: false,
      response: apiError(API_ERROR.IMAGE_INVALID, { message: ownedCheck.message }),
    };
  }
  if (
    previousPost
    && (previousPost.imageRemoved
      || previousPost.status === POST_STATUS.REJECTED
      || previousPost.status === 'failed')
  ) {
    const oldIds = extractCloudFileIds(previousPost.photos);
    for (let i = 0; i < fileIds.length; i++) {
      if (oldIds.includes(fileIds[i])) {
        return { ok: false, response: apiError(API_ERROR.IMAGE_INVALID) };
      }
    }
  }
  const existCheck = await assertCloudFilesExist(cloud, fileIds);
  if (!existCheck.ok) {
    return { ok: false, response: apiError(existCheck.code || API_ERROR.IMAGE_INVALID) };
  }
  return { ok: true, photos: normalized, fileIds };
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

    const title = (data.title || '').trim();
    if (!title) {
      return { success: false, message: '请填写标题' };
    }
    const description = (data.description || '').trim();
    const location = (data.location || '').trim();

    const textCheck = await sec.checkTexts(cloud, openId, [
      { content: title, scene: sec.SCENE.SOCIAL, title },
      { content: description, scene: sec.SCENE.SOCIAL },
      { content: location, scene: sec.SCENE.SOCIAL },
    ]);
    if (!textCheck.ok) {
      const draftPhotos = normalizePhotosInput(data.photos);
      const draftFileIds = extractCloudFileIds(draftPhotos);
      if (draftPhotos.length) {
        return persistRejectedPost(
          {
            title,
            description,
            location,
            photos: draftPhotos,
            author: authorNickname,
            authorId: identity.writeAuthorId(actor),
            authorAvatar,
            likes: 0,
            views: 0,
            likedUsers: [],
            createdAt: db.serverDate(),
          },
          draftFileIds,
          textCheck.message,
          textCheck.code || API_ERROR.POST_REJECTED
        );
      }
      return { success: false, message: textCheck.message, code: textCheck.code };
    }

    const photoCheck = await validateSubmitPhotos(data.photos, actor);
    if (!photoCheck.ok) {
      return photoCheck.response;
    }
    const photos = photoCheck.photos;

    const addData = {
      title,
      description,
      location,
      photos,
      author: authorNickname,
      authorId: identity.writeAuthorId(actor),
      authorAvatar,
      likes: 0,
      views: 0,
      likedUsers: [],
      status: POST_STATUS.REVIEWING,
      createdAt: db.serverDate(),
    };

    const fileIds = extractCloudFileIds(photos);

    const result = await postsCollection.add({ data: addData });
    const postId = result._id;

    let imageCheck = { ok: true, needsReview: false, mediaTraceEntries: [] };
    if (fileIds.length) {
      imageCheck = await sec.checkImages(cloud, openId, fileIds, sec.SCENE.SOCIAL);
      if (!imageCheck.ok) {
        return rejectExistingPost(
          postId,
          addData,
          fileIds,
          imageCheck.message,
          imageCheck.code || API_ERROR.POST_REJECTED
        );
      }
    }

    if (imageCheck.needsReview && imageCheck.mediaTraceEntries && imageCheck.mediaTraceEntries.length) {
      await postsCollection.doc(postId).update({
        data: {
          mediaTraceIds: imageCheck.mediaTraceIds || [],
          mediaAuditBatch: 1,
          mediaPendingCount: imageCheck.mediaTraceEntries.length,
          updatedAt: db.serverDate(),
        },
      });
      try {
        await mediaAudit.createAuditTasks(db, {
          postId,
          auditBatch: 1,
          entries: imageCheck.mediaTraceEntries,
        });
      } catch (e) {
        console.error('[createPost] createAuditTasks failed:', e.message);
      }
      return {
        success: true,
        data: { id: postId, status: POST_STATUS.REVIEWING },
        message: '作品已提交，审核通过后将展示在首页',
      };
    }

    await postsCollection.doc(postId).update({
      data: {
        status: POST_STATUS.RELEASED,
        mediaPendingCount: 0,
        updatedAt: db.serverDate(),
      },
    });
    return { success: true, data: { id: postId, status: POST_STATUS.RELEASED } };
  } catch (e) {
    console.error('[createPost] 失败:', e.message, e.stack);
    const raw = e && e.message ? String(e.message) : '';
    if (/imgSecCheck|mediaCheckAsync|87014|risky content/i.test(raw)) {
      return { success: false, message: sec.IMAGE_BLOCK_MSG, code: 'image_block' };
    }
    if (/msgSecCheck/i.test(raw)) {
      return { success: false, message: sec.BLOCK_MSG, code: 'text_block' };
    }
    return { success: false, message: '发布失败，请稍后重试' };
  }
}

async function applyResubmitRejected(postId, attemptedPhotos, fileIds, reason, code) {
  await deleteCloudFiles(cloud, fileIds);
  await postsCollection.doc(postId).update({
    data: {
      status: POST_STATUS.REJECTED,
      photos: clearPhotosCloudUrls(attemptedPhotos),
      imageRemoved: true,
      reviewAdminNote: reason || '',
      rejectedAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return apiError(code || API_ERROR.POST_REJECTED, {
    message: reason,
    data: { id: postId, status: POST_STATUS.REJECTED },
  });
}

// 驳回作品重新提交：更新同一条记录，status 一律变为 reviewing
async function resubmitPost(data, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }

  const postId = data.postId || data.id;
  if (!postId) {
    return { success: false, message: '缺少作品信息' };
  }

  try {
    const postResult = await postsCollection.doc(postId).get();
    const post = postResult.data;
    if (!post) {
      return { success: false, message: '作品不存在' };
    }
    if (!identity.isAuthor(post.authorId, actor)) {
      return { success: false, message: '无权操作' };
    }
    if (normalizePostStatus(post.status) !== POST_STATUS.REJECTED) {
      return { success: false, message: '当前状态不可重新提交' };
    }

    const title = (data.title || '').trim();
    if (!title) {
      return { success: false, message: '请填写标题' };
    }
    const description = (data.description || '').trim();
    const location = (data.location || '').trim();

    const textCheck = await sec.checkTexts(cloud, openId, [
      { content: title, scene: sec.SCENE.SOCIAL, title },
      { content: description, scene: sec.SCENE.SOCIAL },
      { content: location, scene: sec.SCENE.SOCIAL },
    ]);
    if (!textCheck.ok) {
      const draftPhotos = normalizePhotosInput(data.photos);
      const draftFileIds = extractCloudFileIds(draftPhotos);
      if (draftPhotos.length) {
        return applyResubmitRejected(
          postId,
          draftPhotos,
          draftFileIds,
          textCheck.message,
          textCheck.code || API_ERROR.POST_REJECTED
        );
      }
      return { success: false, message: textCheck.message, code: textCheck.code };
    }

    const photoCheck = await validateSubmitPhotos(data.photos, actor, { previousPost: post });
    if (!photoCheck.ok) {
      return photoCheck.response;
    }
    const photos = photoCheck.photos;
    const newFileIds = photoCheck.fileIds;

    const imageCheck = await sec.checkImages(cloud, openId, newFileIds, sec.SCENE.SOCIAL);
    if (!imageCheck.ok) {
      return applyResubmitRejected(
        postId,
        photos,
        newFileIds,
        imageCheck.message,
        imageCheck.code || API_ERROR.POST_REJECTED
      );
    }

    const oldFileIds = extractCloudFileIds(post.photos);
    const removedFileIds = oldFileIds.filter((id) => !newFileIds.includes(id));

    const nextAuditBatch = (post.mediaAuditBatch || 0) + 1;
    const traceEntries = imageCheck.mediaTraceEntries || [];

    const updateData = {
      title,
      description,
      location,
      photos,
      status: POST_STATUS.REVIEWING,
      imageRemoved: false,
      mediaTraceIds: imageCheck.mediaTraceIds || [],
      mediaAuditBatch: nextAuditBatch,
      mediaPendingCount: traceEntries.length,
      updatedAt: db.serverDate(),
    };

    await postsCollection.doc(postId).update({ data: updateData });
    if (removedFileIds.length) {
      await deleteCloudFiles(cloud, removedFileIds);
    }

    if (traceEntries.length) {
      try {
        await mediaAudit.createAuditTasks(db, {
          postId,
          auditBatch: nextAuditBatch,
          entries: traceEntries,
        });
      } catch (e) {
        console.error('[resubmitPost] createAuditTasks failed:', e.message);
      }
      return {
        success: true,
        message: '已提交审核，通过后将展示在首页',
        data: { id: postId, status: POST_STATUS.REVIEWING },
      };
    }

    await postsCollection.doc(postId).update({
      data: {
        status: POST_STATUS.RELEASED,
        mediaPendingCount: 0,
        mediaAuditResolvedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });
    return {
      success: true,
      message: '发布成功',
      data: { id: postId, status: POST_STATUS.RELEASED },
    };
  } catch (e) {
    console.error('[resubmitPost] 失败:', e.message, e.stack);
    const raw = e && e.message ? String(e.message) : '';
    if (/imgSecCheck|mediaCheckAsync|87014|risky content/i.test(raw)) {
      return { success: false, message: sec.IMAGE_BLOCK_MSG, code: 'image_block' };
    }
    if (/msgSecCheck/i.test(raw)) {
      return { success: false, message: sec.BLOCK_MSG, code: 'text_block' };
    }
    return { success: false, message: '提交失败，请稍后重试' };
  }
}

// 删除帖子（从 posts 集合删除，同时删除关联评论）
async function deletePost(id, openId) {
  const actor = await getActor(openId);
  try {
    if (!id) {
      return { success: false, message: '缺少帖子ID' };
    }
    const post = await postsCollection.doc(id).get();
    if (!identity.isAuthor(post.data.authorId, actor) && !actor.isAdmin) {
      return { success: false, message: '无权删除' };
    }

    const fileIds = (post.data.photos || [])
      .map((p) => p.imageUrl)
      .filter((url) => url && url.startsWith('cloud://'));
    if (fileIds.length) {
      await deleteCloudFiles(cloud, fileIds);
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
  try {
    // 兼容三种调用格式：
    // 1. { id, updates } — 标准格式
    // 2. { postId, data: { status/title/... } } — profile.js toggleHidePost 调用
    // 3. { postId, status: 'hidden' } — 前端直接传顶层字段
    const postId = data.id || data.postId;
    const updates = data.updates || data.data || (data.status !== undefined || data.title !== undefined ? data : undefined);

    if (!postId) {
      return { success: false, message: '缺少帖子ID' };
    }

    // 验证权限
    const post = await postsCollection.doc(postId).get();
    if (!post.data || (!identity.isAuthor(post.data.authorId, actor) && !actor.isAdmin)) {
      return { success: false, message: '无权编辑' };
    }

    const titleDescUpdate =
      updates &&
      (updates.title !== undefined || updates.description !== undefined);
    if (titleDescUpdate) {
      const createdAt = post.data.createdAt;
      const createdTs = createdAt ? new Date(createdAt).getTime() : 0;
      const monthMs = 30 * 24 * 60 * 60 * 1000;
      if (!createdTs || Date.now() - createdTs >= monthMs) {
        return {
          success: false,
          message: '发布超过一个月的作品不可修改标题和描述',
        };
      }
    }

    // 只允许更新特定字段
    const allowedFields = ['title', 'description', 'location', 'status'];
    const updateData = {};
    for (const field of allowedFields) {
      if (updates && updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, message: '没有可更新的字段' };
    }

    if (updateData.status !== undefined) {
      if (!POST_STATUS_LIST.includes(updateData.status)) {
        return { success: false, message: '无效的状态' };
      }
      const currentStatus = post.data.status;
      if (!actor.isAdmin) {
        const canToggle = isUserToggleableStatus(currentStatus)
          && isUserToggleableStatus(updateData.status);
        if (!canToggle) {
          return { success: false, message: '当前状态不可修改' };
        }
      }
    }

    const textItems = [];
    if (updateData.title !== undefined) {
      textItems.push({
        content: updateData.title,
        scene: sec.SCENE.SOCIAL,
        title: updateData.title,
      });
    }
    if (updateData.description !== undefined) {
      textItems.push({ content: updateData.description, scene: sec.SCENE.SOCIAL });
    }
    if (updateData.location !== undefined) {
      textItems.push({ content: updateData.location, scene: sec.SCENE.SOCIAL });
    }
    if (textItems.length) {
      const textCheck = await sec.checkTexts(cloud, openId, textItems);
      if (!textCheck.ok) {
        return { success: false, message: textCheck.message };
      }
    }

    await postsCollection.doc(postId).update({ data: updateData });
    return { success: true };
  } catch (e) {
    console.error('[updatePost] 失败:', e.message, e.stack);
    return { success: false, message: '更新失败: ' + e.message };
  }
}

// 点赞/取消点赞：事务内读改写，避免并发计数漂移
const LIKE_TX_MAX_RETRY = 3;

async function toggleDocumentLike(collectionName, docId, likeId) {
  let lastError;
  for (let attempt = 0; attempt < LIKE_TX_MAX_RETRY; attempt += 1) {
    try {
      let outcome;
      await db.runTransaction(async (transaction) => {
        const snap = await transaction.collection(collectionName).doc(docId).get();
        if (!snap.data) {
          outcome = { ok: false, message: '记录不存在' };
          return;
        }
        const doc = snap.data;
        const likedUsers = doc.likedUsers || [];
        const hasLiked = likedUsers.includes(likeId);
        const currentLikes = doc.likes || 0;
        if (hasLiked) {
          const newLikes = Math.max(0, currentLikes - 1);
          await transaction.collection(collectionName).doc(docId).update({
            data: {
              likes: newLikes,
              likedUsers: _.pull(likeId),
            },
          });
          outcome = { ok: true, liked: false, likes: newLikes };
        } else {
          await transaction.collection(collectionName).doc(docId).update({
            data: {
              likes: _.inc(1),
              likedUsers: _.push(likeId),
            },
          });
          outcome = { ok: true, liked: true, likes: currentLikes + 1 };
        }
      });
      if (outcome) {
        if (!outcome.ok) {
          return { success: false, message: outcome.message };
        }
        return { success: true, liked: outcome.liked, likes: outcome.likes };
      }
    } catch (e) {
      lastError = e;
    }
  }
  console.error('[toggleDocumentLike] 失败:', lastError);
  return { success: false, message: '操作失败' };
}

// 点赞帖子
async function likePost(id, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  const gate = await requireReleasedPost(id, '点赞');
  if (!gate.ok) {
    return { success: false, message: gate.message };
  }
  const likeId = identity.writeLikeId(actor);
  return toggleDocumentLike('posts', id, likeId);
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

    const postGate = await requireReleasedPost(comment.data.postId, '点赞');
    if (!postGate.ok) {
      return { success: false, message: postGate.message };
    }

    return toggleDocumentLike('post_comments', commentId, likeId);
  } catch (e) {
    console.error('[toggleCommentLike] 失败:', e);
    return { success: false, message: '操作失败' };
  }
}

// 获取某条一级评论的所有回复（用于点击"展开"时加载完整列表）
async function getCommentReplies(data, openId) {
  const actor = await getActor(openId);
  try {
    const { commentId } = data;
    const { offset, limit } = normalizeOffsetLimit(data, { offset: 0, limit: 10 });
    if (!commentId) return { success: false, message: '缺少评论ID' };

    const parentComment = await commentsCollection.doc(commentId).get();
    if (!parentComment.data) {
      return { success: false, message: '评论不存在' };
    }
    const gate = await requireViewablePost(parentComment.data.postId, openId);
    if (!gate.ok) {
      return { success: false, message: gate.message };
    }

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
    const gate = await requireReleasedPost(data.postId, '评论');
    if (!gate.ok) {
      return { success: false, message: gate.message };
    }

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

    if (data.replyTo) {
      try {
        const parentCommentRes = await commentsCollection.doc(data.replyTo).get();
        if (parentCommentRes.data) {
          if (parentCommentRes.data.replyTo) {
            commentData.replyToAuthor = parentCommentRes.data.author;
          }
        }
      } catch (e) {
        console.error('[addComment] 查被回复评论失败:', e);
      }
    }

    const textCheck = await sec.checkText(cloud, openId, {
      content: data.content,
      scene: sec.SCENE.COMMENT,
      nickname: authorNickname,
    });
    if (!textCheck.ok) {
      return { success: false, message: textCheck.message };
    }

    const result = await commentsCollection.add({
      data: commentData
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

async function deleteComment(data, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }

  const commentId = data.commentId || data.id;
  if (!commentId) {
    return { success: false, message: '缺少评论ID' };
  }

  try {
    const commentRes = await commentsCollection.doc(commentId).get();
    const comment = commentRes.data;
    if (!comment) {
      return { success: false, message: '评论不存在' };
    }
    if (!identity.isAuthor(comment.authorId, actor) && !actor.isAdmin) {
      return { success: false, message: '无权删除' };
    }

    let removed = 1;
    if (!comment.parentId) {
      const repliesRes = await commentsCollection.where({ parentId: commentId }).get();
      removed += repliesRes.data.length;
      for (const reply of repliesRes.data) {
        await commentsCollection.doc(reply._id).remove();
      }
    }

    await commentsCollection.doc(commentId).remove();

    return { success: true, data: { removed } };
  } catch (e) {
    console.error('[deleteComment] 失败:', e);
    return { success: false, message: '删除失败' };
  }
}

// 获取地点列表（从 posts 集合）
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

    const locations = [...new Set(result.data.map(p => p.location).filter(l => l))];
    return { success: true, data: locations };
  } catch (e) {
    return { success: false, data: [] };
  }
}

// 获取我的作品（读 posts 集合）
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

    let posts = result.data.map((post) => ({
      ...normalizePost({ ...post, status: normalizePostStatus(post.status) }),
      liked: identity.isLikedBy(post.likedUsers, actor),
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

// 获取我发出的评论
async function getMyComments(openId, params = {}) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '未登录', data: { comments: [], hasMore: false, total: 0 } };
  }
  const { offset, limit } = normalizeOffsetLimit(params, { offset: 0, limit: 20 });
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

// 分享海报用小程序码
async function recordShare(data = {}) {
  const postId = data.postId || data.id;
  if (!postId) {
    return { success: false, message: '缺少帖子ID' };
  }
  const guard = await requireReleasedPost(postId, '分享');
  if (!guard.ok) {
    return { success: false, message: guard.message };
  }
  try {
    await postsCollection.doc(postId).update({
      data: { shares: _.inc(1) },
    });
    const updated = await postsCollection.doc(postId).field({ shares: true }).get();
    return {
      success: true,
      data: { shares: updated.data?.shares || 0 },
    };
  } catch (e) {
    console.error('[recordShare] failed:', e);
    return { success: false, message: '记录分享失败' };
  }
}

async function getShareQrCode(params = {}) {
  const { postId, photoIndex = 0 } = params || {};
  if (!postId) {
    return { success: false, message: '缺少帖子ID' };
  }

  const guard = await requireReleasedPost(postId, '分享');
  if (!guard.ok) {
    return { success: false, message: guard.message };
  }

  const idx = Number.isFinite(Number(photoIndex)) && Number(photoIndex) > 0
    ? Math.floor(Number(photoIndex))
    : 0;
  const scene = idx > 0
    ? `${postId},${idx}`.slice(0, 32)
    : String(postId).slice(0, 32);

  try {
    const res = await cloud.openapi.wxacode.getUnlimited({
      scene,
      page: 'pages/index/index',
      checkPath: false,
      width: 280,
    });
    return {
      success: true,
      data: { qrBase64: res.buffer.toString('base64') },
    };
  } catch (e) {
    console.error('[getShareQrCode] failed:', e);
    return { success: false, message: '小程序码生成失败' };
  }
}

// 获取我收到的评论（别人在我的帖子下的评论）
async function getReceivedComments(openId, params = {}) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '未登录', data: { comments: [], hasMore: false, total: 0, newCount: 0 } };
  }
  const { offset, limit } = normalizeOffsetLimit(params, { offset: 0, limit: 20 });
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
