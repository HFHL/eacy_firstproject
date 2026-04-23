/**
 * @file 嵌套字段节点解析器。
 */

/**
 * 判断值是否为纯对象。
 *
 * @param {any} value 任意值。
 * @returns {boolean}
 */
const isPlainObject = (value) => {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 判断数组是否为对象数组。
 *
 * @param {any[]} values 数组值。
 * @returns {boolean}
 */
const isObjectArray = (values) => {
  return Array.isArray(values) && values.every((item) => isPlainObject(item))
}

/**
 * 推断节点类型。
 *
 * @param {any} value 字段值。
 * @returns {'scalar'|'object'|'arrayObject'|'arrayScalar'}
 */
const inferNodeType = (value) => {
  if (Array.isArray(value)) {
    return isObjectArray(value) ? 'arrayObject' : 'arrayScalar'
  }
  if (isPlainObject(value)) return 'object'
  return 'scalar'
}

/**
 * 构建字段节点树。
 *
 * @param {any} value 字段值。
 * @param {{
 *  path: string;
 *  label: string;
 *  schemaHints?: Record<string, any> | null;
 *  depth?: number;
 *  maxDepth?: number;
 * }} options 解析参数。
 * @returns {{
 *  nodeType:'scalar'|'object'|'arrayObject'|'arrayScalar';
 *  path:string;
 *  label:string;
 *  value:any;
 *  children:Array<Record<string, any>>;
 *  rowKeyStrategy:'index';
 *  schemaHints:Record<string, any> | null;
 *  rowCount:number;
 * }}
 */
export const buildNestedFieldNode = (value, options) => {
  const {
    path,
    label,
    schemaHints = null,
    depth = 0,
    maxDepth = 8,
  } = options || {}

  const nodeType = inferNodeType(value)
  if (depth >= maxDepth || nodeType === 'scalar') {
    return {
      nodeType,
      path: String(path || ''),
      label: String(label || path || ''),
      value,
      children: [],
      rowKeyStrategy: 'index',
      schemaHints,
      rowCount: Array.isArray(value) ? value.length : 0,
    }
  }

  if (nodeType === 'arrayScalar') {
    return {
      nodeType,
      path: String(path || ''),
      label: String(label || path || ''),
      value,
      children: (value || []).map((item, index) => ({
        nodeType: inferNodeType(item),
        path: `${path}[${index}]`,
        label: `${label || path}[${index}]`,
        value: item,
        children: [],
        rowKeyStrategy: 'index',
        schemaHints: null,
        rowCount: 0,
      })),
      rowKeyStrategy: 'index',
      schemaHints,
      rowCount: Array.isArray(value) ? value.length : 0,
    }
  }

  if (nodeType === 'arrayObject') {
    const children = (value || []).map((rowItem, rowIndex) => {
      const rowChildren = Object.entries(rowItem || {}).map(([key, rowValue]) => (
        buildNestedFieldNode(rowValue, {
          path: `${path}[${rowIndex}].${key}`,
          label: key,
          depth: depth + 1,
          maxDepth,
        })
      ))
      return {
        nodeType: 'object',
        path: `${path}[${rowIndex}]`,
        label: `记录 ${rowIndex + 1}`,
        value: rowItem,
        children: rowChildren,
        rowKeyStrategy: 'index',
        schemaHints: null,
        rowCount: 0,
      }
    })
    return {
      nodeType,
      path: String(path || ''),
      label: String(label || path || ''),
      value,
      children,
      rowKeyStrategy: 'index',
      schemaHints,
      rowCount: Array.isArray(value) ? value.length : 0,
    }
  }

  const objectChildren = Object.entries(value || {}).map(([key, childValue]) => (
    buildNestedFieldNode(childValue, {
      path: `${path}.${key}`,
      label: key,
      depth: depth + 1,
      maxDepth,
    })
  ))

  return {
    nodeType,
    path: String(path || ''),
    label: String(label || path || ''),
    value,
    children: objectChildren,
    rowKeyStrategy: 'index',
    schemaHints,
    rowCount: 0,
  }
}

/**
 * 判断节点是否为嵌套结构（非标量）。
 *
 * @param {Record<string, any>} node 字段节点。
 * @returns {boolean}
 */
export const isNestedNode = (node) => {
  return Boolean(node && node.nodeType && node.nodeType !== 'scalar')
}

