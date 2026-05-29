<script setup lang="ts">
import { ref, computed } from 'vue';
import { adminAuth } from '../api/admin';

const emit = defineEmits<{
  success: [];
}>();

const loading = ref(false);
const error = ref('');
const form = ref({
  username: '',
  password: ''
});

const isValid = computed(() => form.value.username.trim() && form.value.password.trim());

const handleSubmit = async () => {
  if (!isValid.value || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    const res = await adminAuth.login(form.value.username.trim(), form.value.password);
    if (res.success) {
      emit('success');
      return;
    }
    error.value = res.message || '登录失败';
  } catch (err) {
    error.value = err instanceof Error ? err.message : '网络错误，请稍后重试';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <h1>家乡照片墙</h1>
        <p>管理后台</p>
      </div>

      <form @submit.prevent="handleSubmit">
        <label>
          <span>用户名</span>
          <input
            v-model="form.username"
            type="text"
            placeholder="管理员用户名"
            autocomplete="username"
          />
        </label>

        <label>
          <span>密码</span>
          <input
            v-model="form.password"
            type="password"
            placeholder="登录密码"
            autocomplete="current-password"
          />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button type="submit" :disabled="!isValid || loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(160deg, #eef2ff 0%, #f8fafc 45%, #ecfeff 100%);
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border-radius: 20px;
  padding: 36px 32px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
}

.brand {
  text-align: center;
  margin-bottom: 28px;
}

.brand h1 {
  margin: 0;
  font-size: 24px;
  color: #1e293b;
}

.brand p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 14px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

label span {
  font-size: 14px;
  color: #475569;
}

input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #dbe3f0;
  border-radius: 10px;
  font-size: 14px;
  transition: border-color 0.2s;
}

input:focus {
  outline: none;
  border-color: #6366f1;
}

.error {
  margin: 0;
  color: #dc2626;
  font-size: 14px;
  text-align: center;
}

button {
  margin-top: 4px;
  padding: 13px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
