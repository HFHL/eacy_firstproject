/**
 * API配置文件
 * 根据环境变量自动切换后端地址
 */

// 环境判断
const isDevelopment = import.meta.env.DEV
const isProduction = import.meta.env.PROD

// 优先使用环境变量 VITE_API_BASE_URL
// Docker 开发模式下设置为 /api，由 Vite 代理转发
// 这样手机等外部设备也能正常访问
const envBaseUrl = import.meta.env.VITE_API_BASE_URL

// 获取当前环境的后端地址
export const getBaseUrl = () => {
  // 如果设置了环境变量，优先使用
  if (envBaseUrl !== undefined) {
    return envBaseUrl
  }
  // 否则开发环境用 localhost，生产环境用空字符串
  if (isDevelopment) {
    return 'http://localhost:8000'
  }
  return ''  // Docker 部署时由 nginx 代理
}

function _normalizeBaseUrl(raw) {
  if (raw === undefined || raw === null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  return s.endsWith('/') ? s.slice(0, -1) : s
}

function _buildApiUrl(base) {
  const b = _normalizeBaseUrl(base)
  if (!b) return '/api/v1'
  // 兼容：用户可能直接传了 /api 或 /api/v1 或完整 URL
  if (b.endsWith('/api/v1')) return b
  if (b.endsWith('/api')) return `${b}/v1`
  return `${b}/api/v1`
}

// 完整API地址（确保不会出现 /api/api/v1）
export const API_URL = _buildApiUrl(getBaseUrl())

// 仅用于展示/调试（不再直接拼接使用）
export const API_VERSION = '/api/v1'

// 业务状态码
export const BusinessCode = {
  SUCCESS: 0,
  // 认证相关错误 4xxxx
  AUTH_ERROR: 40001,           // 邮箱或密码错误
  TOKEN_EXPIRED: 40002,        // Token过期
  TOKEN_INVALID: 40003,        // Token无效
  UNAUTHORIZED: 40004,         // 未授权
}

// 导出配置
export default {
  baseUrl: getBaseUrl(),
  apiUrl: API_URL,
  apiVersion: API_VERSION,
  isDevelopment,
  isProduction
}

