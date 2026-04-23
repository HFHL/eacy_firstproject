/**
 * 文档相关API
 */
import request from './request'
import { API_URL } from './config'

/**
 * 上传文档
 * @param {File} file - 要上传的文件
 * @param {Function} onProgress - 上传进度回调函数
 * @param {AbortSignal} signal - 取消信号（可选）
 * @returns {Promise} 上传结果
 */
export const uploadDocument = (file, onProgress, signal) => {
  const formData = new FormData()
  formData.append('file', file)
  
  return request.post('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    // 上传可能超过全局 30s timeout；否则会触发 ECONNABORTED，被上传队列当成失败自动重试，
    // 由于后端允许重复上传，会导致同一个文件出现两条 document 记录。
    timeout: 300000, // 5 分钟
    signal, // 支持取消上传
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percent)
      }
    }
  })
}

/**
 * 批量上传文档
 * @param {File[]} files - 要上传的文件列表
 * @param {Function} onProgress - 每个文件的上传进度回调
 * @param {Function} onFileComplete - 单个文件上传完成回调
 * @returns {Promise} 批量上传结果
 */
export const uploadDocuments = async (files, onProgress, onFileComplete) => {
  const results = []
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      const result = await uploadDocument(file, (percent) => {
        if (onProgress) {
          onProgress(i, percent, file)
        }
      })
      results.push({
        file,
        success: true,
        data: result.data
      })
      if (onFileComplete) {
        onFileComplete(i, true, result, file)
      }
    } catch (error) {
      results.push({
        file,
        success: false,
        error: error.message || '上传失败'
      })
      if (onFileComplete) {
        onFileComplete(i, false, error, file)
      }
    }
  }
  
  return results
}

/**
 * 获取文档列表
 * @param {object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.page_size - 每页数量
 * @param {boolean} params.is_parsed - 是否已解析
 * @returns {Promise} 文档列表
 */
export const getDocumentList = (params) => {
  return request.get('/documents/', { params })
}

/**
 * 删除文档
 * @param {string} documentId - 文档ID
 * @param {boolean} revokeMerge - 如果文档已归档，是否撤销EHR合并数据（默认true）
 * @returns {Promise} 删除结果
 */
export const deleteDocument = (documentId, revokeMerge = true) => {
  return request.delete(`/documents/${documentId}`, {
    params: { revoke_merge: revokeMerge }
  })
}

/**
 * 批量删除文档
 * @param {string[]} documentIds - 文档 ID 列表
 * @param {boolean} revokeMerge - 已归档文档是否撤销 EHR 合并，默认 true
 * @returns {Promise} { success, message, data: { deleted_count, failed_count, errors } }
 */
export const deleteDocuments = (documentIds, revokeMerge = true) => {
  return request.post('/documents/batch-delete', {
    document_ids: documentIds,
    revoke_merge: revokeMerge
  })
}

/**
 * 获取文档临时访问URL
 * @param {string} documentId - 文档ID
 * @param {number} expires - 过期时间（秒），默认3600，最大604800（7天）
 * @returns {Promise} 临时访问URL信息
 */
export const getDocumentTempUrl = (documentId, expires = 3600) => {
  return request.get(`/documents/${documentId}/temp-url`, {
    params: { expires }
  })
}

/**
 * 获取文档 PDF 同源流式 URL（用于 PDF.js 绘制页内高亮，避免 OSS 跨域）
 * @param {string} documentId - 文档ID
 * @returns {string} 带 access_token 的同源 URL，可直接作为 PDF.js getDocument(url) 的 url
 */
export function getDocumentPdfStreamUrl (documentId) {
  if (!documentId) return ''
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('access_token') : ''
  const base = (API_URL || '').replace(/\/$/, '')
  const path = `${base}/documents/${encodeURIComponent(documentId)}/pdf-stream`
  return token ? `${path}?access_token=${encodeURIComponent(token)}` : path
}

/**
 * 归档文档到患者
 * @param {string} documentId - 文档ID
 * @param {string} patientId - 目标患者ID
 * @param {boolean} autoMergeEhr - 是否自动合并病历数据（默认true）
 * @returns {Promise} 归档结果
 */
export const archiveDocument = (documentId, patientId, autoMergeEhr = true) => {
  return request.post(`/documents/${documentId}/archive`, {}, {
    params: { 
      patient_id: patientId,
      auto_merge_ehr: autoMergeEhr
    }
  })
}

/**
 * 解除文档归档
 * @param {string} documentId - 文档ID
 * @param {boolean} revokeLastMerge - 是否撤销上次的EHR合并，默认 false
 * @returns {Promise} 解除结果
 */
export const unarchiveDocument = (documentId, revokeLastMerge = false) => {
  return request.put(`/documents/${documentId}/unarchive`, {}, {
    params: {
      revoke_last_merge: revokeLastMerge
    }
  })
}

/**
 * 更换归档患者
 * @param {string} documentId - 文档ID
 * @param {string} newPatientId - 新患者ID
 * @param {object} options - 可选参数
 * @param {boolean} options.revokeLastMerge - 是否撤销上次的EHR合并，默认 false
 * @param {boolean} options.autoMergeEhr - 是否自动合并EHR到新患者，默认 false
 * @returns {Promise} 更换结果
 */
export const changeArchivePatient = (documentId, newPatientId, options = {}) => {
  const { revokeLastMerge = false, autoMergeEhr = false } = options
  return request.put(`/documents/${documentId}/change-archive-patient`, {}, {
    params: {
      new_patient_id: newPatientId,
      revoke_last_merge: revokeLastMerge,
      auto_merge_ehr: autoMergeEhr
    }
  })
}

/**
 * 触发文档解析
 * @param {string} documentId - 文档ID
 * @param {object} options - 可选参数
 * @param {string} options.crfTemplateId - CRF模板ID（可选）
 * @param {string} options.parserType - 解析器类型（textin/mineru），默认 textin
 * @returns {Promise} 解析任务信息
 */
export const parseDocument = (documentId, options = {}) => {
  const { crfTemplateId = null, parserType = 'textin' } = options
  const params = { parser_type: parserType }
  if (crfTemplateId) {
    params.crf_template_id = crfTemplateId
  }
  return request.post(`/documents/${documentId}/parse`, {}, { params })
}

/**
 * 同步重新解析文档（不改变状态机状态）
 * @param {string} documentId - 文档ID
 * @param {object} options - 可选参数
 * @param {string} options.parserType - 解析器类型，默认 'textin'
 * @returns {Promise} 重新解析结果
 */
export const reparseDocumentSync = (documentId, options = {}) => {
  const { parserType = 'textin' } = options
  const params = { parser_type: parserType }
  return request.post(`/documents/${documentId}/reparse-sync`, {}, { params })
}

/**
 * 获取文档详情
 * @param {string} documentId - 文档ID
 * @param {object} options - 可选参数
 * @param {boolean} options.include_content - 是否包含 parsed_content（OCR 原始返回，较大），默认 false
 * @param {boolean} options.include_versions - 是否包含版本历史，默认 true
 * @param {boolean} options.include_patients - 是否包含关联患者信息，默认 true
 * @returns {Promise} 文档详情
 */
export const getDocumentDetail = (documentId, options = {}) => {
  const {
    include_content = false,
    include_versions = true,
    include_patients = true,
    include_extracted = false
  } = options
  
  return request.get(`/documents/${documentId}`, {
    params: {
      include_content,
      include_versions,
      include_extracted,
      include_patients
    }
  })
}

/**
 * 更新文档元数据
 * @param {string} documentId - 文档ID
 * @param {object} metadata - 元数据对象
 * @returns {Promise} 更新结果
 */
export const updateDocumentMetadata = (documentId, metadata) => {
  return request.put(`/documents/${documentId}/metadata`, metadata)
}

/**
 * 获取文档解析结果
 * @param {string} documentId - 文档ID
 * @returns {Promise} 解析结果
 */
export const getParseResult = (documentId) => {
  return request.get(`/documents/${documentId}/parse-result`)
}

/**
 * 获取解析进度（HTTP轮询备用）
 * @param {string} documentId - 文档ID
 * @returns {Promise} 进度信息
 */
export const getParseProgress = (documentId) => {
  return request.get(`/parse-progress/document/${documentId}`)
}

/**
 * 批量触发解析
 * @param {string[]} documentIds - 文档ID列表
 * @param {object} options - 可选参数（传递给 parseDocument）
 * @returns {Promise[]} 解析结果列表
 */
export const parseDocuments = async (documentIds, options = {}) => {
  const results = await Promise.all(
    documentIds.map(id => parseDocument(id, options).catch(err => ({ success: false, error: err })))
  )
  return results
}

/**
 * AI 抽取病历结构化数据
 * @param {string} documentId - 文档ID
 * @returns {Promise} 抽取结果
 */
export const extractEhrData = (documentId, options = {}) => {
  // AI 抽取的错误提示由调用方负责，避免拦截器与页面重复弹错。
  return request.post(`/documents/${documentId}/extract-ehr`, {}, {
    timeout: 120000, // 120秒 = 2分钟
    _silent: true,
    ...options,
  })
}

/**
 * 异步重新抽取文档元数据（执行 IndexerAgent，替换文档主表元数据）
 * 供「元数据字段」旁的「重新提取」使用，不执行病历结构化抽取
 * @param {string} documentId - 文档ID
 * @returns {Promise} - { celery_task_id, document_id, progress_url }
 */
export const extractDocumentMetadata = (documentId) => {
  return request.post(`/documents/${documentId}/extract-metadata/async`)
}

/**
 * 标记文档是否需要人工审核
 * @param {string} documentId - 文档ID
 * @param {boolean} requiresReview - 是否需要人工审核，默认 true
 * @returns {Promise} 标记结果
 */
export const markDocumentReview = (documentId, requiresReview = true) => {
  return request.post(`/documents/${documentId}/mark-review`, {}, {
    params: { requires_review: requiresReview }
  })
}

/**
 * 获取文档操作历史
 * @param {string} documentId - 文档ID
 * @param {object} options - 可选参数
 * @param {boolean} options.include_upload - 是否包含上传信息，默认 true
 * @param {boolean} options.include_extractions - 是否包含病历抽取记录，默认 true
 * @param {boolean} options.include_field_changes - 是否包含病历字段变更记录，默认 true
 * @param {boolean} options.include_conflict_resolves - 是否包含冲突解决记录，默认 true
 * @returns {Promise} 操作历史
 */
export const getDocumentOperationHistory = (documentId, options = {}) => {
  const {
    include_upload = true,
    include_extractions = true,
    include_field_changes = true,
    include_conflict_resolves = true
  } = options
  
  return request.get(`/documents/${documentId}/operation-history`, {
    params: {
      include_upload,
      include_extractions,
      include_field_changes,
      include_conflict_resolves
    }
  })
}

/**
 * AI初次抽取病历结构化数据并匹配患者
 * 流程：设置状态为ai_matching → AI抽取病历 → 匹配患者 → 根据结果更新状态
 * @param {string} documentId - 文档ID
 * @returns {Promise} 处理结果，包含 extraction_id, match_result, match_score, final_status 等
 */
export const aiMatchPatient = (documentId) => {
  // AI匹配患者需要调用大模型，设置更长的超时时间（3分钟）
  return request.post(`/documents/${documentId}/ai-match-patient`, {}, {
    timeout: 180000  // 180秒 = 3分钟
  })
}

// 兼容旧方法名
export const aiExtractAndMatchPatient = aiMatchPatient

/**
 * 获取文档AI匹配信息
 * @param {string} documentId - 文档ID
 * @returns {Promise} - API响应，包含 extracted_info, match_result, candidates, ai_recommendation, ai_reason 等
 */
export const getDocumentAiMatchInfo = (documentId) => {
  return request.get(`/documents/${documentId}/ai-match-info`)
}

/**
 * 确认创建患者并归档文档
 * 根据前端传入的患者信息创建新患者，并将文档归档到该患者名下
 * @param {string} documentId - 文档ID
 * @param {object} patientData - 患者信息对象，包含 name, gender, age, phone, idNumber, address 等字段
 * @returns {Promise} - API响应，包含 patient_id, patient_name, message 等
 */
export const confirmCreatePatientAndArchive = (documentId, patientData) => {
  // 创建患者并归档可能需要较长时间，设置2分钟超时
  return request.post(`/documents/${documentId}/confirm-create-patient`, patientData, {
    timeout: 120000  // 120秒 = 2分钟
  })
}

/**
 * 确认创建患者并归档文档（多文档合并）
 * 创建一个新患者，并将多个文档归档到该患者名下
 * 适用于同一患者的多个文档都被识别为新患者的场景
 * @param {string[]} documentIds - 文档ID列表
 * @param {object} patientData - 患者信息对象，包含 name, gender, age, phone, idNumber, address 等字段
 * @returns {Promise} - API响应，包含 patient_id, patient_name, success_count, failed_count 等
 */
export const batchCreatePatientAndArchive = (documentIds, patientData) => {
  // 批量创建患者并归档可能需要较长时间，设置3分钟超时
  return request.post('/documents/actions/batch-create-patient-and-archive', {
    document_ids: documentIds,
    ...patientData
  }, {
    timeout: 180000  // 180秒 = 3分钟
  })
}

/**
 * 确认自动归档
 * 将文档状态从 auto_archived 改为 archived，从自动归档列表移除
 * @param {string} documentId - 文档ID
 * @returns {Promise} - API响应
 */
export const confirmAutoArchive = (documentId) => {
  return request.post(`/documents/${documentId}/confirm-auto-archive`)
}

/**
 * 批量确认自动归档
 * @param {string[]} documentIds - 文档ID列表
 * @returns {Promise} - API响应，包含 success_count, failed_count 等
 */
export const batchConfirmAutoArchive = (documentIds) => {
  return request.post('/documents/actions/batch-confirm-auto-archive', documentIds)
}

/**
 * 搜索用户文件列表
 * 支持按关键字（文件名或患者姓名）、状态、上传时间搜索，支持排序
 * 返回文件基本信息、患者信息（已归档才有）和临时访问URL
 * 
 * @param {Object} params - 查询参数
 * @param {number} [params.page=1] - 页码
 * @param {number} [params.page_size=20] - 每页数量
 * @param {string} [params.keyword] - 关键字（文件名或患者姓名）
 * @param {string} [params.task_status] - 状态机状态，多个用逗号分隔（uploaded/parsing/parsed/parse_failed/ai_matching/pending_confirm_new/pending_confirm_review/pending_confirm_uncertain/auto_archived/archived）
 * @param {string} [params.date_from] - 开始日期（ISO格式）
 * @param {string} [params.date_to] - 结束日期（ISO格式）
 * @param {string} [params.order_by='created_at'] - 排序字段（created_at: 上传时间, file_name: 文件名, file_size: 文件大小）
 * @param {string} [params.order_direction='desc'] - 排序方向（asc: 正序, desc: 倒序）
 * @returns {Promise} - API响应
 * @example
 * // 响应数据结构
 * {
 *   items: [{
 *     id: "文档ID",
 *     file_name: "文件名",
 *     file_size: 1024,
 *     file_url: "临时访问URL",
 *     file_type: "pdf/image",
 *     document_type: "文档大类",
 *     document_sub_type: "文档子类",
 *     task_status: "状态",
 *     patient_info: {  // 已归档文档才有
 *       patient_id: "患者ID",
 *       patient_code: "患者编号",
 *       name: "患者姓名",
 *       gender: "性别",
 *       age: 30
 *     },
 *     bound_patient_summary: { // 绑定患者摘要（通常与 patient_info 同源）
 *       name: "患者姓名",
 *       gender: "性别",
 *       age: 30
 *     },
 *     document_metadata_summary: { // 文档元数据摘要（来源 documents 主表）
 *       name: "抽取姓名",
 *       gender: "抽取性别",
 *       age: "39岁"
 *     },
 *     created_at: "上传时间"
 *   }],
 *   total: 100,
 *   page: 1,
 *   page_size: 20,
 *   total_pages: 5
 * }
 */
/**
 * 迁移期：后端状态机词汇表与新前端 task_status 词汇表的映射。
 *
 * 后端（documents.status）实际取值：
 *   pending_upload / uploaded / ocr_pending / ocr_running /
 *   ocr_succeeded / ocr_failed / archived / deleted
 *
 * 新前端 FileList 使用的 task_status 词汇表：
 *   uploading / uploaded / parsing / parsed / extracted / parse_failed /
 *   ai_matching / pending_confirm_new / pending_confirm_review /
 *   pending_confirm_uncertain / auto_archived / archived
 *
 * 后端打通新词汇表后移除本映射层。
 */
const BACKEND_TO_FRONTEND_STATUS = {
  pending_upload: 'uploading',
  uploaded: 'uploaded',
  ocr_pending: 'uploaded',
  ocr_running: 'parsing',
  ocr_succeeded: 'parsed', // 默认；会在 mapBackendRowToFrontendStatus 里按 meta_status 进一步细化
  ocr_failed: 'parse_failed',
  archived: 'archived',
  // deleted 在 GET /documents/ 已被后端过滤掉
}

/**
 * 根据整行判断前端 task_status。
 * 当前后端流水线的"终态"是 status=ocr_succeeded + meta_status=completed（OCR+元数据都跑完，
 * 但本后端版本未实现 AI 匹配患者/归档推荐）。映射规则：
 *   - ocr_succeeded + meta_status=completed  → pending_confirm_new（待归档/新建）
 *   - ocr_succeeded + meta_status!=completed → parsed（保留"解析中"让前端轮询推进）
 *   - 其他 status 按 BACKEND_TO_FRONTEND_STATUS 映射
 */
const mapBackendRowToFrontendStatus = (row) => {
  if (!row) return null
  if (row.status === 'ocr_succeeded') {
    return row.meta_status === 'completed' ? 'pending_confirm_new' : 'parsed'
  }
  return BACKEND_TO_FRONTEND_STATUS[row.status] || row.status
}

const FRONTEND_TO_BACKEND_STATUS = {
  uploading: ['pending_upload'],
  uploaded: ['uploaded', 'ocr_pending'],
  parsing: ['ocr_running'],
  parsed: ['ocr_succeeded'],
  extracted: ['ocr_succeeded'],
  parse_failed: ['ocr_failed'],
  ai_matching: [], // 后端未落地 ai_matching 状态
  pending_confirm_new: [],
  pending_confirm_review: [],
  pending_confirm_uncertain: [],
  auto_archived: [],
  archived: ['archived'],
}

const mapBackendStatusToFrontend = (status) =>
  BACKEND_TO_FRONTEND_STATUS[status] || status

const expandFrontendStatusesToBackend = (statuses = []) => {
  const out = new Set()
  statuses.forEach((s) => {
    const backendList = FRONTEND_TO_BACKEND_STATUS[s]
    if (backendList) backendList.forEach((b) => out.add(b))
    else out.add(s) // 已经是后端词汇表就直接放行
  })
  return Array.from(out)
}

/** 简易格式化文件大小（供前端直接渲染） */
const formatFileSizeForDisplay = (bytes) => {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const toFileItem = (row) => {
  const ext = (row.file_name || '').split('.').pop()?.toLowerCase()
  const fileType = ext || (row.mime_type ? String(row.mime_type).split('/')[1] : null) || 'unknown'
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const metaResult = (meta.result && typeof meta.result === 'object' && !Array.isArray(meta.result))
    ? meta.result
    : meta

  const documentType = row.document_type || row.doc_type || metaResult['文档类型'] || null
  const documentSubtype = row.document_sub_type || metaResult['文档子类型'] || null
  const organizationName = metaResult['机构名称'] || null
  const effectiveDate = row.effective_at || metaResult['文档生效日期'] || null
  const taskStatus = mapBackendRowToFrontendStatus(row)

  // 供前端 DocumentCard / useDocumentFilter / EhrTab LeftPanel 使用的英文 key 元数据
  const normalizedMetadata = {
    documentType,
    // 同时暴露两种大小写拼法：DocumentCard 用 documentSubtype，LeftPanel 用 documentSubType
    documentSubtype,
    documentSubType: documentSubtype,
    organizationName,
    effectiveDate,
    patientName: metaResult['患者姓名'] || null,
    gender: metaResult['患者性别'] || null,
    age: metaResult['患者年龄'] || null,
    docTitle: row.doc_title || metaResult['文档标题'] || null,
    department: metaResult['科室信息'] || null,
    diagnosis: metaResult['诊断'] || null,
  }

  return {
    id: row.id,
    // snake_case（兼容既有调用方）
    file_name: row.file_name,
    file_size: row.file_size,
    file_url: null, // 需要时由 getDocumentTempUrl 单独拉
    file_type: fileType,
    document_type: documentType,
    document_sub_type: documentSubtype,
    task_status: taskStatus,
    meta_status: row.meta_status,
    extract_status: row.extract_status,
    patient_info: row.patient_id
      ? {
          patient_id: row.patient_id,
          name: metaResult['患者姓名'] || null,
          gender: metaResult['患者性别'] || null,
          age: metaResult['患者年龄'] || null,
        }
      : null,
    bound_patient_summary: row.patient_id
      ? {
          name: metaResult['患者姓名'] || null,
          gender: metaResult['患者性别'] || null,
          age: metaResult['患者年龄'] || null,
        }
      : null,
    document_metadata_summary: {
      name: metaResult['患者姓名'] || null,
      gender: metaResult['患者性别'] || null,
      age: metaResult['患者年龄'] || null,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
    // camelCase + 嵌套 metadata，用于 PatientDetail DocumentsTab / EhrTab
    fileName: row.file_name,
    fileSize: formatFileSizeForDisplay(row.file_size),
    fileType,
    documentType,
    documentSubtype,
    documentSubType: documentSubtype,
    uploadTime: row.created_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    effectiveDate,
    status: taskStatus,
    confidence: typeof row.match_score === 'number' ? row.match_score : null,
    metadata: normalizedMetadata,
    raw_metadata: meta,
  }
}

/**
 * 迁移期适配：后端暂无 /documents/search，用现有 GET /documents/ 拉全量，
 * 在前端做过滤/分页/字段映射。接入搜索/分页后端后恢复原实现。
 * 原实现：return request.get('/documents/search', { params })
 */
export const searchUserFiles = async (params = {}) => {
  const {
    page = 1,
    page_size = 50,
    keyword,
    task_status,
    patient_id,
  } = params || {}

  const backendParams = {}
  if (patient_id) backendParams.patientId = patient_id

  const frontendStatusList = typeof task_status === 'string' && task_status
    ? task_status.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  const backendStatusList = expandFrontendStatusesToBackend(frontendStatusList)
  if (backendStatusList.length === 1) backendParams.status = backendStatusList[0]

  const res = await request.get('/documents/', { params: backendParams })
  const rows = Array.isArray(res?.data) ? res.data : []

  let filtered = rows
  if (backendStatusList.length > 1) {
    const set = new Set(backendStatusList)
    filtered = filtered.filter((r) => set.has(r.status))
  }
  if (keyword && String(keyword).trim()) {
    const q = String(keyword).trim().toLowerCase()
    filtered = filtered.filter((r) => (r.file_name || '').toLowerCase().includes(q))
  }

  const total = filtered.length
  const start = (page - 1) * page_size
  const paged = filtered.slice(start, start + page_size)
  const items = paged.map(toFileItem)

  return {
    success: true,
    code: 0,
    message: 'ok',
    data: {
      items,
      total,
      page,
      page_size,
      total_pages: Math.max(1, Math.ceil(total / page_size)),
    },
  }
}

/**
 * 根据文档ID刷新文档状态
 * 用于前端操作某个文档后异步刷新该文档的状态信息
 * @param {string} documentId - 文档ID
 * @returns {Promise} 文档状态信息（与搜索用户文件列表的 item 格式一致）
 */
export const getFileStatusById = (documentId) => {
  return request.get(`/documents/${documentId}/status`)
}

/**
 * 批量获取多个文档的最新状态
 * 用于列表页批量轮询，降低并发请求数
 * @param {string[]} documentIds - 文档ID数组
 * @returns {Promise} - { items: [...] }
 *
 * 迁移期适配：后端无 POST /documents/status/batch，
 * 改用 GET /documents/?ids=... 批量拉，再用 toFileItem 做词汇表映射。
 * 后端落地 status/batch 后恢复：
 *   return request.post('/documents/status/batch', documentIds)
 */
export const getFileStatusesByIds = async (documentIds) => {
  const ids = Array.isArray(documentIds) ? documentIds.filter(Boolean) : []
  if (!ids.length) {
    return { success: true, code: 0, message: 'ok', data: { items: [] } }
  }
  const res = await request.get('/documents/', {
    params: { ids: ids.join(',') },
    _silent: true, // 轮询不弹错
  })
  const rows = Array.isArray(res?.data) ? res.data : []
  return {
    success: true,
    code: 0,
    message: 'ok',
    data: { items: rows.map(toFileItem) },
  }
}

export const getFileListV2Tree = (params = {}) => {
  return request.get('/documents/v2/tree', { params })
}

export const getFileListV2GroupDocuments = (groupId, params = {}) => {
  return request.get(`/documents/v2/groups/${groupId}/documents`, { params })
}

/**
 * V2 重建分组（持久化并查集）
 * @returns {Promise} { success, data: { groups_count, docs_updated } }
 */
export const rebuildGroups = () => {
  return request.post('/documents/v2/rebuild-groups')
}

/**
 * V2 按组执行规则匹配
 * @param {string} groupId
 * @returns {Promise} { success, data: { match_result, match_score, matched_patient_id, candidates, ... } }
 */
export const matchGroup = (groupId) => {
  return request.post(`/documents/v2/groups/${groupId}/match`, {}, {
    timeout: 60000  // 规则匹配最多 60s
  })
}

/**
 * V2 按组确认归档到指定患者
 * @param {string} groupId
 * @param {string} patientId
 * @param {boolean} autoMergeEhr
 * @returns {Promise} { success, data: { archived_count, failed_count, errors } }
 */
export const confirmGroupArchive = (groupId, patientId, autoMergeEhr = true) => {
  return request.post(`/documents/v2/groups/${groupId}/confirm-archive`, {}, {
    params: { patient_id: patientId, auto_merge_ehr: autoMergeEhr },
    timeout: 180000
  })
}

/**
 * V2 为分组创建新患者并归档
 * @param {string} groupId
 * @param {object} patientData - { name, gender, age, ... }
 * @param {boolean} autoMergeEhr
 * @returns {Promise}
 */
export const createPatientAndArchiveGroup = (groupId, patientData, autoMergeEhr = true) => {
  return request.post(`/documents/v2/groups/${groupId}/create-patient-and-archive`, patientData, {
    params: { auto_merge_ehr: autoMergeEhr },
    timeout: 180000
  })
}

/**
 * V2 拖拽变更分组
 * @param {string} documentId
 * @param {string|null} targetGroupId - 目标分组ID，null 表示拆为独立分组
 * @returns {Promise} { success, data: { new_group_id, old_group_id } }
 */
export const moveDocumentToGroup = (documentId, targetGroupId = null) => {
  const params = {}
  if (targetGroupId) params.target_group_id = targetGroupId
  return request.post(`/documents/v2/documents/${documentId}/move-to-group`, {}, { params })
}

/**
 * 上传文档并直接归档到指定患者
 * @param {File} file - 要上传的文件
 * @param {string} patientId - 目标患者ID
 * @param {object} options - 可选参数
 * @param {boolean} options.autoMergeEhr - 是否自动合并病历数据（默认true）
 * @param {string} options.parserType - OCR解析器类型（默认textin）
 * @param {Function} onProgress - 上传进度回调函数
 * @returns {Promise} 上传并归档结果
 */
export const uploadAndArchiveToPatient = (file, patientId, options = {}, onProgress) => {
  const { autoMergeEhr = true, parserType = 'textin' } = options
  
  const formData = new FormData()
  formData.append('file', file)
  
  return request.post('/documents/upload-and-archive', formData, {
    params: {
      patient_id: patientId,
      auto_merge_ehr: autoMergeEhr,
      parser_type: parserType
    },
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 180000, // 3分钟超时，因为包含OCR和AI抽取
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percent)
      }
    }
  })
}

// ==================== 异步任务接口 ====================

/**
 * 异步上传文档并归档到指定患者
 * 同步阶段只上传文件，OCR/AI/归档在后台异步执行
 * @param {File} file - 要上传的文件
 * @param {string} patientId - 目标患者ID
 * @param {object} options - 可选参数
 * @param {boolean} options.autoMergeEhr - 是否自动合并病历数据（默认true）
 * @param {string} options.parserType - OCR解析器类型（默认textin）
 * @param {Function} onProgress - 上传进度回调函数
 * @returns {Promise} - { task_id, document_id, progress_url }
 */
export const uploadAndArchiveAsync = (file, patientId, options = {}, onProgress) => {
  const { autoMergeEhr = true, parserType = 'textin', targetSection = null, projectId = null } = options
  
  const formData = new FormData()
  formData.append('file', file)
  
  const params = {
    patient_id: patientId,
    auto_merge_ehr: autoMergeEhr,
    parser_type: parserType
  }
  if (targetSection) params.target_section = targetSection
  if (projectId) params.project_id = projectId
  
  return request.post('/documents/upload-and-archive/async', formData, {
    params,
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    timeout: 60000, // 1分钟超时（只是上传阶段）
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percent)
      }
    }
  })
}

/**
 * 异步 AI 抽取病历结构化数据
 * @param {string} documentId - 文档ID
 * @returns {Promise} - { task_id, document_id, progress_url }
 */
export const extractEhrDataAsync = (documentId) => {
  return request.post(`/documents/${documentId}/extract-ehr/async`)
}

/**
 * 异步 AI 匹配患者
 * @param {string} documentId - 文档ID
 * @returns {Promise} - { task_id, document_id, progress_url }
 */
export const aiMatchPatientAsync = (documentId) => {
  return request.post(`/documents/${documentId}/ai-match-patient/async`)
}

/**
 * 批量异步 AI 匹配患者
 * @param {string[]} documentIds - 文档ID数组
 * @returns {Promise} - { task_id, document_count, progress_url }
 */
export const batchAiMatchAsync = (documentIds) => {
  return request.post('/documents/batch-ai-match/async', documentIds)
}

/**
 * 查询文档任务进度
 * @param {string} taskId - 任务ID
 * @returns {Promise} - { task_id, status, progress, current_step, message, ... }
 */
export const getDocumentTaskProgress = (taskId, { silent = false } = {}) => {
  return request.get(`/documents/tasks/${taskId}/progress`, { _silent: silent })
}

/**
 * 轮询文档任务进度直到完成
 * @param {string} taskId - 任务ID
 * @param {object} options - 选项
 * @param {number} options.interval - 轮询间隔（毫秒），默认2000
 * @param {number} options.timeout - 超时时间（毫秒），默认600000（10分钟）
 * @param {Function} options.onProgress - 进度回调
 * @returns {Promise} - 最终结果
 */
export const pollDocumentTaskProgress = (taskId, options = {}) => {
  const { interval = 2000, timeout = 600000, onProgress } = options
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    
    const poll = async () => {
      try {
        const response = await getDocumentTaskProgress(taskId, { silent: true })
        
        if (!response.success) {
          reject(new Error(response.message || '查询任务进度失败'))
          return
        }
        
        const progress = response.data
        
        // 调用进度回调
        if (onProgress) {
          onProgress(progress)
        }
        
        // 检查任务状态
        if (progress.status === 'completed') {
          resolve(progress)
          return
        }
        
        if (progress.status === 'failed') {
          reject(new Error(progress.message || '任务执行失败'))
          return
        }
        
        // 检查超时
        if (Date.now() - startTime > timeout) {
          reject(new Error('任务执行超时'))
          return
        }
        
        // 继续轮询
        setTimeout(poll, interval)
        
      } catch (error) {
        reject(error)
      }
    }
    
    // 开始轮询
    poll()
  })
}

/**
 * 批量检查文件是否已上传（用于断点续传）
 * @param {Array} fingerprints - 文件指纹列表，格式：[{fileName: "xxx.jpg", fileSize: 12345}, ...]
 * @returns {Promise} 检查结果
 */
export const checkDuplicateFiles = (fingerprints) => {
  return request.post('/documents/check-duplicates', fingerprints)
}

export default {
  uploadDocument,
  uploadDocuments,
  getDocumentList,
  deleteDocument,
  deleteDocuments,
  getDocumentTempUrl,
  archiveDocument,
  unarchiveDocument,
  changeArchivePatient,
  parseDocument,
  getDocumentDetail,
  getParseResult,
  getParseProgress,
  parseDocuments,
  extractEhrData,
  extractDocumentMetadata,
  markDocumentReview,
  getDocumentOperationHistory,
  aiMatchPatient,
  aiExtractAndMatchPatient,
  getDocumentAiMatchInfo,
  confirmCreatePatientAndArchive,
  batchCreatePatientAndArchive,
  confirmAutoArchive,
  batchConfirmAutoArchive,
  searchUserFiles,
  getFileStatusesByIds,
  getFileStatusById,
  // FileList V2
  getFileListV2Tree,
  getFileListV2GroupDocuments,
  rebuildGroups,
  matchGroup,
  confirmGroupArchive,
  createPatientAndArchiveGroup,
  moveDocumentToGroup,
  uploadAndArchiveToPatient,
  // 异步任务接口
  uploadAndArchiveAsync,
  extractEhrDataAsync,
  aiMatchPatientAsync,
  batchAiMatchAsync,
  getDocumentTaskProgress,
  pollDocumentTaskProgress,
  checkDuplicateFiles
}
