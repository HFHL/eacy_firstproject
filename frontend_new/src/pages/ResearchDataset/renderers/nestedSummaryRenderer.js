/**
 * @file 嵌套字段摘要渲染器。
 */

/**
 * 基于节点生成摘要文本。
 *
 * @param {Record<string, any>} node 字段节点。
 * @returns {{summaryText:string, detailTag:string}}
 */
export const buildNestedSummary = (node) => {
  if (!node || node.nodeType === 'scalar') {
    return {
      summaryText: '普通字段',
      detailTag: '标量',
    }
  }

  if (node.nodeType === 'arrayObject') {
    const firstRecord = node.children?.[0]
    const firstFields = firstRecord?.children || []
    const firstFieldValue = firstFields.find((field) => field?.value !== null && field?.value !== undefined && field?.value !== '')
    const firstValueText = firstFieldValue ? String(firstFieldValue.value) : '无'
    return {
      summaryText: `${node.rowCount || 0} 条记录 | 首条: ${firstValueText}`,
      detailTag: '多行表单',
    }
  }

  if (node.nodeType === 'object') {
    const childCount = Array.isArray(node.children) ? node.children.length : 0
    return {
      summaryText: `${childCount} 个字段`,
      detailTag: '单行表单',
    }
  }

  if (node.nodeType === 'arrayScalar') {
    return {
      summaryText: `${node.rowCount || 0} 个值`,
      detailTag: '数组字段',
    }
  }

  return {
    summaryText: '复杂字段',
    detailTag: '嵌套明细',
  }
}

