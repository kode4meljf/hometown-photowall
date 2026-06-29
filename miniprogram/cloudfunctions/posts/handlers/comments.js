const { cloud, db, _, postsCollection, commentsCollection } = require('../ctx');
const identity = require('../common/identity');
const sec = require('../openApiSecurity');
const { getActor, requireReleasedPost, requireViewablePost } = require('../lib/access');
const { normalizeOffsetLimit } = require('../lib/pagination');
const { getCommentsWithAuthors } = require('../lib/commentsQuery');
const { toggleDocumentLike } = require('../lib/like');

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
        hasMore: result.hasMore,
      },
    };
  } catch (e) {
    console.error('获取更多评论失败:', e);
    return { success: false, message: '加载失败' };
  }
}

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

    const replies = repliesRes.data.map((r) => ({
      id: r._id,
      authorId: r.authorId,
      author: r.author || '',
      content: r.content,
      likes: r.likes || 0,
      liked: identity.isLikedBy(r.likedUsers, actor),
      createdAt: r.createdAt,
      replyTo: r.replyTo || null,
      replyToAuthor: r.replyToAuthor || '',
    }));

    const authorIds = [...new Set(replies.map((r) => r.authorId).filter(Boolean))];
    const { avatarMap } = await identity.resolveAuthorsMap(db, authorIds);
    replies.forEach((r) => {
      r.authorAvatar = avatarMap[r.authorId] || '/assets/icons/default-avatar.png';
    });

    return { success: true, data: { replies, hasMore: offset + replies.length < total, total } };
  } catch (e) {
    console.error('[getCommentReplies] 失败:', e);
    return { success: false, message: '加载失败' };
  }
}

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
      parentId: data.parentId || null,
      replyTo: data.replyTo || null,
      replyToAuthor: '',
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
      data: commentData,
    });

    return {
      success: true,
      data: {
        id: result._id,
        content: data.content,
        author: authorNickname,
        createdAt: new Date(),
      },
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

    const comments = commentsRes.data.map((c) => {
      c.id = c._id;
      return c;
    });

    const postIds = [...new Set(comments.map((c) => c.postId).filter(Boolean))];
    const postMap = {};
    if (postIds.length > 0) {
      const postsRes = await postsCollection
        .where({ _id: _.in(postIds) })
        .field({ _id: true, photos: true, title: true, authorId: true })
        .get();
      postsRes.data.forEach((p) => { postMap[p._id] = p; });
    }

    const commenterIds = [...new Set(comments.map((c) => c.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, commenterIds);

    comments.forEach((c) => {
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
    const myPostIds = myPostsRes.data.map((p) => p._id).filter(Boolean);

    if (myPostIds.length === 0) {
      return { success: true, data: { comments: [], hasMore: false, total: 0, newCount: 0 } };
    }

    const query = { postId: _.in(myPostIds), parentId: _.or(_.eq(null), _.exists(false)) };
    const countResult = await commentsCollection.where(query).count();
    const total = countResult.total;

    const commentsRes = await commentsCollection
      .where(query)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(limit)
      .get();

    const comments = commentsRes.data.map((c) => {
      c.id = c._id;
      return c;
    });

    const postIds = [...new Set(comments.map((c) => c.postId).filter(Boolean))];
    const postMap = {};
    if (postIds.length > 0) {
      const postsRes = await postsCollection
        .where({ _id: _.in(postIds) })
        .field({ _id: true, photos: true, title: true })
        .get();
      postsRes.data.forEach((p) => { postMap[p._id] = p; });
    }

    const commenterIds = [...new Set(comments.map((c) => c.authorId).filter(Boolean))];
    const { avatarMap, nicknameMap } = await identity.resolveAuthorsMap(db, commenterIds);

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const newCount = commentsRes.data.filter((c) => c.createdAt && c.createdAt > dayAgo).length;

    comments.forEach((c) => {
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

module.exports = {
  getMoreComments,
  toggleCommentLike,
  getCommentReplies,
  addComment,
  deleteComment,
  getMyComments,
  getReceivedComments,
};
