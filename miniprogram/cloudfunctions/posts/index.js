// cloudfunctions/posts/index.js - 帖子相关云函数（薄路由）

const { cloud } = require('./ctx');
const { isDevActionsEnabled, assertDevKey, devActionsDisabledResponse } = require('./common/devGate');
const { getActor } = require('./lib/access');
const read = require('./handlers/read');
const write = require('./handlers/write');
const comments = require('./handlers/comments');
const interact = require('./handlers/interact');
const share = require('./handlers/share');
const dev = require('./handlers/dev');

exports.main = async (event) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  if (dev.isDevAction(action)) {
    if (!isDevActionsEnabled()) {
      return devActionsDisabledResponse();
    }
    if (!assertDevKey(data)) {
      return { success: false, message: '无权限' };
    }
    const devActor = await getActor(openId);
    if (!devActor.isAdmin) {
      return { success: false, message: '无权限' };
    }
    return dev.dispatch(action, data, openId);
  }

  switch (action) {
    case 'list':
      return read.getPosts(data, openId);
    case 'detail':
      return read.getPostDetail(data.id, openId);
    case 'create':
      return write.createPost(data, openId);
    case 'resubmit':
      return write.resubmitPost(data, openId);
    case 'delete':
      return write.deletePost(data.id, openId);
    case 'like':
      return interact.likePost(data.id, openId);
    case 'comment':
      return comments.addComment(data, openId);
    case 'deleteComment':
      return comments.deleteComment(data, openId);
    case 'locations':
      return read.getLocations();
    case 'myWorks':
      return read.getMyWorks(openId, data);
    case 'myLiked':
      return read.getMyLiked(openId, data);
    case 'moreComments':
      return comments.getMoreComments(data, openId);
    case 'update':
      return write.updatePost(event.data || {}, openId);
    case 'toggleCommentLike':
      return comments.toggleCommentLike(data, openId);
    case 'getCommentReplies':
      return comments.getCommentReplies(data, openId);
    case 'myComments':
      return comments.getMyComments(openId, data);
    case 'receivedComments':
      return comments.getReceivedComments(openId, data);
    case 'getShareQrCode':
      return share.getShareQrCode(data);
    case 'recordShare':
      return share.recordShare(data);
    default:
      return { success: false, message: '未知操作' };
  }
};
