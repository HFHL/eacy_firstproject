/**
 * @file 项目详情页 V2 单元格渲染工具。
 */

/**
 * 规范化 slash 路径，兼容全角斜杠与空格差异。
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
 * 格式化字段值。
 *
 * @param {any} value 原始值。
 * @returns {string}
 */
export const formatFieldValue = (value) => {
  if (value === null || value === undefined || value === '') return '--'
  if (Array.isArray(value)) {
    if (value.length === 0) return '--'
    if (value.length === 1) return String(formatFieldValue(value[0]))
    return `${value.length} 条记录`
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

/**
 * 从患者行中读取字段值（默认严格路径模式，避免同名叶子串值）。
 *
 * @param {Record<string, any>} patient 患者行。
 * @param {string} groupId 字段组 ID。
 * @param {string} fieldKey 字段 key（slash 路径）。
 * @param {{
 *  groupName?: string;
 *  groupPathTokens?: string[];
 *  strictPathOnly?: boolean;
 * }} [options] 读取选项。
 * @returns {any}
 */
export const getFieldRawValue = (patient, groupId, fieldKey, options = {}) => {
  const normalizedFieldKey = normalizeSlashPath(fieldKey)
  const pathSegments = normalizedFieldKey.split('/').filter(Boolean)
  const strictPathOnly = options?.strictPathOnly !== false
  const crfGroups = patient?.crfGroups && typeof patient.crfGroups === 'object'
    ? patient.crfGroups
    : {}

  /**
   * 统一解析字段对象值。
   *
   * @param {any} fieldData 字段对象或原始值。
   * @returns {any}
   */
  const extractFieldValue = (fieldData) => {
    if (fieldData === null || fieldData === undefined) return null
    if (typeof fieldData !== 'object') return fieldData
    if (Object.prototype.hasOwnProperty.call(fieldData, 'value')) return fieldData.value
    return fieldData
  }

  /**
   * 构建字段路径候选（完整路径优先，兼容去掉首段的历史存储）。
   *
   * @returns {string[]}
   */
  const buildPathCandidates = () => {
    const candidates = [normalizedFieldKey]
    const normalizedGroupName = normalizeSlashPath(options?.groupName || '')
    if (normalizedGroupName && normalizedFieldKey.startsWith(`${normalizedGroupName}/`)) {
      candidates.push(normalizedFieldKey.slice(normalizedGroupName.length + 1))
    }
    if (pathSegments.length > 1) {
      candidates.push(pathSegments.slice(1).join('/'))
    }
    return [...new Set(candidates.filter(Boolean))]
  }

  /**
   * 在对象内按 slash 路径命中读取。
   *
   * @param {Record<string, any> | null | undefined} root 根对象。
   * @param {string} pathKey slash 路径。
   * @returns {any}
   */
  const readObjectPath = (root, pathKey) => {
    if (!root || typeof root !== 'object' || !pathKey) return null
    const segments = String(pathKey).split('/').filter(Boolean)
    if (segments.length === 0) return null
    let cursor = root
    for (const segment of segments) {
      if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, segment)) {
        cursor = cursor[segment]
      } else {
        return null
      }
    }
    return extractFieldValue(cursor)
  }

  /**
   * 从单个分组节点读取（严格路径）。
   *
   * @param {Record<string, any> | null | undefined} groupNode 分组节点。
   * @returns {any}
   */
  const readFromGroup = (groupNode) => {
    const fields = groupNode?.fields && typeof groupNode.fields === 'object' ? groupNode.fields : {}
    const pathCandidates = buildPathCandidates()
    const fieldEntries = Object.entries(fields)
    for (const pathKey of pathCandidates) {
      const matchedEntry = fieldEntries.find(([rawKey]) => normalizeSlashPath(rawKey) === pathKey)
      if (matchedEntry) {
        return extractFieldValue(matchedEntry[1])
      }
    }
    // 历史数据常以相对路径存储；在同组范围内允许最长后缀匹配（不跨组）
    for (const pathKey of pathCandidates) {
      const suffixMatches = fieldEntries.filter(([rawKey]) => {
        const normalizedRawKey = normalizeSlashPath(rawKey)
        return pathKey.endsWith(`/${normalizedRawKey}`) || normalizedRawKey.endsWith(`/${pathKey}`)
      })
      if (suffixMatches.length > 0) {
        suffixMatches.sort((a, b) => String(b[0]).length - String(a[0]).length)
        return extractFieldValue(suffixMatches[0][1])
      }
    }
    if (!strictPathOnly) {
      for (const pathKey of pathCandidates) {
        const nestedValue = readObjectPath(fields, pathKey)
        if (nestedValue !== null) return nestedValue
      }
    }
    return null
  }

  /**
   * 构建分组候选键（限定当前组语义范围，不做跨组遍历）。
   *
   * @returns {string[]}
   */
  const buildGroupCandidates = () => {
    const groupName = normalizeSlashPath(options?.groupName || '')
    const groupPathTokens = Array.isArray(options?.groupPathTokens)
      ? options.groupPathTokens.map((token) => normalizeSlashPath(token)).filter(Boolean)
      : []
    const groupSegments = groupName.split('/').map((segment) => segment.trim()).filter(Boolean)
    const candidates = [
      normalizeSlashPath(groupId),
      groupName,
      ...groupPathTokens,
      groupSegments[0],
      pathSegments[0],
    ].filter(Boolean)
    return [...new Set(candidates)]
  }

  const groupCandidates = buildGroupCandidates()
  const normalizedGroupEntries = Object.entries(crfGroups).map(([rawKey, groupNode]) => ({
    rawKey,
    normalizedKey: normalizeSlashPath(rawKey),
    groupNode,
  }))
  for (const candidateKey of groupCandidates) {
    const matchedGroup = normalizedGroupEntries.find((entry) => entry.normalizedKey === normalizeSlashPath(candidateKey))
    if (!matchedGroup) continue
    const value = readFromGroup(matchedGroup.groupNode)
    if (value !== null) return value
  }

  if (!strictPathOnly) {
    const crfDataRoot = patient?.crf_data?.data
    const pathCandidates = buildPathCandidates()
    for (const pathKey of pathCandidates) {
      const value = readObjectPath(crfDataRoot, pathKey)
      if (value !== null) return value
    }
  }

  return null
}

/**
 * 解包字段对象（兼容 { value }）。
 *
 * @param {any} rawValue 原始值。
 * @returns {any}
 */
const unwrapFieldValue = (rawValue) => {
  if (rawValue && typeof rawValue === 'object' && Object.prototype.hasOwnProperty.call(rawValue, 'value')) {
    return rawValue.value
  }
  return rawValue
}

/**
 * 判断值是否为“有效命中”（非空）。
 *
 * @param {any} value 待判断值。
 * @returns {boolean}
 */
const isMeaningfulValue = (value) => {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * 判断值是否为空（用于诊断与 fallback 治理）。
 *
 * @param {any} value 值。
 * @returns {boolean}
 */
const isEmptyValue = (value) => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * 归一化重复组行记录为“字段字典”。
 *
 * @param {Record<string, any> | null | undefined} recordValue 行记录。
 * @returns {Record<string, any> | null}
 */
const normalizeGroupRecordFields = (recordValue) => {
  if (!recordValue || typeof recordValue !== 'object') return null
  const wrappedFields = recordValue.fields && typeof recordValue.fields === 'object'
    ? recordValue.fields
    : null
  if (wrappedFields) return wrappedFields
  if (recordValue.__rowFields && typeof recordValue.__rowFields === 'object') return recordValue.__rowFields
  return recordValue
}

/**
 * 构建字段路径候选（完整路径 > 去组名前缀 > 去首段）。
 *
 * @param {string} fieldKey 字段路径。
 * @param {string} groupName 字段组名。
 * @returns {string[]}
 */
const buildFieldPathCandidates = (fieldKey, groupName) => {
  const normalizedFieldKey = normalizeSlashPath(fieldKey)
  const keySegments = normalizedFieldKey.split('/').filter(Boolean)
  const candidates = [normalizedFieldKey]
  const normalizedGroupName = normalizeSlashPath(groupName)
  if (normalizedGroupName && normalizedFieldKey.startsWith(`${normalizedGroupName}/`)) {
    candidates.push(normalizedFieldKey.slice(normalizedGroupName.length + 1))
  }
  if (keySegments.length > 1) {
    candidates.push(keySegments.slice(1).join('/'))
  }
  return [...new Set(candidates.filter(Boolean))]
}

/**
 * 按路径段从任意值中读取（对象/数组均支持）。
 *
 * @param {any} rootValue 起始值。
 * @param {string[]} segments 路径分段。
 * @returns {any}
 */
const readValueBySegments = (rootValue, segments) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return unwrapFieldValue(rootValue)
  }
  if (Array.isArray(rootValue)) {
    const mapped = rootValue.map((item) => readValueBySegments(item, segments))
    const hasAny = mapped.some((item) => item !== null && item !== undefined)
    return hasAny ? mapped : undefined
  }
  if (!rootValue || typeof rootValue !== 'object') return undefined
  const [head, ...rest] = segments
  if (!Object.prototype.hasOwnProperty.call(rootValue, head)) return undefined
  return readValueBySegments(rootValue[head], rest)
}

/**
 * 按 slash 路径读取对象。
 *
 * @param {Record<string, any> | null | undefined} root 根对象。
 * @param {string} pathKey 路径。
 * @returns {any}
 */
const readObjectPath = (root, pathKey) => {
  if (!root || typeof root !== 'object' || !pathKey) return null
  const segments = String(pathKey).split('/').filter(Boolean)
  if (segments.length === 0) return null
  let cursor = root
  for (const segment of segments) {
    if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, segment)) {
      cursor = cursor[segment]
    } else {
      return null
    }
  }
  return unwrapFieldValue(cursor)
}

/**
 * 在字段字典中读取值并返回命中路径诊断信息。
 *
 * @param {Record<string, any> | null | undefined} fields 字段字典。
 * @param {string[]} candidates 路径候选。
 * @returns {{value:any, matchedPath:string, stage:string} | null}
 */
const readFromFieldsWithDiagnostics = (fields, candidates) => {
  if (!fields || typeof fields !== 'object') return null
  const entries = Object.entries(fields)
  let emptyCandidateHit = null

  for (const candidateKey of candidates) {
    const directEntry = entries.find(([rawKey]) => normalizeSlashPath(rawKey) === candidateKey)
    if (directEntry) {
      const directValue = unwrapFieldValue(directEntry[1])
      const directHit = {
        value: directValue,
        matchedPath: normalizeSlashPath(directEntry[0]),
        stage: 'exact',
      }
      if (isMeaningfulValue(directValue)) return directHit
      if (!emptyCandidateHit) emptyCandidateHit = directHit
    }
  }

  // 容器前缀命中：fields 存父级键时，继续读取剩余路径。
  for (const candidateKey of candidates) {
    const prefixMatches = entries
      .map(([rawKey, rawValue]) => ({
        rawKey,
        rawValue,
        normalizedRawKey: normalizeSlashPath(rawKey),
      }))
      .filter((entry) => entry.normalizedRawKey && candidateKey.startsWith(`${entry.normalizedRawKey}/`))
    if (prefixMatches.length === 0) continue
    prefixMatches.sort((a, b) => b.normalizedRawKey.length - a.normalizedRawKey.length)
    const bestMatch = prefixMatches[0]
    const baseValue = unwrapFieldValue(bestMatch.rawValue)
    const restPath = candidateKey.slice(bestMatch.normalizedRawKey.length + 1)
    const restSegments = restPath.split('/').filter(Boolean)
    const nestedValue = readValueBySegments(baseValue, restSegments)
    if (nestedValue !== null && nestedValue !== undefined) {
      const prefixHit = {
        value: nestedValue,
        matchedPath: `${bestMatch.normalizedRawKey}/${restSegments.join('/')}`,
        stage: 'prefix',
      }
      if (isMeaningfulValue(nestedValue)) return prefixHit
      if (!emptyCandidateHit) emptyCandidateHit = prefixHit
    }
  }

  for (const candidateKey of candidates) {
    const suffixMatches = entries.filter(([rawKey]) => {
      const normalizedRawKey = normalizeSlashPath(rawKey)
      return candidateKey.endsWith(`/${normalizedRawKey}`) || normalizedRawKey.endsWith(`/${candidateKey}`)
    })
    if (suffixMatches.length > 0) {
      suffixMatches.sort((a, b) => String(b[0]).length - String(a[0]).length)
      for (const suffixEntry of suffixMatches) {
        const suffixValue = unwrapFieldValue(suffixEntry[1])
        const suffixHit = {
          value: suffixValue,
          matchedPath: normalizeSlashPath(suffixEntry[0]),
          stage: 'suffix',
        }
        if (isMeaningfulValue(suffixValue)) return suffixHit
        if (!emptyCandidateHit) emptyCandidateHit = suffixHit
      }
    }
  }

  for (const candidateKey of candidates) {
    const nestedValue = readObjectPath(fields, candidateKey)
    if (nestedValue !== null && nestedValue !== undefined) {
      const nestedHit = {
        value: nestedValue,
        matchedPath: candidateKey,
        stage: 'nested',
      }
      if (isMeaningfulValue(nestedValue)) return nestedHit
      if (!emptyCandidateHit) emptyCandidateHit = nestedHit
    }
  }

  return emptyCandidateHit
}

/**
 * 判断是否允许按外层行索引切片。
 *
 * @param {Record<string, any>} record 当前行。
 * @returns {{rowIndex:number,rowCount:number,canIndex:boolean}}
 */
const resolveRowIndexContext = (record) => {
  const rowIndex = Number.isFinite(record?.__groupRowIndex) ? Number(record.__groupRowIndex) : 0
  const rowCount = Number.isFinite(record?.__groupRowCount) ? Number(record.__groupRowCount) : 0
  const canIndex = Number.isFinite(record?.__groupRowIndex)
    && (
      Boolean(record?.__activeGroupRecord && typeof record.__activeGroupRecord === 'object')
      || rowCount > 1
    )
  return { rowIndex, rowCount, canIndex }
}

/**
 * 外层索引“同维约束”：仅数组长度与外层行数一致时允许切片。
 *
 * @param {any[]} value 数组值。
 * @param {{canIndex:boolean,rowCount:number}} rowContext 行上下文。
 * @returns {boolean}
 */
const shouldSliceByRowDimension = (value, rowContext) => {
  if (!Array.isArray(value) || !rowContext?.canIndex) return false
  if (!Number.isFinite(rowContext.rowCount) || rowContext.rowCount <= 0) return false
  return value.length === rowContext.rowCount
}

/**
 * 统一字段读数入口（ResearchDataset 单一读数链路）。
 *
 * @param {{
 *  record: Record<string, any>;
 *  groupId: string;
 *  options?: {
 *    groupName?: string;
 *    groupPathTokens?: string[];
 *    strictPathOnly?: boolean;
 *  };
 * }} context 读数上下文。
 * @param {string} fieldPath 字段路径。
 * @returns {{
 *  value: any;
 *  source: 'groupRecord'|'groupFields'|'patientArray'|'patientScalar'|'empty';
 *  diagnostics: {
 *    source: string;
 *    matchedPath: string;
 *    fallbackUsed: boolean;
 *    fallbackStage: string;
 *    rowIndex: number;
 *    groupRowCount: number;
 *    candidatePaths: string[];
 *  };
 * }}
 */
export const resolveFieldValue = (context, fieldPath) => {
  const record = context?.record || {}
  const groupId = context?.groupId
  const options = context?.options || {}
  const candidatePaths = buildFieldPathCandidates(fieldPath, options?.groupName || '')
  const rowContext = resolveRowIndexContext(record)
  const buildResult = (value, source, extras = {}) => ({
    value,
    source,
    diagnostics: {
      source,
      matchedPath: extras?.matchedPath || '',
      fallbackUsed: Boolean(extras?.fallbackUsed),
      fallbackStage: extras?.fallbackStage || 'none',
      rowIndex: rowContext.rowIndex,
      groupRowCount: rowContext.rowCount,
      candidatePaths,
    },
  })

  const activeRowFields = normalizeGroupRecordFields(record?.__activeGroupRecord)
  const rowHit = readFromFieldsWithDiagnostics(activeRowFields, candidatePaths)
  if (rowHit) {
    return buildResult(rowHit.value, 'groupRecord', {
      matchedPath: rowHit.matchedPath,
      fallbackUsed: rowHit.stage !== 'exact',
      fallbackStage: rowHit.stage,
    })
  }

  const resolvedGroupNode = record?.__resolvedGroupNode || record?.__groupMatchMeta?.groupNode
  const groupHit = readFromFieldsWithDiagnostics(resolvedGroupNode?.fields, candidatePaths)
  if (groupHit) {
    if (Array.isArray(groupHit.value) && shouldSliceByRowDimension(groupHit.value, rowContext)) {
      return buildResult(groupHit.value[rowContext.rowIndex] ?? null, 'patientArray', {
        matchedPath: groupHit.matchedPath,
        fallbackUsed: true,
        fallbackStage: `${groupHit.stage}-row-slice`,
      })
    }
    return buildResult(groupHit.value, 'groupFields', {
      matchedPath: groupHit.matchedPath,
      fallbackUsed: groupHit.stage !== 'exact',
      fallbackStage: groupHit.stage,
    })
  }

  const fallbackValue = getFieldRawValue(record, groupId, fieldPath, options)
  if (!isEmptyValue(fallbackValue)) {
    if (Array.isArray(fallbackValue) && shouldSliceByRowDimension(fallbackValue, rowContext)) {
      return buildResult(fallbackValue[rowContext.rowIndex] ?? null, 'patientArray', {
        matchedPath: candidatePaths[0] || normalizeSlashPath(fieldPath),
        fallbackUsed: true,
        fallbackStage: 'patient-row-slice',
      })
    }
    return buildResult(fallbackValue, 'patientScalar', {
      matchedPath: candidatePaths[0] || normalizeSlashPath(fieldPath),
      fallbackUsed: true,
      fallbackStage: 'patient-fallback',
    })
  }

  return buildResult(null, 'empty', {
    matchedPath: candidatePaths[0] || normalizeSlashPath(fieldPath),
    fallbackUsed: true,
    fallbackStage: 'miss',
  })
}

/**
 * 基于“当前行上下文”读取字段值（resolveFieldValue 的薄包装）。
 *
 * @param {Record<string, any>} record 当前行（可为展开行或普通患者对象）。
 * @param {string} groupId 字段组 ID。
 * @param {string} fieldKey 字段路径。
 * @param {{
 *  groupName?: string;
 *  groupPathTokens?: string[];
 *  strictPathOnly?: boolean;
 *  includeSource?: boolean;
 *  includeDiagnostics?: boolean;
 * }} [options] 读取选项。
 * @returns {any | {value:any, source:string, diagnostics?:Record<string, any>}}
 */
export const getScopedFieldRawValue = (record, groupId, fieldKey, options = {}) => {
  const resolved = resolveFieldValue({
    record,
    groupId,
    options,
  }, fieldKey)
  if (options?.includeSource === true) {
    if (options?.includeDiagnostics === true) {
      return {
        value: resolved.value,
        source: resolved.source,
        diagnostics: resolved.diagnostics,
      }
    }
    return {
      value: resolved.value,
      source: resolved.source,
    }
  }
  return resolved.value
}

