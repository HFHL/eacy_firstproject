/**
 * 设计系统配色常量
 * 基于 design-tokens.json 和文档管理页面改造规划
 */
import { appThemeToken } from './themeTokens'

// 主色调系统 - 与 ConfigProvider token 对齐
export const PRIMARY_COLORS = {
  main: appThemeToken.colorPrimary,
  hover: '#4096ff',
  active: '#0958d9',
  disabled: 'rgba(0,0,0,0.04)',
  outline: 'rgba(24, 144, 255, 0.2)'
}

// 状态色彩系统 - 与 ConfigProvider token 对齐
export const STATUS_COLORS = {
  success: {
    main: appThemeToken.colorSuccess,
    hover: '#73d13d',
    active: '#389e0d',
    bg: '#f0fdf4',
    border: '#86efac'
  },
  warning: {
    main: appThemeToken.colorWarning,
    hover: '#ffc53d',
    active: '#d48806',
    bg: '#fffbeb',
    border: '#fde68a'
  },
  error: {
    main: appThemeToken.colorError,
    hover: '#ff7875',
    active: '#d9363e',
    bg: '#fef2f2',
    border: '#fecaca'
  }
}

// 中性色系统
export const NEUTRAL_COLORS = {
  text: appThemeToken.colorText,
  textSecondary: appThemeToken.colorTextSecondary,
  textTertiary: appThemeToken.colorTextTertiary,
  textQuaternary: 'rgba(0, 0, 0, 0.25)',
  bgContainer: appThemeToken.colorBgContainer,
  bgElevated: appThemeToken.colorBgContainer,
  bgLayout: appThemeToken.colorBgLayout,
  border: appThemeToken.colorBorder,
  borderSecondary: appThemeToken.colorBorder,
  split: 'rgba(5, 5, 5, 0.06)',
  fill: 'rgba(0, 0, 0, 0.04)',
  fillSecondary: 'rgba(0, 0, 0, 0.02)'
}

// 边框和分割线
export const BORDER_COLORS = {
  main: appThemeToken.colorBorder,
  hover: 'rgba(99, 102, 241, 0.1)',
  primary: PRIMARY_COLORS.main
}

// 阴影系统
export const SHADOWS = {
  basic: '0 1px 2px rgba(0, 0, 0, 0.03)',
  hover: '0 4px 12px rgba(99, 102, 241, 0.15)',
  level1: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
  level2: '0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 9px 28px 8px rgba(0, 0, 0, 0.05)',
  level3: '0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)'
}

// 置信度指示器配色
export const CONFIDENCE_COLORS = {
  high: {
    color: STATUS_COLORS.success.main,
    bg: STATUS_COLORS.success.bg,
    text: '高'
  },
  medium: {
    color: STATUS_COLORS.warning.main,
    bg: STATUS_COLORS.warning.bg, 
    text: '中'
  },
  low: {
    color: STATUS_COLORS.error.main,
    bg: STATUS_COLORS.error.bg,
    text: '低'
  }
}

// 文档状态配色
export const DOCUMENT_STATUS_COLORS = {
  extracted: STATUS_COLORS.success.main,
  pending: STATUS_COLORS.warning.main,
  processing: PRIMARY_COLORS.main,
  error: STATUS_COLORS.error.main
}

// 兼容性映射 - 用于替换旧的硬编码颜色
export const COLOR_MAPPING = {
  // 旧颜色 -> 新颜色
  '#1677ff': appThemeToken.colorPrimary,
  '#52c41a': STATUS_COLORS.success.main,
  '#faad14': STATUS_COLORS.warning.main,
  '#ff4d4f': STATUS_COLORS.error.main,
  '#6366f1': appThemeToken.colorPrimary,
  '#10b981': STATUS_COLORS.success.main,
  '#f59e0b': STATUS_COLORS.warning.main,
  '#ef4444': STATUS_COLORS.error.main
}

// 导出所有颜色常量
export const DESIGN_COLORS = {
  primary: PRIMARY_COLORS,
  status: STATUS_COLORS,
  neutral: NEUTRAL_COLORS,
  border: BORDER_COLORS,
  shadows: SHADOWS,
  confidence: CONFIDENCE_COLORS,
  documentStatus: DOCUMENT_STATUS_COLORS
}

export default DESIGN_COLORS