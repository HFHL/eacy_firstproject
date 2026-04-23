import { appThemeToken } from '../../styles/themeTokens'
import { STATUS_COLORS } from '../../styles/colors'

/**
 * Dashboard 视图层统一色彩映射。
 *
 * @type {Record<string, string>}
 */
export const DASHBOARD_COLORS = {
  primary: appThemeToken.colorPrimary,
  success: appThemeToken.colorSuccess,
  warning: appThemeToken.colorWarning,
  error: appThemeToken.colorError,
  text: appThemeToken.colorText,
  textSecondary: appThemeToken.colorTextSecondary,
  border: appThemeToken.colorBorder,
  bgContainer: appThemeToken.colorBgContainer,
  bgSubtle: 'rgba(0, 0, 0, 0.02)',
  patient: appThemeToken.colorPrimary,
  document: STATUS_COLORS.success.main,
  project: STATUS_COLORS.warning.main,
  task: appThemeToken.colorPrimary,
}

/**
 * Dashboard 文档流转阶段配色。
 *
 * @type {Record<string, string>}
 */
export const FLOW_STAGE_COLORS = {
  upload: appThemeToken.colorPrimary,
  parse: STATUS_COLORS.warning.main,
  todo: appThemeToken.colorPrimary,
  archived: appThemeToken.colorSuccess,
}

/**
 * Dashboard 统一圆角与间距。
 *
 * @type {{ cardRadius: number, blockRadius: number, gutter: number }}
 */
export const DASHBOARD_SIZES = {
  cardRadius: 8,
  blockRadius: 6,
  gutter: 24,
}
