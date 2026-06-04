// cloudfunctions/feedback/index.js - 用户意见反馈
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const feedbackCollection = db.collection('feedbacks');
const commentsCollection = db.collection('post_comments');
const postsCollection = db.collection('posts');
const identity = require('./common/identity');
const sec = require('./common/contentSecurity');
const { REPORT_REASONS, REPORT_DETAIL_MAX } = require('./common/reportReasons');

const CONTENT_MIN = 5;
const CONTENT_MAX = 500;
const CONTACT_MAX = 80;

function authorNicknameFromActor(actor) {
  if (!actor.user) return '游客';
  return actor.user.nickname || actor.user.username || '用户';
}

async function submitFeedback(data, openId) {
  const content = (data.content || '').trim();
  const contact = (data.contact || '').trim();

  if (!content) {
    return { success: false, message: '请输入反馈内容' };
  }
  if (content.length < CONTENT_MIN) {
    return { success: false, message: `反馈内容至少 ${CONTENT_MIN} 个字` };
  }
  if (content.length > CONTENT_MAX) {
    return { success: false, message: `反馈内容不能超过 ${CONTENT_MAX} 字` };
  }
  if (contact.length > CONTACT_MAX) {
    return { success: false, message: '联系方式过长' };
  }

  const actor = await identity.resolveActor(db, openId);
  const authorNickname = authorNicknameFromActor(actor);

  const textCheck = await sec.checkText(cloud, openId, {
    content,
    scene: sec.SCENE.FORUM,
    nickname: authorNickname,
  });
  if (!textCheck.ok) {
    return { success: false, message: textCheck.message };
  }

  try {
    const result = await feedbackCollection.add({
      data: {
        type: 'feedback',
        postId: '',
        reason: '',
        content,
        contact,
        userId: actor.userId,
        openId: actor.openId,
        authorNickname,
        status: 'pending',
        adminNote: '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        resolvedAt: null,
      },
    });

    return {
      success: true,
      message: '反馈已提交',
      data: { id: result._id },
    };
  } catch (e) {
    console.error('[feedback] submit failed:', e);
    return { success: false, message: '提交失败，请稍后重试' };
  }
}

async function submitReport(data, openId) {
  const postId = (data.postId || '').trim();
  const commentId = (data.commentId || '').trim();
  const reason = (data.reason || '').trim();
  const detail = (data.detail || '').trim();

  if (!postId && !commentId) {
    return { success: false, message: '缺少举报对象' };
  }
  if (!reason || !REPORT_REASONS.includes(reason)) {
    return { success: false, message: '请选择有效的举报原因' };
  }
  if (detail.length > REPORT_DETAIL_MAX) {
    return { success: false, message: `补充说明不能超过 ${REPORT_DETAIL_MAX} 字` };
  }

  const actor = await identity.resolveActor(db, openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  const authorNickname = authorNicknameFromActor(actor);

  let targetType = 'post';
  let resolvedPostId = postId;

  if (commentId) {
    try {
      const commentRes = await commentsCollection.doc(commentId).get();
      const comment = commentRes.data;
      if (!comment) {
        return { success: false, message: '评论不存在' };
      }
      targetType = 'comment';
      resolvedPostId = comment.postId || postId;
      if (!resolvedPostId) {
        return { success: false, message: '缺少作品信息' };
      }
    } catch (e) {
      return { success: false, message: '评论不存在' };
    }
  } else if (postId) {
    resolvedPostId = postId;
  }

  try {
    const postRes = await postsCollection.doc(resolvedPostId).get();
    if (!postRes.data) {
      return { success: false, message: '作品不存在' };
    }
  } catch (e) {
    return { success: false, message: '作品不存在' };
  }

  const dupRes = await feedbackCollection.where({
    type: 'report',
    userId: actor.userId,
    postId: resolvedPostId,
    commentId: commentId || '',
    status: _.in(['pending', 'processing']),
  }).limit(1).get();
  if (dupRes.data.length > 0) {
    return { success: false, message: '您已提交过举报，请等待处理' };
  }

  const content = detail
    ? `【${reason}】${detail}`
    : `【${reason}】`;

  const textCheck = await sec.checkText(cloud, openId, {
    content: detail || reason,
    scene: sec.SCENE.FORUM,
    nickname: authorNickname,
  });
  if (!textCheck.ok) {
    return { success: false, message: textCheck.message };
  }

  try {
    const result = await feedbackCollection.add({
      data: {
        type: 'report',
        targetType,
        postId: resolvedPostId,
        commentId: commentId || '',
        reason,
        content,
        contact: '',
        userId: actor.userId,
        openId: actor.openId,
        authorNickname,
        status: 'pending',
        adminNote: '',
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        resolvedAt: null,
      },
    });

    return {
      success: true,
      message: '举报已提交',
      data: { id: result._id },
    };
  } catch (e) {
    console.error('[feedback] report failed:', e);
    return { success: false, message: '提交失败，请稍后重试' };
  }
}

exports.main = async (event) => {
  const { action, data } = event || {};
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  switch (action) {
    case 'submit':
      return await submitFeedback(data || {}, openId);
    case 'report':
      return await submitReport(data || {}, openId);
    default:
      return { success: false, message: '未知操作' };
  }
};
