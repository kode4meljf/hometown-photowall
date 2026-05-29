<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Login from './views/Login.vue';
import Dashboard from './views/Dashboard.vue';
import Toast from './components/Toast.vue';
import { adminAuth, type AdminUser } from './api/admin';

const checking = ref(true);
const user = ref<AdminUser | null>(adminAuth.getUser());

const refreshSession = async () => {
  checking.value = true;
  try {
    const res = await adminAuth.verifySession();
    if (res.success && res.data) {
      user.value = res.data;
    } else {
      user.value = null;
    }
  } catch {
    user.value = adminAuth.getUser();
  } finally {
    checking.value = false;
  }
};

const handleLoginSuccess = () => {
  user.value = adminAuth.getUser();
};

const handleLogout = () => {
  user.value = null;
};

onMounted(refreshSession);
</script>

<template>
  <div class="app-shell">
    <div v-if="checking" class="booting">正在校验登录状态...</div>
    <Dashboard v-else-if="user" :user="user" @logout="handleLogout" />
    <Login v-else @success="handleLoginSuccess" />
    <Toast />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: #f8fafc;
}

.booting {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}
</style>
