/**
 * 统一封装到 crf-service 的 HTTP 调用。
 *
 * 背景（P16）：之前 CRF_SERVICE_URL 的定义分散在 projects.ts / documents.ts，
 * 且 patients.ts、documents.ts 内还混着 `http://localhost:8100` 硬编码，
 * 导致部署到其它环境时极易漏改。这里集中管理 URL 与基本 fetch 调用。
 *
 * 用法：
 *   import { crfServiceFetch, CRF_SERVICE_URL } from '../services/crfServiceClient';
 *   await crfServiceFetch('/api/extract/batch', { method: 'POST', body: JSON.stringify(payload) });
 */

export const CRF_SERVICE_URL: string = (() => {
  const raw = process.env.CRF_SERVICE_URL || process.env.CRF_SERVICE_BASE_URL || 'http://localhost:8100';
  return raw.replace(/\/+$/, '');
})();

export interface CrfFetchInit extends RequestInit {
  /** 默认 headers 会自动附带 Content-Type: application/json */
  skipJsonHeader?: boolean;
}

/**
 * 统一 fetch 入口。path 必须以 `/` 开头。
 */
export async function crfServiceFetch(path: string, init: CrfFetchInit = {}): Promise<Response> {
  if (!path.startsWith('/')) {
    throw new Error(`[crfServiceFetch] path 必须以 "/" 开头：${path}`);
  }
  const url = `${CRF_SERVICE_URL}${path}`;
  const headers = new Headers(init.headers || {});
  if (!init.skipJsonHeader && init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...init, headers });
}

/**
 * 便捷方法：提交批量抽取任务。
 */
export async function crfServiceSubmitBatch(payload: unknown): Promise<Response> {
  return crfServiceFetch('/api/extract/batch', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * 便捷方法：提交单文档抽取任务。
 */
export async function crfServiceSubmitSingle(payload: unknown): Promise<Response> {
  return crfServiceFetch('/api/extract', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
