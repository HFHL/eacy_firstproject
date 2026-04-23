import React, { useEffect, useMemo } from 'react'
import { Table, Tooltip, Tag } from 'antd'
import { formatFieldValue, getScopedFieldRawValue } from './cellRenderers'
import { buildNestedFieldNode } from '../parsers/nestedFieldNodeParser'
import { resolveCrfCellPresentation } from '../renderers/crfRenderRules'

/**
 * 字段组表格。
 *
 * @param {{
 *  loading?: boolean;
 *  group: Record<string, any>;
 *  patients: Array<Record<string, any>>;
 *  enableConsistencyDebug?: boolean;
 *  scrollY: number;
 *  onOpenNestedDetail?: (payload: {title:string,node:Record<string, any>}) => void;
 * }} props 组件参数。
 * @returns {JSX.Element}
 */
const FieldGroupTable = ({
  loading = false,
  group,
  patients,
  enableConsistencyDebug = false,
  scrollY,
  onOpenNestedDetail,
}) => {
  /**
   * 生成简短调试预览，避免控制台输出超大对象。
   *
   * @param {any} value 任意值。
   * @returns {string}
   */
  const toDebugPreview = (value) => {
    try {
      const text = JSON.stringify(value)
      if (!text) return String(value)
      return text.length > 220 ? `${text.slice(0, 220)}...` : text
    } catch (_error) {
      return String(value)
    }
  }

  /**
   * 计算多个字段路径的最长公共前缀（按段）。
   *
   * @param {string[]} paths 字段路径列表。
   * @returns {string}
   */
  const getLongestCommonPrefixPath = (paths) => {
    const normalizedPaths = (Array.isArray(paths) ? paths : [])
      .map((path) => String(path || '').trim())
      .filter(Boolean)
    if (normalizedPaths.length === 0) return ''
    const splitPaths = normalizedPaths.map((path) => path.split('/').map((segment) => segment.trim()).filter(Boolean))
    const minLength = Math.min(...splitPaths.map((segments) => segments.length))
    const prefixSegments = []
    for (let index = 0; index < minLength; index += 1) {
      const segmentValue = splitPaths[0][index]
      const allMatched = splitPaths.every((segments) => segments[index] === segmentValue)
      if (!allMatched) break
      prefixSegments.push(segmentValue)
    }
    return prefixSegments.join('/')
  }

  /**
   * 将扁平字段映射重建为嵌套对象。
   *
   * @param {Record<string, any>} payload 目标对象。
   * @param {string[]} pathSegments 相对路径段。
   * @param {any} value 字段值。
   * @returns {void}
   */
  const setNestedPayloadValue = (payload, pathSegments, value) => {
    if (!payload || typeof payload !== 'object') return
    if (!Array.isArray(pathSegments) || pathSegments.length === 0) return
    let cursor = payload
    for (let index = 0; index < pathSegments.length - 1; index += 1) {
      const segment = pathSegments[index]
      if (!segment) continue
      if (!cursor[segment] || typeof cursor[segment] !== 'object' || Array.isArray(cursor[segment])) {
        cursor[segment] = {}
      }
      cursor = cursor[segment]
    }
    const lastSegment = pathSegments[pathSegments.length - 1]
    if (!lastSegment) return
    cursor[lastSegment] = value
  }

  /**
   * 构建列对应的原始字段值（第2层列可聚合多个源字段）。
   *
   * @param {Record<string, any>} record 当前行。
   * @param {Record<string, any>} column 列定义。
   * @param {boolean} [includeSource=false] 是否返回值来源。
   * @returns {any}
   */
  const buildColumnRawValue = (record, column, includeSource = false) => {
    /**
     * 读取单字段值（优先行级 record，再 groupNode，最后患者级 fallback）。
     *
     * @param {string} fieldPath 字段路径。
     * @returns {any}
     */
    const readScopedValue = (fieldPath) => {
      return getScopedFieldRawValue(record, group?.group_id, fieldPath, {
        groupName: group?.group_name,
        groupPathTokens: group?.groupPathTokens,
        strictPathOnly: true,
        includeSource,
        includeDiagnostics: includeSource,
      })
    }
    const sourceFieldKeys = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
      ? column.sourceFieldKeys
      : [column.key]
    const hasRepeatableRowContext = Boolean(
      (record?.__activeGroupRecord && typeof record.__activeGroupRecord === 'object')
      || Number(record?.__groupRowCount) > 1,
    )
    if (sourceFieldKeys.length === 1) {
      return readScopedValue(sourceFieldKeys[0])
    }

    /**
     * 计算字段相对路径段。
     *
     * @param {string} fieldPath 字段路径。
     * @param {string} prefixPath 公共前缀。
     * @returns {string[]}
     */
    const resolveRelativeSegments = (fieldPath, prefixPath) => {
      const relativePath = prefixPath && fieldPath.startsWith(`${prefixPath}/`)
        ? fieldPath.slice(prefixPath.length + 1)
        : fieldPath
      return String(relativePath || '').split('/').map((segment) => segment.trim()).filter(Boolean)
    }

    /**
     * 基于多源字段值构建“按行对齐”的数组对象 payload。
     * 仅当存在外层同维数组时返回数组；否则返回 null 由对象拼装兜底。
     *
     * @param {Record<string, any>} valuesByField 各字段值映射。
     * @param {string[]} fieldPaths 字段路径集合。
     * @param {string} prefixPath 公共前缀。
     * @returns {Array<Record<string, any>> | null}
     */
    const buildRowAlignedPayload = (valuesByField, fieldPaths, prefixPath) => {
      const rowLengths = fieldPaths
        .map((fieldPath) => valuesByField[fieldPath])
        .filter((value) => Array.isArray(value))
        .map((arrayValue) => arrayValue.length)
        .filter((length) => Number.isFinite(length) && length > 0)
      if (rowLengths.length === 0) return null
      const rowCount = Math.max(...rowLengths)
      if (!Number.isFinite(rowCount) || rowCount <= 0) return null
      const rows = Array.from({ length: rowCount }, () => ({}))
      fieldPaths.forEach((fieldPath) => {
        const fieldValue = valuesByField[fieldPath]
        const relativeSegments = resolveRelativeSegments(fieldPath, prefixPath)
        if (relativeSegments.length === 0) return
        rows.forEach((rowPayload, rowIndex) => {
          // 仅切与外层同维的数组，避免误切内层子表数组。
          const scopedValue = Array.isArray(fieldValue) && fieldValue.length === rowCount
            ? (fieldValue[rowIndex] ?? null)
            : fieldValue
          setNestedPayloadValue(rowPayload, relativeSegments, scopedValue)
        })
      })
      return rows
    }

    const commonPrefixPath = getLongestCommonPrefixPath(sourceFieldKeys)
    // 多源字段统一走“叶子路径逐项拼装”，禁用容器前缀早返回，避免同构列出现两套渲染路径。
    const payload = {}
    let payloadSource = 'groupRecord'
    let payloadDiagnostics = null
    const valuesByField = {}
    sourceFieldKeys.forEach((fieldPath) => {
      const scopedResult = readScopedValue(fieldPath)
      const fieldValue = includeSource ? scopedResult?.value : scopedResult
      const fieldSource = includeSource ? scopedResult?.source : null
      valuesByField[fieldPath] = fieldValue
      if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
        const relativeSegments = resolveRelativeSegments(fieldPath, commonPrefixPath)
        if (relativeSegments.length > 0) {
          setNestedPayloadValue(payload, relativeSegments, fieldValue)
        } else {
          payload[fieldPath] = fieldValue
        }
      }
      if (includeSource && fieldSource && fieldSource !== 'groupRecord') payloadSource = fieldSource
      if (includeSource && scopedResult?.diagnostics) payloadDiagnostics = scopedResult.diagnostics
    })
    const rowAlignedPayload = buildRowAlignedPayload(valuesByField, sourceFieldKeys, commonPrefixPath)
    const finalValue = (hasRepeatableRowContext && rowAlignedPayload) ? rowAlignedPayload : payload
    if (includeSource) {
      return {
        value: finalValue,
        source: payloadSource,
        diagnostics: payloadDiagnostics,
      }
    }
    return finalValue
  }

  const columns = useMemo(() => {
    const groupColumns = Array.isArray(group?.columns) ? group.columns : []
    const sampleRows = Array.isArray(patients) ? patients.slice(0, 20) : []

    /**
     * 根据表头和样本值估算列宽（最小/最大限制）。
     *
     * @param {string} title 列标题。
     * @param {string} key 字段 key。
     * @returns {number}
     */
    const estimateColumnWidth = (title, key) => {
      const minWidth = 80
      const maxWidth = 180
      let maxTextLength = String(title || '').length

      sampleRows.forEach((row) => {
        const rawValue = getScopedFieldRawValue(row, group?.group_id, key, {
          groupName: group?.group_name,
          groupPathTokens: group?.groupPathTokens,
          strictPathOnly: true,
        })
        const displayText = formatFieldValue(rawValue)
        maxTextLength = Math.max(maxTextLength, String(displayText || '').length)
      })

      // 近似按字符宽度估算，兼顾中英文混排；保留上限 180 作为最宽限制。
      const estimatedWidth = (maxTextLength * 12) + 28
      return Math.min(maxWidth, Math.max(minWidth, estimatedWidth))
    }

    return groupColumns.map((column) => ({
      title: (
        <Tooltip title={column.key}>
          <span>{column.title}</span>
        </Tooltip>
      ),
      key: column.key,
      dataIndex: column.key,
      width: estimateColumnWidth(column.title, column.key),
      ellipsis: true,
      render: (_unused, record) => {
        const scopedResult = buildColumnRawValue(record, column, true)
        const rowScopedValue = scopedResult?.value
        const node = buildNestedFieldNode(rowScopedValue, {
          path: `${group?.group_id}.${column.key}`,
          label: column.title,
          schemaHints: column.schemaHints || null,
        })
        const presentation = resolveCrfCellPresentation({
          rawValue: rowScopedValue,
          node,
        })
        if (
          enableConsistencyDebug
          && presentation.mode === 'detail'
          && presentation.summaryText === '0 条'
        ) {
          console.warn('[FieldGroupTable] 0条专项诊断', {
            patientId: record?.patient_id || null,
            subjectId: record?.subject_id || null,
            groupId: group?.group_id || null,
            groupName: group?.group_name || null,
            columnKey: column?.key || null,
            columnTitle: column?.title || null,
            sourceFieldKeys: column?.sourceFieldKeys || [column?.key],
            scopedSource: scopedResult?.source || 'unknown',
            scopedDiagnostics: scopedResult?.diagnostics || null,
            valuePreview: toDebugPreview(rowScopedValue),
            nodeType: node?.nodeType || null,
            nodeRowCount: Number.isFinite(node?.rowCount) ? node.rowCount : null,
          })
        }
        if (presentation.mode === 'detail') {
          return (
            <Tag
              color="blue"
              style={{ cursor: 'pointer', marginInlineEnd: 0 }}
              onClick={() => onOpenNestedDetail?.({
                title: `${record?.subject_id || record?.name || '患者'} / ${group?.group_name} / ${column.title}`,
                node,
                schemaNode: column?.schemaNode || null,
                rawValue: rowScopedValue,
              })}
            >
              {presentation.summaryText}
            </Tag>
          )
        }
        return (
          <Tooltip title={formatFieldValue(rowScopedValue)}>
            <span>{presentation.displayText || formatFieldValue(rowScopedValue)}</span>
          </Tooltip>
        )
      },
    }))
  }, [group, onOpenNestedDetail, patients])

  useEffect(() => {
    if (!enableConsistencyDebug || !group?.group_id) return
    const patientRows = Array.isArray(patients) ? patients : []
    if (patientRows.length === 0) {
      console.info('[FieldGroupTable] 右侧表格诊断摘要', {
        groupId: group.group_id,
        patientCount: 0,
        reason: 'no-patients',
      })
      return
    }

    const expectedGroupId = String(group.group_id)
    const groupColumns = Array.isArray(group.columns) ? group.columns : []
    const expectedFields = (Array.isArray(group.columns) ? group.columns : [])
      .map((column) => String(column?.key || ''))
      .filter(Boolean)
    const expectedFieldSet = new Set(expectedFields)
    const expectedFieldLeafSet = new Set(expectedFields.map((fieldKey) => fieldKey.split('/').pop()))

    const allGroupIds = new Set()
    const actualFieldSet = new Set()
    const actualFieldLeafSet = new Set()
    const patientsWithoutGroup = []
    let nonEmptyCellCount = 0
    const sourceCounters = {
      groupRecord: 0,
      groupFields: 0,
      patientArray: 0,
      patientScalar: 0,
      empty: 0,
    }
    const fallbackCounters = {
      fallbackUsed: 0,
      fallbackStages: {},
    }
    const firstRowsByPatient = new Map()
    patientRows.forEach((row) => {
      const patientId = row?.patient_id
      if (!patientId || firstRowsByPatient.has(patientId)) return
      firstRowsByPatient.set(patientId, row)
    })

    firstRowsByPatient.forEach((row, patientId) => {
      const resolvedGroupNode = row?.__resolvedGroupNode || row?.__groupMatchMeta?.groupNode
      const resolvedGroupKey = row?.__resolvedGroupKey || row?.__groupMatchMeta?.matchedGroupKey
      if (resolvedGroupKey) allGroupIds.add(String(resolvedGroupKey))
      if (!resolvedGroupNode) {
        patientsWithoutGroup.push(patientId)
        return
      }
      const fields = resolvedGroupNode?.fields && typeof resolvedGroupNode.fields === 'object'
        ? resolvedGroupNode.fields
        : {}
      Object.keys(fields).forEach((fieldKey) => {
        actualFieldSet.add(fieldKey)
        actualFieldLeafSet.add(String(fieldKey).split('/').pop())
      })
    })

    patientRows.forEach((patient) => {
      groupColumns.forEach((column) => {
        const scopedResult = buildColumnRawValue(patient, column, true)
        const rowScopedValue = scopedResult?.value
        const valueSource = scopedResult?.source || 'empty'
        const diagnostics = scopedResult?.diagnostics || null
        sourceCounters[valueSource] = (sourceCounters[valueSource] || 0) + 1
        if (diagnostics?.fallbackUsed) {
          fallbackCounters.fallbackUsed += 1
          const stage = diagnostics?.fallbackStage || 'unknown'
          fallbackCounters.fallbackStages[stage] = (fallbackCounters.fallbackStages[stage] || 0) + 1
        }
        if (rowScopedValue !== null && rowScopedValue !== undefined && rowScopedValue !== '') {
          nonEmptyCellCount += 1
        }
      })
    })

    const missingGroup = !allGroupIds.has(expectedGroupId)
    const missingFieldsExact = expectedFields.filter((fieldKey) => !actualFieldSet.has(fieldKey))
    const extraFieldsExact = [...actualFieldSet].filter((fieldKey) => !expectedFieldSet.has(fieldKey))
    const missingFieldsByLeaf = expectedFields.filter((fieldKey) => {
      const leafKey = fieldKey.split('/').pop()
      return !actualFieldLeafSet.has(leafKey)
    })
    const extraFieldsByLeaf = [...actualFieldSet].filter((fieldKey) => {
      const leafKey = String(fieldKey).split('/').pop()
      return !expectedFieldLeafSet.has(leafKey)
    })
    const totalCellCount = Math.max(1, Object.values(sourceCounters).reduce((count, value) => count + value, 0))

    console.info('[FieldGroupTable] 右侧表格诊断摘要', {
      groupId: expectedGroupId,
      patientCount: patientRows.length,
      expectedFieldCount: expectedFields.length,
      actualFieldCount: actualFieldSet.size,
      nonEmptyCellCount,
      cellValueSourceRate: {
        groupRecord: Number((sourceCounters.groupRecord / totalCellCount).toFixed(4)),
        groupFields: Number((sourceCounters.groupFields / totalCellCount).toFixed(4)),
        patientArray: Number((sourceCounters.patientArray / totalCellCount).toFixed(4)),
        patientScalar: Number((sourceCounters.patientScalar / totalCellCount).toFixed(4)),
        empty: Number((sourceCounters.empty / totalCellCount).toFixed(4)),
      },
      fallbackUsedRate: Number((fallbackCounters.fallbackUsed / totalCellCount).toFixed(4)),
      fallbackStages: fallbackCounters.fallbackStages,
    })

    if (
      missingGroup
      || missingFieldsExact.length > 0
      || extraFieldsExact.length > 0
      || nonEmptyCellCount === 0
    ) {
      const patientStructureSamples = patientRows.slice(0, 3).map((patient) => {
        const crfData = patient?.crf_data && typeof patient.crf_data === 'object' ? patient.crf_data : {}
        const groups = crfData?.groups && typeof crfData.groups === 'object' ? crfData.groups : {}
        const dataRoot = crfData?.data && typeof crfData.data === 'object' ? crfData.data : {}
        return {
          patientId: patient?.patient_id,
          crfDataTopKeys: Object.keys(crfData),
          groupIds: Object.keys(groups),
          resolvedGroupKey: patient?.__resolvedGroupKey || patient?.__groupMatchMeta?.matchedGroupKey || null,
          resolvedMatchMode: patient?.__resolvedMatchMode || patient?.__groupMatchMeta?.matchedMode || null,
          dataTopKeys: Object.keys(dataRoot),
          hasCrfData: Object.keys(crfData).length > 0,
        }
      })

      console.warn('[FieldGroupTable] 右侧真实数据对齐诊断', {
        groupId: expectedGroupId,
        patientCount: patientRows.length,
        missingGroup,
        patientsWithoutGroup: patientsWithoutGroup.slice(0, 20),
        expectedFields,
        actualFields: [...actualFieldSet],
        missingFieldsExact,
        extraFieldsExact,
        missingFieldsByLeaf,
        extraFieldsByLeaf,
        nonEmptyCellCount,
        patientStructureSamples,
        sourceCounters,
        fallbackCounters,
      })
    }
  }, [enableConsistencyDebug, group, patients])

  if (!group) {
    return null
  }

  return (
    <Table
      size="small"
      bordered
      rowKey={(row) => row.__rowKey || row.patient_id}
      columns={columns}
      dataSource={patients}
      loading={loading}
      pagination={false}
      scroll={{ x: 'max-content', y: scrollY }}
      tableLayout="fixed"
      style={{ width: '100%' }}
      rowClassName={() => 'project-dataset-v2-row'}
      className="project-dataset-table project-dataset-v2-table table-scrollbar-unified"
    />
  )
}

export default FieldGroupTable

