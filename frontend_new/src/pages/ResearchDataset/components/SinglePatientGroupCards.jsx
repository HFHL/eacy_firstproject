import React from 'react'
import { Card, Empty, Space, Table, Tag, Tooltip } from 'antd'
import { buildNestedFieldNode } from '../parsers/nestedFieldNodeParser'
import { formatFieldValue, getScopedFieldRawValue } from './cellRenderers'
import { resolveCrfCellPresentation } from '../renderers/crfRenderRules'

/**
 * 单患者视图：字段组卡片渲染。
 *
 * @param {{
 *  patient: Record<string, any> | null;
 *  groups: Array<Record<string, any>>;
 *  onOpenNestedDetail: (payload: {title:string,node:Record<string, any>}) => void;
 * }} props 组件参数。
 * @returns {JSX.Element}
 */
const SinglePatientGroupCards = ({ patient, groups, onOpenNestedDetail }) => {
  if (!patient) {
    return <Empty description="暂无患者数据" />
  }

  return (
    <div
      className="project-dataset-v2-single-cards hover-scrollbar"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}
    >
      {(groups || []).map((group) => {
        const groupColumns = Array.isArray(group.columns) ? group.columns : []
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
         * @param {Record<string, any>} column 列定义。
         * @param {Record<string, any>} scopedRecord 当前读数上下文。
         * @param {boolean} [includeSource=false] 是否返回来源与诊断。
         * @returns {any}
         */
        const buildColumnRawValue = (column, scopedRecord = patient, includeSource = false) => {
          const readScopedValue = (fieldPath) => {
            return getScopedFieldRawValue(scopedRecord, group.group_id, fieldPath, {
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
            (scopedRecord?.__activeGroupRecord && typeof scopedRecord.__activeGroupRecord === 'object')
            || Number(scopedRecord?.__groupRowCount) > 1,
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
            const fieldDiagnostics = includeSource ? scopedResult?.diagnostics : null
            valuesByField[fieldPath] = fieldValue
            if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
              const relativeSegments = resolveRelativeSegments(fieldPath, commonPrefixPath)
              if (relativeSegments.length > 0) {
                setNestedPayloadValue(payload, relativeSegments, fieldValue)
              } else {
                payload[fieldPath] = fieldValue
              }
            }
            if (includeSource && fieldSource && fieldSource !== 'groupRecord') {
              payloadSource = fieldSource
            }
            if (includeSource && fieldDiagnostics) payloadDiagnostics = fieldDiagnostics
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

        /**
         * 构建当前字段组的重复记录数据。
         * 优先使用 groupNode.records，其次按字段数组长度重建行。
         *
         * @returns {Array<Record<string, any>>}
         */
        const buildGroupRecords = () => {
          const isRepeatableGroup = Boolean(group?.groupRenderMeta?.isRepeatable || group?.is_repeatable)
          if (!isRepeatableGroup) return []
          const groupMap = patient?.crf_data?.groups && typeof patient.crf_data.groups === 'object'
            ? patient.crf_data.groups
            : {}
          const groupNode = groupMap?.[group?.group_id]
          if (Array.isArray(groupNode?.records) && groupNode.records.length > 0) {
            return groupNode.records
              .map((record, index) => ({
                __rowKey: `${group.group_id}__record__${index}`,
                __rowFields: (
                  record && typeof record === 'object'
                    ? (record.fields && typeof record.fields === 'object' ? record.fields : record)
                    : { value: record }
                ),
              }))
          }

          const sourceValues = {}
          let maxCount = 0
          let hasAnyValue = false
          groupColumns.forEach((column) => {
            const sourceFieldKeys = Array.isArray(column?.sourceFieldKeys) && column.sourceFieldKeys.length > 0
              ? column.sourceFieldKeys
              : [column?.key]
            sourceFieldKeys.forEach((fieldPath) => {
              const fieldValue = getScopedFieldRawValue(patient, group.group_id, fieldPath, {
                groupName: group?.group_name,
                groupPathTokens: group?.groupPathTokens,
                strictPathOnly: true,
              })
              sourceValues[fieldPath] = fieldValue
              if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
                hasAnyValue = true
              }
              if (Array.isArray(fieldValue) && fieldValue.length > maxCount) maxCount = fieldValue.length
            })
          })
          if (maxCount === 0 && hasAnyValue) maxCount = 1
          if (maxCount <= 0) return []
          return Array.from({ length: maxCount }, (_unused, index) => {
            const rowFields = {}
            Object.entries(sourceValues).forEach(([fieldPath, fieldValue]) => {
              rowFields[fieldPath] = Array.isArray(fieldValue) ? (fieldValue[index] ?? null) : fieldValue
            })
            return {
              __rowKey: `${group.group_id}__derived__${index}`,
              __rowFields: rowFields,
            }
          })
        }

        const repeatableRecords = buildGroupRecords()
        const isRepeatableGroup = Boolean(group?.groupRenderMeta?.isRepeatable || group?.is_repeatable)

        const rows = groupColumns.map((column) => {
          const rawValue = buildColumnRawValue(column, patient)
          const node = buildNestedFieldNode(rawValue, {
            path: `${group.group_id}.${column.key}`,
            label: column.title,
          })
          const presentation = resolveCrfCellPresentation({
            rawValue,
            node,
          })
          if (presentation.mode === 'detail') {
            return {
              key: column.key,
              field: column.title,
              value: (
                <Tag
                  color="blue"
                  style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                  onClick={() => onOpenNestedDetail({
                    title: `${group.group_name} / ${column.title}`,
                    node,
                    schemaNode: column?.schemaNode || null,
                    rawValue,
                  })}
                >
                  {presentation.summaryText}
                </Tag>
              ),
            }
          }
          return {
            key: column.key,
            field: column.title,
            value: (
              <Tooltip title={formatFieldValue(rawValue)}>
                <span>{presentation.displayText || formatFieldValue(rawValue)}</span>
              </Tooltip>
            ),
          }
        })

        const repeatableColumns = groupColumns.map((column) => ({
          title: column.title,
          key: column.key,
          dataIndex: column.key,
          width: 180,
          ellipsis: true,
          render: (_unused, rowRecord, rowIndex) => {
            const activeRowFields = rowRecord?.__rowFields && typeof rowRecord.__rowFields === 'object'
              ? rowRecord.__rowFields
              : {}
            const scopedRecord = {
              ...patient,
              __activeGroupRecord: activeRowFields,
              __groupRowIndex: Number.isFinite(rowIndex) ? rowIndex : 0,
              __groupRowCount: repeatableRecords.length,
            }
            const scopedResult = buildColumnRawValue(column, scopedRecord, true)
            const rawValue = scopedResult?.value
            const node = buildNestedFieldNode(rawValue, {
              path: `${group.group_id}.${column.key}`,
              label: column.title,
            })
            const presentation = resolveCrfCellPresentation({
              rawValue,
              node,
            })
            if (presentation.mode === 'detail') {
              return (
                <Tag
                  color="blue"
                  style={{ cursor: 'pointer', marginInlineEnd: 0 }}
                  onClick={() => onOpenNestedDetail({
                    title: `${group.group_name} / ${column.title}`,
                    node,
                    schemaNode: column?.schemaNode || null,
                    rawValue,
                  })}
                >
                  {presentation.summaryText}
                </Tag>
              )
            }
            return (
              <Tooltip title={formatFieldValue(rawValue)}>
                <span>{presentation.displayText || formatFieldValue(rawValue)}</span>
              </Tooltip>
            )
          },
        }))

        return (
          <Card
            key={group.group_id}
            size="small"
            title={group.group_name}
            extra={(
              <Space size={6}>
                <Tag>{`${groupColumns.length} 字段`}</Tag>
                {isRepeatableGroup ? <Tag color="purple">{`${repeatableRecords.length || 1} 行`}</Tag> : null}
              </Space>
            )}
            styles={{ body: { padding: 8 } }}
          >
            {isRepeatableGroup && repeatableRecords.length > 0 ? (
              <Table
                size="small"
                rowKey="__rowKey"
                pagination={false}
                dataSource={repeatableRecords}
                columns={repeatableColumns}
                scroll={{ x: 'max-content' }}
              />
            ) : (
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={rows}
                columns={[
                  { title: '字段', dataIndex: 'field', key: 'field', width: 180 },
                  { title: '值', dataIndex: 'value', key: 'value' },
                ]}
              />
            )}
          </Card>
        )
      })}
    </div>
  )
}

export default SinglePatientGroupCards

