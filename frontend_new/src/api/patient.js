/**
 * 患者相关API
 */
import request from './request'
import { searchUserFiles } from './document'

/**
 * 从后端 ehr-field-history 的返回值合成字段候选列表
 * 后端当前没有独立的 candidate-values 端点，历史记录本身就是每条
 * field_value_candidates 行，按字段值去重即可当候选使用。
 * @param {Array<any>} historyList history 数组
 * @returns {{ candidates: Array<any>, selected_candidate_id: null, has_value_conflict: boolean, distinct_value_count: number }}
 */
export function synthesizeCandidatesFromHistory(historyList) {
  const items = Array.isArray(historyList) ? historyList : []
  const picked = new Map()
  for (const h of items) {
    if (!h || h.new_value === undefined) continue
    const key = (() => {
      try { return JSON.stringify(h.new_value ?? null) } catch { return String(h.new_value) }
    })()
    if (picked.has(key)) continue
    picked.set(key, {
      id: h.id,
      value: h.new_value,
      source_document_id: h.source_document_id || null,
      source_document_name: h.source_document_name || null,
      source_page: h.source_page ?? null,
      source_location: h.source_location || null,
      source_text: h.source_text || null,
      confidence: h.confidence ?? null,
      created_by: h.operator_type || null,
      created_at: h.created_at || null,
    })
  }
  const candidates = Array.from(picked.values())
  return {
    candidates,
    selected_candidate_id: null,
    has_value_conflict: candidates.length > 1,
    distinct_value_count: candidates.length,
  }
}
/**
 * 获取患者列表
 * @param {object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.page_size - 每页数量
 * @param {string} params.search - 搜索关键词（患者姓名、ID或诊断）
 * @param {string} params.gender - 性别筛选
 * @param {string} params.department_id - 科室ID筛选
 * @returns {Promise} 患者列表
 */
export const getPatientList = (params) => {
  return request.get('/patients/', { params })
}

/**
 * 创建患者
 * @param {object} data - 患者信息
 * @param {string} data.name - 姓名
 * @param {string} data.gender - 性别
 * @param {number} data.age - 年龄
 * @param {string} data.id_card - 身份证号
 * @param {string} data.phone - 联系电话
 * @param {string} data.address - 住址
 * @param {string[]} data.diagnosis - 诊断列表
 * @param {string} data.department_id - 科室ID
 * @param {string} data.attending_doctor_name - 主治医生
 * @returns {Promise} 创建结果
 */
export const createPatient = (data) => {
  return request.post('/patients/', data)
}

/**
 * 批量删除患者
 * @param {object} data - 批量删除请求
 * @param {string[]} data.patient_ids - 患者ID列表
 * @returns {Promise} 批量删除结果
 */
export const batchDeletePatients = (data) => {
  return request.post('/patients/batch-delete/', data)
}

/**
 * 删除患者前检查关联的科研项目
 * @param {object} data - { patient_ids: string[] }
 * @returns {Promise} 关联项目列表
 */
export const batchDeleteCheck = (data) => {
  return request.post('/patients/batch-delete/check', data)
}

/**
 * 导出患者数据
 * @param {object} data - 导出请求参数
 * @param {string} data.format - 导出格式: excel, csv, json
 * @param {string} data.scope - 导出范围: all(全部患者), filtered(当前筛选), selected(选中患者)
 * @param {string} [data.search] - 搜索关键词（scope=filtered 时使用）
 * @param {string} [data.gender] - 性别筛选（scope=filtered 时使用）
 * @param {string} [data.department_id] - 科室ID筛选（scope=filtered 时使用）
 * @param {string} [data.tags] - 标签筛选（scope=filtered 时使用）
 * @param {string[]} [data.patient_ids] - 选中的患者ID列表（scope=selected 时使用）
 * @param {boolean} [data.include_basic_info=true] - 包含基本信息
 * @param {boolean} [data.include_diagnosis=true] - 包含诊断信息
 * @param {boolean} [data.include_completeness=true] - 包含完整度信息
 * @returns {Promise} 导出结果
 */
export const exportPatients = (data) => {
  return request.post('/patients/export', data, {
    responseType: 'blob' // 文件下载需要blob类型
  })
}

/**
 * 获取科室树
 * @returns {Promise} 科室树形结构数据
 */
export const getDepartmentTree = () => {
  return request.get('/patients/departments/tree')
}

/**
 * 获取患者详情
 * @param {string} patientId - 患者ID
 * @returns {Promise} 患者详情
 *
 * 迁移期适配：后端无 GET /patients/:id，从列表里查。
 * 原实现：return request.get(`/patients/${patientId}`)
 */
export const getPatientDetail = async (patientId) => {
  const res = await request.get('/patients/', { params: { page: 1, page_size: 1000 } })
  const rows = Array.isArray(res?.data) ? res.data : []
  const row = rows.find((p) => p?.id === patientId)
  if (!row) {
    return { success: false, code: 404, message: '患者不存在', data: null }
  }
  return {
    success: true,
    code: 0,
    message: 'ok',
    data: {
      ...row,
      // 这些字段后端未实现，补 null/空让前端脱敏/渲染不报错
      phone: row.phone ?? null,
      id_card: row.id_card ?? null,
      address: row.address ?? null,
      merged_data: row.merged_data ?? {},
      source_document_ids: row.source_document_ids ?? [],
    },
  }
}

/**
 * 更新患者信息
 * @param {string} patientId - 患者ID
 * @param {object} data - 更新数据
 * @returns {Promise} 更新结果
 */
export const updatePatient = (patientId, data) => {
  return request.put(`/patients/${patientId}`, data)
}

/**
 * 获取患者电子病历
 * @param {string} patientId - 患者ID
 * @returns {Promise} 患者病历数据
 */
export const getPatientEhr = (patientId) => {
  return request.get(`/patients/${patientId}/ehr`)
}

/**
 * 获取患者电子病历 Schema + 对齐后的数据
 *
 * 直接调用后端 `/api/v1/patients/:patientId/ehr-schema-data`，
 * 由后端基于 field_value_selected（CRF 抽取流水线结果）物化为嵌套 JSON。
 * 不再在前端用文档 metadata 做聚合/适配。
 *
 * @param {string} patientId - 患者ID
 * @returns {Promise} { success, code, message, data: { schema, data, instance, ... } }
 */
export const getPatientEhrSchemaData = (patientId) => {
  return request.get(`/patients/${patientId}/ehr-schema-data`)
}

/**
 * 更新患者电子病历 Schema 数据（以字段名为更新单元，提交整张表单）
 * @param {string} patientId - 患者ID
 * @param {object} data - 前端表单数据（与 schema-data 的 data 结构一致，中文 key 嵌套）
 * @returns {Promise} 更新结果
 */
export const updatePatientEhrSchemaData = (patientId, data) => {
  return request.put(`/patients/${patientId}/ehr-schema-data`, data)
}

/**
 * 更新电子病历夹
 * 提交该患者名下尚未抽取的文档进入病历夹抽取流程。
 * @param {string} patientId - 患者ID
 * @returns {Promise} 更新结果
 */
export const updatePatientEhrFolder = (patientId) => {
  return request.post(`/patients/${patientId}/ehr-folder/update`, {})
}

/**
 * 更新患者病历字段
 * @param {string} patientId - 患者ID
 * @param {object} data - 更新数据
 * @param {Array} data.fields - 要更新的字段列表，每个字段包含 field_id 和 value
 * @returns {Promise} 更新结果
 */
export const updatePatientEhr = (patientId, data) => {
  return request.patch(`/patients/${patientId}/ehr`, data)
}

/**
 * 获取患者关联的文档列表
 * @param {string} patientId - 患者ID
 * @returns {Promise} 文档列表
 *
 * 迁移期适配：后端无 GET /patients/:id/documents，走 document.searchUserFiles(patient_id=...)
 * 原实现：return request.get(`/patients/${patientId}/documents`)
 */
export const getPatientDocuments = async (patientId) => {
  const res = await searchUserFiles({ patient_id: patientId, page: 1, page_size: 500 })
  return {
    success: true,
    code: 0,
    message: 'ok',
    data: res?.data?.items || [],
  }
}

/**
 * 合并病历数据到患者
 * @param {string} patientId - 患者ID
 * @param {object} data - 合并请求数据
 * @param {string} data.document_id - 源文档ID（必须已关联到该患者）
 * @param {string} [data.conflict_policy] - 冲突策略: prefer_latest(优先最新)/prefer_existing(保留现有)/merge_array(数组合并)
 * @returns {Promise} 合并结果
 */
export const mergeEhrData = (patientId, data) => {
  return request.post(`/patients/${patientId}/merge`, data)
}

/**
 * 根据抽取记录ID获取冲突详情
 * @param {string} extractionId - 抽取记录ID
 * @param {object} params - 查询参数
 * @param {string} [params.status] - 状态筛选: pending/resolved_adopt/resolved_keep/ignored
 * @returns {Promise} 冲突列表
 */
export const getConflictsByExtractionId = (extractionId, params = {}) => {
  return request.get(`/patients/extractions/${extractionId}/conflicts`, { params })
}

/**
 * 解决冲突
 * @param {string} conflictId - 冲突记录ID
 * @param {object} data - 解决请求数据
 * @param {string} data.resolution - 解决方式: adopt(采用新值)/keep(保留现有值)/ignore(忽略)
 * @param {string} [data.remark] - 解决备注
 * @returns {Promise} 解决结果
 */
export const resolveConflict = (conflictId, data) => {
  return request.post(`/patients/conflicts/${conflictId}/resolve`, data)
}

/**
 * 启动患者文档抽取任务（异步）
 * 抽取患者关联的所有已解析文档，使用 AI 提取结构化数据并智能合并到 EHR
 * @param {string} patientId - 患者ID
 * @returns {Promise} 返回任务ID
 */
export const startPatientExtraction = (patientId) => {
  return request.post(`/patients/${patientId}/extract`)
}

/**
 * 查询抽取任务状态
 * @param {string} taskId - 任务ID
 * @returns {Promise} 任务状态和进度
 */
export const getExtractionTaskStatus = (taskId) => {
  return request.get(`/patients/tasks/${taskId}`)
}

/**
 * 获取病历字段溯源历史
 * @param {string} patientId - 患者ID
 * @param {string} fieldName - 字段名称
 * @returns {Promise} 字段变更历史列表
 */
export const getEhrFieldHistory = (patientId, fieldName) => {
  return request.get(`/patients/${patientId}/ehr/history`, {
    params: { field_name: fieldName }
  })
}

/**
 * 获取病历字段溯源历史（V2版本，支持Schema路径）
 * @param {string} patientId - 患者ID
 * @param {string} fieldPath - 字段路径（如 "基本信息.人口学情况.患者姓名"）
 * @returns {Promise} 字段变更历史列表
 */
export const getEhrFieldHistoryV2 = (patientId, fieldPath) => {
  return request.get(`/patients/${patientId}/ehr-v2/history`, {
    params: { field_path: fieldPath }
  })
}

/**
 * 获取病历字段溯源历史
 *
 * 直接调用后端 GET /api/v1/patients/:patientId/ehr-field-history
 * 返回的每条记录已经带 source_document_id / source_page / source_location.bbox / source_text / confidence
 * 后端同时接受 `/a/b/c` 或 `a.b.c`，内部会自动做重复段/索引段兜底匹配，不需要前端额外归一化。
 *
 * @param {string} patientId - 患者ID
 * @param {string} fieldPath - 字段路径（如 "基本信息.人口学情况.性别" 或 "/治疗情况/药物治疗/0/药物名称"）
 * @param {string|null} _rowUid - 行级定位符（后端暂未使用，保留签名以兼容调用方）
 * @returns {Promise} 字段变更历史列表
 */
export const getEhrFieldHistoryV3 = (patientId, fieldPath, _rowUid = null) => {
  return request.get(`/patients/${patientId}/ehr-field-history`, {
    params: { field_path: fieldPath },
  })
}

/**
 * 获取患者字段候选值列表（真实后端）。
 *
 * 后端接口：GET /api/v1/patients/:patientId/ehr-field-candidates
 * 返回每条候选事件（不去重），并带当前选中的 candidate_id。
 *
 * @param {string} patientId 患者 ID。
 * @param {string} fieldPath 字段路径。
 * @param {string|null} _rowUid 行级定位符（后端暂未使用，保留签名兼容调用方）。
 * @param {string|null} projectId 项目 ID（项目 CRF 模式传入；病历夹模式留空）。
 * @returns {Promise}
 */
export const getEhrFieldCandidatesV3 = (patientId, fieldPath, _rowUid = null, projectId = null) => {
  return request.get(`/patients/${patientId}/ehr-field-candidates`, {
    params: {
      field_path: fieldPath,
      ...(projectId ? { project_id: projectId } : {}),
    },
  })
}

/**
 * 采用某个候选值为当前值（真实后端）。
 *
 * 后端接口：POST /api/v1/patients/:patientId/ehr-field-candidates/select
 * 后端会 UPSERT field_value_selected，并追加一条 created_by='user' 的审计 candidate。
 *
 * @param {string} patientId 患者 ID。
 * @param {string} fieldPath 字段路径。
 * @param {string} candidateId 候选 ID。
 * @param {any} [_selectedValue] 保留参数：用于未来"手工修改值并固化"一步完成。
 * @param {string|null} [_rowUid] 行级定位符（保留签名兼容调用方）。
 * @param {string|null} [projectId] 项目 ID（项目 CRF 模式传入）。
 * @returns {Promise}
 */
export const selectEhrFieldCandidateV3 = (
  patientId,
  fieldPath,
  candidateId,
  selectedValue,
  _rowUid = null,
  projectId = null
) => {
  return request.post(`/patients/${patientId}/ehr-field-candidates/select`, {
    field_path: fieldPath,
    candidate_id: candidateId,
    ...(selectedValue !== undefined ? { selected_value: selectedValue } : {}),
    ...(projectId ? { project_id: projectId } : {}),
  })
}

/**
 * 上传文档并抽取单个字段
 * @param {string} patientId - 患者ID
 * @param {string} fieldPath - 字段路径
 * @param {File} file - 上传的文件
 * @returns {Promise} 任务信息
 */
export const uploadAndExtractField = (patientId, fieldPath, file) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post(`/patients/${patientId}/field-extract?field_path=${encodeURIComponent(fieldPath)}`, formData, {
    timeout: 60000 // 60秒超时，因为文件上传和解析可能需要时间
  })
}

/**
 * 获取待解决的字段冲突列表
 * @param {string} patientId - 患者ID
 * @param {string} status - 冲突状态: pending/resolved_adopt/resolved_keep
 * @returns {Promise} 冲突列表
 *
 * 迁移期：后端无 /patients/:id/field-conflicts，返回空冲突列表让 UI 静默渲染。
 * 原实现：return request.get(`/patients/${patientId}/field-conflicts`, { params: { status } })
 */
export const getFieldConflicts = (_patientId, _status = 'pending') => {
  return Promise.resolve({
    success: true,
    code: 0,
    message: 'ok (migration stub)',
    data: { conflicts: [] },
  })
}

/**
 * 解决字段冲突
 * @param {string} patientId - 患者ID
 * @param {string} conflictId - 冲突ID
 * @param {string} action - 操作: adopt（采用新值）/ keep（保留旧值）
 * @returns {Promise} 解决结果
 */
export const resolveFieldConflict = (patientId, conflictId, action) => {
  return request.post(`/patients/${patientId}/field-conflicts/${conflictId}/resolve`, { action })
}

/**
 * 生成AI病情综述
 * 根据患者关联文档的 OCR 内容，调用大模型生成结构化病情综述
 * @param {string} patientId - 患者ID
 * @returns {Promise} { content, source_documents, generated_at }
 */
export const generateAiSummary = (patientId) => {
  return request.post(`/patients/${patientId}/ai-summary`)
}

/**
 * 获取AI病情综述
 * 获取患者已生成的 AI 病情综述
 * @param {string} patientId - 患者ID
 * @returns {Promise} { content, source_documents, generated_at }
 *
 * 迁移期：后端无此接口，返回"未生成"空结果让 UI 显示占位。
 * 原实现：return request.get(`/patients/${patientId}/ai-summary`)
 */
export const getAiSummary = (_patientId) => {
  return Promise.resolve({
    success: true,
    code: 0,
    message: 'ok (migration stub)',
    data: { content: '', source_documents: [], generated_at: null },
  })
}

export default {
  getPatientList,
  createPatient,
  batchDeletePatients,
  exportPatients,
  getDepartmentTree,
  getPatientDetail,
  updatePatient,
  getPatientEhr,
  getPatientEhrSchemaData,
  updatePatientEhrSchemaData,
  updatePatientEhrFolder,
  getPatientDocuments,
  mergeEhrData,
  getConflictsByExtractionId,
  resolveConflict,
  startPatientExtraction,
  getExtractionTaskStatus,
  getEhrFieldHistory,
  getEhrFieldHistoryV2,
  getEhrFieldHistoryV3,
  getEhrFieldCandidatesV3,
  selectEhrFieldCandidateV3,
  uploadAndExtractField,
  getFieldConflicts,
  resolveFieldConflict,
  generateAiSummary,
  getAiSummary
}
