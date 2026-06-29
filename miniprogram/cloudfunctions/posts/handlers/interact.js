const identity = require('../common/identity');
const { getActor, requireReleasedPost } = require('../lib/access');
const { toggleDocumentLike } = require('../lib/like');

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

module.exports = {
  likePost,
};
