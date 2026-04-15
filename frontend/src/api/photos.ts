const API_BASE = 'http://localhost:3000/api';

// 获取 token
const getToken = () => localStorage.getItem('token');

export const auth = {
  // 注册
  async register(username, password, nickname) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, nickname })
    });
    const data = await res.json();
    if (data.success && data.data.token) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
    }
    return data;
  },

  // 登录
  async login(username, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success && data.data.token) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('user', JSON.stringify(data.data.user));
    }
    return data;
  },

  // 获取当前用户（从服务端验证，不信任本地缓存）
  async getCurrentUser() {
    const token = getToken();
    if (!token) return { success: true, data: null };
    
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    // 每次从服务端获取后更新本地缓存，确保 role 准确
    if (data.success && data.data) {
      localStorage.setItem('user', JSON.stringify(data.data));
    }
    return data;
  },

  // 登出
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  // 获取本地用户信息
  getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }
};

export const api = {
  // 获取照片列表
  async getPhotos(params = {}) {
    const token = getToken();
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/photos?${query}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    return res.json();
  },

  // 获取时间线数据
  async getTimeline() {
    const token = getToken();
    const res = await fetch(`${API_BASE}/photos/timeline`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    return res.json();
  },

  // 获取单张照片
  async getPhoto(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/photos/${id}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    return res.json();
  },

  // 上传照片
  async uploadPhoto(formData) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/photos`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return res.json();
  },

  // 点赞
  async likePhoto(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/photos/${id}/like`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    return res.json();
  },

  // 删除照片
  async deletePhoto(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/photos/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },

  // 获取评论（分页）
  async getComments(photoId, page = 1, limit = 20) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/photos/${photoId}/comments?page=${page}&limit=${limit}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    return res.json();
  },

  // 添加评论
  async addComment(photoId, content) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/photos/${photoId}/comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ content })
    });
    return res.json();
  },

  // 获取分类
  async getCategories() {
    const res = await fetch(`${API_BASE}/categories`);
    return res.json();
  },

  // 获取所有地点
  async getLocations() {
    const res = await fetch(`${API_BASE}/locations`);
    return res.json();
  },

  // 获取统计数据
  async getStats() {
    const res = await fetch(`${API_BASE}/stats`);
    return res.json();
  }
};

// 管理员 API
export const adminApi = {
  // 获取用户列表
  async getUsers() {
    const token = getToken();
    const res = await fetch(`${API_BASE}/admin/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },

  // 获取照片管理列表
  async getPhotos(params = {}) {
    const token = getToken();
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/admin/photos?${query}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  },

  // 删除照片（管理员）
  async deletePhoto(id) {
    const token = getToken();
    const res = await fetch(`${API_BASE}/photos/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.json();
  }
};
