const { postApi, feedbackApi } = require('../utils/api');
const { getDetailMaxSlotHeight } = require('../utils/heroLayout');
const { showLoading, hideLoading, showToast, showSuccess, formatDateTime, formatPostCountTexts } = require('../utils/util');
const { getDataset } = require('../utils/eventBridge');
const { requireLogin, isLoggedIn } = require('../utils/session');
const { REPORT_REASONS } = require('../utils/constants');
const { withLikeFields, togglePostLike } = require('../utils/postLike');
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
    canAdminDelete: false,
    deleteBtnPressed: false,
    reportBtnPressed: false,
    showReportModal: false,
    reportReason: '',
    reportDetail: '',
    reportCommentId: '',
    reportSubmitting: false,
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
    likesCountText: '0',
    sharesCountText: '0',
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

    _buildCloseDetail(extra = {}) {
      const detail = { likedChanged: !!this._likedChanged, ...extra };
      if (this._likedChanged && this.data.post) {
        detail.postId = this._getPostId();
        detail.liked = this.data.post.liked;
        detail.likes = this.data.post.likes;
      }
      return detail;
    },

    _ensureLogin() {
      return requireLogin({
        toast: false,
        onUnauthenticated: () => this.setData({ loginModalShow: true }),
      });
    },

    /** 评论数行右侧：仅管理员显示删除 */
    _canAdminDeleteHint() {
      const user = app.globalData?.userInfo;
      return !!(user && user.role === 'admin');
    },

    _getCurrentUserId() {
      const user = app.globalData?.userInfo;
      return user && user.id ? user.id : '';
    },

    _formatReplyForDisplay(reply, userId) {
      const uid = userId || '';
      return {
        ...reply,
        time: formatDateTime(reply.createdAt),
        authorAvatar: reply.authorAvatar || '/assets/icons/default-avatar.png',
        isMine: !!(uid && reply.authorId === uid),
      };
    },

    _formatTopCommentForDisplay(comment, userId, withMeta = false) {
      const uid = userId || '';
      const replies = (comment.replies || []).map((r) => this._formatReplyForDisplay(r, uid));
      const formatted = {
        ...comment,
        time: formatDateTime(comment.createdAt),
        authorAvatar: comment.authorAvatar || '/assets/icons/default-avatar.png',
        isMine: !!(uid && comment.authorId === uid),
        replies,
      };
      if (withMeta) {
        formatted._hasReplies = (comment.repliesCount || 0) > 0 || replies.length > 0;
        formatted._repliesHasMore = (comment.repliesCount || 0) > replies.length;
      }
      return formatted;
    },

    _formatCommentsForDisplay(comments, userId, withMeta = false) {
      return (comments || []).map((c) => this._formatTopCommentForDisplay(c, userId, withMeta));
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

    _detailMaxSlotHeight() {
      const w = this._windowWidth || wx.getSystemInfoSync().windowWidth;
      return getDetailMaxSlotHeight(w);
    },

    async loadPost(silent = false) {
      const postId = this._getPostId();
      if (!postId) return;
      if (!silent) {
        this.setData({ loading: true });
      }
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
          post.comments = this._formatCommentsForDisplay(
            post.comments,
            this._getCurrentUserId(),
            true
          );
          const avatar = this.properties.authorAvatar || this._indexAvatarUrl;
          if (avatar) post.authorAvatar = avatar;
          post.authorAvatar = post.authorAvatar || '/assets/icons/default-avatar.png';
          const finalPost = this._alignFirstPhotoWithCover(post);
          if (!isLoggedIn()) {
            finalPost.liked = false;
          }
          const canDelete = !!finalPost.canDelete;
          const canAdminDelete = this._canAdminDeleteHint();
          const hasMoreComments = res.data.hasMore || false;
          const countTexts = formatPostCountTexts(finalPost);
          let currentPhotoIndex = 0;
          const imageSlotHeight = this._detailMaxSlotHeight();
          const pendingIdx = this._pendingInitialPhotoIndex || 0;
          if (
            pendingIdx > 0 &&
            finalPost.photos &&
            pendingIdx < finalPost.photos.length
          ) {
            currentPhotoIndex = pendingIdx;
          }
          this._pendingInitialPhotoIndex = 0;
          this.setData({
            post: finalPost,
            canDelete,
            canAdminDelete,
            loading: false,
            hasMoreComments,
            ...countTexts,
            currentPhotoIndex,
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
          if (!silent) this.setData({ loading: false });
        }
      } catch (e) {
        console.error('[loadPost]', e);
        showToast('加载失败');
        if (!silent) this.setData({ loading: false });
      }
    },

    _appendSubmittedComment(data, { parentId, replyTo, replyToAuthor }) {
      const post = this.data.post;
      if (!post || !data?.id) return;

      const userId = this._getCurrentUserId();
      const user = app.globalData?.userInfo;
      const item = this._formatReplyForDisplay({
        id: data.id,
        content: data.content,
        author: data.author,
        authorId: userId,
        authorAvatar: (user && user.avatar) || '/assets/icons/default-avatar.png',
        createdAt: data.createdAt || new Date(),
        likes: 0,
        liked: false,
        replyTo: replyTo || null,
        replyToAuthor: replyToAuthor || '',
      }, userId);
      item.isMine = true;

      if (parentId) {
        const top = (post.comments || []).find((c) => c.id === parentId);
        if (top) {
          top.replies = [...(top.replies || []), item];
          top.repliesCount = (top.repliesCount || 0) + 1;
          top._hasReplies = true;
          top._repliesExpanded = true;
          top._everExpandedOnce = true;
        }
      } else {
        post.comments = [{
          ...item,
          replies: [],
          repliesCount: 0,
          _hasReplies: false,
        }, ...(post.comments || [])];
      }

      post.commentsCount = (post.commentsCount != null ? post.commentsCount : 0) + 1;
      this.setData({ post, ...formatPostCountTexts(post) });
    },

    onSwiperChange(e) {
      const index = e.detail.current;
      this.setData({ currentPhotoIndex: index });
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
          const newComments = this._formatCommentsForDisplay(
            res.data.comments,
            this._getCurrentUserId()
          );
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
        const res = await togglePostLike(this._getPostId());
        if (res.success && this.data.post) {
          const post = withLikeFields(this.data.post, res.liked, res.likes);
          this.setData({ post, ...formatPostCountTexts(post) });
          this._likedChanged = true;
        }
      } catch (e) {
        showToast('操作失败');
      }
    },

    async toggleCommentLike(e) {
      if (!this._ensureLogin()) return;
      const commentId = getDataset(e).id;
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

    onReportBtnTouchStart() {
      this.setData({ reportBtnPressed: true });
    },

    onReportBtnTouchEnd() {
      if (this.data.reportBtnPressed) {
        this.setData({ reportBtnPressed: false });
      }
    },

    _showReportReasonSheet(onPick) {
      wx.showActionSheet({
        itemList: REPORT_REASONS,
        success: (res) => {
          if (res.tapIndex < 0 || res.tapIndex >= REPORT_REASONS.length) return;
          onPick(REPORT_REASONS[res.tapIndex]);
        },
      });
    },

    onReportPostTap() {
      if (!this._ensureLogin()) return;
      if (this.data.canAdminDelete) return;

      this._showReportReasonSheet((reason) => {
        this.setData({
          showReportModal: true,
          reportReason: reason,
          reportDetail: '',
          reportCommentId: '',
        });
      });
    },

    onReportDetailInput(e) {
      const value = (e.detail && e.detail.value !== undefined) ? e.detail.value : e.detail;
      this.setData({ reportDetail: value });
    },

    onReportCommentTap(e) {
      if (!this._ensureLogin()) return;
      const commentId = getDataset(e).id;
      if (!commentId) return;

      this._showReportReasonSheet((reason) => {
        this.setData({
          showReportModal: true,
          reportReason: reason,
          reportDetail: '',
          reportCommentId: commentId,
        });
      });
    },

    onDeleteCommentTap(e) {
      if (!this._ensureLogin()) return;
      const commentId = getDataset(e).id;
      const parentId = getDataset(e).parent || '';
      if (!commentId) return;

      wx.showModal({
        title: '删除评论',
        content: '删除后无法恢复，确定删除吗？',
        confirmColor: '#e02020',
        success: async (res) => {
          if (!res.confirm) return;
          showLoading('删除中...');
          try {
            const result = await postApi.deleteComment(commentId);
            hideLoading();
            if (!result.success) {
              showToast(result.message || '删除失败');
              return;
            }
            showSuccess('已删除');
            const post = this.data.post;
            if (!post || !post.comments) {
              this.loadPost();
              return;
            }
            if (parentId) {
              const top = post.comments.find((c) => c.id === parentId);
              if (top && top.replies) {
                top.replies = top.replies.filter((r) => r.id !== commentId);
                if (top.repliesCount > 0) top.repliesCount -= 1;
              }
            } else {
              post.comments = post.comments.filter((c) => c.id !== commentId);
            }
            const removed = result.data && result.data.removed ? result.data.removed : 1;
            post.commentsCount = Math.max(
              0,
              (post.commentsCount != null ? post.commentsCount : post.comments.length) - removed
            );
            this.setData({
              post,
              ...formatPostCountTexts(post),
            });
          } catch (err) {
            hideLoading();
            showToast('删除失败');
          }
        },
      });
    },

    closeReportModal() {
      if (this.data.reportSubmitting) return;
      this.setData({
        showReportModal: false,
        reportReason: '',
        reportDetail: '',
        reportCommentId: '',
      });
    },

    async submitReport() {
      if (this.data.reportSubmitting || !this.data.reportReason) return;
      const postId = this._getPostId();
      if (!postId) return;

      this.setData({ reportSubmitting: true });
      showLoading('提交中...');
      try {
        const payload = {
          postId,
          reason: this.data.reportReason,
          detail: (this.data.reportDetail || '').trim(),
        };
        if (this.data.reportCommentId) {
          payload.commentId = this.data.reportCommentId;
        }
        const res = await feedbackApi.report(payload);
        hideLoading();
        if (res.success) {
          this.setData({
            showReportModal: false,
            reportReason: '',
            reportDetail: '',
            reportCommentId: '',
          });
          showToast('感谢举报，我们会尽快处理');
        } else {
          showToast(res.message || '提交失败');
        }
      } catch (e) {
        hideLoading();
        showToast('提交失败，请稍后重试');
      } finally {
        this.setData({ reportSubmitting: false });
      }
    },

    onDeletePost() {
      const post = this.data.post;
      if (!post || !this.data.canAdminDelete) return;
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
      if (this._getPostId()) {
        this.loadPost(true);
      }
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
      const emoji = getDataset(e).emoji;
      if (!emoji) return;
      const content = (this.data.commentContent || '') + emoji;
      this.setData({
        commentContent: content,
        sendDisabled: !content.trim(),
      });
    },

    handleReplyTap(e) {
      if (!this._ensureLogin()) return;
      const { id, author, replyId } = getDataset(e);
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
      const commentId = getDataset(e).id;
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
          const userId = this._getCurrentUserId();
          const newReplies = res.data.replies.map((r) => this._formatReplyForDisplay(r, userId));
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
      const commentId = getDataset(e).id;
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
          this._appendSubmittedComment(res.data, {
            parentId,
            replyTo: replyTo,
            replyToAuthor,
          });
        } else {
          showToast(res.message || '评论失败');
        }
      } catch (e) {
        hideLoading();
        showToast('评论失败');
      }
    },

  },
});
