<script setup>
import { ref, onMounted, computed } from 'vue';
import { api, auth } from '../api/photos';
import { toast } from '../utils/toast.js';

const emit = defineEmits(['success']);

const loading = ref(false);
const categories = ref([]);
const form = ref({
  title: '',
  description: '',
  location: '',
  category: '风景'
});
const file = ref(null);
const previewUrl = ref('');

const currentUser = computed(() => auth.getUser());

const loadCategories = async () => {
  const res = await api.getCategories();
  if (res.success) {
    categories.value = res.data;
  }
};

const handleFileChange = (e) => {
  const target = e.target;
  if (target.files && target.files[0]) {
    file.value = target.files[0];
    previewUrl.value = URL.createObjectURL(file.value);
  }
};

const handleSubmit = async () => {
  if (!file.value) { toast.warning('请选择图片'); return; }
  if (!form.value.title) { toast.warning('请输入标题'); return; }
  if (!currentUser.value) { toast.warning('请先登录'); return; }

  loading.value = true;
  try {
    const formData = new FormData();
    formData.append('image', file.value);
    formData.append('title', form.value.title);
    formData.append('description', form.value.description);
    formData.append('location', form.value.location);
    formData.append('category', form.value.category);
    formData.append('author', currentUser.value.nickname);

    const res = await api.uploadPhoto(formData);
    if (res.success) {
      toast.success('上传成功！');
      form.value = { title: '', description: '', location: '', category: '风景' };
      file.value = null;
      previewUrl.value = '';
      emit('success');
    } else {
      toast.error(res.message || '上传失败');
    }
  } catch (error) {
    toast.error('上传失败，请重试');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadCategories();
});
</script>

<template>
  <div class="upload-form">
    <h3>📤 上传照片</h3>
    <p class="author-hint" v-if="currentUser">将以「{{ currentUser.nickname }}」的名义发布</p>

    <div class="upload-area" @click="$refs.fileInput.click()">
      <div v-if="previewUrl" class="preview">
        <img :src="previewUrl" alt="预览" />
        <div class="preview-overlay">点击更换图片</div>
      </div>
      <div v-else class="placeholder">
        <span class="upload-icon">📷</span>
        <p>点击选择图片</p>
        <p class="hint">支持 JPG、PNG、GIF、WebP，最大 10MB</p>
      </div>
      <input ref="fileInput" type="file" accept="image/*" @change="handleFileChange" hidden />
    </div>

    <div class="form-group">
      <label>标题 *</label>
      <input v-model="form.title" type="text" placeholder="给照片起个名字" maxlength="50" />
    </div>

    <div class="form-group">
      <label>描述</label>
      <textarea v-model="form.description" placeholder="描述一下这张照片的故事..." rows="3" maxlength="500"></textarea>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>地点</label>
        <input v-model="form.location" type="text" placeholder="在哪里拍的" maxlength="30" />
      </div>
      <div class="form-group">
        <label>分类</label>
        <select v-model="form.category">
          <option v-for="cat in (categories || [])" :key="cat.id || cat.name" :value="cat.name">
            {{ cat.icon }} {{ cat.name }}
          </option>
        </select>
      </div>
    </div>

    <button class="btn-submit" :disabled="loading" @click="handleSubmit">
      {{ loading ? '上传中...' : '发布照片' }}
    </button>
  </div>
</template>

<style scoped>
.upload-form {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.06);
}

h3 {
  margin: 0 0 16px;
  font-size: 18px;
  color: #333;
}

.author-hint {
  margin: -8px 0 16px;
  font-size: 13px;
  color: #888;
  background: #f5f7fa;
  padding: 8px 12px;
  border-radius: 8px;
}

.upload-area {
  border: 2px dashed #ddd;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s;
  margin-bottom: 20px;
}

.upload-area:hover {
  border-color: #999;
}

.preview {
  position: relative;
  height: 200px;
}

.preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.preview-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.4);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
}

.upload-area:hover .preview-overlay {
  opacity: 1;
}

.placeholder {
  padding: 40px 20px;
  text-align: center;
  color: #999;
}

.upload-icon {
  font-size: 40px;
  display: block;
  margin-bottom: 8px;
}

.placeholder p { margin: 4px 0; }
.hint { font-size: 12px; color: #bbb; }

.form-group {
  margin-bottom: 16px;
  flex: 1;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #555;
  font-weight: 500;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
  font-family: inherit;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  border-color: #999;
}

.form-group textarea {
  resize: vertical;
}

.form-row {
  display: flex;
  gap: 16px;
}

.btn-submit {
  width: 100%;
  padding: 12px;
  background: #333;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-submit:hover { background: #555; }
.btn-submit:disabled { background: #999; cursor: not-allowed; }

@media (max-width: 640px) {
  .form-row { flex-direction: column; gap: 0; }
}
</style>
