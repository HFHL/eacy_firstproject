/**
 * Axios请求封装
 */
import axios from 'axios'
import { message } from 'antd'
import { API_URL, BusinessCode } from './config.js'

// 创建axios实例
const request = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // 从localStorage获取token
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // 如果是 FormData，移除 Content-Type，让浏览器自动设置（包括 boundary）
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    // 处理blob类型响应（文件下载）
    if (response.config.responseType === 'blob') {
      return response.data
    }
    
    const res = response.data
    
    // 业务状态码判断
    if (res.code !== BusinessCode.SUCCESS) {
      // 迁移期：对后端尚未实现（501）的模块静默，避免刷红整屏 toast
      const isNotImplemented = res.code === 501
      if (!response.config?._silent && !isNotImplemented) {
        message.error(res.message || '请求失败')
      }

      // 迁移期：登录流程未接入，禁用 token 失效自动跳 /login
      // 接回登录后恢复下面这段：
      // if ([BusinessCode.TOKEN_EXPIRED, BusinessCode.TOKEN_INVALID, BusinessCode.UNAUTHORIZED].includes(res.code)) {
      //   localStorage.removeItem('access_token')
      //   localStorage.removeItem('refresh_token')
      //   localStorage.removeItem('user_info')
      //   window.location.href = '/login'
      // }

      return Promise.reject(new Error(res.message || '请求失败'))
    }
    
    return res
  },
  (error) => {
    // HTTP错误处理
    let errorMessage = '网络错误，请稍后重试'
    
    if (error.response) {
      const { status, data } = error.response

      switch (status) {
        case 400:
          errorMessage = data?.message || '请求参数错误'
          break
        case 401:
          // 迁移期：不自动跳 /login，也不弹 toast（接回登录后恢复）
          errorMessage = ''
          break
        case 403:
          errorMessage = '没有权限访问'
          break
        case 404:
          errorMessage = '请求的资源不存在'
          break
        case 500:
          errorMessage = '服务器内部错误'
          break
        case 501:
          // 迁移期：后端未实现的模块（/auth /users /stats /crf-templates）静默
          errorMessage = ''
          break
        default:
          errorMessage = data?.message || `请求失败 (${status})`
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = '请求超时，请稍后重试'
    }

    if (errorMessage && !error.config?._silent) {
      message.error(errorMessage)
    }
    return Promise.reject(error)
  }
)

export default request

