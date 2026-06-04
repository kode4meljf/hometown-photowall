import { invokeAdminApi, AdminApiError } from './cloud';
import type { PostStatus } from '../constants/postStatus';

export type { PostStatus } from '../constants/postStatus';
export { AdminApiError } from './cloud';

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

const AUTH_FAILURE_HINTS = ['未登录', '登录已过期', '无权限访问'];

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAuthError';
  }
}

export function isAdminAuthMessage(message?: string) {
  if (!message) return false;
  return AUTH_FAILURE_HINTS.some((hint) => message.includes(hint));
}

function notifySessionExpired(message?: string) {
  window.dispatchEvent(
    new CustomEvent('admin:session-expired', { detail: { message: message || '登录已过期，请重新登录' } })
  );
}

async function invokeAdminApiAuthed<T>(action: string, data: Record<string, unknown> = {}) {
  try {
    return await invokeAdminApi<T>(action, data);
  } catch (e) {
    if (e instanceof AdminApiError && isAdminAuthMessage(e.message)) {
      adminAuth.logout();
      notifySessionExpired(e.message);
      throw new AdminAuthError(e.message || '登录已过期，请重新登录');
    }
    throw e;
  }
}

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
  status: PostStatus;
  mediaTraceIds?: string[];
  reviewAdminNote?: string;
  createdAt: string;
  photos: PostImage[];
}

/** 管理后台列表项（作品摘要） */
export interface AdminPost {
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
  status: PostStatus;
  mediaTraceIds?: string[];
  reviewAdminNote?: string;
  createdAt: string;
  photos?: PostImage[];
}

export function toPostDetail(post: AdminPost): AdminPostDetail {
  return {
    id: post.id,
    title: post.title || '无标题',
    description: post.description || '',
    author: post.author,
    authorId: post.authorId || '',
    location: post.location || '-',
    category: post.category || '-',
    likes: post.likes || 0,
    views: post.views || 0,
    commentCount: post.commentCount || 0,
    status: post.status,
    mediaTraceIds: post.mediaTraceIds,
    reviewAdminNote: post.reviewAdminNote,
    createdAt: post.createdAt,
    photos: post.photos?.length
      ? post.photos
      : (post.imageUrl ? [{ imageUrl: post.imageUrl }] : [])
  };
}

export interface AdminStats {
  totalPosts: number;
  totalUsers: number;
  totalLikes: number;
  totalViews: number;
  totalComments: number;
  pendingFeedbacks?: number;
  reviewingPosts?: number;
}

export interface AdminFeedback {
  id: string;
  type: 'feedback' | 'report';
  postId: string;
  reason: string;
  content: string;
  contact: string;
  userId: string;
  authorNickname: string;
  status: 'pending' | 'processing' | 'resolved';
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string;
}

export interface ManagedUser {
  id: string;
  username: string;
  nickname: string;
  role: string;
  postCount: number;
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
    try {
      const res = await invokeAdminApi<{ token: string; user: AdminUser }>('login', {
        username,
        password
      });
      if (res.data) {
        localStorage.setItem(TOKEN_KEY, res.data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
      }
      return res;
    } catch (e) {
      if (e instanceof AdminApiError) {
        return { success: false as const, message: e.message };
      }
      throw e;
    }
  },

  async verifySession() {
    const token = getToken();
    if (!token) {
      return { success: true as const, data: null };
    }
    try {
      const res = await invokeAdminApi<AdminUser | null>('verifySession', {
        adminToken: token
      });
      if (res.data) {
        localStorage.setItem(USER_KEY, JSON.stringify(res.data));
      } else {
        this.logout();
      }
      return res;
    } catch (e) {
      if (e instanceof AdminApiError && isAdminAuthMessage(e.message)) {
        this.logout();
        return { success: false as const, message: e.message };
      }
      throw e;
    }
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
};

export const adminApi = {
  async getPosts(params: { page?: number; pageSize?: number; status?: PostStatus | 'all' } = {}) {
    return invokeAdminApiAuthed<{ posts: AdminPost[]; total: number }>('getPhotos', withToken(params));
  },

  async getPostDetail(id: string) {
    return invokeAdminApiAuthed<AdminPostDetail>('getPostDetail', withToken({ id }));
  },

  async updatePost(id: string, updates: Pick<AdminPostDetail, 'title' | 'description' | 'location'>) {
    return invokeAdminApiAuthed<AdminPostDetail>('updatePost', withToken({ id, updates }));
  },

  async updatePostStatus(id: string, status: PostStatus, reviewNote?: string) {
    return invokeAdminApiAuthed<AdminPostDetail>('updatePostStatus', withToken({ id, status, reviewNote }));
  },

  async getUsers() {
    return invokeAdminApiAuthed<ManagedUser[]>('getUsers', withToken());
  },

  async getStats() {
    return invokeAdminApiAuthed<AdminStats>('getStats', withToken());
  },

  async deletePost(id: string) {
    return invokeAdminApiAuthed('deletePost', withToken({ id }));
  },

  async getFeedbacks(params: { page?: number; pageSize?: number; status?: string; type?: string } = {}) {
    return invokeAdminApiAuthed<{ feedbacks: AdminFeedback[]; total: number }>(
      'getFeedbacks',
      withToken(params)
    );
  },

  async updateFeedback(
    id: string,
    updates: { status?: AdminFeedback['status']; adminNote?: string }
  ) {
    return invokeAdminApiAuthed<AdminFeedback>('updateFeedback', withToken({ id, updates }));
  },
};
