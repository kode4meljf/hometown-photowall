// cloudfunctions/feedback/index.js - 用户意见反馈
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const feedbackCollection = db.collection('feedbacks');
const usersCollection = db.collection('users');
const sec = require('./common/contentSecurity');

const CONTENT_MIN = 5;
const CONTENT_MAX = 500;
const CONTACT_MAX = 80;
const REPORT_DETAIL_MAX = 200;
const REPORT_REASONS = ['违法违规', '色情低俗', '垃圾广告', '侵犯权益', '其他'];

async function resolveReporter(openId) {
  let userId = null;
  let authorNickname = '游客';
  if (openId) {
    const userRes = await usersCollection.where({ _openid: openId }).limit(1).get();
    const user = userRes.data[0];
    if (user) {
      userId = user._id;
      authorNickname = user.nickname || user.username || '用户';
    }
  }
  return { userId, authorNickname, openId: openId || '' };
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

  const reporter = await resolveReporter(openId);

  const textCheck = await sec.checkText(cloud, openId, {
    content,
    scene: sec.SCENE.FORUM,
    nickname: reporter.authorNickname,
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
        userId: reporter.userId,
        openId: reporter.openId,
        authorNickname: reporter.authorNickname,
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
  const reason = (data.reason || '').trim();
  const detail = (data.detail || '').trim();

  if (!postId) {
    return { success: false, message: '缺少作品信息' };
  }
  if (!reason || !REPORT_REASONS.includes(reason)) {
    return { success: false, message: '请选择有效的举报原因' };
  }
  if (detail.length > REPORT_DETAIL_MAX) {
    return { success: false, message: `补充说明不能超过 ${REPORT_DETAIL_MAX} 字` };
  }

  const reporter = await resolveReporter(openId);
  if (!reporter.userId) {
    return { success: false, message: '请先登录' };
  }

  const content = detail
    ? `【${reason}】${detail}`
    : `【${reason}】`;

  const textCheck = await sec.checkText(cloud, openId, {
    content: detail || reason,
    scene: sec.SCENE.FORUM,
    nickname: reporter.authorNickname,
  });
  if (!textCheck.ok) {
    return { success: false, message: textCheck.message };
  }

  try {
    const result = await feedbackCollection.add({
      data: {
        type: 'report',
        postId,
        reason,
        content,
        contact: '',
        userId: reporter.userId,
        openId: reporter.openId,
        authorNickname: reporter.authorNickname,
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
