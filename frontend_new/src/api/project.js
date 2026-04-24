/**
 * 科研项目 API 接口
 */
import request from './request'

// ============== 项目管理 ==============

/**
 * 获取项目列表
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.page_size - 每页数量
 * @param {string} params.status - 状态筛选
 * @param {string} params.search - 搜索关键词
 */
export const getProjects = (params = {}) => {
  return request.get('/projects/', { params })
}

/**
 * 获取项目详情
 * @param {string} projectId - 项目 ID
 */
export const getProject = (projectId) => {
  return request.get(`/projects/${projectId}`)
}

/**
 * 创建项目
 * @param {Object} data - 项目数据
 * @param {string} data.project_name - 项目名称
 * @param {string} data.description - 项目描述
 * @param {string} data.principal_investigator_id - PI ID
 * @param {string} data.crf_template_id - CRF 模板 ID
 * @param {number} data.expected_patient_count - 预期入组人数
 * @param {string} data.start_date - 开始日期
 * @param {string} data.end_date - 结束日期
 */
export const createProject = (data) => {
  return request.post('/projects/', data)
}

/**
 * 更新项目
 * @param {string} projectId - 项目 ID
 * @param {Object} data - 更新数据
 */
export const updateProject = (projectId, data) => {
  return request.put(`/projects/${projectId}`, data)
}

/**
 * 删除项目
 * @param {string} projectId - 项目 ID
 */
export const deleteProject = (projectId) => {
  return request.delete(`/projects/${projectId}`)
}

/**
 * 切换项目状态
 * @param {string} projectId - 项目 ID
 * @param {string} status - 新状态: planning/active/paused/completed
 */
export const toggleProjectStatus = (projectId, status) => {
  return request.patch(`/projects/${projectId}/status`, {}, {
    params: { status }
  })
}

// ============== 项目成员管理 ==============

/**
 * 获取项目成员列表
 * @param {string} projectId - 项目 ID
 */
export const getProjectMembers = (projectId) => {
  return request.get(`/projects/${projectId}/members`)
}

/**
 * 添加项目成员
 * @param {string} projectId - 项目 ID
 * @param {Object} data - 成员数据
 * @param {string} data.user_id - 用户 ID
 * @param {string} data.role - 角色
 * @param {Array} data.permissions - 权限列表
 */
export const addProjectMember = (projectId, data) => {
  return request.post(`/projects/${projectId}/members`, data)
}

/**
 * 移除项目成员
 * @param {string} projectId - 项目 ID
 * @param {string} userId - 用户 ID
 */
export const removeProjectMember = (projectId, userId) => {
  return request.delete(`/projects/${projectId}/members/${userId}`)
}

// ============== 受试者管理 ==============

/**
 * 获取项目受试者列表
 * @param {string} projectId - 项目 ID
 * @param {Object} params - 查询参数
 */
export const getProjectPatients = (projectId, params = {}) => {
  return request.get(`/projects/${projectId}/patients`, { params })
}

/**
 * 获取项目患者详情
 * @param {string} projectId - 项目 ID
 * @param {string} patientId - 患者 ID
 * @returns {Promise} 患者详情（包含 CRF 数据、关联文档等）
 */
export const getProjectPatientDetail = (projectId, patientId) => {
  return request.get(`/projects/${projectId}/patients/${patientId}`)
}

/**
 * 更新项目患者 CRF 字段（写入 ProjectPatient.crf_data）
 * @param {string} projectId
 * @param {string} patientId
 * @param {{fields: Array<{group_id: string, field_key: string, value: any}>}} data
 */
export const updateProjectPatientCrfFields = (projectId, patientId, data) => {
  return request.patch(`/projects/${projectId}/patients/${patientId}/crf/fields`, data)
}

/**
 * 获取项目患者 CRF 冲突列表
 * @param {string} projectId
 * @param {string} patientId
 * @param {{status?: string, limit?: number}} params
 */
export const getProjectPatientCrfConflicts = (projectId, patientId, params = {}) => {
  return request.get(`/projects/${projectId}/patients/${patientId}/crf/conflicts`, { params })
}

/**
 * 解决单条项目患者 CRF 冲突
 * @param {string} projectId
 * @param {string} patientId
 * @param {string} conflictId
 * @param {{action: 'adopt'|'keep'|'ignore', remark?: string}} data
 */
export const resolveProjectPatientCrfConflict = (projectId, patientId, conflictId, data) => {
  return request.post(`/projects/${projectId}/patients/${patientId}/crf/conflicts/${conflictId}/resolve`, data)
}

/**
 * 批量解决项目患者所有 pending 冲突
 * @param {string} projectId
 * @param {string} patientId
 * @param {{action: 'adopt'|'keep'|'ignore', remark?: string}} data
 */
export const resolveAllProjectPatientCrfConflicts = (projectId, patientId, data) => {
  return request.post(`/projects/${projectId}/patients/${patientId}/crf/conflicts/resolve-all`, data)
}

/**
 * 获取项目患者 CRF 字段溯源历史
 *
 * 直接复用后端 GET /api/v1/patients/:patientId/ehr-field-history，
 * 传 project_id 查询该项目对应 schema 的 project_crf 实例。
 * 返回形状和 getEhrFieldHistoryV3 一致（每条含 source_document_id / bbox / page 等）。
 *
 * @param {string} projectId 项目 ID
 * @param {string} patientId 患者 ID
 * @param {string} fieldPath 字段路径
 * @param {string|null} _rowUid 行级定位符（后端暂未使用，保留签名以兼容调用方）
 * @returns {Promise}
 */
export const getProjectCrfFieldHistory = (projectId, patientId, fieldPath, _rowUid = null) => {
  return request.get(`/patients/${patientId}/ehr-field-history`, {
    params: { field_path: fieldPath, project_id: projectId },
  })
}

/**
 * 获取项目患者 CRF 字段候选值列表（真实后端）。
 *
 * 与病历夹共用 `/patients/:patientId/ehr-field-candidates`，通过 project_id 区分实例。
 *
 * @param {string} projectId 项目 ID。
 * @param {string} patientId 患者 ID。
 * @param {string} fieldPath 字段路径。
 * @param {string|null} _rowUid 行级定位符（保留签名兼容调用方）。
 * @returns {Promise}
 */
export const getProjectCrfFieldCandidates = (projectId, patientId, fieldPath, _rowUid = null) => {
  return request.get(`/patients/${patientId}/ehr-field-candidates`, {
    params: { field_path: fieldPath, project_id: projectId },
  })
}

/**
 * 采用项目患者 CRF 某个候选值为当前值（真实后端）。
 *
 * @param {string} projectId 项目 ID。
 * @param {string} patientId 患者 ID。
 * @param {string} fieldPath 字段路径。
 * @param {string} candidateId 候选 ID。
 * @param {any} [_selectedValue] 保留参数。
 * @param {string|null} [_rowUid] 行级定位符（保留签名兼容调用方）。
 * @returns {Promise}
 */
export const selectProjectCrfFieldCandidate = (
  projectId,
  patientId,
  fieldPath,
  candidateId,
  selectedValue,
  _rowUid = null
) => {
  return request.post(`/patients/${patientId}/ehr-field-candidates/select`, {
    field_path: fieldPath,
    candidate_id: candidateId,
    ...(selectedValue !== undefined ? { selected_value: selectedValue } : {}),
    project_id: projectId,
  })
}

/**
 * 患者入组
 * @param {string} projectId - 项目 ID
 * @param {Object} data - 入组数据
 * @param {string} data.patient_id - 患者 ID
 * @param {string} data.subject_id - 受试者编号
 * @param {string} data.group_name - 分组
 */
export const enrollPatient = (projectId, data) => {
  return request.post(`/projects/${projectId}/patients`, data)
}

/**
 * 移除受试者
 * @param {string} projectId - 项目 ID
 * @param {string} patientId - 患者 ID
 */
export const removeProjectPatient = (projectId, patientId) => {
  return request.delete(`/projects/${projectId}/patients/${patientId}`)
}

// ============== CRF 抽取任务管理 ==============

/**
 * 启动项目 CRF 抽取任务
 * @param {string} projectId - 项目 ID
 * @param {Array} patientIds - 可选，指定患者列表
 * @param {string} mode - 抽取模式 (incremental / full)
 * @param {Array} targetGroups - 可选，专项抽取的字段组 key 列表
 */
export const startCrfExtraction = (projectId, patientIds = null, mode = 'incremental', targetGroups = null) => {
  const body = { patient_ids: patientIds, mode }
  if (Array.isArray(targetGroups) && targetGroups.length > 0) {
    body.target_groups = targetGroups
  }
  return request.post(`/projects/${projectId}/crf/extraction/start`, body)
}

/**
 * 查询抽取任务进度
 * @param {string} projectId - 项目 ID
 * @param {string} taskId - 任务 ID
 */
export const getCrfExtractionProgress = (projectId, taskId) => {
  return request.get(`/projects/${projectId}/crf/extraction/progress`, {
    params: taskId ? { task_id: taskId } : undefined,
  })
}

// ============== 项目内 CRF 模板（项目快照）=============

/**
 * 获取项目内 CRF 模板 Designer（项目快照）
 * @param {string} projectId
 */
export const getProjectTemplateDesigner = (projectId) => {
  return request.get(`/projects/${projectId}/template/designer`)
}

/**
 * 保存项目内 CRF 模板 Designer，并自动迁移已抽取数据
 * @param {string} projectId
 * @param {{designer: Object}} data
 */
export const saveProjectTemplateDesigner = (projectId, data) => {
  return request.put(`/projects/${projectId}/template/designer`, data)
}

/**
 * 获取项目抽取任务列表
 * @param {string} projectId - 项目 ID
 * @param {number} limit - 返回数量
 */
export const getProjectExtractionTasks = (projectId, limit = 10) => {
  return request.get(`/projects/${projectId}/crf/extraction/tasks`, {
    params: { limit }
  })
}

/**
 * 获取项目活跃的抽取任务
 * @param {string} projectId - 项目 ID
 */
export const getActiveExtractionTask = (projectId) => {
  return request.get(`/projects/${projectId}/crf/extraction/active`)
}

/**
 * 取消/暂停抽取任务
 * @param {string} projectId - 项目 ID
 */
export const cancelCrfExtraction = (projectId) => {
  return request.post(`/projects/${projectId}/crf/extraction/cancel`)
}

/**
 * 重置抽取任务状态（允许重新抽取）
 * @param {string} projectId - 项目 ID
 */
export const resetCrfExtraction = (projectId) => {
  return request.post(`/projects/${projectId}/crf/extraction/reset`)
}

/**
 * 切换项目模板版本并迁移 CRF 数据
 * @param {string} projectId
 * @param {{schema_version: string, force?: boolean}} data
 */
export const applyTemplateVersion = (projectId, data) => {
  return request.post(`/projects/${projectId}/template/apply-version`, data)
}

/**
 * 导出项目 CRF 数据文件（Excel/CSV/JSON）
 * @param {string} projectId
 * @param {{scope?: 'all'|'selected', patient_ids?: string[]}} data
 * @returns {Promise<Blob>} Excel 文件 blob
 */
export const exportProjectCrfFile = (projectId, data) => {
  return request.post(`/projects/${projectId}/crf/export-file`, data, {
    responseType: 'blob'
  })
}

export default {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  toggleProjectStatus,
  getProjectMembers,
  addProjectMember,
  removeProjectMember,
  getProjectPatients,
  getProjectPatientDetail,
  updateProjectPatientCrfFields,
  getProjectPatientCrfConflicts,
  resolveProjectPatientCrfConflict,
  resolveAllProjectPatientCrfConflicts,
  getProjectCrfFieldHistory,
  getProjectCrfFieldCandidates,
  selectProjectCrfFieldCandidate,
  enrollPatient,
  removeProjectPatient,
  startCrfExtraction,
  getCrfExtractionProgress,
  getProjectExtractionTasks,
  getActiveExtractionTask,
  cancelCrfExtraction,
  resetCrfExtraction,
  exportProjectCrfFile,
  applyTemplateVersion,
}
