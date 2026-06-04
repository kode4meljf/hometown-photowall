<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminApi, toPostDetail, AdminAuthError, AdminApiError, type AdminPost, type AdminPostDetail } from '../../api/admin';
import {
  POST_STATUS,
  POST_STATUS_FILTER_TABS,
  postStatusLabel,
  type PostStatus,
  type PostStatusFilter,
} from '../../constants/postStatus';
import PostDetailModal from '../PostDetailModal.vue';
import { formatDate } from '../../utils/formatDate';
import { toast } from '../../utils/toast.js';

const emit = defineEmits<{
  'stats-changed': [];
}>();

const PAGE_SIZE = 30;

const postStatus = ref<PostStatusFilter>('all');
const posts = ref<AdminPost[]>([]);
const postPage = ref(1);
const postTotal = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const deleteId = ref<string | null>(null);
const detailShow = ref(false);
const detailLoading = ref(false);
const detailPost = ref<AdminPostDetail | null>(null);
const statusUpdatingId = ref<string | null>(null);
const rejectModalId = ref<string | null>(null);
const rejectNote = ref('');

const loadPosts = async (reset = true) => {
  if (reset) {
    loading.value = true;
    postPage.value = 1;
  } else {
    loadingMore.value = true;
  }
  try {
    const page = reset ? 1 : postPage.value;
    const res = await adminApi.getPosts({
      page,
      pageSize: PAGE_SIZE,
      status: postStatus.value,
    });
    postTotal.value = res.data?.total ?? res.data?.posts.length ?? 0;
    const items = res.data?.posts ?? [];
    posts.value = reset ? items : [...posts.value, ...items];
    postPage.value = page + 1;
  } catch (e) {
    if (e instanceof AdminAuthError) return;
    toast.error(e instanceof AdminApiError ? e.message : '加载作品失败');
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const hasMorePosts = () => posts.value.length < postTotal.value;

const loadMorePosts = () => {
  if (loading.value || loadingMore.value || !hasMorePosts()) return;
  loadPosts(false);
};

const updatePostStatus = async (id: string, status: PostStatus, reviewNote?: string) => {
  if (statusUpdatingId.value) return;
  statusUpdatingId.value = id;
  try {
    const res = await adminApi.updatePostStatus(id, status, reviewNote);
    if (res.data) {
      if (postStatus.value !== 'all' && res.data.status !== postStatus.value) {
        posts.value = posts.value.filter((p) => p.id !== id);
      } else {
        const idx = posts.value.findIndex((p) => p.id === id);
        if (idx >= 0) {
          posts.value[idx] = {
            ...posts.value[idx],
            status: res.data.status,
            mediaTraceIds: res.data.mediaTraceIds,
            reviewAdminNote: res.data.reviewAdminNote,
          };
        }
      }
      if (detailPost.value?.id === id) {
        detailPost.value = res.data;
      }
      emit('stats-changed');
      toast.success('状态已更新');
    }
  } catch (e) {
    if (e instanceof AdminAuthError) return;
    toast.error(e instanceof AdminApiError ? e.message : '更新失败');
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
  await updatePostStatus(id, POST_STATUS.REJECTED, note);
};

const onPostStatusChange = (id: string, status: PostStatus) => {
  if (status === POST_STATUS.REJECTED) {
    promptReject(id);
    return;
  }
  updatePostStatus(id, status);
};

const handleDelete = (id: string) => {
  deleteId.value = id;
};

const openDetail = async (post: AdminPost) => {
  detailShow.value = true;
  detailPost.value = toPostDetail(post);
  detailLoading.value = true;
  try {
    const res = await adminApi.getPostDetail(post.id);
    if (res.data) {
      detailPost.value = res.data;
    }
  } catch (e) {
    if (e instanceof AdminAuthError) return;
    toast.warning(e instanceof AdminApiError ? e.message : '详情加载失败，已显示基础信息');
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
  const idx = posts.value.findIndex((p) => p.id === post.id);
  if (idx >= 0) {
    posts.value[idx] = {
      ...posts.value[idx],
      title: post.title,
      description: post.description,
      location: post.location,
      status: post.status,
      mediaTraceIds: post.mediaTraceIds,
      reviewAdminNote: post.reviewAdminNote,
      imageUrl: post.photos[0]?.imageUrl || posts.value[idx].imageUrl,
      photos: post.photos,
    };
  }
};

const confirmDelete = async () => {
  const id = deleteId.value;
  if (!id) return;
  deleteId.value = null;

  try {
    await adminApi.deletePost(id);
    posts.value = posts.value.filter((p) => p.id !== id);
    if (detailPost.value?.id === id) closeDetail();
    emit('stats-changed');
    toast.success('删除成功');
  } catch (e) {
    if (e instanceof AdminAuthError) return;
    toast.error(e instanceof AdminApiError ? e.message : '删除失败');
  }
};

onMounted(() => {
  loadPosts();
});

defineExpose({ reload: loadPosts });
</script>

<template>
  <div class="panel">
    <div class="feedback-toolbar">
      <button
        v-for="item in POST_STATUS_FILTER_TABS"
        :key="item.key"
        :class="['filter-btn', { active: postStatus === item.key }]"
        @click="postStatus = item.key; loadPosts(true)"
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
          <tr v-for="post in posts" :key="post.id" class="post-row" @click="openDetail(post)">
            <td>
              <img v-if="post.imageUrl" :src="post.imageUrl" alt="" class="thumb" />
              <span v-else class="no-thumb">无图</span>
            </td>
            <td>{{ post.title || '无标题' }}</td>
            <td>
              <span :class="['post-status', post.status]">{{ postStatusLabel(post.status) }}</span>
            </td>
            <td>{{ post.author }}</td>
            <td>{{ post.location || '-' }}</td>
            <td>{{ post.category }}</td>
            <td>{{ post.likes }}</td>
            <td>{{ post.views }}</td>
            <td>{{ post.commentCount }}</td>
            <td>{{ formatDate(post.createdAt) }}</td>
            <td class="action-cell" @click.stop>
              <button
                v-if="post.status === POST_STATUS.REVIEWING"
                class="primary-btn small-btn"
                :disabled="statusUpdatingId === post.id"
                @click="updatePostStatus(post.id, POST_STATUS.RELEASED)"
              >
                通过
              </button>
              <button
                v-if="post.status === POST_STATUS.REVIEWING"
                class="ghost-btn small-btn"
                :disabled="statusUpdatingId === post.id"
                @click="promptReject(post.id)"
              >
                驳回
              </button>
              <button
                v-if="post.status === POST_STATUS.REJECTED"
                class="ghost-btn small-btn"
                :disabled="statusUpdatingId === post.id"
                @click="updatePostStatus(post.id, POST_STATUS.RELEASED)"
              >
                重新发布
              </button>
              <button
                v-if="post.status === POST_STATUS.RELEASED"
                class="ghost-btn small-btn"
                :disabled="statusUpdatingId === post.id"
                @click="updatePostStatus(post.id, POST_STATUS.HIDDEN)"
              >
                隐藏
              </button>
              <button
                v-if="post.status === POST_STATUS.HIDDEN"
                class="ghost-btn small-btn"
                :disabled="statusUpdatingId === post.id"
                @click="updatePostStatus(post.id, POST_STATUS.RELEASED)"
              >
                公开
              </button>
              <button class="danger-btn small-btn" @click="handleDelete(post.id)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!posts.length" class="empty">暂无作品</p>
      <div v-else class="list-pagination">
        <span class="pagination-meta">已加载 {{ posts.length }} / {{ postTotal }}</span>
        <button
          v-if="hasMorePosts()"
          class="ghost-btn"
          :disabled="loadingMore"
          @click="loadMorePosts"
        >
          {{ loadingMore ? '加载中...' : '加载更多' }}
        </button>
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
        <p class="confirm-title">确定删除这条作品？</p>
        <p class="confirm-hint">删除后无法恢复，相关评论也会一并删除</p>
        <div class="confirm-actions">
          <button class="ghost-btn" @click="deleteId = null">取消</button>
          <button class="danger-btn" @click="confirmDelete">确定删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="../../styles/dashboard-shared.css"></style>
