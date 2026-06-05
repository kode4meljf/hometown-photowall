// cloudfunctions/cleanupRejectedPosts/index.js — 每周清理超过 7 天的 rejected 帖子（库记录；云图已在驳回时删除）
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const postsCollection = db.collection('posts');
const commentsCollection = db.collection('post_comments');
const { POST_STATUS } = require('./common/postStatus');
const { deleteCloudFiles, extractCloudFileIds } = require('./common/postHelpers');

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;

function cutoffDate() {
  return new Date(Date.now() - RETENTION_MS);
}

function expiredRejectedWhere(cutoff) {
  return _.and([
    { status: _.in([POST_STATUS.REJECTED, 'failed']) },
    _.or([
      { rejectedAt: _.lt(cutoff) },
      _.and([
        _.or([{ rejectedAt: _.exists(false) }, { rejectedAt: null }]),
        { updatedAt: _.lt(cutoff) },
      ]),
      _.and([
        _.or([{ rejectedAt: _.exists(false) }, { rejectedAt: null }]),
        _.or([{ updatedAt: _.exists(false) }, { updatedAt: null }]),
        { createdAt: _.lt(cutoff) },
      ]),
    ]),
  ]);
}

async function purgePostRecord(post) {
  const postId = post._id;
  const fileIds = extractCloudFileIds(post.photos);
  if (fileIds.length) {
    await deleteCloudFiles(cloud, fileIds);
  }
  await commentsCollection.where({ postId }).remove();
  await postsCollection.doc(postId).remove();
}

async function cleanupExpiredRejectedPosts() {
  const cutoff = cutoffDate();
  let removed = 0;
  let scanned = 0;

  while (true) {
    const res = await postsCollection
      .where(expiredRejectedWhere(cutoff))
      .limit(BATCH_SIZE)
      .get();
    const batch = res.data || [];
    if (!batch.length) break;

    scanned += batch.length;
    for (let i = 0; i < batch.length; i++) {
      try {
        await purgePostRecord(batch[i]);
        removed += 1;
      } catch (e) {
        console.error('[cleanupRejectedPosts] purge failed:', batch[i]._id, e.message);
      }
    }

    if (batch.length < BATCH_SIZE) break;
  }

  return { scanned, removed, cutoff: cutoff.toISOString() };
}

exports.main = async () => {
  try {
    const result = await cleanupExpiredRejectedPosts();
    console.log('[cleanupRejectedPosts]', JSON.stringify(result));
    return { success: true, data: result };
  } catch (e) {
    console.error('[cleanupRejectedPosts] failed:', e.message, e.stack);
    return { success: false, message: e.message };
  }
};
