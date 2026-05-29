const { postApi } = require('../utils/api');
const { getDetailSlotHeight } = require('../utils/heroLayout');
const { showLoading, hideLoading, showToast, showSuccess, formatDateTime, formatLikeCount } = require('../utils/util');
const { requireLogin } = require('../utils/session');
const app = getApp();

/**
 * 帖子详情浮层：帖子数据、评论与互动逻辑
 */
module.exports = Behavior({
  data: {
    post: null,
    loading: true,
    commentContent: '',
    canDelete: false,
    deleteBtnPressed: false,
    showCommentInput: false,
    loginModalShow: false,
    showEmojiPanel: false,
    sendDisabled: true,
    commentsLoading: false,
    hasMoreComments: false,
    replyToId: null,
    replyToAuthor: '',
    parentId: null,
    highlightCommentId: null,
    currentPhotoIndex: 0,
    indexBadgeVisible: false,
    commentsCountText: '0',
    keyboardHeight: 0,
    commentBottomInset: 0,
    commentFocus: false,
    commentScrollTop: 0,
    photoMode: 'aspectFit',
    quickEmojis: ['😀', '😂', '🤣', '😊', '😅', '😍', '🙄', '👍'],
    emojiPanelEmojis: [
      '😀', '😁', '😂', '🤣', '😊', '😇', '🙂', '😉',
      '😍', '🥰', '😘', '😗', '😋', '😛', '😜', '🤪',
      '😢', '😭', '😤', '😡', '🥺', '😱', '🤔', '🙄',
      '👍', '👎', '👏', '🙏', '💪', '❤️', '🔥', '✨',
    ],
  },

  methods: {
    _getPostId() {
      return this.postId || this.properties.postId || '';
    },

    _ensureLogin() {
      return requireLogin({
        toast: false,
        onUnauthenticated: () => this.setData({ loginModalShow: true }),
      });
    },

    /** 与详情接口 canDelete 规则一致，用于骨架阶段预占位避免行高跳动 */
    _canDeleteHint(authorId) {
      const user = app.globalData?.userInfo;
      if (!user) return false;
      if (user.role === 'admin') return true;
      const uid = user.id || user._id || user.userId;
      return !!(authorId && uid && authorId === uid);
    },

    /** 详情首图与首页传入 cover 同源，避免 FLIP 结束后 swiper 换图闪烁 */
    _alignFirstPhotoWithCover(post) {
      const cover =
        (this.properties && this.properties.coverUrl) ||
        this.data.coverUrl ||
        '';
      if (!cover || !post.photos || !post.photos.length) return post;
      const photos = post.photos.slice();
      photos[0] = { ...photos[0], imageUrl: cover };
      return { ...post, photos };
    },

    _photoAspectRatio(photo, fallback) {
      if (photo && photo.width && photo.height) {
        const r = photo.height / photo.width;
        if (isFinite(r) && r > 0) return r;
      }
      const fb = fallback ?? this.properties.aspectRatio;
      return fb > 0 ? fb : 1;
    },

    _imageSlotHeightForIndex(index) {
      const post = this.data.post;
      const photo = post && post.photos && post.photos[index];
      const ar = this._photoAspectRatio(photo, this.properties.aspectRatio);
      const w = this._windowWidth || wx.getSystemInfoSync().windowWidth;
      return getDetailSlotHeight(w, ar);
    },

    async loadPost() {
      const postId = this._getPostId();
      if (!postId) return;
      this.setData({ loading: true });
      try {
        const res = await postApi.getPostDetail(postId);
        if (res.success && res.data) {
          const post = res.data;
          post.date = formatDateTime(post.createdAt);
          const titleParts = [];
          if (post.title) titleParts.push(post.title);
          if (post.description) titleParts.push(post.description);
          post.titleDesc = titleParts.join(' ');
          if (!post.photos || post.photos.length === 0) {
            const cover =
              (this.properties && this.properties.coverUrl) ||
              this.data.coverUrl ||
              post.imageUrl ||
              '';
            post.photos = [{ imageUrl: cover, width: 1, height: 1, order: 0 }];
          }
          post.comments = (post.comments || []).map((c) => ({
            ...c,
            time: formatDateTime(c.createdAt),
            authorAvatar: c.authorAvatar || '/assets/icons/default-avatar.png',
            replies: (c.replies || []).map((r) => ({
              ...r,
              time: formatDateTime(r.createdAt),
              authorAvatar: r.authorAvatar || '/assets/icons/default-avatar.png',
            })),
            _hasReplies: (c.repliesCount || 0) > 0 || (c.replies && c.replies.length > 0),
            _repliesHasMore: (c.repliesCount || 0) > (c.replies || []).length,
          }));
          const avatar = this.properties.authorAvatar || this._indexAvatarUrl;
          if (avatar) post.authorAvatar = avatar;
          post.authorAvatar = post.authorAvatar || '/assets/icons/default-avatar.png';
          const finalPost = this._alignFirstPhotoWithCover(post);
          const canDelete = !!finalPost.canDelete;
          const hasMoreComments = res.data.hasMore || false;
          const commentsCountText = formatLikeCount(finalPost.commentsCount || 0).text;
          const imageSlotHeight = this._imageSlotHeightForIndex(0);
          this.setData({
            post: finalPost,
            canDelete,
            loading: false,
            hasMoreComments,
            commentsCountText,
            currentPhotoIndex: 0,
            imageSlotHeight,
          });
          if (
            this.data.heroPhase === 'docked' &&
            typeof this._heroTryHandoff === 'function' &&
            !this._handoffStarted
          ) {
            this._heroTryHandoff();
          }
        } else {
          showToast(res.message || '加载失败');
          this.setData({ loading: false });
        }
      } catch (e) {
        showToast('加载失败');
        this.setData({ loading: false });
      }
    },

    onSwiperChange(e) {
      const index = e.detail.current;
      this.setData({
        currentPhotoIndex: index,
        imageSlotHeight: this._imageSlotHeightForIndex(index),
      });
      this._showIndexBadge();
    },

    _showIndexBadge() {
      if (this._badgeTimer) clearTimeout(this._badgeTimer);
      const patch = { indexBadgeVisible: true };
      if (this.data.isPreviewMode) {
        patch.previewProgressVisible = true;
      }
      this.setData(patch);
      this._badgeTimer = setTimeout(() => {
        const hide = { indexBadgeVisible: false };
        if (this.data.isPreviewMode) {
          hide.previewProgressVisible = false;
        }
        this.setData(hide);
      }, 1500);
    },

    onCommentScroll(e) {
      const { scrollTop, scrollHeight } = e.detail;
      const clientHeight = e.detail.clientHeight || this._windowHeight || 600;
      if (scrollHeight - scrollTop - clientHeight < 300) {
        this._tryLoadMore();
      }
    },

    _tryLoadMore() {
      if (this.data.commentsLoading || !this.data.hasMoreComments) return;
      this.loadMoreComments();
    },

    async loadMoreComments() {
      if (this.data.commentsLoading || !this.data.hasMoreComments || !this.data.post) return;
      const offset = this.data.post.comments?.length || 0;
      this.setData({ commentsLoading: true });
      try {
        const res = await postApi.getMoreComments(this.data.post._id, offset);
        if (res.success) {
          const newComments = (res.data.comments || []).map((c) => ({
            ...c,
            time: formatDateTime(c.createdAt),
            authorAvatar: c.authorAvatar || '/assets/icons/default-avatar.png',
          }));
          const post = this.data.post;
          post.comments = [...(post.comments || []), ...newComments];
          this.setData({ post, hasMoreComments: res.data.hasMore, commentsLoading: false });
        } else {
          this.setData({ commentsLoading: false });
        }
      } catch (e) {
        this.setData({ commentsLoading: false });
      }
    },

    async handleLike() {
      if (!this._ensureLogin()) return;
      try {
        const res = await postApi.likePost(this._getPostId());
        if (res.success && this.data.post) {
          const post = { ...this.data.post, likes: res.likes, liked: res.liked };
          this.setData({ post });
          this._likedChanged = true;
        }
      } catch (e) {
        showToast('操作失败');
      }
    },

    async toggleCommentLike(e) {
      if (!this._ensureLogin()) return;
      const commentId = e.currentTarget.dataset.id;
      if (!commentId) return;
      try {
        const res = await postApi.toggleCommentLike(commentId);
        if (res.success) {
          this._updateCommentLike(commentId, res.liked, res.likes);
        }
      } catch (e) {
        showToast('操作失败');
      }
    },

    _updateCommentLike(commentId, liked, likes) {
      const post = this.data.post;
      if (!post || !post.comments) return;
      const topComment = post.comments.find((c) => c.id === commentId);
      if (topComment) {
        topComment.liked = liked;
        topComment.likes = likes;
        this.setData({ post });
        return;
      }
      for (const c of post.comments) {
        if (!c.replies) continue;
        const reply = c.replies.find((r) => r.id === commentId);
        if (reply) {
          reply.liked = liked;
          reply.likes = likes;
          this.setData({ post });
          return;
        }
      }
    },

    onDeleteBtnTouchStart() {
      this.setData({ deleteBtnPressed: true });
    },

    onDeleteBtnTouchEnd() {
      if (this.data.deleteBtnPressed) {
        this.setData({ deleteBtnPressed: false });
      }
    },

    onDeletePost() {
      const post = this.data.post;
      if (!post || !this.data.canDelete) return;
      const id = post.id || post._id;
      if (!id) return;
      wx.showModal({
        title: '确认删除',
        content: '删除后无法恢复，确定要删除这条作品吗？',
        confirmColor: '#e02020',
        success: async (res) => {
          if (!res.confirm) return;
          showLoading('删除中...');
          try {
            const result = await postApi.deletePost(id);
            hideLoading();
            if (result.success) {
              showSuccess('已删除');
              if (typeof this._onPostDeleted === 'function') {
                this._onPostDeleted();
              } else {
                setTimeout(() => wx.navigateBack(), 400);
              }
            } else {
              showToast(result.message || '删除失败');
            }
          } catch (e) {
            hideLoading();
            showToast('删除失败');
          }
        },
      });
    },

    onLoginModalClose() {
      this.setData({ loginModalShow: false });
    },

    onLoginSuccess() {
      this.setData({ loginModalShow: false });
    },

    focusCommentInput() {
      if (!this._ensureLogin()) return;
      this.setData({
        showCommentInput: true,
        showEmojiPanel: false,
        sendDisabled: true,
        replyToId: null,
        replyToAuthor: '',
        parentId: null,
        commentContent: '',
        keyboardHeight: 0,
        commentBottomInset: 0,
        commentFocus: false,
      }, () => {
        this.setData({ commentFocus: true });
      });
    },

    hideCommentInput() {
      wx.hideKeyboard();
      this.setData({
        showCommentInput: false,
        showEmojiPanel: false,
        replyToId: null,
        replyToAuthor: '',
        parentId: null,
        commentContent: '',
        keyboardHeight: 0,
        commentBottomInset: 0,
        commentFocus: false,
      });
    },

    _onKeyboardHeightChange(e) {
      const h = e.detail.height || 0;
      if (h > 0) {
        this.setData({
          keyboardHeight: h,
          showEmojiPanel: false,
          commentBottomInset: h,
        });
      } else if (!this.data.showEmojiPanel) {
        this.setData({ keyboardHeight: 0, commentBottomInset: 0 });
      }
    },

    toggleEmojiPanel() {
      const next = !this.data.showEmojiPanel;
      if (next) {
        wx.hideKeyboard();
        const h = this._emojiPanelHeight || 280;
        this.setData({
          showEmojiPanel: true,
          keyboardHeight: 0,
          commentBottomInset: h,
          commentFocus: false,
        });
      } else {
        this.setData({
          showEmojiPanel: false,
          commentBottomInset: 0,
          commentFocus: false,
        }, () => {
          this.setData({ commentFocus: true });
        });
      }
    },

    _onCommentInputFocus() {
      if (this.data.showEmojiPanel) {
        this.setData({
          showEmojiPanel: false,
          commentBottomInset: this.data.keyboardHeight || 0,
        });
      }
    },

    _onCommentInputBlur() {
      // 保留面板状态，由键盘高度回调收起底部占位
    },

    onQuickEmojiTap(e) {
      const emoji = e.currentTarget.dataset.emoji;
      if (!emoji) return;
      const content = (this.data.commentContent || '') + emoji;
      this.setData({
        commentContent: content,
        sendDisabled: !content.trim(),
      });
    },

    handleReplyTap(e) {
      if (!this._ensureLogin()) return;
      const { id, author, replyId } = e.currentTarget.dataset;
      if (!id) return;
      if (replyId) {
        this.setData({
          replyToId: replyId,
          replyToAuthor: author || '',
          parentId: id,
          showCommentInput: true,
          commentContent: '',
          commentFocus: false,
        }, () => {
          this.setData({ commentFocus: true });
        });
      } else {
        this.setData({
          replyToId: id,
          replyToAuthor: '',
          parentId: id,
          showCommentInput: true,
          commentContent: '',
          commentFocus: false,
        }, () => {
          this.setData({ commentFocus: true });
        });
      }
    },

    async expandReplies(e) {
      const commentId = e.currentTarget.dataset.id;
      if (!commentId) return;
      const post = this.data.post;
      const comment = post.comments.find((c) => c.id === commentId);
      if (!comment) return;
      if (comment._everExpandedOnce && !comment._repliesExpanded) {
        comment._repliesExpanded = true;
        this.setData({ post });
        return;
      }
      comment._repliesLoading = true;
      this.setData({ post });
      try {
        const currentCount = comment.replies ? comment.replies.length : 0;
        let limit;
        if (currentCount === 0) limit = 3;
        else if (currentCount < 10) limit = 10 - currentCount;
        else limit = 10;
        const res = await postApi.getCommentReplies(commentId, currentCount, limit);
        if (res.success && res.data?.replies) {
          const newReplies = res.data.replies.map((r) => ({
            ...r,
            time: formatDateTime(r.createdAt),
            authorAvatar: r.authorAvatar || '/assets/icons/default-avatar.png',
          }));
          const thePost = this.data.post;
          const theComment = thePost.comments.find((c) => c.id === commentId);
          if (theComment) {
            theComment.replies = [...(theComment.replies || []), ...newReplies];
            theComment._repliesLoading = false;
            theComment._repliesHasMore = res.data.hasMore;
            theComment._repliesExpanded = true;
            theComment._everExpandedOnce = true;
            this.setData({ post: thePost });
          }
        }
      } catch (e) {
        const thePost = this.data.post;
        const theComment = thePost.comments.find((c) => c.id === commentId);
        if (theComment) {
          theComment._repliesLoading = false;
          this.setData({ post: thePost });
        }
        showToast('加载失败');
      }
    },

    collapseReplies(e) {
      const commentId = e.currentTarget.dataset.id;
      if (!commentId) return;
      const post = this.data.post;
      const comment = post.comments.find((c) => c.id === commentId);
      if (!comment) return;
      comment._repliesExpanded = false;
      this.setData({ post });
    },

    onCommentInput(e) {
      const value = e.detail.value;
      this.setData({ commentContent: value, sendDisabled: !value.trim() });
    },

    async submitComment() {
      if (!this._ensureLogin()) return;
      const content = this.data.commentContent.trim();
      if (!content) {
        showToast('请输入评论内容');
        return;
      }
      const cleanContent = content.replace(/^@[^\s]+\s/, '').trim();
      if (!cleanContent) {
        showToast('请输入评论内容');
        return;
      }
      try {
        showLoading('发送中...');
        const parentId = this.data.parentId || null;
        const replyTo = this.data.replyToId || null;
        const replyToAuthor = this.data.replyToAuthor || '';
        const res = await postApi.addComment(
          this._getPostId(),
          cleanContent,
          parentId,
          replyTo,
          replyToAuthor
        );
        hideLoading();
        if (res.success) {
          showSuccess(parentId ? '回复成功' : '评论成功');
          this.setData({
            commentContent: '',
            showCommentInput: false,
            showEmojiPanel: false,
            sendDisabled: true,
            replyToId: null,
            replyToAuthor: '',
            parentId: null,
          });
          this.loadPost();
        } else {
          showToast(res.message || '评论失败');
        }
      } catch (e) {
        hideLoading();
        showToast('评论失败');
      }
    },

    generatePoster() {
      showToast('海报分享功能开发中');
    },
  },
});
