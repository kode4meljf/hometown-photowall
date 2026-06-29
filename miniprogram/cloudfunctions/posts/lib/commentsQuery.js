const { db, _, commentsCollection } = require('../ctx');
const identity = require('../common/identity');
const { getActor } = require('./access');
const { normalizeOffsetLimit } = require('./pagination');

async function getCommentsWithAuthors(postId, offset = 0, limit = 10, openId) {
  ({ offset, limit } = normalizeOffsetLimit({ offset, limit }, { offset: 0, limit: 10 }));
  const actor = await getActor(openId);
  try {
    const query = { postId, parentId: _.or(_.eq(null), _.exists(false)) };
    const countResult = await commentsCollection.where(query).count();
    const total = countResult.total;

    const commentsResult = await commentsCollection
      .where(query)
      .orderBy('likes', 'desc')
      .skip(offset)
      .limit(limit)
      .get();

    const topCommentIds = commentsResult.data
      .filter((c) => !c.parentId)
      .map((c) => c._id);
    const repliesCountMap = {};
    if (topCommentIds.length > 0) {
      const repliesRes = await commentsCollection
        .where({ parentId: _.in(topCommentIds) })
        .field({ parentId: true, likes: true, likedUsers: true, authorId: true, author: true, authorAvatar: true, content: true, createdAt: true, replyTo: true, replyToAuthor: true })
        .get();

      const repliesMap = {};
      repliesRes.data.forEach((r) => {
        if (!repliesMap[r.parentId]) repliesMap[r.parentId] = [];
        repliesMap[r.parentId].push(r);
      });
      Object.keys(repliesMap).forEach((pid) => {
        repliesMap[pid].sort((a, b) => (b.likes || 0) - (a.likes || 0));
        repliesCountMap[pid] = repliesMap[pid].length;
      });

      commentsResult.data.forEach((c) => {
        if (!c.parentId) {
          c.replies = [];
          c.repliesCount = repliesCountMap[c._id] || 0;
          c._hasReplies = (repliesCountMap[c._id] || 0) > 0;
        }
      });
    }

    const comments = commentsResult.data.map((c) => {
      c.id = c._id;
      c.likes = c.likes || 0;
      c.likedUsers = c.likedUsers || [];
      c.liked = identity.isLikedBy(c.likedUsers, actor);
      c.repliesCount = repliesCountMap[c._id] || 0;
      return c;
    });

    const authorIds = [...new Set(comments.map((c) => c.authorId).filter(Boolean))];
    const { avatarMap } = await identity.resolveAuthorsMap(db, authorIds);
    comments.forEach((c) => {
      c.authorAvatar = avatarMap[c.authorId] || '/assets/icons/default-avatar.png';
    });

    return { comments, hasMore: offset + limit < total, total };
  } catch (e) {
    console.error('查询评论失败:', e);
    return { comments: [], hasMore: false, total: 0 };
  }
}

module.exports = {
  getCommentsWithAuthors,
};
