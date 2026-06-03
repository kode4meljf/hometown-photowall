<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminApi, adminAuth, toPostDetail, type AdminFeedback, type AdminPhoto, type AdminPostDetail, type AdminStats, type AdminUser, type ManagedUser, type PostStatus } from '../api/admin';
import PostDetailModal from '../components/PostDetailModal.vue';
import { toast } from '../utils/toast.js';

const emit = defineEmits<{
  logout: [];
}>();

const props = defineProps<{
  user: AdminUser;
}>();

const activeTab = ref<'photos' | 'users' | 'feedbacks'>('photos');
const photoStatus = ref<'all' | PostStatus>('all');
const feedbackStatus = ref<'all' | 'pending' | 'processing' | 'resolved'>('pending');
const feedbackType = ref<'all' | 'feedback' | 'report'>('all');
const photos = ref<AdminPhoto[]>([]);
const users = ref<ManagedUser[]>([]);
const feedbacks = ref<AdminFeedback[]>([]);
const stats = ref<AdminStats | null>(null);
const loading = ref(false);
const deleteId = ref<string | null>(null);
const detailShow = ref(false);
const detailLoading = ref(false);
const detailPost = ref<AdminPostDetail | null>(null);
const feedbackDetail = ref<AdminFeedback | null>(null);
const feedbackNote = ref('');
const feedbackSaving = ref(false);
const statusUpdatingId = ref<string | null>(null);
const rejectModalId = ref<string | null>(null);
const rejectNote = ref('');

const loadPhotos = async () => {
  loading.value = true;
  try {
    const res = await adminApi.getPhotos({
      pageSize: 100,
      status: photoStatus.value,
    });
    if (res.success && res.data) {
      photos.value = res.data.photos;
    } else {
      toast.error(res.message || '加载照片失败');
    }
  } catch {
    toast.error('加载照片失败');
  } finally {
    loading.value = false;
  }
};

const loadUsers = async () => {
  loading.value = true;
  try {
    const res = await adminApi.getUsers();
    if (res.success && res.data) {
      users.value = res.data;
    } else {
      toast.error(res.message || '加载用户失败');
    }
  } catch {
    toast.error('加载用户失败');
  } finally {
    loading.value = false;
  }
};

const loadStats = async () => {
  const res = await adminApi.getStats();
  if (res.success && res.data) {
    stats.value = res.data;
  }
};

const loadFeedbacks = async () => {
  loading.value = true;
  try {
    const res = await adminApi.getFeedbacks({
      pageSize: 100,
      status: feedbackStatus.value,
      type: feedbackType.value,
    });
    if (res.success && res.data) {
      feedbacks.value = res.data.feedbacks;
    } else {
      toast.error(res.message || '加载反馈失败');
    }
  } catch {
    toast.error('加载反馈失败');
  } finally {
    loading.value = false;
  }
};

const openFeedback = (item: AdminFeedback) => {
  feedbackDetail.value = item;
  feedbackNote.value = item.adminNote || '';
};

const closeFeedback = () => {
  feedbackDetail.value = null;
  feedbackNote.value = '';
};

const saveFeedback = async (status: AdminFeedback['status']) => {
  const item = feedbackDetail.value;
  if (!item || feedbackSaving.value) return;

  feedbackSaving.value = true;
  try {
    const res = await adminApi.updateFeedback(item.id, {
      status,
      adminNote: feedbackNote.value.trim(),
    });
    if (res.success && res.data) {
      const idx = feedbacks.value.findIndex((f) => f.id === item.id);
      if (idx >= 0) {
        feedbacks.value[idx] = res.data;
      }
      if (feedbackStatus.value !== 'all' && res.data.status !== feedbackStatus.value) {
        feedbacks.value = feedbacks.value.filter((f) => f.id !== item.id);
      }
      feedbackDetail.value = res.data;
      loadStats();
      toast.success(status === 'resolved' ? '已标记为已处理' : '状态已更新');
    } else {
      toast.error(res.message || '更新失败');
    }
  } catch {
    toast.error('更新失败');
  } finally {
    feedbackSaving.value = false;
  }
};

const feedbackStatusLabel = (status: AdminFeedback['status']) => {
  if (status === 'pending') return '待处理';
  if (status === 'processing') return '处理中';
  return '已处理';
};

const feedbackTypeLabel = (type: AdminFeedback['type']) => {
  return type === 'report' ? '举报' : '反馈';
};

const postStatusLabel = (status: PostStatus) => {
  if (status === 'released') return '已发布';
  if (status === 'reviewing') return '审核中';
  if (status === 'hidden') return '已隐藏';
  return '未通过';
};

const updatePhotoStatus = async (id: string, status: PostStatus, reviewNote?: string) => {
  if (statusUpdatingId.value) return;
  statusUpdatingId.value = id;
  try {
    const res = await adminApi.updatePostStatus(id, status, reviewNote);
    if (res.success && res.data) {
      if (photoStatus.value !== 'all' && res.data.status !== photoStatus.value) {
        photos.value = photos.value.filter((p) => p.id !== id);
      } else {
        const idx = photos.value.findIndex((p) => p.id === id);
        if (idx >= 0) {
          photos.value[idx] = {
            ...photos.value[idx],
            status: res.data.status,
            mediaTraceIds: res.data.mediaTraceIds,
            reviewAdminNote: res.data.reviewAdminNote,
          };
        }
      }
      if (detailPost.value?.id === id) {
        detailPost.value = res.data;
      }
      loadStats();
      toast.success('状态已更新');
    } else {
      toast.error(res.message || '更新失败');
    }
  } catch {
    toast.error('更新失败');
  } finally {
    statusUpdatingId.value = null;
  }
};

const promptReject = (id: string) => {
  rejectModalId.value = id;
  rejectNote.value = '';
};

const closeRejectModal = () => {
  rejectModalId.value = null;
  rejectNote.value = '';
};

const confirmReject = async () => {
  const id = rejectModalId.value;
  if (!id) return;
  const note = rejectNote.value.trim();
  closeRejectModal();
  await updatePhotoStatus(id, 'rejected', note);
};

const onPostStatusChange = (id: string, status: PostStatus) => {
  if (status === 'rejected') {
    promptReject(id);
    return;
  }
  updatePhotoStatus(id, status);
};

const truncateText = (text: string, max = 48) => {
  if (!text) return '-';
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

const handleDelete = (id: string) => {
  deleteId.value = id;
};

const openDetail = async (photo: AdminPhoto) => {
  detailShow.value = true;
  detailPost.value = toPostDetail(photo);
  detailLoading.value = true;
  try {
    const res = await adminApi.getPostDetail(photo.id);
    if (res.success && res.data) {
      detailPost.value = res.data;
    } else if (res.message && res.message !== '未知操作') {
      toast.warning(res.message);
    }
  } catch (e) {
    toast.warning(e instanceof Error ? e.message : '详情加载失败，已显示基础信息');
  } finally {
    detailLoading.value = false;
  }
};

const closeDetail = () => {
  detailShow.value = false;
  detailPost.value = null;
};

const handlePostUpdated = (post: AdminPostDetail) => {
  detailPost.value = post;
  const idx = photos.value.findIndex((p) => p.id === post.id);
  if (idx >= 0) {
    photos.value[idx] = {
      ...photos.value[idx],
      title: post.title,
      description: post.description,
      location: post.location,
      status: post.status,
      mediaTraceIds: post.mediaTraceIds,
      reviewAdminNote: post.reviewAdminNote,
      imageUrl: post.photos[0]?.imageUrl || photos.value[idx].imageUrl,
      photos: post.photos
    };
  }
};

const confirmDelete = async () => {
  const id = deleteId.value;
  if (!id) return;
  deleteId.value = null;

  const res = await adminApi.deletePhoto(id);
  if (res.success) {
    photos.value = photos.value.filter((p) => p.id !== id);
    if (detailPost.value?.id === id) closeDetail();
    loadStats();
    toast.success('删除成功');
  } else {
    toast.error(res.message || '删除失败');
  }
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('zh-CN');
};

const handleLogout = () => {
  adminAuth.logout();
  emit('logout');
};

onMounted(() => {
  loadPhotos();
  loadUsers();
  loadStats();
});
</script>

<template>
  <div class="dashboard">
    <header class="header">
      <div>
        <h1>管理后台</h1>
        <p>欢迎，{{ props.user.nickname || props.user.username }}</p>
      </div>
      <button class="logout-btn" @click="handleLogout">退出登录</button>
    </header>

    <div v-if="stats" class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalPhotos }}</div>
        <div class="stat-label">照片总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalUsers }}</div>
        <div class="stat-label">用户总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalLikes }}</div>
        <div class="stat-label">获赞总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalViews }}</div>
        <div class="stat-label">浏览总数</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">{{ stats.totalComments }}</div>
        <div class="stat-label">评论总数</div>
      </div>
      <div class="stat-card stat-card-warn">
        <div class="stat-value">{{ stats.reviewingPosts ?? 0 }}</div>
        <div class="stat-label">待审作品</div>
      </div>
      <div class="stat-card stat-card-warn">
        <div class="stat-value">{{ stats.pendingFeedbacks ?? 0 }}</div>
        <div class="stat-label">待处理反馈</div>
      </div>
    </div>

    <div class="tabs">
      <button :class="{ active: activeTab === 'photos' }" @click="activeTab = 'photos'; loadPhotos()">
        照片管理
        <span v-if="stats?.reviewingPosts" class="tab-badge">{{ stats.reviewingPosts }}</span>
      </button>
      <button :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'; loadUsers()">
        用户管理
      </button>
      <button :class="{ active: activeTab === 'feedbacks' }" @click="activeTab = 'feedbacks'; loadFeedbacks()">
        意见反馈
        <span v-if="stats?.pendingFeedbacks" class="tab-badge">{{ stats.pendingFeedbacks }}</span>
      </button>
    </div>

    <div v-if="activeTab === 'photos'" class="panel">
      <div class="feedback-toolbar">
        <button
          v-for="item in [
            { key: 'all', label: '全部' },
            { key: 'released', label: '已发布' },
            { key: 'reviewing', label: '审核中' },
            { key: 'hidden', label: '已隐藏' },
            { key: 'rejected', label: '未通过' },
          ]"
          :key="item.key"
          :class="['filter-btn', { active: photoStatus === item.key }]"
          @click="photoStatus = item.key as typeof photoStatus; loadPhotos()"
        >
          {{ item.label }}
        </button>
      </div>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>封面</th>
              <th>标题</th>
              <th>状态</th>
              <th>作者</th>
              <th>地点</th>
              <th>分类</th>
              <th>点赞</th>
              <th>浏览</th>
              <th>评论</th>
              <th>时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="photo in photos" :key="photo.id" class="photo-row" @click="openDetail(photo)">
              <td>
                <img v-if="photo.imageUrl" :src="photo.imageUrl" alt="" class="thumb" />
                <span v-else class="no-thumb">无图</span>
              </td>
              <td>{{ photo.title || '无标题' }}</td>
              <td>
                <span :class="['post-status', photo.status]">{{ postStatusLabel(photo.status) }}</span>
              </td>
              <td>{{ photo.author }}</td>
              <td>{{ photo.location || '-' }}</td>
              <td>{{ photo.category }}</td>
              <td>{{ photo.likes }}</td>
              <td>{{ photo.views }}</td>
              <td>{{ photo.commentCount }}</td>
              <td>{{ formatDate(photo.createdAt) }}</td>
              <td class="action-cell" @click.stop>
                <button
                  v-if="photo.status === 'reviewing'"
                  class="primary-btn small-btn"
                  :disabled="statusUpdatingId === photo.id"
                  @click="updatePhotoStatus(photo.id, 'released')"
                >
                  通过
                </button>
                <button
                  v-if="photo.status === 'reviewing'"
                  class="ghost-btn small-btn"
                  :disabled="statusUpdatingId === photo.id"
                  @click="promptReject(photo.id)"
                >
                  驳回
                </button>
                <button
                  v-if="photo.status === 'rejected'"
                  class="ghost-btn small-btn"
                  :disabled="statusUpdatingId === photo.id"
                  @click="updatePhotoStatus(photo.id, 'released')"
                >
                  重新发布
                </button>
                <button
                  v-if="photo.status === 'released'"
                  class="ghost-btn small-btn"
                  :disabled="statusUpdatingId === photo.id"
                  @click="updatePhotoStatus(photo.id, 'hidden')"
                >
                  隐藏
                </button>
                <button
                  v-if="photo.status === 'hidden'"
                  class="ghost-btn small-btn"
                  :disabled="statusUpdatingId === photo.id"
                  @click="updatePhotoStatus(photo.id, 'released')"
                >
                  公开
                </button>
                <button class="danger-btn small-btn" @click="handleDelete(photo.id)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!photos.length" class="empty">暂无照片</p>
      </div>
    </div>

    <div v-if="activeTab === 'users'" class="panel">
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>昵称</th>
              <th>角色</th>
              <th>照片数</th>
              <th>评论数</th>
              <th>注册时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id">
              <td>{{ user.username || '-' }}</td>
              <td>{{ user.nickname }}</td>
              <td>
                <span :class="['role', user.role]">
                  {{ user.role === 'admin' ? '管理员' : '用户' }}
                </span>
              </td>
              <td>{{ user.photoCount }}</td>
              <td>{{ user.commentCount }}</td>
              <td>{{ formatDate(user.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!users.length" class="empty">暂无用户</p>
      </div>
    </div>

    <div v-if="activeTab === 'feedbacks'" class="panel">
      <div class="feedback-toolbar">
        <button
          v-for="item in [
            { key: 'pending', label: '待处理' },
            { key: 'processing', label: '处理中' },
            { key: 'resolved', label: '已处理' },
            { key: 'all', label: '全部' },
          ]"
          :key="item.key"
          :class="['filter-btn', { active: feedbackStatus === item.key }]"
          @click="feedbackStatus = item.key as typeof feedbackStatus; loadFeedbacks()"
        >
          {{ item.label }}
        </button>
        <span class="toolbar-divider"></span>
        <button
          v-for="item in [
            { key: 'all', label: '全部类型' },
            { key: 'feedback', label: '意见反馈' },
            { key: 'report', label: '举报' },
          ]"
          :key="`type-${item.key}`"
          :class="['filter-btn', 'filter-btn-type', { active: feedbackType === item.key }]"
          @click="feedbackType = item.key as typeof feedbackType; loadFeedbacks()"
        >
          {{ item.label }}
        </button>
      </div>
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>状态</th>
              <th>类型</th>
              <th>用户</th>
              <th>内容</th>
              <th>作品ID</th>
              <th>联系方式</th>
              <th>提交时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in feedbacks"
              :key="item.id"
              class="photo-row"
              @click="openFeedback(item)"
            >
              <td>
                <span :class="['fb-status', item.status]">{{ feedbackStatusLabel(item.status) }}</span>
              </td>
              <td>
                <span :class="['fb-type', item.type]">{{ feedbackTypeLabel(item.type) }}</span>
              </td>
              <td>{{ item.authorNickname || '游客' }}</td>
              <td class="content-cell">
                <span v-if="item.type === 'report' && item.reason" class="report-reason">{{ item.reason }}</span>
                {{ truncateText(item.content, 60) }}
              </td>
              <td>{{ item.postId || '-' }}</td>
              <td>{{ item.contact || '-' }}</td>
              <td>{{ formatDate(item.createdAt) }}</td>
              <td>
                <button class="ghost-btn small-btn" @click.stop="openFeedback(item)">处理</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!feedbacks.length" class="empty">暂无反馈</p>
      </div>
    </div>

    <PostDetailModal
      :show="detailShow"
      :post="detailPost"
      :loading="detailLoading"
      :status-updating="statusUpdatingId === detailPost?.id"
      @close="closeDetail"
      @updated="handlePostUpdated"
      @status-change="onPostStatusChange"
    />

    <div v-if="rejectModalId" class="confirm-overlay" @click.self="closeRejectModal">
      <div class="feedback-box">
        <div class="feedback-head">
          <h3>驳回作品</h3>
        </div>
        <p class="feedback-meta">用户端仅会看到「未通过审核」的泛化提示，不会看到下方备注。</p>
        <label class="feedback-label">内部备注（选填，仅管理员可见）</label>
        <textarea
          v-model="rejectNote"
          class="feedback-note"
          placeholder="记录驳回原因，便于后续处理"
          maxlength="500"
        />
        <div class="confirm-actions">
          <button class="ghost-btn" @click="closeRejectModal">取消</button>
          <button class="danger-btn" @click="confirmReject">确认驳回</button>
        </div>
      </div>
    </div>

    <div v-if="deleteId" class="confirm-overlay" @click.self="deleteId = null">
      <div class="confirm-box">
        <p class="confirm-title">确定删除这张照片？</p>
        <p class="confirm-hint">删除后无法恢复，相关评论也会一并删除</p>
        <div class="confirm-actions">
          <button class="ghost-btn" @click="deleteId = null">取消</button>
          <button class="danger-btn" @click="confirmDelete">确定删除</button>
        </div>
      </div>
    </div>

    <div v-if="feedbackDetail" class="confirm-overlay" @click.self="closeFeedback">
      <div class="feedback-box">
        <div class="feedback-head">
          <h3>{{ feedbackDetail.type === 'report' ? '内容举报' : '意见反馈' }}</h3>
          <span :class="['fb-status', feedbackDetail.status]">
            {{ feedbackStatusLabel(feedbackDetail.status) }}
          </span>
        </div>
        <p class="feedback-meta">
          <span :class="['fb-type', feedbackDetail.type]">{{ feedbackTypeLabel(feedbackDetail.type) }}</span>
          · {{ feedbackDetail.authorNickname || '游客' }}
          · {{ formatDate(feedbackDetail.createdAt) }}
          <span v-if="feedbackDetail.contact"> · {{ feedbackDetail.contact }}</span>
        </p>
        <div v-if="feedbackDetail.type === 'report'" class="feedback-report-meta">
          <p v-if="feedbackDetail.reason"><strong>举报原因：</strong>{{ feedbackDetail.reason }}</p>
          <p v-if="feedbackDetail.postId"><strong>作品 ID：</strong>{{ feedbackDetail.postId }}</p>
        </div>
        <div class="feedback-content">{{ feedbackDetail.content }}</div>
        <label class="feedback-label">处理备注（选填）</label>
        <textarea
          v-model="feedbackNote"
          class="feedback-note"
          placeholder="记录处理说明，仅管理员可见"
          maxlength="500"
        />
        <div class="confirm-actions">
          <button class="ghost-btn" @click="closeFeedback">关闭</button>
          <button
            class="ghost-btn"
            :disabled="feedbackSaving"
            @click="saveFeedback('processing')"
          >
            标记处理中
          </button>
          <button
            class="primary-btn"
            :disabled="feedbackSaving"
            @click="saveFeedback('resolved')"
          >
            标记已处理
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 20px 40px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.header h1 {
  margin: 0;
  font-size: 24px;
  color: #1e293b;
}

.header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 14px;
}

.logout-btn,
.ghost-btn,
.danger-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.logout-btn,
.ghost-btn {
  padding: 10px 16px;
  background: #f1f5f9;
  color: #475569;
}

.danger-btn {
  padding: 6px 12px;
  background: #fee2e2;
  color: #dc2626;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
}

.stat-card {
  background: #fff;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
}

.stat-label {
  margin-top: 6px;
  font-size: 13px;
  color: #64748b;
}

.stat-card-warn .stat-value {
  color: #ea580c;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.tabs button {
  padding: 10px 18px;
  border: 1px solid #dbe3f0;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  cursor: pointer;
}

.tabs button.active {
  background: #6366f1;
  border-color: #6366f1;
  color: #fff;
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  line-height: 1;
}

.feedback-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 0;
}

.toolbar-divider {
  width: 1px;
  height: 24px;
  margin: 0 4px;
  background: #dbe3f0;
}

.filter-btn-type.active {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #b45309;
}

.fb-type {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  background: #f1f5f9;
  color: #475569;
}

.fb-type.report {
  background: #fef3c7;
  color: #b45309;
}

.report-reason {
  display: inline-block;
  margin-right: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 12px;
}

.feedback-report-meta {
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 14px;
  color: #334155;
}

.feedback-report-meta p {
  margin: 0 0 6px;
}

.feedback-report-meta p:last-child {
  margin-bottom: 0;
}

.filter-btn {
  padding: 8px 14px;
  border: 1px solid #dbe3f0;
  border-radius: 999px;
  background: #fff;
  color: #475569;
  cursor: pointer;
  font-size: 13px;
}

.filter-btn.active {
  background: #eef2ff;
  border-color: #6366f1;
  color: #4338ca;
}

.fb-status {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.fb-status.pending {
  background: #ffedd5;
  color: #c2410c;
}

.fb-status.processing {
  background: #dbeafe;
  color: #1d4ed8;
}

.fb-status.resolved {
  background: #dcfce7;
  color: #15803d;
}

.content-cell {
  max-width: 320px;
}

.action-cell {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 180px;
}

.post-status {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
}

.post-status.released {
  background: #dcfce7;
  color: #15803d;
}

.post-status.reviewing {
  background: #ffedd5;
  color: #c2410c;
}

.post-status.hidden {
  background: #f1f5f9;
  color: #475569;
}

.post-status.rejected {
  background: #fee2e2;
  color: #b91c1c;
}

.small-btn {
  padding: 6px 10px;
}

.primary-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  padding: 11px;
  flex: 1;
  background: #6366f1;
  color: #fff;
}

.feedback-box {
  width: min(520px, calc(100vw - 32px));
  background: #fff;
  border-radius: 16px;
  padding: 24px;
}

.feedback-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.feedback-head h3 {
  margin: 0;
  font-size: 18px;
  color: #0f172a;
}

.feedback-meta {
  margin: 10px 0 0;
  font-size: 13px;
  color: #64748b;
}

.feedback-content {
  margin-top: 16px;
  padding: 14px;
  background: #f8fafc;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.7;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-word;
}

.feedback-label {
  display: block;
  margin-top: 16px;
  font-size: 13px;
  color: #64748b;
}

.feedback-note {
  width: 100%;
  min-height: 88px;
  margin-top: 8px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  font-family: inherit;
}

.panel {
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  overflow: hidden;
}

.loading,
.empty {
  padding: 40px;
  text-align: center;
  color: #94a3b8;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
}

th {
  background: #f8fafc;
  color: #64748b;
  font-weight: 600;
}

.thumb {
  width: 56px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
}

.no-thumb {
  color: #94a3b8;
  font-size: 12px;
}

.photo-row {
  cursor: pointer;
  transition: background 0.15s;
}

.photo-row:hover {
  background: #f8fafc;
}

.role {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.role.admin {
  background: #dcfce7;
  color: #15803d;
}

.role.user {
  background: #dbeafe;
  color: #1d4ed8;
}

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.confirm-box {
  width: 320px;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
}

.confirm-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.confirm-hint {
  margin: 8px 0 0;
  font-size: 13px;
  color: #94a3b8;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.confirm-actions button {
  flex: 1;
  padding: 11px;
}

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
  }

  th,
  td {
    padding: 8px;
    font-size: 12px;
  }
}
</style>
