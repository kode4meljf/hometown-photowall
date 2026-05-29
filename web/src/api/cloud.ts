const DEFAULT_HTTP_BASE = 'https://cloud1-d2g545zl57f7db2de.ap-shanghai.app.tcloudbase.com';
const API_PATH = import.meta.env.VITE_ADMIN_API_PATH || '/adminApi';
const API_URL = import.meta.env.VITE_ADMIN_API_URL || '/api/admin';

export interface CloudResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export async function callFunction<T = unknown>(
  _name: string,
  action: string,
  data: Record<string, unknown> = {}
): Promise<CloudResult<T>> {
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data })
    });
  } catch {
    throw new Error('网络请求失败，请确认 adminApi 已部署且 HTTP 访问服务已配置');
  }

  if (response.status === 404) {
    throw new Error(
      'adminApi HTTP 访问未配置：云开发平台 → HTTP 访问服务 → 关联云函数 adminApi，触发路径设为 /adminApi'
    );
  }

  let result: CloudResult<T>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务响应异常 (${response.status})`);
  }

  if (!response.ok && !result.message) {
    throw new Error(`请求失败 (${response.status})`);
  }

  return result;
}

export const adminApiHttpConfig = {
  defaultHttpBase: DEFAULT_HTTP_BASE,
  apiPath: API_PATH
};
