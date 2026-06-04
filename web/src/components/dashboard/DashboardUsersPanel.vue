<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { adminApi, AdminAuthError, AdminApiError, type ManagedUser } from '../../api/admin';
import { formatDate } from '../../utils/formatDate';
import { toast } from '../../utils/toast.js';

const users = ref<ManagedUser[]>([]);
const loading = ref(false);

const loadUsers = async () => {
  loading.value = true;
  try {
    const res = await adminApi.getUsers();
    users.value = res.data ?? [];
  } catch (e) {
    if (e instanceof AdminAuthError) return;
    toast.error(e instanceof AdminApiError ? e.message : '加载用户失败');
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadUsers();
});

defineExpose({ reload: loadUsers });
</script>

<template>
  <div class="panel">
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>用户名</th>
            <th>昵称</th>
            <th>角色</th>
            <th>作品数</th>
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
            <td>{{ user.postCount }}</td>
            <td>{{ user.commentCount }}</td>
            <td>{{ formatDate(user.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!users.length" class="empty">暂无用户</p>
    </div>
  </div>
</template>

<style src="../../styles/dashboard-shared.css"></style>
