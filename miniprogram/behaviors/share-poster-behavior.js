const { postApi } = require('../utils/api');
const { renderSharePoster } = require('../utils/sharePoster');
const { ensurePrivacyAuthorized } = require('../utils/privacy');
const { handleSaveAlbumFail } = require('../utils/mediaPicker');
const { showLoading, hideLoading, showToast, showSuccess, formatPostCountTexts } = require('../utils/util');

module.exports = Behavior({
  data: {
    showSharePoster: false,
    sharePosterPath: '',
    sharePosterGenerating: false,
    sharePosterError: '',
  },

  methods: {
    async generatePoster() {
      if (typeof this._ensureLogin === 'function' && !this._ensureLogin()) return;

      const post = this.data.post;
      if (!post || this._posterGenerating) return;

      const postId = this._getPostId();
      if (!postId) return;

      const idx = this.data.currentPhotoIndex || 0;
      const photo = post.photos && post.photos[idx];
      if (!photo || !photo.imageUrl) {
        showToast('暂无图片可分享');
        return;
      }

      this._posterGenerating = true;
      this.setData({ sharePosterGenerating: true, sharePosterError: '' });
      showLoading('生成中');

      const drawPoster = async () => {
        try {
          const qrRes = await postApi.getShareQrCode({ postId, photoIndex: idx });
          if (!qrRes.success || !qrRes.data || !qrRes.data.qrBase64) {
            throw new Error(qrRes.message || '小程序码获取失败');
          }

          const posterPath = await renderSharePoster(this, {
            photoUrl: photo.imageUrl,
            photoIndex: idx,
            photoCount: post.photos.length,
            titleDesc: post.titleDesc || post.title || post.description || '',
            author: post.author || '',
            authorAvatar: post.authorAvatar || '',
            location: post.location || '',
            qrBase64: qrRes.data.qrBase64,
          });

          this.setData({
            showSharePoster: true,
            sharePosterPath: posterPath,
            sharePosterError: '',
          });

          postApi.recordShare(postId).then((res) => {
            if (!res?.success || !this.data.post) return;
            const nextPost = { ...this.data.post, shares: res.data.shares };
            this.setData({ post: nextPost, ...formatPostCountTexts(nextPost) });
          }).catch(() => {});
        } catch (e) {
          const msg = (e && e.message) || '生成失败，请重试';
          console.error('[generatePoster]', e);
          this.setData({ sharePosterError: msg });
          showToast(msg);
        } finally {
          hideLoading();
          this._posterGenerating = false;
          this.setData({ sharePosterGenerating: false });
        }
      };

      wx.nextTick(() => {
        drawPoster();
      });
    },

    closeSharePoster() {
      this.setData({
        showSharePoster: false,
        sharePosterPath: '',
      });
    },

    async saveSharePoster() {
      const path = this.data.sharePosterPath;
      if (!path) return;

      const privacyOk = await ensurePrivacyAuthorized();
      if (!privacyOk) return;

      showLoading('保存中');
      try {
        await wx.saveImageToPhotosAlbum({ filePath: path });
        showSuccess('已保存到相册');
      } catch (e) {
        handleSaveAlbumFail(e);
      } finally {
        hideLoading();
      }
    },

    _resetSharePosterState() {
      this._posterGenerating = false;
      this.setData({
        showSharePoster: false,
        sharePosterPath: '',
        sharePosterGenerating: false,
        sharePosterError: '',
      });
    },
  },
});
