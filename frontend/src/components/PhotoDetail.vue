<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { api, auth } from '../api/photos';
import { toast } from '../utils/toast.js';

const props = defineProps({
  photoId: { type: Number, required: true }
});

const emit = defineEmits(['close', 'deleted']);

const photo = ref(null);
const loading = ref(true);
const newComment = ref('');
const submitting = ref(false);
const currentUser = ref(null);
const liked = ref(false);
const showDeleteConfirm = ref(false);
const comments = ref([]);
const commentCount = ref(0);

const getImageUrl = (path) => {
  if (path.startsWith('http')) return path;
  return `http://localhost:3000${path}`;
};

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const loadPhoto = async () => {
  loading.value = true;
  try {
    const res = await api.getPhoto(props.photoId);
    if (res.success) {
      photo.value = res.data;
      liked.value = res.data.liked || false;
      commentCount.value = res.data.commentCount || 0;
      // 评论走独立接口
      const cres = await api.getComments(props.photoId);
      if (cres.success) {
        comments.value = cres.data.comments;
      }
    }
  } catch (error) {
    console.error('加载照片失败:', error);
  } finally {
    loading.value = false;
  }
};

const handleLike = async () => {
  if (!currentUser.value) {
    toast.warning('请先登录');
    return;
  }
  const res = await api.likePhoto(props.photoId);
  if (res.success) {
    photo.value.likes = res.data.likes;
    liked.value = res.liked;
  }
};

const handleDelete = async () => {
  showDeleteConfirm.value = true;
};

const confirmDelete = async () => {
  showDeleteConfirm.value = false;
  const res = await api.deletePhoto(props.photoId);
  if (res.success) {
    toast.success('删除成功');
    emit('deleted');
    emit('close');
  } else {
    toast.error(res.message || '删除失败');
  }
};

const handleComment = async () => {
  if (!newComment.value.trim()) return;
  
  submitting.value = true;
  try {
    const res = await api.addComment(props.photoId, newComment.value);
    if (res.success) {
      comments.value.unshift(res.data);
      commentCount.value++;
      newComment.value = '';
      toast.success('评论成功');
    } else {
      toast.error(res.message || '评论失败');
    }
  } catch (error) {
    toast.error('评论失败，请重试');
  } finally {
    submitting.value = false;
  }
};

const handleKeydown = (e) => {
  if (e.key === 'Escape') {
    if (showDeleteConfirm.value) {
      // 先关确认弹窗
      showDeleteConfirm.value = false;
    } else {
      // 关闭详情页，触发主页刷新
      emit('close');
    }
  }
};

onMounted(() => {
  loadPhoto();
  currentUser.value = auth.getUser();
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="$emit('close')">
      <div class="modal">
        <button class="close-btn" @click="$emit('close')">×</button>
        
        <div v-if="loading" class="loading">加载中...</div>
        
        <div v-else-if="photo" class="content">
          <div class="image-section">
            <img :src="getImageUrl(photo.imageUrl)" :alt="photo.title" />
          </div>
          
          <div class="info-section">
            <h2>{{ photo.title }}</h2>
            <p class="description">{{ photo.description }}</p>
            
            <div class="meta">
              <span>📍 {{ photo.location }}</span>
              <span>👤 {{ photo.author }}</span>
              <span>📅 {{ formatDate(photo.createdAt) }}</span>
            </div>
            
            <div class="actions">
              <button :class="['like-btn', { liked: liked }]" @click="handleLike">
                <span class="heart">{{ liked ? '❤️' : '🤍' }}</span>
                <span class="count">{{ photo.likes }}</span>
              </button>
              <button 
                v-if="currentUser && currentUser.id === photo.authorId" 
                class="delete-btn" 
                @click="handleDelete"
              >
                🗑️ 删除
              </button>
            </div>


            
            <!-- 评论区域 -->
            <div class="comments-section">
              <h3>评论 ({{ commentCount }})</h3>
              
              <div class="comment-list">
                <div v-for="comment in comments" :key="comment.id || comment.content" class="comment">
                  <div class="comment-header">
                    <span class="author">{{ comment.author }}</span>
                    <span class="time">{{ formatDate(comment.createdAt) }}</span>
                  </div>
                  <p>{{ comment.content }}</p>
                </div>
                <div v-if="!comments.length" class="no-comments">
                  暂无评论，快来抢沙发~
                </div>
              </div>
              
              <div v-if="currentUser" class="comment-form">
                <input 
                  v-model="newComment" 
                  type="text" 
                  placeholder="说点什么..."
                  @keyup.enter="handleComment"
                />
                <button 
                  :disabled="!newComment.trim() || submitting"
                  @click="handleComment"
                >
                  {{ submitting ? '发送中' : '发送' }}
                </button>
              </div>
              <div v-else class="login-tip">
                登录后可以评论
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 删除确认对话框 —— 覆盖整个 modal -->
      <Transition name="confirm-fade">
        <div v-if="showDeleteConfirm" class="confirm-dialog" @click.self="showDeleteConfirm = false">
          <div class="confirm-content">
            <div class="confirm-icon">🗑️</div>
            <p class="confirm-title">确定要删除这张照片吗？</p>
            <p class="confirm-hint">删除后无法恢复</p>
            <div class="confirm-btns">
              <button class="confirm-cancel" @click="showDeleteConfirm = false">取消</button>
              <button class="confirm-ok" @click="confirmDelete">确定删除</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  font-size: 28px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading {
  padding: 60px;
  text-align: center;
  color: #888;
}

.content {
  display: flex;
  height: 100%;
  max-height: 90vh;
}

.image-section {
  flex: 1;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.image-section img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
}

.info-section {
  width: 360px;
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

h2 {
  margin: 0 0 12px;
  font-size: 20px;
}

.description {
  color: #666;
  margin: 0 0 16px;
  line-height: 1.6;
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #888;
  font-size: 14px;
  margin-bottom: 16px;
}

.actions {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.delete-btn {
  background: #fef0f0;
  color: #e74c3c;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.like-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f5f5f5;
  color: #666;
  padding: 10px 20px;
  border: none;
  border-radius: 24px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.like-btn:hover {
  background: #eeeeee;
}

.like-btn.liked {
  background: #ffeaea;
}

.like-btn .count {
  font-weight: 600;
}

.like-btn.liked .count {
  color: #fe2c55;
}

.like-btn .heart {
  font-size: 20px;
}

.delete-btn {
  background: #fef0f0;
  color: #e74c3c;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.comments-section {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.comments-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: #333;
}

.comment-list {
  flex: 1;
  overflow-y: auto;
  margin-bottom: 16px;
}

.comment {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.comment-header .author {
  font-weight: 600;
  color: #333;
  font-size: 14px;
}

.comment-header .time {
  color: #aaa;
  font-size: 12px;
}

.comment p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.no-comments {
  color: #aaa;
  text-align: center;
  padding: 20px;
}

.comment-form {
  display: flex;
  gap: 8px;
}

.comment-form input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
}

.comment-form button {
  padding: 10px 16px;
  background: #667eea;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.comment-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-tip {
  text-align: center;
  color: #888;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
  font-size: 14px;
}

/* 删除确认对话框 */
.confirm-dialog {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  z-index: 100;
}

.confirm-content {
  background: white;
  padding: 32px 28px 24px;
  border-radius: 20px;
  text-align: center;
  width: 300px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.confirm-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.confirm-title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.confirm-hint {
  margin: 0;
  font-size: 13px;
  color: #999;
}

.confirm-btns {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.confirm-cancel,
.confirm-ok {
  flex: 1;
  padding: 11px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.confirm-cancel {
  background: #f0f0f0;
  color: #555;
}

.confirm-cancel:hover {
  background: #e0e0e0;
}

.confirm-ok {
  background: #ef4444;
  color: white;
}

.confirm-ok:hover {
  background: #dc2626;
  transform: translateY(-1px);
}

/* 确认弹窗动画 */
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
.confirm-fade-enter-active .confirm-content,
.confirm-fade-leave-active .confirm-content {
  transition: transform 0.2s ease;
}
.confirm-fade-enter-from .confirm-content {
  transform: scale(0.9);
}
.confirm-fade-leave-to .confirm-content {
  transform: scale(0.9);
}

@media (max-width: 768px) {
  .content {
    flex-direction: column;
  }
  
  .info-section {
    width: 100%;
    max-height: 50vh;
  }
  
  .image-section {
    min-height: 250px;
  }
}
</style>

