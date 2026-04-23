/**
 * CRF 模板 API 接口
 *
 * 当前后端 `/crf-templates/*` 一整套路由返回 501 未实现，但等价数据保存在
 * `/schemas/`（CRF/病历模板同属 schema 表）。本文件将前端的模板调用转接到
 * `/schemas/` 的对应接口，供前端列表/详情渲染使用。
 */
import request from './request.js'

// ============== 模板管理 ==============

// 将后端 schema 行映射为前端期望的 CRF 模板对象
const schemaToTemplate = (row) => {
  if (!row || typeof row !== 'object') return null
  const isPublished =
    typeof row.is_published === 'boolean' || typeof row.is_published === 'number'
      ? Boolean(row.is_published)
      : Boolean(row.is_active)
  return {
    id: row.id,
    template_id: row.id,
    template_code: row.code || row.template_code || null,
    template_name: row.template_name || row.name || row.code || '未命名模板',
    category: row.category || '通用',
    description: row.description || '',
    version: row.version ?? null,
    schema_version: row.version != null ? String(row.version) : null,
    schema_type: row.schema_type || 'crf',
    is_active: Boolean(row.is_active),
    is_published: isPublished,
    template_type: 'database',
    field_count: Array.isArray(row.fields)
      ? row.fields.length
      : row.field_count || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    schema_json: row.schema_json || null,
    designer: row.designer || null,
    layout_config: row.layout_config || null,
    source: row.source || null,
    raw: row,
  }
}

/**
 * 获取 CRF 模板列表
 * 说明：现走 `/schemas/`，默认过滤 schema_type === 'crf'。
 */
export const getCRFTemplates = async (params = {}) => {
  try {
    const res = await request.get('/schemas/', { params })
    if (!res || !res.success) return res
    const rows = Array.isArray(res.data) ? res.data : []
    const items = rows
      .filter((r) => !r.schema_type || r.schema_type === 'crf')
      .map(schemaToTemplate)
      .filter(Boolean)
    return { ...res, data: items }
  } catch (e) {
    return { success: false, code: 500, message: e?.message || '加载模板失败', data: [] }
  }
}

/**
 * 获取 CRF 模板详情（走 `/schemas/:id`）
 */
export const getCRFTemplate = async (templateId, requestConfig = {}) => {
  const res = await request.get(`/schemas/${templateId}`, requestConfig)
  if (!res || !res.success) return res
  return { ...res, data: schemaToTemplate(res.data) }
}

/**
 * 更新 CRF 模板基础信息
 * @param {string} templateId - 模板 ID
 * @param {Object} payload
 * @param {string=} payload.template_name
 * @param {string=} payload.category
 * @param {string=} payload.description
 */
export const updateCrfTemplateMeta = (templateId, payload) => {
  return request.patch(`/crf-templates/${templateId}`, payload)
}

/**
 * 获取模板分类列表
 * 后端未实现对应接口：改为从 `/schemas/` 聚合分类。
 */
export const getCRFCategories = async () => {
  try {
    const res = await request.get('/schemas/', { _silent: true })
    const rows = res?.success && Array.isArray(res.data) ? res.data : []
    const set = new Set()
    rows.forEach((r) => {
      if (r && r.category) set.add(r.category)
    })
    return {
      success: true,
      code: 0,
      message: 'ok',
      data: Array.from(set).map((name) => ({ name, value: name })),
    }
  } catch (e) {
    return { success: true, code: 0, message: 'ok (empty)', data: [] }
  }
}

/**
 * 获取文档类型配置（用于 x-sources 配置）
 * 后端无此路由，先 stub 空列表，避免加载 CRF 设计器时 404。
 */
export const getCrfDocTypes = () => {
  return Promise.resolve({
    success: true,
    code: 0,
    message: 'ok (migration stub)',
    data: [],
  })
}

// ============== 项目模板关联 ==============

/**
 * 为项目分配 CRF 模板
 * @param {string} projectId - 项目 ID
 * @param {string} templateId - 模板 ID
 * @param {Object} scopeConfig - 模板裁剪配置
 */
export const assignTemplateToProject = (projectId, templateId, scopeConfig = null) => {
  return request.post(`/crf-templates/assign/${projectId}`, {
    template_id: templateId,
    scope_config: scopeConfig
  })
}

/**
 * 获取项目的 CRF 模板
 * 后端无该路由，改走 `/projects/` 列表 + `/schemas/:id` 拼装。
 */
export const getProjectTemplate = async (projectId) => {
  try {
    const projRes = await request.get('/projects/', { _silent: true })
    const rows = projRes?.success && Array.isArray(projRes.data) ? projRes.data : []
    const project = rows.find((p) => String(p.id) === String(projectId))
    const templateId = project?.crf_template_id || project?.schema_id || project?.template_scope_config?.template_id
    if (!templateId) {
      return {
        success: false,
        code: 404,
        message: '未找到项目绑定的 CRF 模板',
        data: null,
      }
    }
    const tplRes = await request.get(`/schemas/${templateId}`, { _silent: true })
    if (!tplRes?.success) return tplRes
    return { ...tplRes, data: schemaToTemplate(tplRes.data) }
  } catch (e) {
    return { success: false, code: 500, message: e?.message || '加载项目模板失败', data: null }
  }
}

/**
 * 将文件模板转换为数据库模板
 * @param {string} templateId - 文件模板 ID
 */
export const convertTemplate = (templateId) => {
  return request.post(`/crf-templates/convert/${templateId}`)
}

/**
 * 通过 CSV 导入创建 CRF 模板（草稿）- 使用前端 CSVConverter 格式
 * @param {Object} payload
 * @param {string} payload.template_code
 * @param {string} payload.template_name
 * @param {string=} payload.category
 * @param {string=} payload.description
 * @param {boolean=} payload.publish
 * @param {File} payload.file
 */
export const importCrfTemplateFromCsv = (payload) => {
  const form = new FormData()
  // template_code 可不传：后端会根据 template_name 自动生成（全局唯一）
  if (payload.template_code) form.append('template_code', payload.template_code)
  form.append('template_name', payload.template_name)
  if (payload.category) form.append('category', payload.category)
  if (payload.description) form.append('description', payload.description)
  form.append('publish', payload.publish ? 'true' : 'false')
  form.append('file', payload.file)
  // 使用后端内置生成器，支持 开发者指南/docs-参考的原始文件 中的 CSV 格式
  return request.post('/crf-templates/import/csv-script', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
}

export const publishCrfTemplate = (templateId) => {
  return request.post(`/crf-templates/${templateId}/publish`)
}

/**
 * 保存 CRFDesigner 编辑结果（生成资产并更新模板）
 * @param {string} templateId
 * @param {Object} payload
 * @param {string=} payload.template_name
 * @param {string=} payload.category
 * @param {string=} payload.description
 * @param {boolean=} payload.publish
 * @param {Object} payload.designer
 */
export const saveCrfTemplateDesigner = (templateId, payload) => {
  return request.put(`/crf-templates/${templateId}/designer`, payload)
}

/**
 * 通过 CRFDesigner 创建模板（草稿）
 * @param {Object} payload
 * @param {string} payload.template_code
 * @param {string} payload.template_name
 * @param {string=} payload.category
 * @param {string=} payload.description
 * @param {boolean=} payload.publish
 * @param {Object} payload.designer
 */
export const createCrfTemplateDesigner = (payload) => {
  return request.post('/crf-templates/designer', payload)
}

/**
 * 复制模板（用于已发布模板变更）
 * @param {string} templateId
 * @param {Object} payload
 * @param {string} payload.new_template_code
 * @param {string=} payload.new_template_name
 * @param {string=} payload.category
 * @param {string=} payload.description
 */
export const cloneCrfTemplate = (templateId, payload) => {
  return request.post(`/crf-templates/${templateId}/clone`, payload)
}

/**
 * 删除 CRF 模板
 * @param {string} templateId
 * @param {Object=} requestConfig - Axios 可选配置（如 _silent）
 */
export const deleteCrfTemplate = (templateId, requestConfig = {}) => {
  return request.delete(`/crf-templates/${templateId}`, requestConfig)
}

/**
 * 获取模板版本列表
 * @param {string} templateId
 */
export const listCrfTemplateVersions = (templateId) => {
  return request.get(`/crf-templates/${templateId}/versions`)
}

/**
 * 获取模板指定版本快照
 * @param {string} templateId
 * @param {string} schemaVersion
 */
export const getCrfTemplateVersion = (templateId, schemaVersion) => {
  return request.get(`/crf-templates/${templateId}/versions/${schemaVersion}`)
}

/**
 * 激活/回滚模板版本
 * @param {string} templateId
 * @param {string} schemaVersion
 */
export const activateCrfTemplateVersion = (templateId, schemaVersion) => {
  return request.post(`/crf-templates/${templateId}/versions/${schemaVersion}/activate`)
}

export default {
  getCRFTemplates,
  getCRFTemplate,
  updateCrfTemplateMeta,
  getCRFCategories,
  getCrfDocTypes,
  assignTemplateToProject,
  getProjectTemplate,
  convertTemplate,
  importCrfTemplateFromCsv,
  publishCrfTemplate,
  saveCrfTemplateDesigner,
  createCrfTemplateDesigner,
  cloneCrfTemplate,
  deleteCrfTemplate,
  listCrfTemplateVersions,
  getCrfTemplateVersion,
  activateCrfTemplateVersion,
}

