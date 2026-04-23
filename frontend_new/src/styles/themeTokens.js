/**
 * 前端主题单一来源（SSOT）。
 *
 * 说明：
 * - 所有全局色彩、字号、间距优先从该文件导出。
 * - ConfigProvider 与业务样式常量共享该定义，避免多来源漂移。
 */

/**
 * Ant Design 全局 token。
 *
 * @type {Record<string, string | number>}
 */
export const appThemeToken = {
  colorPrimary: '#1890ff',
  colorSuccess: '#52c41a',
  colorWarning: '#faad14',
  colorError: '#ff4d4f',
  colorBgContainer: '#ffffff',
  colorBgLayout: '#f0f2f5',
  colorBorder: '#f0f0f0',
  colorText: 'rgba(0, 0, 0, 0.85)',
  colorTextSecondary: 'rgba(0, 0, 0, 0.45)',
  colorTextTertiary: 'rgba(0, 0, 0, 0.25)',
  fontSize: 14,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
  borderRadius: 6,
  marginXS: 8,
  marginSM: 12,
  margin: 16,
  marginMD: 20,
  marginLG: 24,
  marginXL: 32,
}

/**
 * Ant Design 组件级 token。
 *
 * @type {Record<string, Record<string, string | number>>}
 */
export const appComponentTokens = {
  Table: {
    headerBg: '#fafafa',
    headerColor: 'rgba(0, 0, 0, 0.85)',
    rowHoverBg: '#f5f7fa',
  },
  Button: {
    borderRadius: 4,
  },
  Card: {
    borderRadius: 8,
    boxShadowTertiary: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
  },
  Layout: {
    siderBg: '#ffffff',
    headerBg: '#ffffff',
    bodyBg: '#f0f2f5',
  },
  Menu: {
    darkItemBg: '#001529',
    darkItemSelectedBg: '#1890ff',
  },
}

/**
 * 项目内统一使用的 Modal 宽度档位。
 *
 * @type {{ narrow: number, standard: number, wide: number, xwide: number }}
 */
export const modalWidthPreset = {
  narrow: 480,
  standard: 600,
  wide: 800,
  xwide: 1000,
}

/**
 * 项目内统一使用的 Modal body 样式。
 *
 * @type {{ body: { maxHeight: string, overflowY: string, overflowX: string } }}
 */
export const modalBodyPreset = {
  body: {
    maxHeight: '70vh',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
}

/**
 * 医疗业务语义色（挂载到 window 供历史模块兼容）。
 *
 * @type {Record<string, Record<string, string | Record<string, string>>>}
 */
export const medicalUIConfig = {
  dataCompleteness: {
    high: '#10b981',
    medium: '#f59e0b',
    low: '#ef4444',
  },
  confidence: {
    high: { bg: '#f6ffed', border: '#b7eb8f', color: appThemeToken.colorSuccess },
    medium: { bg: '#fffbe6', border: '#ffe58f', color: appThemeToken.colorWarning },
    low: { bg: '#fff2f0', border: '#ffccc7', color: appThemeToken.colorError },
  },
}
