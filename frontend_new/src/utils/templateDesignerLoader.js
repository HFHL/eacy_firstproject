/**
 * 设计器模板加载纯工具。
 */
import { parseJsonAsset } from './templateAssetResolver.js'

const countDesignerLeafFields = (designer) => {
  if (!designer?.folders || !Array.isArray(designer.folders)) return 0
  let count = 0
  const walkField = (field) => {
    if (!field) return
    if (Array.isArray(field.children) && field.children.length > 0) {
      field.children.forEach(walkField)
      return
    }
    count += 1
  }
  designer.folders.forEach((folder) => {
    ;(folder.groups || []).forEach((group) => {
      ;(group.fields || []).forEach(walkField)
    })
  })
  return count
}

const analyzeSchema = (schema) => {
  const stats = {
    leafCount: 0,
    complexCount: 0,
  }
  const walk = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
      const propertyValues = Object.values(node.properties)
      const hasNestedObject = propertyValues.some((child) => child && typeof child === 'object' && (child.type === 'object' || child.type === 'array'))
      if (hasNestedObject) stats.complexCount += 1
      propertyValues.forEach(walk)
      return
    }
    if (node.type === 'array' && node.items && typeof node.items === 'object') {
      stats.complexCount += 1
      walk(node.items)
      return
    }
    stats.leafCount += 1
  }
  walk(schema)
  return stats
}

const designerHasComplexStructures = (designer) => {
  if (!designer?.folders || !Array.isArray(designer.folders)) return false
  return designer.folders.some((folder) =>
    (folder.groups || []).some((group) =>
      (group.fields || []).some((field) => Array.isArray(field.children) && field.children.length > 0)
    )
  )
}

const hasDesignerStructure = (designer) => {
  return !!(designer && Array.isArray(designer.folders))
}

const hasUsableDesigner = (designer) => {
  return hasDesignerStructure(designer) && designer.folders.length > 0
}

const hasSchemaStructure = (schema) => {
  return !!(schema && typeof schema === 'object' && schema.$schema && schema.properties && typeof schema.properties === 'object')
}

const hasUsableSchema = (schema) => {
  return hasSchemaStructure(schema) && Object.keys(schema.properties).length > 0
}

const shouldPreferSchema = ({ designer, schema, mode }) => {
  if (!hasUsableSchema(schema)) return false
  if (mode === 'schema') return true
  if (mode === 'designer') return false
  if (!hasUsableDesigner(designer)) return true

  const designerLeafCount = countDesignerLeafFields(designer)
  const schemaStats = analyzeSchema(schema)
  if (designerLeafCount === 0 && schemaStats.leafCount > 0) return true
  if (schemaStats.leafCount > designerLeafCount) return true
  if (schemaStats.complexCount > 0 && !designerHasComplexStructures(designer)) return true
  return false
}

/**
 * 将模板资产加载到设计器，并在 schema 失败时自动回退 designer。
 * 空白 designer（`folders: []`）也被视作合法初始模板，用于新建草稿二次进入时的回显。
 *
 * @param {Object} formDesignerRef
 * @param {Object} options
 * @param {Object=} options.designer
 * @param {Object=} options.schema
 * @param {'auto'|'schema'|'designer'=} options.mode
 * @returns {Promise<{loadedFrom: 'schema'|'designer'|null, reason: 'loaded'|'missing-assets'|'schema-parse-failed'|'designer-fallback'|'designer-schema-empty'}>}
 */
export const loadTemplateIntoDesignerDetailed = async (formDesignerRef, { designer, schema, mode = 'auto' } = {}) => {
  if (!formDesignerRef?.current) {
    return { loadedFrom: null, reason: 'missing-assets' }
  }
  designer = parseJsonAsset(designer)
  schema = parseJsonAsset(schema)
  const designerLoadable = hasDesignerStructure(designer)
  const schemaLoadable = hasSchemaStructure(schema)

  if (shouldPreferSchema({ designer, schema, mode })) {
    const parsed = await formDesignerRef.current.loadSchema(schema, {
      silent: true,
      successMessage: '',
      suppressError: true,
    })
    if (parsed) return { loadedFrom: 'schema', reason: 'loaded' }
    if (designerLoadable) {
      formDesignerRef.current.loadData(designer, { silent: true, successMessage: '' })
      return { loadedFrom: 'designer', reason: 'designer-fallback' }
    }
    formDesignerRef.current.clearData?.({ silent: true })
    return { loadedFrom: null, reason: 'schema-parse-failed' }
  }

  if (designerLoadable) {
    formDesignerRef.current.loadData(designer, { silent: true, successMessage: '' })
    return { loadedFrom: 'designer', reason: 'loaded' }
  }

  if (schemaLoadable) {
    const parsed = await formDesignerRef.current.loadSchema(schema, {
      silent: true,
      successMessage: '',
      suppressError: true,
    })
    if (parsed) return { loadedFrom: 'schema', reason: 'loaded' }
    formDesignerRef.current.clearData?.({ silent: true })
    return { loadedFrom: null, reason: 'schema-parse-failed' }
  }

  formDesignerRef.current.clearData?.({ silent: true })
  return {
    loadedFrom: null,
    reason: designer || schema ? 'designer-schema-empty' : 'missing-assets',
  }
}

/**
 * 兼容旧调用方，仅返回加载来源。
 *
 * @param {Object} formDesignerRef 设计器 ref
 * @param {Object} options 加载参数
 * @returns {Promise<'schema'|'designer'|null>}
 */
export const loadTemplateIntoDesigner = async (formDesignerRef, options = {}) => {
  const result = await loadTemplateIntoDesignerDetailed(formDesignerRef, options)
  return result.loadedFrom
}
