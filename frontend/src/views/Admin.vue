<script setup>
import { ref, computed, onMounted } from 'vue';
import { api, adminApi, auth } from '../api/photos';
import { toast } from '../utils/toast.js';

const currentUser = computed(() => auth.getUser());
const isAdmin = computed(() => currentUser.value?.role === 'admin');

const activeTab = ref('photos');
const photos = ref([]);
const users = ref([]);
const loading = ref(false);
const stats = ref(null);
const deleteId = ref(null);

const loadPhotos = async () => {
  loading.value = true;
  try {
    const res = await adminApi.getPhotos({ limit: 100 });
    if (res.success) {
      photos.value = res.data.photos;
    }
  } catch (error) {
    console.error('加载照片失败:', error);
  } finally {
    loading.value = false;
  }
};

const loadUsers = async () => {
  loading.value = true;
  try {
    const res = await adminApi.getUsers();
    if (res.success) {
      users.value = res.data;
    }
  } catch (error) {
    console.error('加载用户失败:', error);
  } finally {
    loading.value = false;
  }
};

const loadStats = async () => {
  const res = await api.getStats();
  if (res.success) {
    stats.value = res.data;
  }
};

const handleDelete = (id) => {
  deleteId.value = id;
};

const confirmDelete = async () => {
  const id = deleteId.value;
  deleteId.value = null;
  
  const res = await adminApi.deletePhoto(id);
  if (res.success) {
    photos.value = photos.value.filter(p => p.id !== id);
    loadStats();
    toast.success('删除成功');
  } else {
    toast.error(res.message || '删除失败');
  }
};

const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('zh-CN');
};

onMounted(() => {
  if (isAdmin.value) {
    loadPhotos();
    loadUsers();
    loadStats();
  }
});
</script>

<template>
  <div class="admin-page">
    <header class="header">
      <h1>⚙️ 管理后台</h1>
    </header>

    <div v-if="!isAdmin" class="no-permission">
      <p>您没有管理员权限</p>
    </div>

    <template v-else>
      <!-- 统计卡片 -->
      <div v-if="stats" class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">📸</div>
          <div class="stat-value">{{ stats.totalPhotos }}</div>
          <div class="stat-label">照片总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-value">{{ stats.totalUsers }}</div>
          <div class="stat-label">用户总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">❤️</div>
          <div class="stat-value">{{ stats.totalLikes }}</div>
          <div class="stat-label">获赞总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">👁️</div>
          <div class="stat-value">{{ stats.totalViews }}</div>
          <div class="stat-label">浏览总数</div>
        </div>
      </div>

      <!-- 标签页 -->
      <div class="tabs">
        <button 
          :class="{ active: activeTab === 'photos' }" 
          @click="activeTab = 'photos'; loadPhotos()"
        >
          📸 照片管理
        </button>
        <button 
          :class="{ active: activeTab === 'users' }" 
          @click="activeTab = 'users'; loadUsers()"
        >
          👥 用户管理
        </button>
      </div>

      <!-- 照片列表 -->
      <div v-if="activeTab === 'photos'" class="content">
        <div v-if="loading" class="loading">加载中...</div>
        
        <div v-else class="photo-list">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>封面</th>
                <th>标题</th>
                <th>作者</th>
                <th>地点</th>
                <th>分类</th>
                <th>点赞</th>
                <th>浏览</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="photo in photos" :key="photo.id">
                <td>{{ photo.id }}</td>
                <td>
                  <img 
                    :src="`http://localhost:3000${photo.imageUrl}`" 
                    alt="" 
                    class="thumbnail"
                  />
                </td>
                <td>{{ photo.title }}</td>
                <td>{{ photo.author }}</td>
                <td>{{ photo.location }}</td>
                <td>{{ photo.category }}</td>
                <td>{{ photo.likes }}</td>
                <td>{{ photo.views }}</td>
                <td>{{ formatDate(photo.createdAt) }}</td>
                <td>
                  <button class="delete-btn" @click="handleDelete(photo.id)">
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 用户列表 -->
      <div v-if="activeTab === 'users'" class="content">
        <div v-if="loading" class="loading">加载中...</div>
        
        <div v-else class="user-list">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>昵称</th>
                <th>角色</th>
                <th>照片数</th>
                <th>注册时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td>{{ user.id }}</td>
                <td>{{ user.username }}</td>
                <td>{{ user.nickname }}</td>
                <td>
                  <span :class="['role', user.role]">{{ user.role === 'admin' ? '管理员' : '用户' }}</span>
                </td>
                <td>{{ user.photoCount }}</td>
                <td>{{ formatDate(user.createdAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 删除确认弹窗 -->
    <Transition name="confirm-fade">
      <div v-if="deleteId" class="confirm-overlay" @click.self="deleteId = null">
        <div class="confirm-box">
          <div class="confirm-icon">🗑️</div>
          <p class="confirm-title">确定要删除这张照片吗？</p>
          <p class="confirm-hint">删除后无法恢复</p>
          <div class="confirm-btns">
            <button class="confirm-cancel" @click="deleteId = null">取消</button>
            <button class="confirm-ok" @click="confirmDelete">确定删除</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.admin-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  margin-bottom: 24px;
}

.header h1 {
  margin: 0;
  color: #333;
}

.no-permission {
  text-align: center;
  padding: 60px;
  color: #888;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: white;
  padding: 20px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.stat-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #333;
}

.stat-label {
  color: #888;
  font-size: 14px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.tabs button {
  padding: 12px 24px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.tabs button.active {
  background: #667eea;
  color: white;
  border-color: #667eea;
}

.content {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.loading {
  padding: 40px;
  text-align: center;
  color: #888;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

th {
  background: #f9f9f9;
  font-weight: 600;
  font-size: 14px;
  color: #666;
}

td {
  font-size: 14px;
}

.thumbnail {
  width: 60px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
}

.delete-btn {
  padding: 6px 12px;
  background: #ffeaea;
  color: #e74c3c;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.delete-btn:hover {
  background: #ffdada;
}

.role {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.role.admin {
  background: #e8f5e9;
  color: #4caf50;
}

.role.user {
  background: #e3f2fd;
  color: #2196f3;
}

/* 删除确认弹窗 */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.confirm-box {
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

/* 弹窗动画 */
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}
.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}
.confirm-fade-enter-active .confirm-box,
.confirm-fade-leave-active .confirm-box {
  transition: transform 0.2s ease;
}
.confirm-fade-enter-from .confirm-box {
  transform: scale(0.9);
}
.confirm-fade-leave-to .confirm-box {
  transform: scale(0.9);
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  table {
    font-size: 12px;
  }
  
  th, td {
    padding: 8px 4px;
  }
}
</style>
