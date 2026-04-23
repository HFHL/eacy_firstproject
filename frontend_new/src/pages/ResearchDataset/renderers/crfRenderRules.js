import { formatFieldValue } from '../components/cellRenderers'

/**
 * 解包字段包装对象（兼容 { value, ...meta } 结构）。
 *
 * @param {any} value 原始值。
 * @returns {any}
 */
const unwrapValue = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value
  }
  return value
}

/**
 * 计算复杂值的摘要条数。
 *
 * 规则：
 * 1. 值本身是数组：直接取数组长度；
 * 2. 值是对象且存在“顶层数组字段”：取第一个顶层数组字段长度（主数组）；
 * 3. 值是非空对象但无顶层数组：按 1 条记录处理；
 * 4. 值为空对象：按 0 条处理；
 * 5. 若 rawValue 无法判断，回退到 node 的数组行数。
 *
 * @param {any} rawValue 单元格原始值。
 * @param {Record<string, any> | null} node 解析后的嵌套节点。
 * @returns {number}
 */
const resolveSummaryCount = (rawValue, node) => {
  const normalizedValue = unwrapValue(rawValue)

  if (Array.isArray(normalizedValue)) return normalizedValue.length

  if (normalizedValue && typeof normalizedValue === 'object') {
    const topLevelValues = Object.values(normalizedValue).map((item) => unwrapValue(item))
    const primaryArray = topLevelValues.find((item) => Array.isArray(item) && item.length > 0)
      || topLevelValues.find((item) => Array.isArray(item))
    if (Array.isArray(primaryArray)) return primaryArray.length
    return Object.keys(normalizedValue).length > 0 ? 1 : 0
  }

  if (node && (node.nodeType === 'arrayObject' || node.nodeType === 'arrayScalar')) {
    if (typeof node.rowCount === 'number') return node.rowCount
  }

  if (node && node.nodeType === 'object') {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0
    return hasChildren ? 1 : 0
  }

  return 0
}

/**
 * 统一 CRF 单元格展示规则（单/多患者共用）。
 *
 * @param {{rawValue:any,node:Record<string, any> | null}} params 输入参数。
 * @returns {{
 *  mode:'scalar'|'detail';
 *  summaryText?: string;
 *  displayText?: string;
 * }} 统一渲染决策。
 */
export const resolveCrfCellPresentation = ({ rawValue, node }) => {
  if (node && node.nodeType && node.nodeType !== 'scalar') {
    const summaryCount = resolveSummaryCount(rawValue, node)
    return {
      mode: 'detail',
      summaryText: `${summaryCount} 条`,
    }
  }

  if (Array.isArray(rawValue)) {
    return {
      mode: 'detail',
      summaryText: `${rawValue.length} 条`,
    }
  }

  if (rawValue && typeof rawValue === 'object') {
    const summaryCount = resolveSummaryCount(rawValue, node)
    return {
      mode: 'detail',
      summaryText: `${summaryCount} 条`,
    }
  }

  return {
    mode: 'scalar',
    displayText: formatFieldValue(rawValue),
  }
}
