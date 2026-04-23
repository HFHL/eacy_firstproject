/**
 * @file Schema 渲染共享内核（结构判定与路径定位）。
 */

/**
 * 将扩展配置规范化为对象。
 *
 * @param {Record<string, any>} schemaNode Schema 节点。
 * @returns {Record<string, any> | null}
 */
const parseExtendedConfig = (schemaNode) => {
  const rawExtendedConfig = schemaNode?.['x-extended-config']
  if (!rawExtendedConfig) return null
  if (typeof rawExtendedConfig === 'object') return rawExtendedConfig
  if (typeof rawExtendedConfig !== 'string') return null
  try {
    return JSON.parse(rawExtendedConfig)
  } catch (_error) {
    return null
  }
}

/**
 * 判断节点是否为多行表格定义。
 *
 * @param {Record<string, any>} schemaNode Schema 节点。
 * @returns {boolean}
 */
const isMultiRowTable = (schemaNode) => {
  const extendedConfig = parseExtendedConfig(schemaNode)
  const tableRows = extendedConfig?.tableRows
  const tableConfigMultiRow = schemaNode?.['x-table-config']?.multiRow === true
  const rowConstraintMulti = schemaNode?.['x-row-constraint'] === 'multi_row'
  return tableRows === 'multiRow' || tableConfigMultiRow || rowConstraintMulti
}

/**
 * 判断是否为可重复表单（对象数组）。
 *
 * @param {Record<string, any> | null | undefined} schemaNode Schema 节点。
 * @returns {boolean}
 */
export const isRepeatableFormSchema = (schemaNode) => {
  if (!schemaNode || typeof schemaNode !== 'object') return false
  return schemaNode.type === 'array' && schemaNode.items?.type === 'object' && !!schemaNode.items?.properties
}

/**
 * 将“object + table + multi_row”兼容归一到 array schema。
 *
 * @param {Record<string, any> | null | undefined} schemaNode Schema 节点。
 * @returns {Record<string, any> | null | undefined}
 */
export const normalizeRepeatableTableSchema = (schemaNode) => {
  if (!schemaNode || typeof schemaNode !== 'object') return schemaNode
  const multiRow = isMultiRowTable(schemaNode)

  if (
    schemaNode.type === 'object'
    && schemaNode['x-display'] === 'table'
    && multiRow
    && schemaNode.properties
  ) {
    return {
      type: 'array',
      minItems: schemaNode.minItems,
      maxItems: schemaNode.maxItems,
      items: { ...schemaNode, type: 'object' },
    }
  }

  if (schemaNode.type === 'array' && schemaNode['x-display'] === 'table' && multiRow) {
    if (!schemaNode.items || !schemaNode.items.properties) {
      return {
        ...schemaNode,
        items: schemaNode.items
          ? { ...schemaNode.items, properties: schemaNode.items.properties || {} }
          : { type: 'object', properties: {} },
      }
    }
  }

  return schemaNode
}

/**
 * 通过点路径定位 schema 节点。
 * 支持数组实例路径，如 `A.B.0.C`。
 *
 * @param {Record<string, any> | null | undefined} schema 根 schema。
 * @param {string} path 点路径。
 * @returns {{
 *  schema: Record<string, any>;
 *  isArrayInstance: boolean;
 *  instanceIndex: number | null;
 *  parentArrayPath: string | null;
 * } | null}
 */
export const getSchemaAtPath = (schema, path) => {
  if (!path || !schema) return null
  const keys = String(path).split('.')
  let current = schema
  let isArrayInstance = false
  let instanceIndex = null
  let parentArrayPath = null

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (!current) return null

    if (/^\d+$/.test(key)) {
      if (current.type === 'array' && current.items) {
        isArrayInstance = true
        instanceIndex = Number.parseInt(key, 10)
        parentArrayPath = keys.slice(0, index).join('.')
        current = current.items
      } else {
        return null
      }
      continue
    }

    if (current.properties && current.properties[key]) {
      current = current.properties[key]
      continue
    }

    if (current.items?.properties && current.items.properties[key]) {
      current = current.items.properties[key]
      continue
    }

    return null
  }

  return {
    schema: current,
    isArrayInstance,
    instanceIndex,
    parentArrayPath,
  }
}

