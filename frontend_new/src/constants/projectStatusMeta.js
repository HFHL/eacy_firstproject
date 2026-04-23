import { appThemeToken } from '../styles/themeTokens'
import { STATUS_COLORS } from '../styles/colors'

/**
 * 项目状态规范键集合。
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PROJECT_STATUS_KEYS = Object.freeze({
  planning: 'planning',
  active: 'active',
  paused: 'paused',
  completed: 'completed',
})

/**
 * 将接口侧多种状态值归一到统一键。
 *
 * @param {string | null | undefined} status 原始状态值
 * @returns {string} 归一化状态键
 */
export const normalizeProjectStatusKey = (status) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'planning' || normalized === 'draft') return PROJECT_STATUS_KEYS.planning
  if (normalized === 'active' || normalized === 'recruiting') return PROJECT_STATUS_KEYS.active
  if (normalized === 'paused' || normalized === 'suspended') return PROJECT_STATUS_KEYS.paused
  if (normalized === 'completed') return PROJECT_STATUS_KEYS.completed
  return normalized || PROJECT_STATUS_KEYS.planning
}

/**
 * 项目状态统一展示定义（文案/颜色）。
 *
 * @type {Readonly<Record<string, {label: string, color: string}>>}
 */
export const PROJECT_STATUS_META = Object.freeze({
  [PROJECT_STATUS_KEYS.planning]: {
    label: '规划中',
    color: appThemeToken.colorPrimary,
  },
  [PROJECT_STATUS_KEYS.active]: {
    label: '进行中',
    color: STATUS_COLORS.success.main,
  },
  [PROJECT_STATUS_KEYS.paused]: {
    label: '暂停中',
    color: STATUS_COLORS.warning.main,
  },
  [PROJECT_STATUS_KEYS.completed]: {
    label: '已完成',
    color: appThemeToken.colorTextSecondary,
  },
})

/**
 * 项目状态展示顺序。
 *
 * @type {ReadonlyArray<string>}
 */
export const PROJECT_STATUS_ORDER = Object.freeze([
  PROJECT_STATUS_KEYS.planning,
  PROJECT_STATUS_KEYS.active,
  PROJECT_STATUS_KEYS.paused,
  PROJECT_STATUS_KEYS.completed,
])

/**
 * 获取项目状态展示元信息。
 *
 * @param {string | null | undefined} status 原始状态值
 * @returns {{key: string, label: string, color: string}} 状态展示信息
 */
export const getProjectStatusMeta = (status) => {
  const key = normalizeProjectStatusKey(status)
  const meta = PROJECT_STATUS_META[key]
  if (meta) return { key, ...meta }
  return {
    key,
    label: String(status || '未知'),
    color: appThemeToken.colorTextTertiary,
  }
}

/**
 * 获取项目状态选项（用于下拉框等场景）。
 *
 * @returns {Array<{value: string, label: string}>} 状态选项
 */
export const getProjectStatusOptions = () => {
  return PROJECT_STATUS_ORDER.map((key) => ({
    value: key,
    label: PROJECT_STATUS_META[key].label,
  }))
}

