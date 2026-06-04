const { formatLikeCount } = require('./util');
const { postApi } = require('./api');

function withFeedLikeFields(post, liked, likes) {
  const likesInfo = formatLikeCount(likes || 0);
  return {
    ...post,
    liked: !!liked,
    likes: likes || 0,
    _likesText: likesInfo.text,
    _likesCls: likesInfo.cls,
  };
}

function withLikeFields(post, liked, likes) {
  return {
    ...post,
    liked: !!liked,
    likes: likes || 0,
  };
}

function togglePostLike(postId) {
  return postApi.likePost(postId);
}

module.exports = {
  withFeedLikeFields,
  withLikeFields,
  togglePostLike,
};
