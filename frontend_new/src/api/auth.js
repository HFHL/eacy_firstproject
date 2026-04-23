/**
 * 认证相关API
 */
import request from './request'

/**
 * 用户注册
 * @param {object} data - 注册信息
 * @param {string} data.email - 邮箱
 * @param {string} data.password - 密码
 * @param {string} data.name - 用户姓名
 * @param {string} [data.phone] - 手机号（可选）
 * @param {string} [data.organization] - 所属机构（可选）
 * @param {string} [data.department] - 科室（可选）
 * @param {string} [data.job_title] - 职称（可选）
 * @returns {Promise} 注册结果
 */
export const register = (data) => {
  return request.post('/auth/register', data)
}

/**
 * 发送注册邮箱验证码
 * @param {object} data
 * @param {string} data.email - 注册邮箱
 * @returns {Promise}
 */
export const sendRegisterEmailCode = (data) => {
  return request.post('/auth/register/send-email-code', data)
}

/**
 * 发送忘记密码邮箱验证码
 * @param {object} data
 * @param {string} data.email - 账户邮箱
 * @returns {Promise}
 */
export const sendResetPasswordEmailCode = (data) => {
  return request.post('/auth/password/send-email-code', data)
}

/**
 * 忘记密码-通过邮箱验证码重置密码
 * @param {object} data
 * @param {string} data.email - 账户邮箱
 * @param {string} data.code - 邮箱验证码
 * @param {string} data.new_password - 新密码
 * @returns {Promise}
 */
export const resetPasswordByEmail = (data) => {
  return request.post('/auth/password/reset', data)
}

/**
 * 邮箱密码登录
 * @param {object} data - 登录信息
 * @param {string} data.email - 邮箱
 * @param {string} data.password - 密码
 * @returns {Promise} 登录结果
 */
export const loginByEmail = (data) => {
  return request.post('/auth/login/email', data)
}

/**
 * 获取微信登录二维码
 * @returns {Promise} 二维码信息
 */
export const getWechatQrCode = () => {
  return request.get('/auth/wechat/qrcode')
}

/**
 * 检查微信扫码状态
 * @param {string} ticket - 二维码ticket
 * @returns {Promise} 扫码状态
 */
export const checkWechatScanStatus = (ticket) => {
  return request.get('/auth/wechat/check', { params: { ticket } })
}

/**
 * 刷新Token
 * @param {string} refreshToken - 刷新token
 * @returns {Promise} 新的token
 */
export const refreshToken = (refreshToken) => {
  return request.post('/auth/refresh', { refresh_token: refreshToken })
}

/**
 * 登出
 * @returns {Promise}
 */
export const logout = () => {
  return request.post('/auth/logout')
}

/**
 * 获取当前用户信息
 * @returns {Promise} 用户信息
 */
export const getCurrentUser = () => {
  return request.get('/auth/me')
}

/**
 * 更新当前用户信息
 * @param {object} data - 个人信息
 * @returns {Promise} 更新结果
 */
export const updateUserInfo = (data) => {
  return request.put('/auth/me', data)
}

/**
 * 用户软登录（更新用户追踪信息）
 * 用于前端启动时更新累积使用天数、本月活跃天数等
 * @returns {Promise} 软登录结果
 */
export const softLogin = () => {
  return request.post('/users/soft-login')
}

/**
 * 获取当前用户设置
 * @returns {Promise} { success, data: { settings } }
 */
export const getUserSettings = () => {
  return request.get('/users/me/settings')
}

/**
 * 更新当前用户设置（与现有设置合并）
 * @param {object} settings - 要更新的键值对，如 { theme_mode, data_masking }
 * @returns {Promise} { success, data: { settings } } 更新后的完整 settings
 */
export const updateUserSettings = (settings) => {
  return request.put('/users/me/settings', { settings })
}

/**
 * 获取可用的 OCR 脱敏模式
 * @returns {Promise} { success, data: { patterns: [{key, name, enabled}] } }
 */
export const getDesensitizePatterns = () => {
  return request.get('/users/me/desensitize-patterns')
}

export default {
  register,
  sendRegisterEmailCode,
  loginByEmail,
  getWechatQrCode,
  checkWechatScanStatus,
  refreshToken,
  logout,
  getCurrentUser,
  updateUserInfo,
  softLogin,
  getUserSettings,
  updateUserSettings,
  getDesensitizePatterns
}

