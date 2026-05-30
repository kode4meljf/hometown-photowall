<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminApi, adminAuth, toPostDetail, type AdminPhoto, type AdminPostDetail, type AdminStats, type AdminUser, type ManagedUser } from '../api/admin';
import PostDetailModal from '../components/PostDetailModal.vue';
import { toast } from '../utils/toast.js';

const emit = defineEmits<{
  logout: [];
}>();

const props = defineProps<{
  user: AdminUser;
}>();

const activeTab = ref<'photos' | 'users'>('photos');
const photos = ref<AdminPhoto[]>([]);
const users = ref<ManagedUser[]>([]);
const stats = ref<AdminStats | null>(null);
const loading = ref(false);
const deleteId = ref<string | null>(null);
const detailShow = ref(false);
const detailLoading = ref(false);
const detailPost = ref<AdminPostDetail | null>(null);

const loadPhotos = async () => {
  loading.value = true;
  try {
    const res = await adminApi.getPhotos({ pageSize: 100 });
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
    </div>

    <div class="tabs">
      <button :class="{ active: activeTab === 'photos' }" @click="activeTab = 'photos'; loadPhotos()">
        照片管理
      </button>
      <button :class="{ active: activeTab === 'users' }" @click="activeTab = 'users'; loadUsers()">
        用户管理
      </button>
    </div>

    <div v-if="activeTab === 'photos'" class="panel">
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>封面</th>
              <th>标题</th>
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
              <td>{{ photo.author }}</td>
              <td>{{ photo.location || '-' }}</td>
              <td>{{ photo.category }}</td>
              <td>{{ photo.likes }}</td>
              <td>{{ photo.views }}</td>
              <td>{{ photo.commentCount }}</td>
              <td>{{ formatDate(photo.createdAt) }}</td>
              <td>
                <button class="danger-btn" @click.stop="handleDelete(photo.id)">删除</button>
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

    <PostDetailModal
      :show="detailShow"
      :post="detailPost"
      :loading="detailLoading"
      @close="closeDetail"
      @updated="handlePostUpdated"
    />

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
