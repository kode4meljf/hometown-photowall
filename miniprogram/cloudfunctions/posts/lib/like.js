const { db, _ } = require('../ctx');

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

module.exports = {
  toggleDocumentLike,
};
