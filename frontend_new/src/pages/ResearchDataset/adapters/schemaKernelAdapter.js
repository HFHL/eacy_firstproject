/**
 * @file ResearchDataset 对 SchemaForm 共享内核的适配层。
 */

import { normalizeRepeatableTableSchema } from '../../../components/SchemaForm/schemaRenderKernel'

/**
 * 解析路径分段（`A/B/C` -> `['A','B','C']`）。
 *
 * @param {string} rawPath 原始路径。
 * @returns {string[]}
 */
const splitSlashPath = (rawPath) => {
  return String(rawPath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

/**
 * 统一路径字符串（全角归一、去除斜杠两侧空格）。
 *
 * @param {string} rawPath 原始路径。
 * @returns {string}
 */
export const normalizeSlashPath = (rawPath) => {
  return String(rawPath || '')
    .normalize('NFKC')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

/**
 * 统一路径分段文本，降低全角/空格差异带来的匹配失败。
 *
 * @param {string} rawSegment 原始分段。
 * @returns {string}
 */
const normalizeSegmentForCompare = (rawSegment) => {
  return String(rawSegment || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .trim()
}

/**
 * 对外暴露：按 slash 路径解析分段。
 *
 * @param {string} rawPath 原始路径。
 * @returns {string[]}
 */
export const splitSchemaSlashPath = (rawPath) => splitSlashPath(rawPath)

/**
 * 判断 `prefix` 是否是 `segments` 的前缀。
 *
 * @param {string[]} segments 目标分段。
 * @param {string[]} prefix 前缀分段。
 * @returns {boolean}
 */
const startsWithSegments = (segments, prefix) => {
  if (!Array.isArray(segments) || !Array.isArray(prefix) || prefix.length === 0) return false
  if (segments.length < prefix.length) return false
  return prefix.every((segment, index) => {
    return normalizeSegmentForCompare(segments[index]) === normalizeSegmentForCompare(segment)
  })
}

/**
 * 构建字段路径候选（完整路径优先，再尝试去掉组名前缀）。
 *
 * @param {string} groupName 字段组名称。
 * @param {string} fieldPath 字段完整路径。
 * @returns {string[][]}
 */
const buildPathCandidates = (groupName, fieldPath) => {
  const fullSegments = splitSlashPath(fieldPath)
  const groupSegments = splitSlashPath(groupName)
  const candidates = []

  if (fullSegments.length > 0) {
    candidates.push(fullSegments)
  }
  if (groupSegments.length > 0 && startsWithSegments(fullSegments, groupSegments)) {
    candidates.push(fullSegments.slice(groupSegments.length))
  }
  if (fullSegments.length > 1) {
    candidates.push(fullSegments.slice(1))
  }

  const dedup = []
  const visited = new Set()
  candidates.forEach((segments) => {
    if (!Array.isArray(segments) || segments.length === 0) return
    const key = segments.join('/')
    if (visited.has(key)) return
    visited.add(key)
    dedup.push(segments)
  })
  return dedup
}

/**
 * 在 schema 中按分段路径递归定位字段节点。
 *
 * @param {Record<string, any> | null} schema 根 schema。
 * @param {string[]} segments 路径分段。
 * @returns {Record<string, any> | null}
 */
const findSchemaNodeBySegments = (schema, segments) => {
  if (!schema || !Array.isArray(segments) || segments.length === 0) return null
  let currentNode = schema
  let cursor = 0

  /**
   * 在 properties 中匹配“可能含 / 的键名”，返回命中的键与消费段数。
   *
   * @param {Record<string, any>} properties 属性字典。
   * @param {string[]} remainingSegments 剩余分段。
   * @returns {{matchedKey:string, consumed:number} | null}
   */
  const matchCompositePropertyKey = (properties, remainingSegments) => {
    if (!properties || !remainingSegments || remainingSegments.length === 0) return null
    const propertyEntries = Object.entries(properties)
    // 优先最长匹配，确保“基因突变/扩增/...”不会被拆成第一个片段
    for (let consumed = remainingSegments.length; consumed >= 1; consumed -= 1) {
      const joinedKey = remainingSegments.slice(0, consumed).join('/')
      const normalizedJoined = normalizeSlashPath(joinedKey)
      const matchedEntry = propertyEntries.find(([rawKey]) => normalizeSlashPath(rawKey) === normalizedJoined)
      if (matchedEntry) {
        return { matchedKey: matchedEntry[0], consumed }
      }
    }
    return null
  }

  while (cursor < segments.length) {
    const normalizedNode = normalizeRepeatableTableSchema(currentNode)
    const remainingSegments = segments.slice(cursor)

    const propertyMatch = matchCompositePropertyKey(normalizedNode?.properties, remainingSegments)
    if (propertyMatch) {
      currentNode = normalizedNode.properties[propertyMatch.matchedKey]
      cursor += propertyMatch.consumed
      continue
    }

    if (normalizedNode?.type === 'array' && normalizedNode?.items?.properties) {
      const itemPropertyMatch = matchCompositePropertyKey(normalizedNode.items.properties, remainingSegments)
      if (itemPropertyMatch) {
        currentNode = normalizedNode.items.properties[itemPropertyMatch.matchedKey]
        cursor += itemPropertyMatch.consumed
        continue
      }
    }

    return null
  }

  return normalizeRepeatableTableSchema(currentNode) || null
}

/**
 * 直接按路径定位 schema 节点（用于字段组级定位）。
 *
 * @param {Record<string, any> | null} schema 根 schema。
 * @param {string} rawPath slash 路径。
 * @returns {Record<string, any> | null}
 */
export const resolveSchemaNodeByPath = (schema, rawPath) => {
  const segments = splitSlashPath(normalizeSlashPath(rawPath))
  if (segments.length === 0) return null
  return findSchemaNodeBySegments(schema, segments)
}

/**
 * 按“字段组路径 + 字段路径”定位 schema 节点。
 *
 * @param {Record<string, any> | null} schema 根 schema。
 * @param {string} groupName 字段组名称。
 * @param {string} fieldPath 字段路径。
 * @returns {Record<string, any> | null}
 */
export const resolveSchemaNodeByFieldPath = (schema, groupName, fieldPath) => {
  const candidates = buildPathCandidates(groupName, fieldPath)
  for (const segments of candidates) {
    const node = findSchemaNodeBySegments(schema, segments)
    if (node) return node
  }
  return null
}

/**
 * 判断 schema 节点是否是标量类型。
 *
 * @param {Record<string, any> | null} schemaNode schema 节点。
 * @returns {boolean}
 */
const isScalarSchemaNode = (schemaNode) => {
  if (!schemaNode || typeof schemaNode !== 'object') return false
  const normalizedNode = normalizeRepeatableTableSchema(schemaNode)
  const type = normalizedNode?.type
  return type === 'string'
    || type === 'number'
    || type === 'integer'
    || type === 'boolean'
    || type === 'null'
}

/**
 * 根据 sourceFieldKeys 的 schema 命中结果推断列类型。
 *
 * @param {Array<Record<string, any> | null>} schemaNodes 命中的 schema 节点列表。
 * @param {number} sourceCount 源字段个数。
 * @returns {'scalar'|'complex'}
 */
export const inferColumnNodeKindBySchema = (schemaNodes, sourceCount) => {
  const nodes = Array.isArray(schemaNodes) ? schemaNodes.filter(Boolean) : []
  if (nodes.length === 0) {
    return sourceCount === 1 ? 'scalar' : 'complex'
  }
  return nodes.every((node) => isScalarSchemaNode(node)) && sourceCount === 1
    ? 'scalar'
    : 'complex'
}

/**
 * 基于 db_fields 计算最佳组路径绑定（组级 schema 节点 + repeatable 数据路径）。
 *
 * @param {Record<string, any> | null} schema 根 schema。
 * @param {string} groupName 字段组名称。
 * @param {string[]} dbFields 组内字段路径。
 * @returns {{
 *  groupPathTokens: string[];
 *  groupPath: string;
 *  repeatableDataPath: string | null;
 *  groupSchemaNode: Record<string, any> | null;
 * }}
 */
export const resolveGroupSchemaBinding = (schema, groupName, dbFields) => {
  const normalizedGroupName = normalizeSlashPath(groupName)
  const normalizedDbFields = Array.isArray(dbFields)
    ? dbFields.map((fieldPath) => normalizeSlashPath(fieldPath)).filter(Boolean)
    : []

  /**
   * 从字段路径集中提取前缀候选，并按“覆盖率 + 长度”排序。
   *
   * @returns {string[]}
   */
  const buildPrefixCandidates = () => {
    const candidateScoreMap = new Map()
    const seedPaths = [normalizedGroupName, ...normalizedDbFields].filter(Boolean)
    seedPaths.forEach((pathText) => {
      const segments = splitSlashPath(pathText)
      for (let prefixLen = 1; prefixLen <= segments.length; prefixLen += 1) {
        const prefix = segments.slice(0, prefixLen).join('/')
        if (!prefix) continue
        const coverage = normalizedDbFields.filter((fieldPath) => fieldPath.startsWith(`${prefix}/`) || fieldPath === prefix).length
        const score = (coverage * 1000) + prefixLen
        const prevScore = candidateScoreMap.get(prefix) || 0
        if (score > prevScore) {
          candidateScoreMap.set(prefix, score)
        }
      }
    })

    return [...candidateScoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([prefix]) => prefix)
  }

  const prefixCandidates = buildPrefixCandidates()
  let groupPath = normalizedGroupName
  let groupSchemaNode = resolveSchemaNodeByPath(schema, groupPath)

  if (!groupSchemaNode) {
    for (const candidatePath of prefixCandidates) {
      const candidateNode = resolveSchemaNodeByPath(schema, candidatePath)
      if (!candidateNode) continue
      groupPath = candidatePath
      groupSchemaNode = candidateNode
      break
    }
  }

  const groupPathTokens = splitSlashPath(groupPath)
  const normalizedGroupNode = normalizeRepeatableTableSchema(groupSchemaNode)
  const repeatableDataPath = normalizedGroupNode?.type === 'array' && normalizedGroupNode?.items?.properties
    ? groupPath
    : null

  return {
    groupPathTokens,
    groupPath,
    repeatableDataPath,
    groupSchemaNode: normalizedGroupNode || null,
  }
}

