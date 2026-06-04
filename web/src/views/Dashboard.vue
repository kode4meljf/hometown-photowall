<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminApi, adminAuth, AdminAuthError, AdminApiError, type AdminStats, type AdminUser } from '../api/admin';
import DashboardPostsPanel from '../components/dashboard/DashboardPostsPanel.vue';
import DashboardUsersPanel from '../components/dashboard/DashboardUsersPanel.vue';
import DashboardFeedbacksPanel from '../components/dashboard/DashboardFeedbacksPanel.vue';
import { toast } from '../utils/toast.js';

const emit = defineEmits<{
  logout: [];
}>();

const props = defineProps<{
  user: AdminUser;
}>();

type DashboardTab = 'posts' | 'users' | 'feedbacks';

const activeTab = ref<DashboardTab>('posts');
const stats = ref<AdminStats | null>(null);
const postsPanel = ref<InstanceType<typeof DashboardPostsPanel> | null>(null);
const usersPanel = ref<InstanceType<typeof DashboardUsersPanel> | null>(null);
const feedbacksPanel = ref<InstanceType<typeof DashboardFeedbacksPanel> | null>(null);

const loadStats = async () => {
  try {
    const res = await adminApi.getStats();
    if (res.data) {
      stats.value = res.data;
    }
  } catch (e) {
    if (e instanceof AdminAuthError) return;
    toast.error(e instanceof AdminApiError ? e.message : '加载统计失败');
  }
};

const switchTab = (tab: DashboardTab) => {
  activeTab.value = tab;
  if (tab === 'posts') postsPanel.value?.reload();
  if (tab === 'users') usersPanel.value?.reload();
  if (tab === 'feedbacks') feedbacksPanel.value?.reload();
};

const handleLogout = () => {
  adminAuth.logout();
  emit('logout');
};

onMounted(() => {
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
        <div class="stat-value">{{ stats.totalPosts }}</div>
        <div class="stat-label">作品总数</div>
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
      <button :class="{ active: activeTab === 'posts' }" @click="switchTab('posts')">
        作品管理
        <span v-if="stats?.reviewingPosts" class="tab-badge">{{ stats.reviewingPosts }}</span>
      </button>
      <button :class="{ active: activeTab === 'users' }" @click="switchTab('users')">
        用户管理
      </button>
      <button :class="{ active: activeTab === 'feedbacks' }" @click="switchTab('feedbacks')">
        意见反馈
        <span v-if="stats?.pendingFeedbacks" class="tab-badge">{{ stats.pendingFeedbacks }}</span>
      </button>
    </div>

    <DashboardPostsPanel
      v-if="activeTab === 'posts'"
      ref="postsPanel"
      @stats-changed="loadStats"
    />
    <DashboardUsersPanel v-if="activeTab === 'users'" ref="usersPanel" />
    <DashboardFeedbacksPanel
      v-if="activeTab === 'feedbacks'"
      ref="feedbacksPanel"
      @stats-changed="loadStats"
    />
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

.logout-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  padding: 10px 16px;
  background: #f1f5f9;
  color: #475569;
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

@media (max-width: 768px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
