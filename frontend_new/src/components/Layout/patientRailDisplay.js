import { maskName } from '../../utils/sensitiveUtils.js'

/**
 * 生成患者 rail 卡片的姓名展示值。
 *
 * 仅用于展示层脱敏，不修改原始数据。
 *
 * @param {string | null | undefined} rawName 患者原始姓名
 * @returns {string | null | undefined} 脱敏后的姓名展示值
 */
export function getPatientRailDisplayName(rawName) {
  return maskName(rawName)
}

