<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, reactive } from 'vue';
import { adminApi, type AdminPostDetail, type PostStatus } from '../api/admin';
import { toast } from '../utils/toast.js';

const props = defineProps<{
  show: boolean;
  post: AdminPostDetail | null;
  loading?: boolean;
  statusUpdating?: boolean;
}>();

const emit = defineEmits<{
  close: [];
  updated: [post: AdminPostDetail];
  statusChange: [id: string, status: PostStatus];
}>();

const currentIndex = ref(0);
const touchStartX = ref(0);
const touchDeltaX = ref(0);
const editing = ref(false);
const saving = ref(false);
const form = reactive({
  title: '',
  description: '',
  location: ''
});

const images = computed(() => props.post?.photos?.filter((p) => p.imageUrl) || []);
const hasMultiple = computed(() => images.value.length > 1);

const formatDate = (dateStr: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('zh-CN');
};

const postStatusLabel = (status: PostStatus) => {
  if (status === 'released') return '已发布';
  if (status === 'reviewing') return '审核中';
  if (status === 'hidden') return '已隐藏';
  return '未通过';
};

const changeStatus = (status: PostStatus) => {
  if (!props.post || props.statusUpdating) return;
  emit('statusChange', props.post.id, status);
};

const syncForm = () => {
  if (!props.post) return;
  form.title = props.post.title || '';
  form.description = props.post.description || '';
  form.location = props.post.location === '-' ? '' : (props.post.location || '');
};

const startEdit = () => {
  syncForm();
  editing.value = true;
};

const cancelEdit = () => {
  editing.value = false;
  syncForm();
};

const saveEdit = async () => {
  if (!props.post || saving.value) return;
  const title = form.title.trim();
  if (!title) {
    toast.warning('标题不能为空');
    return;
  }

  saving.value = true;
  try {
    const res = await adminApi.updatePost(props.post.id, {
      title,
      description: form.description.trim(),
      location: form.location.trim()
    });
    if (res.success && res.data) {
      editing.value = false;
      emit('updated', res.data);
      toast.success('保存成功');
    } else {
      toast.error(res.message || '保存失败');
    }
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '保存失败');
  } finally {
    saving.value = false;
  }
};

const goPrev = () => {
  if (!hasMultiple.value) return;
  currentIndex.value = (currentIndex.value - 1 + images.value.length) % images.value.length;
};

const goNext = () => {
  if (!hasMultiple.value) return;
  currentIndex.value = (currentIndex.value + 1) % images.value.length;
};

const onTouchStart = (e: TouchEvent) => {
  touchStartX.value = e.touches[0].clientX;
  touchDeltaX.value = 0;
};

const onTouchMove = (e: TouchEvent) => {
  touchDeltaX.value = e.touches[0].clientX - touchStartX.value;
};

const onTouchEnd = () => {
  if (Math.abs(touchDeltaX.value) < 40) return;
  if (touchDeltaX.value < 0) goNext();
  else goPrev();
  touchDeltaX.value = 0;
};

const onKeydown = (e: KeyboardEvent) => {
  if (!props.show) return;
  if (editing.value) return;
  if (e.key === 'Escape') emit('close');
  if (e.key === 'ArrowLeft') goPrev();
  if (e.key === 'ArrowRight') goNext();
};

watch(() => props.post?.id, () => {
  currentIndex.value = 0;
  editing.value = false;
  syncForm();
});

watch(() => props.show, (visible) => {
  if (visible) {
    document.body.style.overflow = 'hidden';
    syncForm();
  } else {
    document.body.style.overflow = '';
    currentIndex.value = 0;
    editing.value = false;
  }
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="show" class="detail-overlay" @click.self="emit('close')">
        <div class="detail-panel">
          <button class="close-btn" type="button" aria-label="关闭" @click="emit('close')">×</button>
          <div v-if="loading" class="detail-loading-badge">加载中...</div>

          <template v-if="post">
            <div
              class="gallery"
              @touchstart.passive="onTouchStart"
              @touchmove.passive="onTouchMove"
              @touchend="onTouchEnd"
            >
              <button
                v-if="hasMultiple"
                class="nav-btn nav-prev"
                type="button"
                aria-label="上一张"
                @click.stop="goPrev"
              >
                ‹
              </button>

              <div class="gallery-track" :style="{ transform: `translateX(-${currentIndex * 100}%)` }">
                <div v-for="(img, idx) in images" :key="idx" class="gallery-slide">
                  <img :src="img.imageUrl" :alt="`${post.title} ${idx + 1}`" />
                </div>
                <div v-if="!images.length" class="gallery-slide gallery-empty">暂无图片</div>
              </div>

              <button
                v-if="hasMultiple"
                class="nav-btn nav-next"
                type="button"
                aria-label="下一张"
                @click.stop="goNext"
              >
                ›
              </button>

              <div v-if="hasMultiple" class="gallery-indicator">
                {{ currentIndex + 1 }} / {{ images.length }}
              </div>
            </div>

            <div v-if="hasMultiple" class="dots">
              <button
                v-for="(_, idx) in images"
                :key="idx"
                type="button"
                :class="['dot', { active: idx === currentIndex }]"
                @click="currentIndex = idx"
              />
            </div>

            <div class="detail-body">
              <div class="detail-head">
                <div class="detail-title-row">
                  <h2 v-if="!editing">{{ post.title || '无标题' }}</h2>
                  <span :class="['post-status', post.status]">{{ postStatusLabel(post.status) }}</span>
                </div>
                <button
                  v-if="!editing"
                  class="edit-btn"
                  type="button"
                  @click="startEdit"
                >
                  编辑
                </button>
              </div>

              <div v-if="editing" class="edit-form">
                <label>
                  <span>标题</span>
                  <input v-model="form.title" type="text" placeholder="帖子标题" />
                </label>
                <label>
                  <span>描述</span>
                  <textarea v-model="form.description" rows="4" placeholder="帖子描述" />
                </label>
                <label>
                  <span>地点</span>
                  <input v-model="form.location" type="text" placeholder="拍摄地点" />
                </label>
                <div class="edit-actions">
                  <button class="ghost-btn" type="button" :disabled="saving" @click="cancelEdit">取消</button>
                  <button class="save-btn" type="button" :disabled="saving" @click="saveEdit">
                    {{ saving ? '保存中...' : '保存' }}
                  </button>
                </div>
              </div>

              <template v-else>
                <p v-if="post.description" class="desc">{{ post.description }}</p>
                <p v-else class="desc empty-desc">暂无描述</p>
              </template>

              <div class="meta-grid">
                <div><span>作者</span>{{ post.author }}</div>
                <div v-if="!editing"><span>地点</span>{{ post.location || '-' }}</div>
                <div><span>分类</span>{{ post.category || '-' }}</div>
                <div><span>点赞</span>{{ post.likes }}</div>
                <div><span>浏览</span>{{ post.views }}</div>
                <div><span>评论</span>{{ post.commentCount }}</div>
                <div class="meta-wide"><span>发布时间</span>{{ formatDate(post.createdAt) }}</div>
                <div v-if="post.mediaTraceIds?.length" class="meta-wide">
                  <span>审核追踪 ID</span>{{ post.mediaTraceIds.join(', ') }}
                </div>
                <div v-if="post.reviewAdminNote" class="meta-wide admin-only-meta">
                  <span>管理员备注</span>{{ post.reviewAdminNote }}
                </div>
              </div>

              <div v-if="!editing" class="status-actions">
                <button
                  v-if="post.status === 'reviewing'"
                  class="save-btn"
                  type="button"
                  :disabled="statusUpdating"
                  @click="changeStatus('released')"
                >
                  审核通过
                </button>
                <button
                  v-if="post.status === 'reviewing'"
                  class="ghost-btn"
                  type="button"
                  :disabled="statusUpdating"
                  @click="changeStatus('rejected')"
                >
                  驳回
                </button>
                <button
                  v-if="post.status === 'rejected'"
                  class="ghost-btn"
                  type="button"
                  :disabled="statusUpdating"
                  @click="changeStatus('released')"
                >
                  重新发布
                </button>
                <button
                  v-if="post.status === 'released'"
                  class="ghost-btn"
                  type="button"
                  :disabled="statusUpdating"
                  @click="changeStatus('hidden')"
                >
                  隐藏
                </button>
                <button
                  v-if="post.status === 'hidden'"
                  class="ghost-btn"
                  type="button"
                  :disabled="statusUpdating"
                  @click="changeStatus('released')"
                >
                  公开
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.detail-panel {
  position: relative;
  width: min(720px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: rgba(15, 23, 42, 0.55);
  color: #fff;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.detail-loading-badge {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 2;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.65);
  color: #fff;
  font-size: 12px;
}

.gallery {
  position: relative;
  overflow: hidden;
  background: #0f172a;
  border-radius: 20px 20px 0 0;
  touch-action: pan-y;
}

.gallery-track {
  display: flex;
  transition: transform 0.28s ease;
}

.gallery-slide {
  flex: 0 0 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  max-height: 52vh;
}

.gallery-slide img {
  width: 100%;
  max-height: 52vh;
  object-fit: contain;
  user-select: none;
  -webkit-user-drag: none;
}

.gallery-empty {
  color: #94a3b8;
  font-size: 14px;
}

.nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  color: #1e293b;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}

.nav-prev { left: 12px; }
.nav-next { right: 12px; }

.gallery-indicator {
  position: absolute;
  right: 14px;
  bottom: 14px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.6);
  color: #fff;
  font-size: 12px;
}

.dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px 0 4px;
}

.dot {
  width: 8px;
  height: 8px;
  border: none;
  border-radius: 50%;
  background: #cbd5e1;
  cursor: pointer;
  padding: 0;
}

.dot.active {
  background: #6366f1;
  transform: scale(1.15);
}

.detail-body {
  padding: 20px 24px 24px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.detail-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  flex: 1;
}

.detail-title-row h2 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
}

.post-status {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
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

.status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.status-actions .ghost-btn {
  border: 1px solid #dbe3f0;
  background: #fff;
  color: #475569;
  padding: 10px 14px;
}

.admin-only-meta {
  color: #64748b;
  font-size: 13px;
}

.detail-body h2 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
  flex: 1;
}

.edit-btn,
.ghost-btn,
.save-btn {
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.edit-btn {
  padding: 6px 14px;
  background: #eef2ff;
  color: #4f46e5;
  flex-shrink: 0;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 4px;
}

.edit-form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.edit-form label span {
  font-size: 13px;
  color: #64748b;
}

.edit-form input,
.edit-form textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #dbe3f0;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}

.edit-form input:focus,
.edit-form textarea:focus {
  outline: none;
  border-color: #6366f1;
}

.edit-form textarea {
  resize: vertical;
  min-height: 96px;
}

.edit-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.ghost-btn {
  padding: 10px 16px;
  background: #f1f5f9;
  color: #475569;
}

.save-btn {
  padding: 10px 18px;
  background: #6366f1;
  color: #fff;
}

.save-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.desc {
  margin: 10px 0 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.empty-desc {
  color: #94a3b8;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 16px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #f1f5f9;
  font-size: 14px;
  color: #1e293b;
}

.meta-grid span {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #94a3b8;
}

.meta-wide {
  grid-column: 1 / -1;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .detail-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .detail-panel {
    width: 100%;
    max-height: 92vh;
    border-radius: 20px 20px 0 0;
  }

  .gallery-slide {
    min-height: 240px;
  }
}
</style>
