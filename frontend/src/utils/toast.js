import { reactive } from 'vue';

export const toast = reactive({
  show: false,
  message: '',
  type: 'info',
  _timer: null,

  _show(message, type = 'info', duration = 2500) {
    if (!message) return; // 空消息不显示
    if (this._timer) clearTimeout(this._timer);
    this.message = message;
    this.type = type;
    this.show = true;
    this._timer = setTimeout(() => {
      this.show = false;
      this._timer = null;
    }, duration);
  },

  // 重置状态（页面加载时调用）
  _reset() {
    if (this._timer) clearTimeout(this._timer);
    this.show = false;
    this.message = '';
    this._timer = null;
  },

  success(msg) { if (msg) this._show(msg, 'success'); },
  error(msg)   { if (msg) this._show(msg, 'error'); },
  warning(msg) { if (msg) this._show(msg, 'warning'); },
  info(msg)    { if (msg) this._show(msg, 'info'); }
});

// 页面加载时重置状态
if (typeof window !== 'undefined') {
  toast._reset();
}
