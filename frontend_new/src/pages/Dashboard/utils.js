/**
 * 将任意输入安全转换为数值。
 *
 * @param {unknown} value 输入值
 * @returns {number} 转换后的数值，非法值返回 0
 */
export const toNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

/**
 * 将百分比限制在 0-100 区间并四舍五入。
 *
 * @param {unknown} value 百分比原始值
 * @returns {number} 合法百分比
 */
export const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(toNumber(value))))

/**
 * 判断时间是否属于今天。
 *
 * @param {string | number | Date | null | undefined} value 时间值
 * @returns {boolean} 是否今天
 */
export const isToday = (value) => {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

/**
 * 计算相对时间展示文本。
 *
 * @param {string | number | Date | null | undefined} iso 时间值
 * @returns {string} 展示文案
 */
export const formatTimeAgo = (iso) => {
  if (!iso) return '刚刚'
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return '刚刚'
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} 小时前`
  return `${Math.floor(diff / (24 * 60 * 60 * 1000))} 天前`
}

/**
 * 按任务状态优先级与更新时间排序。
 *
 * @param {Array<Record<string, any>>} tasks 任务列表
 * @param {Record<string, number>} statusOrder 状态优先级映射
 * @returns {Array<Record<string, any>>} 排序后的任务
 */
export const sortByStatusAndTime = (tasks, statusOrder) => [...tasks].sort((a, b) => {
  const aWeight = statusOrder[a.status] ?? 9
  const bWeight = statusOrder[b.status] ?? 9
  if (aWeight !== bWeight) return aWeight - bWeight
  return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
})
