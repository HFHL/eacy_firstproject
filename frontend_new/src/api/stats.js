/**
 * 统计相关API
 */
import request from './request'

/**
 * 获取仪表盘数据（聚合统计）
 * @returns {Promise} { success, data: { overview, documents, patients } }
 */
export const getDashboardStats = () => {
  return request.get('/stats/dashboard')
}

/**
 * 获取所有活跃的异步任务（从 Redis 扫描）
 * @returns {Promise} { success, data: { tasks, total, active_count } }
 */
export const getActiveTasks = () => {
  return request.get('/stats/active-tasks')
}

export default {
  getDashboardStats,
  getActiveTasks
}

