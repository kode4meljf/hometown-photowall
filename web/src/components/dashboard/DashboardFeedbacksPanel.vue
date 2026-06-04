<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminApi, AdminAuthError, AdminApiError, type AdminFeedback } from '../../api/admin';
import { formatDate } from '../../utils/formatDate';
import { toast } from '../../utils/toast.js';

const emit = defineEmits<{
  'stats-changed': [];
}>();

const PAGE_SIZE = 30;

const feedbackStatus = ref<'all' | 'pending' | 'processing' | 'resolved'>('pending');
const feedbackType = ref<'all' | 'feedback' | 'report'>('all');
const feedbacks = ref<AdminFeedback[]>([]);
const feedbackPage = ref(1);
const feedbackTotal = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const feedbackDetail = ref<AdminFeedback | null>(null);
const feedbackNote = ref('');
const feedbackSaving = ref(false);

const STATUS_FILTERS = [
  { key: 'pending', label: '待处理' },
  { key: 'processing', label: '处理中' },
  { key: 'resolved', label: '已处理' },
  { key: 'all', label: '全部' },
] as const;

const TYPE_FILTERS = [
  { key: 'all', label: '全部类型' },
  { key: 'feedback', label: '意见反馈' },
  { key: 'report', label: '举报' },
] as const;

const loadFeedbacks = async (reset = true) => {
  if (reset) {
    loading.value = true;
    feedbackPage.value = 1;
  } else {
    loadingMore.value = true;
  }
  try {
    const page = reset ? 1 : feedbackPage.value;
    const res = await adminApi.getFeedbacks({
      page,
      pageSize: PAGE_SIZE,
      status: feedbackStatus.value,
      type: feedbackType.value,
    });
    feedbackTotal.value = res.data?.total ?? res.data?.feedbacks.length ?? 0;
    const items = res.data?.feedbacks ?? [];
    feedbacks.value = reset ? items : [...feedbacks.value, ...items];
    feedbackPage.value = page + 1;
  } catch (e) {
    if (e instanceof AdminAuthError) return;
    toast.error(e instanceof AdminApiError ? e.message : '加载反馈失败');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const hasMoreFeedbacks = () => feedbacks.value.length < feedbackTotal.value;

const loadMoreFeedbacks = () => {
  if (loading.value || loadingMore.value || !hasMoreFeedbacks()) return;
  loadFeedbacks(false);
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
    if (res.data) {
      const idx = feedbacks.value.findIndex((f) => f.id === item.id);
      if (idx >= 0) {
        feedbacks.value[idx] = res.data;
      }
      if (feedbackStatus.value !== 'all' && res.data.status !== feedbackStatus.value) {
        feedbacks.value = feedbacks.value.filter((f) => f.id !== item.id);
      }
      feedbackDetail.value = res.data;
      emit('stats-changed');
      toast.success(status === 'resolved' ? '已标记为已处理' : '状态已更新');
    }
  } catch (e) {
    if (e instanceof AdminAuthError) return;
    toast.error(e instanceof AdminApiError ? e.message : '更新失败');
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

const truncateText = (text: string, max = 48) => {
  if (!text) return '-';
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

onMounted(() => {
  loadFeedbacks();
});

defineExpose({ reload: loadFeedbacks });
</script>

<template>
  <div class="panel">
    <div class="feedback-toolbar">
      <button
        v-for="item in STATUS_FILTERS"
        :key="item.key"
        :class="['filter-btn', { active: feedbackStatus === item.key }]"
        @click="feedbackStatus = item.key; loadFeedbacks(true)"
      >
        {{ item.label }}
      </button>
      <span class="toolbar-divider"></span>
      <button
        v-for="item in TYPE_FILTERS"
        :key="`type-${item.key}`"
        :class="['filter-btn', 'filter-btn-type', { active: feedbackType === item.key }]"
        @click="feedbackType = item.key; loadFeedbacks(true)"
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
            class="post-row"
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
      <div v-else class="list-pagination">
        <span class="pagination-meta">已加载 {{ feedbacks.length }} / {{ feedbackTotal }}</span>
        <button
          v-if="hasMoreFeedbacks()"
          class="ghost-btn"
          :disabled="loadingMore"
          @click="loadMoreFeedbacks"
        >
          {{ loadingMore ? '加载中...' : '加载更多' }}
        </button>
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

<style src="../../styles/dashboard-shared.css"></style>
