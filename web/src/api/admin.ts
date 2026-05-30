import { callFunction } from './cloud';

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

export interface AdminUser {
  id: string;
  username: string;
  nickname: string;
  role: string;
}

export interface PostImage {
  imageUrl: string;
  width?: number;
  height?: number;
  order?: number;
}

export interface AdminPostDetail {
  id: string;
  title: string;
  description: string;
  author: string;
  authorId: string;
  location: string;
  category: string;
  likes: number;
  views: number;
  commentCount: number;
  createdAt: string;
  photos: PostImage[];
}

export interface AdminPhoto {
  id: string;
  title: string;
  imageUrl: string;
  description?: string;
  author: string;
  authorId?: string;
  location: string;
  category: string;
  likes: number;
  views: number;
  commentCount: number;
  createdAt: string;
  photos?: PostImage[];
}

export function toPostDetail(photo: AdminPhoto): AdminPostDetail {
  return {
    id: photo.id,
    title: photo.title || '无标题',
    description: photo.description || '',
    author: photo.author,
    authorId: photo.authorId || '',
    location: photo.location || '-',
    category: photo.category || '-',
    likes: photo.likes || 0,
    views: photo.views || 0,
    commentCount: photo.commentCount || 0,
    createdAt: photo.createdAt,
    photos: photo.photos?.length
      ? photo.photos
      : (photo.imageUrl ? [{ imageUrl: photo.imageUrl }] : [])
  };
}

export interface AdminStats {
  totalPhotos: number;
  totalUsers: number;
  totalLikes: number;
  totalViews: number;
  totalComments: number;
}

export interface ManagedUser {
  id: string;
  username: string;
  nickname: string;
  role: string;
  photoCount: number;
  commentCount: number;
  createdAt: string;
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function withToken<T extends Record<string, unknown>>(data: T = {} as T) {
  const token = getToken();
  return token ? { ...data, adminToken: token } : data;
}

export const adminAuth = {
  getUser(): AdminUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  async login(username: string, password: string) {
    const res = await callFunction<{ token: string; user: AdminUser }>('adminApi', 'login', {
      username,
      password
    });
    if (res.success && res.data) {
      localStorage.setItem(TOKEN_KEY, res.data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
    }
    return res;
  },

  async verifySession() {
    const token = getToken();
    if (!token) {
      return { success: true, data: null };
    }
    const res = await callFunction<AdminUser | null>('adminApi', 'verifySession', {
      adminToken: token
    });
    if (res.success && res.data) {
      localStorage.setItem(USER_KEY, JSON.stringify(res.data));
    } else if (res.success && !res.data) {
      this.logout();
    }
    return res;
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

export const adminApi = {
  async getPhotos(params: { page?: number; pageSize?: number } = {}) {
    return callFunction<{ photos: AdminPhoto[]; total: number }>('adminApi', 'getPhotos', withToken(params));
  },

  async getPostDetail(id: string) {
    return callFunction<AdminPostDetail>('adminApi', 'getPostDetail', withToken({ id }));
  },

  async updatePost(id: string, updates: Pick<AdminPostDetail, 'title' | 'description' | 'location'>) {
    return callFunction<AdminPostDetail>('adminApi', 'updatePost', withToken({ id, updates }));
  },

  async getUsers() {
    return callFunction<ManagedUser[]>('adminApi', 'getUsers', withToken());
  },

  async getStats() {
    return callFunction<AdminStats>('adminApi', 'getStats', withToken());
  },

  async deletePhoto(id: string) {
    return callFunction('adminApi', 'deletePost', withToken({ id }));
  }
};
