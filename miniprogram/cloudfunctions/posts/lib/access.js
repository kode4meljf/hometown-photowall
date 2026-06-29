const { db, postsCollection } = require('../ctx');
const identity = require('../common/identity');
const { isPublicStatus } = require('../common/postStatus');

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

module.exports = {
  getActor,
  canViewPost,
  requireReleasedPost,
  requireViewablePost,
};
