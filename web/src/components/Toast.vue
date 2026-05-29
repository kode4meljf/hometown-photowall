<script setup>
import { watch } from 'vue';
import { toast } from '../utils/toast.js';

const colorMap = {
  success: { bg: '#f0fdf4', border: '#86efac', text: '#166534', icon: '#22c55e' },
  error:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '#ef4444' },
  warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '#f59e0b' },
  info:    { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: '#3b82f6' }
};

const iconMap = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: '💡'
};
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="toast.show && toast.message"
        class="toast"
        :style="{
          background: colorMap[toast.type]?.bg,
          borderColor: colorMap[toast.type]?.border,
          color: colorMap[toast.type]?.text
        }"
      >
        <span class="toast-icon" :style="{ color: colorMap[toast.type]?.icon }">
          {{ iconMap[toast.type] }}
        </span>
        <span class="toast-message">{{ toast.message }}</span>
        <button class="toast-close" @click="toast.show = false">×</button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 20px;
  border-radius: 12px;
  border: 1px solid;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 99999;
  font-size: 14px;
  font-weight: 500;
  min-width: 220px;
  max-width: 400px;
  white-space: nowrap;
}

.toast-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  opacity: 0.5;
  padding: 0 0 0 8px;
  color: inherit;
  transition: opacity 0.2s;
  flex-shrink: 0;
}

.toast-close:hover {
  opacity: 1;
}

.toast-enter-active {
  animation: toast-in 0.3s ease;
}

.toast-leave-active {
  animation: toast-out 0.25s ease;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

@keyframes toast-out {
  from { opacity: 1; transform: translateX(-50%) translateY(0); }
  to   { opacity: 0; transform: translateX(-50%) translateY(-16px); }
}
</style>
