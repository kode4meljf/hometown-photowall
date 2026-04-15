<script setup lang="ts">
import { ref, computed } from 'vue';
import { auth } from '../api/photos';

const props = defineProps<{
  show: boolean
}>();

const emit = defineEmits(['close', 'login-success']);

const mode = ref('login');
const loading = ref(false);
const form = ref({
  username: '',
  password: '',
  nickname: ''
});
const error = ref('');

const isValid = computed(() => {
  if (!form.value.username || !form.value.password) return false;
  if (mode.value === 'register' && !form.value.nickname) return false;
  return true;
});

const handleSubmit = async () => {
  if (!isValid.value) return;
  
  loading.value = true;
  error.value = '';
  
  try {
    let res;
    if (mode.value === 'login') {
      res = await auth.login(form.value.username, form.value.password);
    } else {
      res = await auth.register(form.value.username, form.value.password, form.value.nickname);
    }
    
    if (res.success) {
      emit('login-success');
      emit('close');
      form.value = { username: '', password: '', nickname: '' };
    } else {
      error.value = res.message || '操作失败';
    }
  } catch (e) {
    error.value = '网络错误，请重试';
  } finally {
    loading.value = false;
  }
};

const switchMode = () => {
  mode.value = mode.value === 'login' ? 'register' : 'login';
  error.value = '';
};

const handleClose = () => {
  emit('close');
  form.value = { username: '', password: '', nickname: '' };
  error.value = '';
};
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="handleClose">
      <div class="modal">
        <button class="close-btn" @click="handleClose">×</button>
        
        <h2>{{ mode === 'login' ? '登录' : '注册' }}</h2>
        <p class="subtitle">{{ mode === 'login' ? '欢迎回来' : '加入我们' }}</p>
        
        <form @submit.prevent="handleSubmit">
          <div class="form-group">
            <label>用户名</label>
            <input 
              v-model="form.username" 
              type="text" 
              placeholder="请输入用户名"
              autocomplete="username"
            />
          </div>
          
          <div v-if="mode === 'register'" class="form-group">
            <label>昵称</label>
            <input 
              v-model="form.nickname" 
              type="text" 
              placeholder="请输入昵称"
            />
          </div>
          
          <div class="form-group">
            <label>密码</label>
            <input 
              v-model="form.password" 
              type="password" 
              placeholder="请输入密码"
              autocomplete="current-password"
            />
          </div>
          
          <div v-if="error" class="error">{{ error }}</div>
          
          <button type="submit" class="submit-btn" :disabled="!isValid || loading">
            {{ loading ? '处理中...' : (mode === 'login' ? '登录' : '注册') }}
          </button>
        </form>
        
        <p class="switch-mode">
          {{ mode === 'login' ? '还没有账号？' : '已有账号？' }}
          <a href="#" @click.prevent="switchMode">{{ mode === 'login' ? '立即注册' : '立即登录' }}</a>
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 32px;
  border-radius: 16px;
  width: 90%;
  max-width: 380px;
  position: relative;
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  font-size: 24px;
  color: #999;
  cursor: pointer;
}

h2 {
  margin: 0 0 8px;
  text-align: center;
  color: #333;
}

.subtitle {
  text-align: center;
  color: #888;
  margin: 0 0 24px;
}

.form-group {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  color: #666;
}

input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

input:focus {
  outline: none;
  border-color: #667eea;
}

.error {
  color: #e74c3c;
  font-size: 14px;
  margin-bottom: 12px;
  text-align: center;
}

.submit-btn {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.switch-mode {
  text-align: center;
  margin-top: 16px;
  color: #888;
}

.switch-mode a {
  color: #667eea;
  text-decoration: none;
}
</style>
