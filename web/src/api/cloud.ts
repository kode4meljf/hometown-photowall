const API_URL = import.meta.env.VITE_ADMIN_API_URL || '/api/admin';

export interface CloudResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  code?: string;
}

function explainApiError(status: number, result: CloudResult): string {
  const code = result.code || '';
  const msg = result.message || '';

  if (code === 'INVALID_ENV' || msg.includes('INVALID_ENV')) {
    return '默认域名未生效：请在 HTTP 访问服务页面找到「默认域名」，点击「续期」，保存路由后再试';
  }
  if (code === 'DEFAULT_DOMAIN_EXPIRED') {
    return '默认域名已过期，请在 HTTP 访问服务页面点击「续期」';
  }
  if (code === 'FUNCTION_INVOCATION_FAILED') {
    return 'adminApi 云函数执行失败，请在微信开发者工具重新上传并部署 adminApi';
  }
  if (msg === '未知操作') {
    return '请重新部署 adminApi 云函数（含 getPostDetail 接口）';
  }
  if (status === 404) {
    return 'HTTP 路由未生效：确认已保存 /adminApi 路由，且「身份认证」已关闭';
  }
  if (msg) return msg;
  return `请求失败 (${status})`;
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
    throw new Error('网络请求失败，请确认本地 dev 服务已启动');
  }

  let result = {} as CloudResult<T>;
  try {
    result = await response.json();
  } catch {
    throw new Error(`服务响应异常 (${response.status})`);
  }

  if (!response.ok) {
    throw new Error(explainApiError(response.status, result));
  }
  if (result.code && result.success === undefined) {
    throw new Error(explainApiError(response.status, result));
  }

  return result;
}
