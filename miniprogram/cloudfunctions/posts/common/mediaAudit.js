/**
 * 异步图片审核：mediaCheckAsync trace_id 映射与 wxa_media_check 回调聚合
 */
const { POST_STATUS } = require('./postStatus');
const { deleteCloudFiles, extractCloudFileIds, clearPhotosCloudUrls } = require('./postHelpers');

const COLLECTION = 'media_audit_tasks';

const AUDIT_STATUS = {
  PENDING: 'pending',
  PASS: 'pass',
  RISKY: 'risky',
  REVIEW: 'review',
  ERROR: 'error',
};

function normalizeSuggest(suggest) {
  const s = String(suggest || '').trim().toLowerCase();
  if (s === 'pass' || s === 'risky' || s === 'review') return s;
  return 'review';
}

function taskStatusFromCallback(event) {
  const errcode = event.errcode;
  if (errcode !== 0 && errcode != null) {
    return AUDIT_STATUS.ERROR;
  }
  const suggest = normalizeSuggest(event.result && event.result.suggest);
  if (suggest === 'pass') return AUDIT_STATUS.PASS;
  if (suggest === 'risky') return AUDIT_STATUS.RISKY;
  return AUDIT_STATUS.REVIEW;
}

async function createAuditTasks(db, { postId, auditBatch, entries }) {
  if (!postId || !entries || !entries.length) return [];

  const created = [];
  for (const entry of entries) {
    const traceId = entry.traceId || entry.trace_id;
    if (!traceId) continue;

    await db.collection(COLLECTION).add({
      data: {
        traceId,
        postId,
        fileId: entry.fileId || '',
        auditBatch: auditBatch || 1,
        status: AUDIT_STATUS.PENDING,
        suggest: '',
        label: null,
        errcode: null,
        createdAt: db.serverDate(),
        resolvedAt: null,
      },
    });
    created.push(traceId);
  }
  return created;
}

async function findTaskByTraceId(db, traceId) {
  const res = await db.collection(COLLECTION).where({ traceId }).limit(1).get();
  return res.data[0] || null;
}

async function getTasksForPostBatch(db, postId, auditBatch) {
  const batch = auditBatch || 1;
  const res = await db.collection(COLLECTION).where({ postId, auditBatch: batch }).get();
  return res.data || [];
}

async function aggregatePostMediaAudit(db, postId, cloud) {
  const postRes = await db.collection('posts').doc(postId).get();
  if (!postRes.data) {
    return { ok: false, reason: 'post_not_found' };
  }

  const post = postRes.data;
  if (post.status !== POST_STATUS.REVIEWING) {
    return { ok: true, skipped: true, status: post.status };
  }

  const auditBatch = post.mediaAuditBatch || 1;
  const tasks = await getTasksForPostBatch(db, postId, auditBatch);
  if (!tasks.length) {
    return { ok: true, waiting: true, status: POST_STATUS.REVIEWING, reason: 'no_tasks' };
  }

  const statuses = tasks.map((t) => t.status);

  if (statuses.some((s) => s === AUDIT_STATUS.RISKY)) {
    const fileIds = extractCloudFileIds(post.photos);
    if (cloud && fileIds.length) {
      await deleteCloudFiles(cloud, fileIds);
    }
    await db.collection('posts').doc(postId).update({
      data: {
        status: POST_STATUS.REJECTED,
        photos: clearPhotosCloudUrls(post.photos),
        imageRemoved: true,
        reviewAdminNote: '图片内容不符合规范',
        mediaAuditResolvedAt: db.serverDate(),
        mediaPendingCount: 0,
        rejectedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });
    return { ok: true, status: POST_STATUS.REJECTED };
  }

  const waiting = statuses.some(
    (s) => s === AUDIT_STATUS.PENDING || s === AUDIT_STATUS.REVIEW || s === AUDIT_STATUS.ERROR
  );
  if (waiting) {
    const pendingCount = statuses.filter((s) => s === AUDIT_STATUS.PENDING).length;
    await db.collection('posts').doc(postId).update({
      data: { mediaPendingCount: pendingCount },
    });
    return { ok: true, waiting: true, status: POST_STATUS.REVIEWING };
  }

  if (statuses.every((s) => s === AUDIT_STATUS.PASS)) {
    await db.collection('posts').doc(postId).update({
      data: {
        status: POST_STATUS.RELEASED,
        mediaAuditResolvedAt: db.serverDate(),
        mediaPendingCount: 0,
      },
    });
    return { ok: true, status: POST_STATUS.RELEASED };
  }

  return { ok: true, waiting: true, status: POST_STATUS.REVIEWING };
}

async function handleMediaCheckEvent(db, event, cloud) {
  const traceId = event.trace_id;
  if (!traceId) {
    console.error('[mediaAudit] missing trace_id:', JSON.stringify(event).slice(0, 400));
    return { ok: false, reason: 'no_trace_id' };
  }

  const task = await findTaskByTraceId(db, traceId);
  if (!task) {
    console.warn('[mediaAudit] unknown trace_id:', traceId);
    return { ok: false, reason: 'unknown_trace', traceId };
  }

  if (task.status !== AUDIT_STATUS.PENDING && task.status !== AUDIT_STATUS.ERROR) {
    return { ok: true, reason: 'already_resolved', traceId, postId: task.postId };
  }

  const newStatus = taskStatusFromCallback(event);
  const suggest = event.result && event.result.suggest;
  const label = event.result && event.result.label;

  await db.collection(COLLECTION).doc(task._id).update({
    data: {
      status: newStatus,
      suggest: suggest != null ? String(suggest) : '',
      label: label != null ? label : null,
      errcode: event.errcode != null ? event.errcode : null,
      resolvedAt: db.serverDate(),
    },
  });

  const aggregate = await aggregatePostMediaAudit(db, task.postId, cloud);
  return {
    ok: true,
    traceId,
    postId: task.postId,
    taskStatus: newStatus,
    aggregate,
  };
}

module.exports = {
  AUDIT_STATUS,
  COLLECTION,
  createAuditTasks,
  handleMediaCheckEvent,
  aggregatePostMediaAudit,
  taskStatusFromCallback,
};
