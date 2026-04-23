import React, { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Divider,
  Drawer,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { normalizeRepeatableTableSchema } from '../../../components/SchemaForm/schemaRenderKernel'

const { Text } = Typography

/**
 * 判断是否为纯对象（排除数组）。
 *
 * @param {any} value 任意值。
 * @returns {boolean}
 */
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * 判断是否为标量值。
 *
 * @param {any} value 任意值。
 * @returns {boolean}
 */
const isScalar = (value) => value === null || value === undefined || typeof value !== 'object'

/**
 * 解包字段包装对象（兼容 { value, ...meta } 结构）。
 *
 * @param {any} value 原始值。
 * @returns {any}
 */
const unwrapFieldValue = (value) => {
  if (!value || typeof value !== 'object') return value
  if (Object.prototype.hasOwnProperty.call(value, 'value')) return value.value
  return value
}

/**
 * 判断数组是否为对象数组。
 *
 * @param {any[]} value 数组值。
 * @returns {boolean}
 */
const isObjectArray = (value) => Array.isArray(value) && value.every((item) => isPlainObject(unwrapFieldValue(item)))

/**
 * 规范化 slash 路径，兼容全角斜杠与空格差异。
 *
 * @param {string} rawPath 原始路径。
 * @returns {string}
 */
const normalizeSlashPath = (rawPath) => {
  return String(rawPath || '')
    .normalize('NFKC')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

/**
 * 将标量值转为可读文本。
 *
 * @param {any} value 任意值。
 * @returns {string}
 */
const formatScalarText = (value) => {
  const normalizedValue = unwrapFieldValue(value)
  if (normalizedValue === null || normalizedValue === undefined || normalizedValue === '') return '--'
  if (typeof normalizedValue === 'boolean') return normalizedValue ? '是' : '否'
  return String(normalizedValue)
}

/**
 * 判断对齐候选值是否为空，用于“非空优先”保护。
 *
 * @param {any} value 任意值。
 * @returns {boolean}
 */
const isEmptyAlignedValue = (value) => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

/**
 * 安全序列化，避免循环引用导致崩溃。
 *
 * @param {any} value 任意值。
 * @returns {string}
 */
const safeStringify = (value) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return `[序列化失败] ${String(error?.message || error)}`
  }
}

/**
 * 构建 schema 对象字段列表（保留定义顺序）。
 *
 * @param {Record<string, any>} schemaNode schema 节点。
 * @returns {Array<[string, Record<string, any>]>}
 */
const getSchemaPropertyEntries = (schemaNode) => {
  if (!schemaNode || typeof schemaNode !== 'object') return []
  const normalizedNode = normalizeRepeatableTableSchema(schemaNode)
  const properties = normalizedNode?.properties && typeof normalizedNode.properties === 'object'
    ? normalizedNode.properties
    : null
  if (!properties) return []
  const order = normalizedNode?.['x-property-order']
  if (!Array.isArray(order) || order.length === 0) return Object.entries(properties)
  const seen = new Set()
  const sorted = []
  order.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(properties, key) && !seen.has(key)) {
      sorted.push([key, properties[key]])
      seen.add(key)
    }
  })
  Object.entries(properties).forEach(([key, value]) => {
    if (seen.has(key)) return
    sorted.push([key, value])
    seen.add(key)
  })
  return sorted
}

/**
 * 判断 schema 节点是否为标量类型。
 *
 * @param {Record<string, any> | null} schemaNode schema 节点。
 * @returns {boolean}
 */
const isScalarSchemaNode = (schemaNode) => {
  if (!schemaNode || typeof schemaNode !== 'object') return true
  const normalizedNode = normalizeRepeatableTableSchema(schemaNode)
  const type = normalizedNode?.type
  return type === 'string'
    || type === 'number'
    || type === 'integer'
    || type === 'boolean'
    || type === 'null'
}

/**
 * 判断值类型（用于统一标签和渲染分支）。
 *
 * @param {any} value 任意值。
 * @returns {'scalar'|'object'|'arrayScalar'|'arrayObject'|'arrayMixed'}
 */
const inferValueKind = (value) => {
  const normalizedValue = unwrapFieldValue(value)
  if (isScalar(normalizedValue)) return 'scalar'
  if (Array.isArray(normalizedValue)) {
    if (normalizedValue.length === 0) return 'arrayScalar'
    if (isObjectArray(normalizedValue)) return 'arrayObject'
    const allScalar = normalizedValue.every((item) => isScalar(unwrapFieldValue(item)))
    return allScalar ? 'arrayScalar' : 'arrayMixed'
  }
  return 'object'
}

/**
 * 推断 schema 类型（仅用于诊断与类型冲突提示）。
 *
 * @param {Record<string, any> | null} schemaNode schema 节点。
 * @returns {'scalar'|'object'|'array'|'unknown'}
 */
const inferSchemaKind = (schemaNode) => {
  if (!schemaNode || typeof schemaNode !== 'object') return 'unknown'
  const normalizedNode = normalizeRepeatableTableSchema(schemaNode)
  const schemaType = normalizedNode?.type
  if (schemaType === 'object') return 'object'
  if (schemaType === 'array') return 'array'
  if (isScalarSchemaNode(normalizedNode)) return 'scalar'
  return 'unknown'
}

/**
 * 将 raw 对象按 schema 字段对齐（字段齐全、值按路径映射）。
 *
 * @param {Record<string, any>} schemaNode schema 节点。
 * @param {Record<string, any>} rawObject 原始对象。
 * @returns {Record<string, any>}
 */
const alignObjectBySchema = (schemaNode, rawObject) => {
  const aligned = {}
  getSchemaPropertyEntries(schemaNode).forEach(([fieldKey]) => {
    if (!isPlainObject(rawObject)) {
      aligned[fieldKey] = undefined
      return
    }
    const normalizedFieldKey = normalizeSlashPath(fieldKey)
    const entries = Object.entries(rawObject)
    const exactEntry = entries.find(([rawKey]) => normalizeSlashPath(rawKey) === normalizedFieldKey)
    const suffixCandidates = entries.filter(([rawKey]) => {
      const normalizedRawKey = normalizeSlashPath(rawKey)
      return normalizedRawKey.endsWith(`/${normalizedFieldKey}`)
    })
    // 与读取主链保持一致：后缀匹配使用“最长键优先”，减少同名叶子字段误命中。
    suffixCandidates.sort((a, b) => String(b[0]).length - String(a[0]).length)
    const directValue = rawObject?.[fieldKey]
    const preferredSuffixEntry = suffixCandidates.find((entry) => !isEmptyAlignedValue(unwrapFieldValue(entry[1])))
      || suffixCandidates[0]
    const candidateQueue = [
      {
        kind: 'exact',
        value: exactEntry ? unwrapFieldValue(exactEntry[1]) : undefined,
      },
      {
        kind: 'suffix',
        value: preferredSuffixEntry ? unwrapFieldValue(preferredSuffixEntry[1]) : undefined,
      },
      {
        kind: 'direct',
        value: directValue === undefined ? undefined : unwrapFieldValue(directValue),
      },
    ]
    const preferred = candidateQueue.find((candidate) => (
      candidate.value !== undefined && !isEmptyAlignedValue(candidate.value)
    ))
    if (preferred) {
      aligned[fieldKey] = preferred.value
      return
    }
    const firstDefined = candidateQueue.find((candidate) => candidate.value !== undefined)
    aligned[fieldKey] = firstDefined ? firstDefined.value : undefined
  })
  return aligned
}

/**
 * 生成节点标签文案。
 *
 * @param {any} value 任意值。
 * @returns {string}
 */
const buildTypeLabel = (value) => {
  const kind = inferValueKind(value)
  if (kind === 'scalar') return '标量'
  if (kind === 'object') return '对象'
  if (kind === 'arrayObject') return '对象数组'
  if (kind === 'arrayMixed') return '混合数组'
  return '数组'
}

/**
 * 生成条数标签文案。
 *
 * @param {any} value 任意值。
 * @returns {string}
 */
const buildCountLabel = (value) => {
  const normalizedValue = unwrapFieldValue(value)
  if (Array.isArray(normalizedValue)) return `${normalizedValue.length} 条`
  if (isPlainObject(normalizedValue)) return `${Object.keys(normalizedValue).length} 字段`
  return '1 条'
}

/**
 * 判断对象是否可直接按“并行数组列”渲染为表格。
 *
 * 规则：
 * - 至少存在一个标量数组字段；
 * - 字段值仅允许“标量”或“标量数组”；
 * - 一旦出现对象、对象数组、混合数组，则不走该快捷表格方案。
 *
 * @param {Record<string, any>} objectValue 对象值。
 * @returns {boolean}
 */
const canRenderObjectAsParallelArrayTable = (objectValue) => {
  if (!isPlainObject(objectValue)) return false
  const entries = Object.entries(objectValue)
  if (entries.length === 0) return false
  let hasArrayColumn = false
  for (const [, rawFieldValue] of entries) {
    const fieldValue = unwrapFieldValue(rawFieldValue)
    const kind = inferValueKind(fieldValue)
    if (kind === 'arrayScalar') {
      hasArrayColumn = true
      continue
    }
    if (kind === 'scalar') continue
    return false
  }
  return hasArrayColumn
}

/**
 * 将“对象+并行数组字段”转换为表格列与行。
 *
 * @param {Record<string, any>} objectValue 对象值。
 * @returns {{
 *  columns: Array<Record<string, any>>;
 *  rows: Array<Record<string, any>>;
 *  rowCount: number;
 * }}
 */
const buildParallelArrayTableModel = (objectValue) => {
  const entries = Object.entries(objectValue).map(([fieldKey, rawFieldValue]) => ([
    fieldKey,
    unwrapFieldValue(rawFieldValue),
  ]))
  const arrayColumns = entries.filter(([, fieldValue]) => Array.isArray(fieldValue))
  const rowCount = arrayColumns.reduce((maxCount, [, fieldValue]) => Math.max(maxCount, fieldValue.length), 0)
  const columns = entries.map(([fieldKey]) => ({
    title: fieldKey,
    dataIndex: fieldKey,
    key: fieldKey,
    ellipsis: true,
    render: (cellValue) => formatScalarText(cellValue),
  }))
  const rows = Array.from({ length: rowCount }, (_unused, rowIndex) => {
    const rowRecord = { __rowKey: `row-${rowIndex}` }
    entries.forEach(([fieldKey, fieldValue]) => {
      if (Array.isArray(fieldValue)) {
        rowRecord[fieldKey] = fieldValue[rowIndex] ?? null
      } else {
        rowRecord[fieldKey] = fieldValue
      }
    })
    return rowRecord
  })
  return { columns, rows, rowCount }
}

/**
 * 从对象中提取复杂字段（对象/数组），用于展开行展示。
 *
 * @param {Record<string, any>} objectValue 对象值。
 * @returns {Record<string, any>}
 */
const extractComplexObjectPayload = (objectValue) => {
  if (!isPlainObject(objectValue)) return {}
  return Object.entries(objectValue).reduce((payload, [fieldKey, fieldValue]) => {
    const normalizedFieldValue = unwrapFieldValue(fieldValue)
    if (isScalar(normalizedFieldValue)) return payload
    payload[fieldKey] = normalizedFieldValue
    return payload
  }, {})
}

/**
 * 渲染结构问题提示块。
 *
 * @param {{
 *  title: string;
 *  detail: string;
 *  path: string;
 * }} props 提示参数。
 * @returns {JSX.Element}
 */
const RenderIssueBlock = ({ title, detail, path }) => (
  <Alert
    style={{ marginBottom: 12 }}
    type="warning"
    showIcon
    message={title}
    description={(
      <Space direction="vertical" size={2}>
        <Text type="secondary">{detail}</Text>
        <Text code>{path || '(root)'}</Text>
      </Space>
    )}
  />
)

/**
 * 统一结构化渲染器（Schema 优先 + 数据自适应）。
 *
 * @param {{
 *  value: any;
 *  schemaNode?: Record<string, any> | null;
 *  label: string;
 *  path: string;
 *  depth: number;
 *  expandMode: 'all'|'none'|'custom';
 *  customExpandedKeys: string[];
 *  onTogglePanel: (panelKey:string) => void;
 *  showDiagnostics: boolean;
 * }} props 渲染参数。
 * @returns {JSX.Element}
 */
const StructuredValueRenderer = ({
  value,
  schemaNode = null,
  label,
  path,
  depth = 0,
  expandMode,
  customExpandedKeys,
  onTogglePanel,
  showDiagnostics,
}) => {
  const normalizedValue = unwrapFieldValue(value)
  const normalizedSchemaNode = schemaNode && typeof schemaNode === 'object'
    ? normalizeRepeatableTableSchema(schemaNode)
    : null
  const valueKind = inferValueKind(normalizedValue)
  const schemaKind = inferSchemaKind(normalizedSchemaNode)
  const effectiveSchemaNode = (
    normalizedSchemaNode
    && !(
      (schemaKind === 'array' && !Array.isArray(normalizedValue))
      || (schemaKind === 'object' && !isPlainObject(normalizedValue))
      || (schemaKind === 'scalar' && !isScalar(normalizedValue))
    )
  )
    ? normalizedSchemaNode
    : null
  const panelMarginLeft = depth * 10

  const isSchemaMismatch = normalizedSchemaNode
    ? (
      (schemaKind === 'array' && !Array.isArray(normalizedValue))
      || (schemaKind === 'object' && !isPlainObject(normalizedValue))
      || (schemaKind === 'scalar' && !isScalar(normalizedValue))
    )
    : false

  const renderNodeHeader = (
    <Space size={6} wrap>
      <Text strong>{label || '字段详情'}</Text>
      <Tag>{buildTypeLabel(normalizedValue)}</Tag>
      <Tag color="blue">{buildCountLabel(normalizedValue)}</Tag>
      {showDiagnostics ? <Text code>{path || '(root)'}</Text> : null}
    </Space>
  )

  if (isScalar(normalizedValue)) {
    return (
      <div style={{ marginBottom: 10, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 6 }}>{renderNodeHeader}</div>
        <Text>{formatScalarText(normalizedValue)}</Text>
      </div>
    )
  }

  if (Array.isArray(normalizedValue) && (valueKind === 'arrayObject')) {
    const schemaItem = effectiveSchemaNode?.items && typeof effectiveSchemaNode.items === 'object'
      ? normalizeRepeatableTableSchema(effectiveSchemaNode.items)
      : null
    const schemaEntries = getSchemaPropertyEntries(schemaItem)
    const keySet = new Set(schemaEntries.map(([fieldKey]) => fieldKey))
    normalizedValue.forEach((row) => {
      const normalizedRow = unwrapFieldValue(row)
      if (!isPlainObject(normalizedRow)) return
      Object.keys(normalizedRow).forEach((fieldKey) => keySet.add(fieldKey))
    })
    const tableColumns = [...keySet].map((fieldKey) => {
      return {
        title: fieldKey,
        dataIndex: fieldKey,
        key: fieldKey,
        ellipsis: true,
        render: (cellValue) => {
          const normalizedCell = unwrapFieldValue(cellValue)
          if (isScalar(normalizedCell)) return formatScalarText(normalizedCell)
          return (
            <Tag color="purple">
              {Array.isArray(normalizedCell) ? `${normalizedCell.length} 条` : '对象'}
            </Tag>
          )
        },
      }
    })
    const tableRows = normalizedValue.map((row, index) => {
      const normalizedRow = unwrapFieldValue(row)
      if (schemaItem && isPlainObject(normalizedRow)) {
        return { __rowKey: `${path}[${index}]`, ...alignObjectBySchema(schemaItem, normalizedRow) }
      }
      if (isPlainObject(normalizedRow)) {
        return { __rowKey: `${path}[${index}]`, ...normalizedRow }
      }
      return { __rowKey: `${path}[${index}]`, value: normalizedRow }
    })

    return (
      <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
        {showDiagnostics && isSchemaMismatch ? (
          <RenderIssueBlock
            title="Schema 与数据结构不一致，已自动切换自适应渲染"
            detail={`Schema 期望 ${schemaKind}，实际值为 ${valueKind}。`}
            path={path}
          />
        ) : null}
        <Table
          size="small"
          rowKey={(row) => row.__rowKey}
          columns={tableColumns}
          dataSource={tableRows}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            rowExpandable: (record) => {
              const candidate = { ...record }
              delete candidate.__rowKey
              return Object.values(candidate).some((item) => !isScalar(unwrapFieldValue(item)))
            },
            expandedRowRender: (record, rowIndex) => {
              const rowData = { ...record }
              delete rowData.__rowKey
              const complexPayload = extractComplexObjectPayload(rowData)
              return (
                Object.keys(complexPayload).length > 0 ? (
                  <StructuredValueRenderer
                    value={complexPayload}
                    schemaNode={schemaItem}
                    label={`记录 ${rowIndex + 1}`}
                    path={`${path}[${rowIndex}]`}
                    depth={depth + 1}
                    expandMode={expandMode}
                    customExpandedKeys={customExpandedKeys}
                    onTogglePanel={onTogglePanel}
                    showDiagnostics={showDiagnostics}
                  />
                ) : (
                  <Text type="secondary">该行无可展开的嵌套字段。</Text>
                )
              )
            },
          }}
        />
      </div>
    )
  }

  if (Array.isArray(normalizedValue) && valueKind === 'arrayScalar') {
    return (
      <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {normalizedValue.length === 0 ? (
            <Tag>0 条</Tag>
          ) : (
            normalizedValue.map((item, index) => (
              <Tag key={`${path}-${index}`}>{formatScalarText(item)}</Tag>
            ))
          )}
        </div>
      </div>
    )
  }

  if (Array.isArray(normalizedValue) && valueKind === 'arrayMixed') {
    const panelItems = normalizedValue.map((item, index) => {
      const panelKey = `${path}[${index}]`
      const isExpanded = expandMode === 'all' || (expandMode === 'custom' && customExpandedKeys.includes(panelKey))
      return {
        key: panelKey,
        label: (
          <Space size={6}>
            <Text>{`第 ${index + 1} 项`}</Text>
            <Tag>{buildTypeLabel(item)}</Tag>
          </Space>
        ),
        children: (
          <StructuredValueRenderer
            value={item}
            schemaNode={effectiveSchemaNode?.items || null}
            label={`第 ${index + 1} 项`}
            path={panelKey}
            depth={depth + 1}
            expandMode={expandMode}
            customExpandedKeys={customExpandedKeys}
            onTogglePanel={onTogglePanel}
            showDiagnostics={showDiagnostics}
          />
        ),
        forceRender: isExpanded,
      }
    })
    return (
      <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
        <Collapse
          size="small"
          items={panelItems}
          activeKey={
            expandMode === 'all'
              ? panelItems.map((item) => item.key)
              : (expandMode === 'none'
                ? []
                : panelItems.filter((item) => customExpandedKeys.includes(item.key)).map((item) => item.key))
          }
          onChange={(keys) => {
            const changedKeys = Array.isArray(keys) ? keys : [keys]
            panelItems.forEach((item) => {
              const shouldOpen = changedKeys.includes(item.key)
              const isOpen = expandMode === 'all' || (expandMode === 'custom' && customExpandedKeys.includes(item.key))
              if (shouldOpen !== isOpen) onTogglePanel(item.key)
            })
          }}
        />
      </div>
    )
  }

  if (isPlainObject(normalizedValue)) {
    const schemaEntries = getSchemaPropertyEntries(effectiveSchemaNode)
    const schemaFieldKeys = schemaEntries.map(([fieldKey]) => fieldKey)
    const extraFieldKeys = Object.keys(normalizedValue).filter((fieldKey) => !schemaFieldKeys.includes(fieldKey))
    const fieldKeys = schemaEntries.length > 0
      ? [...schemaFieldKeys, ...extraFieldKeys]
      : Object.keys(normalizedValue)
    const alignedBySchema = schemaEntries.length > 0
      ? alignObjectBySchema(effectiveSchemaNode, normalizedValue)
      : {}
    const normalizedObjectValue = fieldKeys.reduce((accumulator, fieldKey) => {
      accumulator[fieldKey] = schemaEntries.length > 0
        ? (Object.prototype.hasOwnProperty.call(alignedBySchema, fieldKey)
          ? alignedBySchema[fieldKey]
          : unwrapFieldValue(normalizedValue[fieldKey]))
        : unwrapFieldValue(normalizedValue[fieldKey])
      return accumulator
    }, {})

    if (canRenderObjectAsParallelArrayTable(normalizedObjectValue)) {
      const { columns, rows, rowCount } = buildParallelArrayTableModel(normalizedObjectValue)
      return (
        <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
          <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
          <Table
            size="small"
            rowKey="__rowKey"
            columns={columns}
            dataSource={rows}
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: rowCount === 0 ? '0 条' : '暂无数据' }}
          />
        </div>
      )
    }

    const scalarItems = []
    const complexItems = []
    fieldKeys.forEach((fieldKey) => {
      const matchedSchema = schemaEntries.find(([schemaField]) => schemaField === fieldKey)?.[1] || null
      const fieldValue = normalizedObjectValue[fieldKey]
      if (isScalar(unwrapFieldValue(fieldValue))) {
        scalarItems.push({
          key: fieldKey,
          label: fieldKey,
          children: formatScalarText(fieldValue),
        })
      } else {
        complexItems.push({
          key: fieldKey,
          value: fieldValue,
          schemaNode: matchedSchema,
        })
      }
    })

    if (fieldKeys.length === 0) {
      return (
        <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
          <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
          <Text type="secondary">无字段</Text>
        </div>
      )
    }

    return (
      <div style={{ marginBottom: 12, marginLeft: panelMarginLeft }}>
        <div style={{ marginBottom: 8 }}>{renderNodeHeader}</div>
        {showDiagnostics && isSchemaMismatch ? (
          <RenderIssueBlock
            title="Schema 与数据结构不一致，已自动切换自适应渲染"
            detail={`Schema 期望 ${schemaKind}，实际值为 ${valueKind}。`}
            path={path}
          />
        ) : null}
        {scalarItems.length > 0 ? (
          <Descriptions size="small" bordered column={1} items={scalarItems} />
        ) : null}
        {complexItems.map((item) => {
          const panelKey = `${path}.${item.key}`
          const canRenderAsTableDirectly = canRenderObjectAsParallelArrayTable(unwrapFieldValue(item.value))
          if (canRenderAsTableDirectly) {
            return (
              <div key={panelKey} style={{ marginTop: 10 }}>
                <StructuredValueRenderer
                  value={item.value}
                  schemaNode={item.schemaNode}
                  label={item.key}
                  path={panelKey}
                  depth={depth + 1}
                  expandMode={expandMode}
                  customExpandedKeys={customExpandedKeys}
                  onTogglePanel={onTogglePanel}
                  showDiagnostics={showDiagnostics}
                />
              </div>
            )
          }
          const isExpanded = expandMode === 'all' || (expandMode === 'custom' && customExpandedKeys.includes(panelKey))
          const activeKey = isExpanded ? [panelKey] : []
          return (
            <Collapse
              key={panelKey}
              style={{ marginTop: 10 }}
              size="small"
              activeKey={activeKey}
              items={[
                {
                  key: panelKey,
                  label: (
                    <Space size={6}>
                      <Text>{item.key}</Text>
                      <Tag>{buildTypeLabel(item.value)}</Tag>
                      <Tag color="blue">{buildCountLabel(item.value)}</Tag>
                    </Space>
                  ),
                  children: (
                    <StructuredValueRenderer
                      value={item.value}
                      schemaNode={item.schemaNode}
                      label={item.key}
                      path={panelKey}
                      depth={depth + 1}
                      expandMode={expandMode}
                      customExpandedKeys={customExpandedKeys}
                      onTogglePanel={onTogglePanel}
                      showDiagnostics={showDiagnostics}
                    />
                  ),
                  forceRender: isExpanded,
                },
              ]}
              onChange={() => onTogglePanel(panelKey)}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 8, marginLeft: panelMarginLeft }}>
      <RenderIssueBlock
        title="无法识别的数据结构"
        detail="当前节点无法归类为对象或数组，请检查抽取结果结构。"
        path={path}
      />
    </div>
  )
}

/**
 * 嵌套字段明细抽屉。
 *
 * @param {{
 *  open: boolean;
 *  title: string;
 *  node: Record<string, any> | null;
 *  schemaNode?: Record<string, any> | null;
 *  rawValue?: any;
 *  useSchemaKernel?: boolean;
 *  onClose: () => void;
 * }} props 组件参数。
 * @returns {JSX.Element}
 */
const NestedDetailDrawer = ({
  open,
  title,
  node,
  schemaNode = null,
  rawValue = undefined,
  useSchemaKernel = true,
  onClose,
}) => {
  const drawerNode = useMemo(() => node || null, [node])
  const drawerSchemaNode = useMemo(() => schemaNode || null, [schemaNode])
  const [expandMode, setExpandMode] = useState('custom')
  const [customExpandedKeys, setCustomExpandedKeys] = useState([])
  const [showRawPayload, setShowRawPayload] = useState(false)
  const showDiagnostics = Boolean(import.meta?.env?.DEV)

  const effectiveValue = rawValue !== undefined ? rawValue : drawerNode?.value

  /**
   * 切换单个折叠面板开关。
   *
   * @param {string} panelKey 面板唯一 key。
   * @returns {void}
   */
  const handleTogglePanel = (panelKey) => {
    if (!panelKey) return
    setExpandMode('custom')
    setCustomExpandedKeys((prev) => {
      if (prev.includes(panelKey)) return prev.filter((key) => key !== panelKey)
      return [...prev, panelKey]
    })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title || '嵌套字段明细'}
      width={560}
      destroyOnHidden
      extra={(
        <Space size={8}>
          <Button size="small" type={showRawPayload ? 'primary' : 'default'} onClick={() => setShowRawPayload((prev) => !prev)}>
            原始 JSON
          </Button>
        </Space>
      )}
    >
      {useSchemaKernel && !drawerSchemaNode && showDiagnostics ? (
        <RenderIssueBlock
          title="Schema 未命中，已切换自适应渲染"
          detail="当前字段未解析到 schemaNode。请检查模板映射路径或字段定义。"
          path={drawerNode?.path || '(root)'}
        />
      ) : null}
      {effectiveValue !== undefined ? (
        <StructuredValueRenderer
          value={effectiveValue}
          schemaNode={useSchemaKernel ? drawerSchemaNode : null}
          label={title || drawerNode?.label || '字段详情'}
          path={drawerNode?.path || 'root'}
          depth={0}
          expandMode={expandMode}
          customExpandedKeys={customExpandedKeys}
          onTogglePanel={handleTogglePanel}
          showDiagnostics={showDiagnostics}
        />
      ) : (
        <Text type="secondary">暂无可展示的嵌套明细。</Text>
      )}
      {showRawPayload ? (
        <>
          <Divider style={{ marginBlock: 12 }} />
          <Text strong>原始 JSON（调试）</Text>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {safeStringify(effectiveValue)}
          </pre>
        </>
      ) : null}
    </Drawer>
  )
}

export default NestedDetailDrawer

