/**
 * 管理员后台接口。
 *
 * 当前实现：
 *   GET /api/v1/admin/extraction-tasks
 *     把科研项目 CRF 批次、电子病历夹 EHR 抽取、靶向抽取统一汇成一张列表，
 *     每行带进度、状态、最新错误信息，供 /admin 页面「抽取任务」Tab 展示。
 *
 * 说明：
 *   - 三类任务分别来自 project_extraction_tasks + ehr_extraction_jobs。
 *   - 接口只读，严格无副作用（不写 DB、不触发 stale-sweep，避免 P10 那类问题）。
 *   - 后续步骤（详情弹窗、LLM 日志、SSE）会在同文件扩展。
 */
import { Router, Request, Response } from 'express'
import db from '../db.js'
import { CRF_SERVICE_URL, crfServiceSubmitBatch } from '../services/crfServiceClient.js'

const router = Router()

function nowIso() {
  return new Date().toISOString()
}

// ─── JSON 解析工具 ───────────────────────────────────────────────────────────

function parseJsonArray(raw: unknown): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(raw: unknown): Record<string, any> {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseJsonValue(raw: unknown): unknown {
  if (raw == null) return null
  if (typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed)
  } catch {
    return raw
  }
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))]
}

// ─── 任务状态枚举 ────────────────────────────────────────────────────────────

type UnifiedStatus = 'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled' | 'idle'
type TaskType = 'project_crf' | 'patient_ehr' | 'targeted'

interface UnifiedTask {
  id: string                              // row 主键（task_id 或 job_id）
  task_type: TaskType
  source_table: 'project_extraction_tasks' | 'ehr_extraction_jobs'
  status: UnifiedStatus
  patient_id: string | null
  patient_name: string | null
  project_id: string | null
  project_name: string | null
  schema_id: string | null
  schema_name: string | null
  schema_code: string | null
  instance_type: string | null
  target_section: string | null
  document_count: number
  completed_count: number
  failed_count: number
  running_count: number
  pending_count: number
  progress: number                        // 0–100
  primary_job_id: string | null           // 用于后续订阅 SSE (crf:progress:{job_id})
  document_ids: string[]
  job_ids: string[]
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  error_message: string | null
  model_name: string | null
  prompt_version: string | null
}

// ─── 任务汇总逻辑 ────────────────────────────────────────────────────────────

/**
 * 汇总一条 project_extraction_tasks 行 + 它关联的 ehr_extraction_jobs。
 * 纯函数：不改动 DB。行为对齐 projects.ts::summarizeProjectTask，但去掉副作用。
 */
function summarizeProjectTaskReadOnly(taskRow: any): UnifiedTask {
  const jobIds = normalizeStringList(parseJsonArray(taskRow.job_ids_json))
  const patientIds = normalizeStringList(parseJsonArray(taskRow.patient_ids_json))
  const documentIds = normalizeStringList(parseJsonArray(taskRow.document_ids_json))
  const summary = parseJsonObject(taskRow.summary_json)

  let jobRows: any[] = []
  if (jobIds.length > 0) {
    jobRows = db.prepare(`
      SELECT id, status, last_error, started_at, completed_at
      FROM ehr_extraction_jobs
      WHERE id IN (${jobIds.map(() => '?').join(',')})
    `).all(...jobIds) as any[]
  }

  let pending = 0
  let running = 0
  let completed = 0
  let failed = 0
  let latestError: string | null = null

  for (const j of jobRows) {
    if (j.status === 'pending') pending += 1
    else if (j.status === 'running') running += 1
    else if (j.status === 'completed') completed += 1
    else if (j.status === 'failed') {
      failed += 1
      if (j.last_error) latestError = String(j.last_error).slice(0, 500)
    }
  }

  const total = jobIds.length
  let status: UnifiedStatus = String(taskRow.status || 'pending') as UnifiedStatus
  if (status !== 'cancelled' && total > 0) {
    if (failed === total) status = 'failed'
    else if (completed + failed === total) status = failed > 0 ? 'completed_with_errors' : 'completed'
    else if (running > 0) status = 'running'
    else if (pending > 0) status = 'pending'
  } else if (status !== 'cancelled' && total === 0) {
    status = summary.submitted_job_count > 0 ? 'running' : 'idle'
  }

  const progress = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0

  return {
    id: String(taskRow.id),
    task_type: 'project_crf',
    source_table: 'project_extraction_tasks',
    status,
    patient_id: patientIds.length === 1 ? patientIds[0] : null,
    patient_name: null,
    project_id: taskRow.project_id || null,
    project_name: taskRow.project_name || null,
    schema_id: taskRow.schema_id || null,
    schema_name: taskRow.schema_name || null,
    schema_code: taskRow.schema_code || null,
    instance_type: 'project_crf',
    target_section: null,
    document_count: documentIds.length || total,
    completed_count: completed,
    failed_count: failed,
    running_count: running,
    pending_count: pending,
    progress,
    primary_job_id: jobIds[0] || null,
    document_ids: documentIds,
    job_ids: jobIds,
    started_at: taskRow.started_at || taskRow.created_at || null,
    finished_at: taskRow.finished_at || null,
    created_at: taskRow.created_at,
    updated_at: taskRow.updated_at || taskRow.created_at,
    error_message: latestError,
    model_name: null,
    prompt_version: null,
  }
}

/**
 * 把一个独立的 ehr_extraction_job（不在任何 project_extraction_tasks 里）
 * 包装成 UnifiedTask。既覆盖电子病历夹批量抽取，也覆盖靶向抽取。
 */
function summarizeJobRow(jobRow: any): UnifiedTask {
  // 靶向判定：
  //   1) 关联的 extraction_run.target_mode == 'targeted_section'（物化后能看到）；
  //   2) 或源文档 documents.metadata.target_section 非空（物化前也能看到）。
  let targetSection: string | null = null
  if (jobRow.run_target_mode === 'targeted_section' && jobRow.run_target_path) {
    targetSection = String(jobRow.run_target_path)
  } else if (typeof jobRow.job_type === 'string' && jobRow.job_type.startsWith('extract:target:')) {
    targetSection = jobRow.job_type.slice('extract:target:'.length).trim() || null
  } else if (jobRow.doc_metadata) {
    const meta = parseJsonObject(jobRow.doc_metadata)
    const ts = meta.target_section
    if (typeof ts === 'string' && ts.trim()) targetSection = ts.trim()
  }

  const isTargeted = !!targetSection

  const jobStatus = String(jobRow.status || 'pending')
  let unifiedStatus: UnifiedStatus = 'pending'
  let completed = 0
  let failed = 0
  let running = 0
  let pending = 0
  switch (jobStatus) {
    case 'completed':
      unifiedStatus = 'completed'
      completed = 1
      break
    case 'failed':
      unifiedStatus = 'failed'
      failed = 1
      break
    case 'running':
      unifiedStatus = 'running'
      running = 1
      break
    case 'cancelled':
      unifiedStatus = 'cancelled'
      break
    default:
      unifiedStatus = 'pending'
      pending = 1
  }

  const progress = unifiedStatus === 'completed' || unifiedStatus === 'failed'
    ? 100
    : unifiedStatus === 'running' ? 50 : 0

  return {
    id: String(jobRow.id),
    task_type: isTargeted ? 'targeted' : 'patient_ehr',
    source_table: 'ehr_extraction_jobs',
    status: unifiedStatus,
    patient_id: jobRow.patient_id || null,
    patient_name: jobRow.patient_name || null,
    project_id: null,
    project_name: null,
    schema_id: jobRow.schema_id || null,
    schema_name: jobRow.schema_name || null,
    schema_code: jobRow.schema_code || null,
    instance_type: isTargeted ? 'targeted' : 'patient_ehr',
    target_section: targetSection,
    document_count: 1,
    completed_count: completed,
    failed_count: failed,
    running_count: running,
    pending_count: pending,
    progress,
    primary_job_id: String(jobRow.id),
    document_ids: jobRow.document_id ? [String(jobRow.document_id)] : [],
    job_ids: [String(jobRow.id)],
    started_at: jobRow.started_at || null,
    finished_at: jobRow.completed_at || null,
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at || jobRow.created_at,
    error_message: jobRow.last_error ? String(jobRow.last_error).slice(0, 500) : null,
    model_name: jobRow.run_model_name || null,
    prompt_version: jobRow.run_prompt_version || null,
  }
}

function enrichJobRowsWithLatestRun(jobRows: any[]): any[] {
  const instanceIds = Array.from(new Set(
    jobRows
      .map((row) => String(row.result_extraction_run_id || ''))
      .filter((id) => id.startsWith('si_'))
  ))
  if (instanceIds.length === 0) return jobRows

  const runRows = db.prepare(`
    SELECT er.instance_id, er.document_id, er.target_mode, er.target_path,
           er.model_name, er.prompt_version, er.created_at
    FROM extraction_runs er
    WHERE er.instance_id IN (${instanceIds.map(() => '?').join(',')})
    ORDER BY er.created_at DESC
  `).all(...instanceIds) as any[]

  const runMap = new Map<string, any>()
  for (const run of runRows) {
    const key = `${run.instance_id}:${run.document_id || ''}`
    if (!runMap.has(key)) runMap.set(key, run)
  }

  return jobRows.map((row) => {
    if (row.run_target_mode || row.run_target_path) return row
    const run = runMap.get(`${row.result_extraction_run_id || ''}:${row.document_id || ''}`)
    if (!run) return row
    return {
      ...row,
      run_target_mode: run.target_mode,
      run_target_path: run.target_path,
      run_model_name: run.model_name,
      run_prompt_version: run.prompt_version,
    }
  })
}

// ─── 路由 ───────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/extraction-tasks
 *
 * Query:
 *   task_type?: 'project_crf' | 'patient_ehr' | 'targeted'
 *   status?:    'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
 *   patient_id?: string
 *   project_id?: string
 *   limit?: number (默认 50, 最大 200)
 *   offset?: number (默认 0)
 */
router.get('/extraction-tasks', (req: Request, res: Response) => {
  try {
    const taskTypeFilter = typeof req.query.task_type === 'string' ? req.query.task_type : ''
    const statusFilter = typeof req.query.status === 'string' ? req.query.status : ''
    const patientIdFilter = typeof req.query.patient_id === 'string' ? req.query.patient_id : ''
    const projectIdFilter = typeof req.query.project_id === 'string' ? req.query.project_id : ''
    const limitParam = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
    const offsetParam = Math.max(0, Number(req.query.offset) || 0)

    // 1) 项目 CRF 批次
    const projectTaskRows = db.prepare(`
      SELECT pet.*,
             p.project_name AS project_name,
             s.name AS schema_name,
             s.code AS schema_code
      FROM project_extraction_tasks pet
      LEFT JOIN projects p ON p.id = pet.project_id
      LEFT JOIN schemas  s ON s.id = pet.schema_id
    `).all() as any[]

    const projectTasks: UnifiedTask[] = projectTaskRows.map(summarizeProjectTaskReadOnly)

    // 2) 独立 ehr_extraction_jobs（不在任何项目批次里）。
    //    用 job_ids_json LIKE 做排除（批次记录数极少，扫一次即可）。
    const projectJobIdSet = new Set<string>()
    for (const row of projectTaskRows) {
      for (const jid of normalizeStringList(parseJsonArray(row.job_ids_json))) {
        projectJobIdSet.add(jid)
      }
    }

    const allJobRows = db.prepare(`
      SELECT
        j.id, j.document_id, j.patient_id, j.schema_id, j.job_type, j.status,
        j.last_error, j.started_at, j.completed_at, j.created_at, j.updated_at,
        j.result_extraction_run_id,
        pat.name AS patient_name,
        sch.name AS schema_name,
        sch.code AS schema_code,
        doc.metadata AS doc_metadata,
        er.target_mode AS run_target_mode,
        er.target_path AS run_target_path,
        er.model_name  AS run_model_name,
        er.prompt_version AS run_prompt_version
      FROM ehr_extraction_jobs j
      LEFT JOIN patients  pat ON pat.id = j.patient_id
      LEFT JOIN schemas   sch ON sch.id = j.schema_id
      LEFT JOIN documents doc ON doc.id = j.document_id
      LEFT JOIN extraction_runs er ON er.id = j.result_extraction_run_id
      WHERE j.job_type LIKE 'extract%'
    `).all() as any[]

    const standaloneJobs: UnifiedTask[] = allJobRows
      .filter((r) => !projectJobIdSet.has(String(r.id)))
      .map((r) => r)

    const standaloneTasks: UnifiedTask[] = enrichJobRowsWithLatestRun(standaloneJobs)
      .map(summarizeJobRow)

    // 3) 合并、筛选、排序
    let merged: UnifiedTask[] = [...projectTasks, ...standaloneTasks]

    if (taskTypeFilter) {
      merged = merged.filter((t) => t.task_type === taskTypeFilter)
    }
    if (statusFilter) {
      // completed_with_errors 归类到 completed 方便前端筛选
      merged = merged.filter((t) => {
        if (statusFilter === 'completed') return t.status === 'completed' || t.status === 'completed_with_errors'
        return t.status === statusFilter
      })
    }
    if (patientIdFilter) {
      merged = merged.filter((t) => t.patient_id === patientIdFilter || t.document_ids.length === 0)
    }
    if (projectIdFilter) {
      merged = merged.filter((t) => t.project_id === projectIdFilter)
    }

    merged.sort((a, b) => {
      const aTs = a.updated_at || a.created_at
      const bTs = b.updated_at || b.created_at
      return bTs.localeCompare(aTs)
    })

    const total = merged.length
    const items = merged.slice(offsetParam, offsetParam + limitParam)

    // 对 project 行的 patient_name 做二次富化（它 summary 只有 patient_ids 列表，没查 name）
    const projectRowsNeedingPatient = items.filter((t) => t.task_type === 'project_crf' && t.patient_id && !t.patient_name)
    if (projectRowsNeedingPatient.length > 0) {
      const ids = Array.from(new Set(projectRowsNeedingPatient.map((t) => t.patient_id!)))
      const nameRows = db.prepare(`
        SELECT id, name FROM patients WHERE id IN (${ids.map(() => '?').join(',')})
      `).all(...ids) as any[]
      const nameMap: Record<string, string> = {}
      for (const r of nameRows) nameMap[r.id] = r.name || ''
      for (const t of projectRowsNeedingPatient) {
        if (t.patient_id) t.patient_name = nameMap[t.patient_id] || null
      }
    }

    // 统计各分类 count（用于前端筛选 tab 计数），在全集上统计（不受当前 filter 限制）
    const allTasks = [...projectTasks, ...standaloneJobs]
    const typeCounts = {
      all: allTasks.length,
      project_crf: allTasks.filter((t) => t.task_type === 'project_crf').length,
      patient_ehr: allTasks.filter((t) => t.task_type === 'patient_ehr').length,
      targeted: allTasks.filter((t) => t.task_type === 'targeted').length,
    }
    const statusCounts = {
      pending: allTasks.filter((t) => t.status === 'pending').length,
      running: allTasks.filter((t) => t.status === 'running').length,
      completed: allTasks.filter((t) => t.status === 'completed' || t.status === 'completed_with_errors').length,
      failed: allTasks.filter((t) => t.status === 'failed').length,
      cancelled: allTasks.filter((t) => t.status === 'cancelled').length,
    }

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data: {
        items,
        total,
        limit: limitParam,
        offset: offsetParam,
        type_counts: typeCounts,
        status_counts: statusCounts,
      },
    })
  } catch (err: any) {
    console.error('[admin/extraction-tasks] query error:', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '查询抽取任务列表失败',
      data: null,
    })
  }
})

/**
 * POST /api/v1/admin/extraction-tasks/:id/resubmit
 *
 * 重新投递抽取任务到 crf-service。用于处理 Celery worker 旧代码/异常退出导致的
 * DB 仍停留 pending、但 broker 中已经没有消息的“假等待”任务，也支持 failed/cancelled
 * 任务重新提交。
 */
router.post('/extraction-tasks/:id/resubmit', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const sourceHint = typeof req.body?.source === 'string' ? req.body.source : ''
    const submittedAt = nowIso()

    const projectRow = sourceHint !== 'job'
      ? db.prepare(`SELECT * FROM project_extraction_tasks WHERE id = ?`).get(id) as any
      : null

    if (projectRow) {
      const documentIds = normalizeStringList(parseJsonArray(projectRow.document_ids_json))
      const oldJobIds = normalizeStringList(parseJsonArray(projectRow.job_ids_json))
      if (documentIds.length === 0) {
        return res.status(400).json({ success: false, code: 400, message: '该项目任务没有可重新提交的文档', data: null })
      }

      if (oldJobIds.length > 0) {
        db.prepare(`
          UPDATE ehr_extraction_jobs
          SET status = 'cancelled',
              last_error = COALESCE(last_error, '管理员重新提交项目抽取任务，旧任务已取消'),
              completed_at = COALESCE(completed_at, ?),
              updated_at = ?
          WHERE id IN (${oldJobIds.map(() => '?').join(',')})
            AND status IN ('pending', 'running')
        `).run(submittedAt, submittedAt, ...oldJobIds)
      }

      const docRows = db.prepare(`
        SELECT id, patient_id
        FROM documents
        WHERE id IN (${documentIds.map(() => '?').join(',')})
          AND status != 'deleted'
        ORDER BY created_at ASC
      `).all(...documentIds) as any[]

      const docsByPatient = new Map<string, string[]>()
      for (const row of docRows) {
        const patientId = String(row.patient_id || '')
        if (!patientId) continue
        const list = docsByPatient.get(patientId) || []
        list.push(String(row.id))
        docsByPatient.set(patientId, list)
      }

      const submittedJobIds: string[] = []
      const submittedDocumentIds: string[] = []
      const submittedPatientIds: string[] = []
      const skippedPatients: any[] = []

      for (const [patientId, patientDocIds] of docsByPatient.entries()) {
        const response = await crfServiceSubmitBatch({
          patient_id: patientId,
          schema_id: projectRow.schema_id,
          project_id: projectRow.project_id,
          document_ids: patientDocIds,
          instance_type: 'project_crf',
        })

        if (!response.ok) {
          const errorText = await response.text()
          return res.status(response.status).json({
            success: false,
            code: response.status,
            message: errorText || '重新提交项目抽取任务失败',
            data: null,
          })
        }

        const result = await response.json()
        const jobs = Array.isArray(result?.jobs) ? result.jobs : []
        const jobIds = normalizeStringList(jobs.map((job: any) => job?.job_id))
        if (jobIds.length === 0) {
          skippedPatients.push({ patient_id: patientId, reason: 'no_new_jobs' })
          continue
        }
        submittedPatientIds.push(patientId)
        submittedJobIds.push(...jobIds)
        submittedDocumentIds.push(...patientDocIds)
      }

      if (submittedJobIds.length === 0) {
        return res.status(409).json({
          success: false,
          code: 409,
          message: '没有可重新提交的任务；可能所有文档已有活跃任务',
          data: { skipped_patients: skippedPatients },
        })
      }

      const summary = parseJsonObject(projectRow.summary_json)
      db.prepare(`
        UPDATE project_extraction_tasks
        SET status = 'running',
            job_ids_json = ?,
            patient_ids_json = ?,
            document_ids_json = ?,
            summary_json = ?,
            started_at = ?,
            finished_at = NULL,
            cancelled_at = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(
        JSON.stringify(submittedJobIds),
        JSON.stringify(submittedPatientIds),
        JSON.stringify(submittedDocumentIds),
        JSON.stringify({
          ...summary,
          resubmitted_at: submittedAt,
          resubmitted_from_task_id: projectRow.id,
          cancelled_old_job_ids: oldJobIds,
          resubmitted_job_count: submittedJobIds.length,
          skipped_patients: skippedPatients,
        }),
        submittedAt,
        submittedAt,
        id,
      )

      return res.json({
        success: true,
        code: 0,
        message: `已重新提交 ${submittedJobIds.length} 个项目抽取任务`,
        data: {
          task_id: id,
          job_ids: submittedJobIds,
          submitted_patient_count: submittedPatientIds.length,
          submitted_document_count: submittedDocumentIds.length,
          skipped_patients: skippedPatients,
        },
      })
    }

    const jobRow = sourceHint !== 'project'
      ? db.prepare(`
          SELECT j.*, doc.metadata AS doc_metadata
          FROM ehr_extraction_jobs j
          LEFT JOIN documents doc ON doc.id = j.document_id
          WHERE j.id = ?
        `).get(id) as any
      : null

    if (!jobRow) {
      return res.status(404).json({ success: false, code: 404, message: '未找到可重新提交的抽取任务', data: null })
    }

    if (jobRow.status === 'running') {
      return res.status(409).json({ success: false, code: 409, message: '任务正在运行中，无需重新提交', data: null })
    }

    const docMeta = parseJsonObject(jobRow.doc_metadata)
    const targetSection = typeof docMeta.target_section === 'string' && docMeta.target_section.trim()
      ? docMeta.target_section.trim()
      : undefined

    const response = await crfServiceSubmitBatch({
      patient_id: jobRow.patient_id,
      schema_id: jobRow.schema_id,
      document_ids: [jobRow.document_id],
      instance_type: targetSection ? 'patient_ehr' : 'patient_ehr',
      target_section: targetSection,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(response.status).json({
        success: false,
        code: response.status,
        message: errorText || '重新提交抽取任务失败',
        data: null,
      })
    }

    const result = await response.json()
    const jobs = Array.isArray(result?.jobs) ? result.jobs : []
    const newJobId = jobs[0]?.job_id || null
    if (!newJobId) {
      return res.status(409).json({
        success: false,
        code: 409,
        message: '没有创建或复用到可投递的任务',
        data: result,
      })
    }

    return res.json({
      success: true,
      code: 0,
      message: newJobId === id ? '已重新投递当前任务' : '已创建并提交新的抽取任务',
      data: {
        task_id: newJobId,
        original_task_id: id,
        job_ids: [newJobId],
      },
    })
  } catch (err: any) {
    console.error('[admin/extraction-tasks/:id/resubmit] error:', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '重新提交抽取任务失败',
      data: null,
    })
  }
})

interface LLMCallPair {
  call_id: string | null
  document_id: string | null
  task_name: string | null
  task_path: string | null
  started_at: string | null
  finished_at: string | null
  elapsed_ms: number | null
  status: 'success' | 'error' | 'pending'
  instruction: string | null
  user_message: string | null
  extracted_raw: unknown
  parsed: unknown
  validation_log: unknown
  error: string | null
}

// ─── llm_call_logs 数据库查询 ───────────────────────────────────────────────
//
// crf-service 把每次 LLM 调用写入 llm_call_logs 表（含 job_id），
// 这里仅用 job_id 精确拉取，不再从 JSONL 做软关联。

function readLlmCallsFromDb(jobIds: string[]): LLMCallPair[] {
  if (jobIds.length === 0) return []
  // 表由 db.ts 里 llmCallLogsDdl 创建；历史库可能尚未建，catch 后返回空列表。
  let rows: any[] = []
  try {
    rows = db.prepare(`
      SELECT call_id, job_id, document_id, task_name, task_path,
             status, started_at, finished_at, elapsed_ms,
             instruction, user_message, extracted_raw, parsed, validation_log,
             error_message
      FROM llm_call_logs
      WHERE job_id IN (${jobIds.map(() => '?').join(',')})
      ORDER BY COALESCE(started_at, created_at) ASC
    `).all(...jobIds) as any[]
  } catch (err) {
    console.warn('[admin/extraction-tasks] llm_call_logs 查询失败:', err)
    return []
  }

  const parseMaybeJson = (raw: unknown): unknown => {
    if (raw == null) return null
    if (typeof raw !== 'string') return raw
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed) } catch { return raw }
    }
    return raw
  }

  return rows.map((r) => ({
    call_id: String(r.call_id),
    document_id: r.document_id || null,
    task_name: r.task_name || null,
    task_path: r.task_path ? (parseMaybeJson(r.task_path) as any) : null,
    started_at: r.started_at || null,
    finished_at: r.finished_at || null,
    elapsed_ms: r.elapsed_ms ?? null,
    status: (r.status === 'success' || r.status === 'error' || r.status === 'pending')
      ? r.status as 'success' | 'error' | 'pending'
      : 'pending',
    instruction: r.instruction ?? null,
    user_message: r.user_message ?? null,
    extracted_raw: parseMaybeJson(r.extracted_raw),
    parsed: parseMaybeJson(r.parsed),
    validation_log: parseMaybeJson(r.validation_log),
    error: r.error_message ? String(r.error_message).slice(0, 2000) : null,
  }))
}

// ─── 详情接口 ───────────────────────────────────────────────────────────────

interface JobDetail {
  id: string
  document_id: string | null
  document_name: string | null
  patient_id: string | null
  patient_name: string | null
  status: string
  attempt_count: number
  max_attempts: number
  last_error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  extraction_run: ExtractionRunDetail | null
}

interface ExtractionRunDetail {
  id: string
  instance_id: string | null
  target_mode: string | null
  target_path: string | null
  model_name: string | null
  prompt_version: string | null
  status: string | null
  started_at: string | null
  finished_at: string | null
  error_message: string | null
  field_candidate_count: number
  field_with_evidence_count: number
  extracted_fields: ExtractedFieldDetail[]
}

interface ExtractedFieldDetail {
  id: string
  field_path: string
  value: unknown
  source_text: string | null
  source_document_id: string | null
  source_document_name: string | null
  source_page: number | null
  confidence: number | null
  created_at: string | null
}

function buildJobDetails(jobRows: any[]): JobDetail[] {
  if (jobRows.length === 0) return []

  // 说明：当前 crf-service `complete_job(conn, job_id, instance_id)` 把 schema_instance.id 错
  //      塞进了 result_extraction_run_id（语义错位，见 audit 里的 P24 占位）。因此这里做兼容：
  //      先当作 extraction_runs.id 查，查不到再按 instance_id + document_id 匹配最接近的 run。
  const rawIds: string[] = jobRows
    .map((j) => j.result_extraction_run_id)
    .filter((v): v is string => !!v)
  const uniqRawIds = Array.from(new Set(rawIds))

  const runMap = new Map<string, ExtractionRunDetail>()   // key = raw id
  if (uniqRawIds.length > 0) {
    // 第一步：按 er.id 直查
    const directRows = db.prepare(`
      SELECT er.id, er.instance_id, er.target_mode, er.target_path,
             er.model_name, er.prompt_version, er.status,
             er.started_at, er.finished_at, er.error_message
      FROM extraction_runs er
      WHERE er.id IN (${uniqRawIds.map(() => '?').join(',')})
    `).all(...uniqRawIds) as any[]
    const directHit = new Map<string, any>()
    for (const r of directRows) directHit.set(String(r.id), r)

    // 第二步：剩下的按 instance_id 查，同时要跟 job.document_id 对齐
    const missingIds = uniqRawIds.filter((id) => !directHit.has(id))
    const instanceMatched = new Map<string, any[]>()   // instance_id -> 该 instance 下所有 runs
    if (missingIds.length > 0) {
      const instRows = db.prepare(`
        SELECT er.id, er.instance_id, er.document_id, er.target_mode, er.target_path,
               er.model_name, er.prompt_version, er.status,
               er.started_at, er.finished_at, er.error_message
        FROM extraction_runs er
        WHERE er.instance_id IN (${missingIds.map(() => '?').join(',')})
        ORDER BY er.created_at DESC
      `).all(...missingIds) as any[]
      for (const r of instRows) {
        const k = String(r.instance_id)
        if (!instanceMatched.has(k)) instanceMatched.set(k, [])
        instanceMatched.get(k)!.push(r)
      }
    }

    // 第三步：为每个 job 选出最合适的 run
    for (const job of jobRows) {
      const raw = job.result_extraction_run_id
      if (!raw) continue
      const rawKey = String(raw)
      if (runMap.has(rawKey + ':' + (job.document_id || ''))) continue

      let chosen: any = directHit.get(rawKey) || null
      if (!chosen) {
        const candidates = instanceMatched.get(rawKey) || []
        if (job.document_id) {
          chosen = candidates.find((r) => r.document_id === job.document_id) || candidates[0] || null
        } else {
          chosen = candidates[0] || null
        }
      }
      if (chosen) {
        runMap.set(rawKey + ':' + (job.document_id || ''), chosen as any)
      }
    }

    // 把 chosen 统一转成 runRows，后面查 field stats
    const chosenRunIds = Array.from(new Set(
      Array.from(runMap.values()).map((r: any) => String(r.id)).filter(Boolean)
    ))
    const statsMap = new Map<string, { total: number; with_evidence: number }>()
    const fieldsMap = new Map<string, ExtractedFieldDetail[]>()
    if (chosenRunIds.length > 0) {
      const statsRows = db.prepare(`
        SELECT extraction_run_id,
               COUNT(*) AS field_total,
               SUM(CASE WHEN source_text IS NOT NULL AND source_text != '' THEN 1 ELSE 0 END) AS with_evidence
        FROM field_value_candidates
        WHERE extraction_run_id IN (${chosenRunIds.map(() => '?').join(',')})
        GROUP BY extraction_run_id
      `).all(...chosenRunIds) as any[]
      for (const r of statsRows) {
        statsMap.set(String(r.extraction_run_id), {
          total: Number(r.field_total) || 0,
          with_evidence: Number(r.with_evidence) || 0,
        })
      }

      const fieldRows = db.prepare(`
        SELECT fvc.id, fvc.extraction_run_id, fvc.field_path, fvc.value_json,
               fvc.source_text, fvc.source_document_id, fvc.source_page,
               fvc.confidence, fvc.created_at, d.file_name AS source_document_name
        FROM field_value_candidates fvc
        LEFT JOIN documents d ON d.id = fvc.source_document_id
        WHERE fvc.extraction_run_id IN (${chosenRunIds.map(() => '?').join(',')})
        ORDER BY fvc.extraction_run_id, fvc.created_at ASC, fvc.field_path ASC
      `).all(...chosenRunIds) as any[]
      for (const r of fieldRows) {
        const key = String(r.extraction_run_id)
        const list = fieldsMap.get(key) || []
        if (list.length >= 80) continue
        list.push({
          id: String(r.id),
          field_path: String(r.field_path || ''),
          value: parseJsonValue(r.value_json),
          source_text: r.source_text || null,
          source_document_id: r.source_document_id || null,
          source_document_name: r.source_document_name || null,
          source_page: r.source_page == null ? null : Number(r.source_page),
          confidence: r.confidence == null ? null : Number(r.confidence),
          created_at: r.created_at || null,
        })
        fieldsMap.set(key, list)
      }
    }

    // 把 runMap 中的原始行转成 ExtractionRunDetail
    const detailMap = new Map<string, ExtractionRunDetail>()
    for (const [key, r] of runMap.entries()) {
      const stat = statsMap.get(String(r.id)) || { total: 0, with_evidence: 0 }
      detailMap.set(key, {
        id: String(r.id),
        instance_id: r.instance_id || null,
        target_mode: r.target_mode || null,
        target_path: r.target_path || null,
        model_name: r.model_name || null,
        prompt_version: r.prompt_version || null,
        status: r.status || null,
        started_at: r.started_at || null,
        finished_at: r.finished_at || null,
        error_message: r.error_message || null,
        field_candidate_count: stat.total,
        field_with_evidence_count: stat.with_evidence,
        extracted_fields: fieldsMap.get(String(r.id)) || [],
      })
    }
    // 把 runMap 替换掉，后面 jobs 映射用 detailMap
    runMap.clear()
    for (const [k, v] of detailMap.entries()) runMap.set(k, v as unknown as any)
  }

  return jobRows.map((j) => {
    const key = j.result_extraction_run_id
      ? String(j.result_extraction_run_id) + ':' + (j.document_id || '')
      : null
    const run = key ? (runMap.get(key) as unknown as ExtractionRunDetail) : null
    return {
      id: String(j.id),
      document_id: j.document_id || null,
      document_name: j.document_name || null,
      patient_id: j.patient_id || null,
      patient_name: j.patient_name || null,
      status: String(j.status || 'pending'),
      attempt_count: Number(j.attempt_count) || 0,
      max_attempts: Number(j.max_attempts) || 0,
      last_error: j.last_error ? String(j.last_error).slice(0, 1000) : null,
      started_at: j.started_at || null,
      completed_at: j.completed_at || null,
      created_at: j.created_at,
      updated_at: j.updated_at || j.created_at,
      extraction_run: run || null,
    }
  })
}

/**
 * GET /api/v1/admin/extraction-tasks/:id
 *
 * Query:
 *   source?: 'project' | 'job' 显式指定。省略时按 id 先匹配 project_extraction_tasks，
 *            再匹配 ehr_extraction_jobs。
 */
router.get('/extraction-tasks/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id
    const sourceHint = typeof req.query.source === 'string' ? req.query.source : ''
    const includeLlm = req.query.include_llm !== '0' && req.query.include_llm !== 'false'

    // 1) 尝试 project 任务
    let projectRow: any = null
    if (sourceHint !== 'job') {
      projectRow = db.prepare(`
        SELECT pet.*, p.project_name, s.name AS schema_name, s.code AS schema_code
        FROM project_extraction_tasks pet
        LEFT JOIN projects p ON p.id = pet.project_id
        LEFT JOIN schemas  s ON s.id = pet.schema_id
        WHERE pet.id = ?
      `).get(id) as any
    }

    let summary: UnifiedTask | null = null
    let jobDetails: JobDetail[] = []

    if (projectRow) {
      summary = summarizeProjectTaskReadOnly(projectRow)
      const jobIds = summary.job_ids
      const jobRows = jobIds.length > 0
        ? db.prepare(`
            SELECT j.*, doc.file_name AS document_name, pat.name AS patient_name
            FROM ehr_extraction_jobs j
            LEFT JOIN documents doc ON doc.id = j.document_id
            LEFT JOIN patients  pat ON pat.id = j.patient_id
            WHERE j.id IN (${jobIds.map(() => '?').join(',')})
            ORDER BY j.created_at ASC
          `).all(...jobIds) as any[]
        : []
      jobDetails = buildJobDetails(jobRows)
    } else if (sourceHint !== 'project') {
      // 2) 尝试 ehr_extraction_jobs 单条
      const jobRow = db.prepare(`
        SELECT j.*,
               pat.name AS patient_name,
               sch.name AS schema_name,
               sch.code AS schema_code,
               doc.file_name AS document_name,
               doc.metadata AS doc_metadata,
               er.target_mode AS run_target_mode,
               er.target_path AS run_target_path,
               er.model_name  AS run_model_name,
               er.prompt_version AS run_prompt_version
        FROM ehr_extraction_jobs j
        LEFT JOIN patients  pat ON pat.id = j.patient_id
        LEFT JOIN schemas   sch ON sch.id = j.schema_id
        LEFT JOIN documents doc ON doc.id = j.document_id
        LEFT JOIN extraction_runs er ON er.id = j.result_extraction_run_id
        WHERE j.id = ?
      `).get(id) as any

      if (jobRow) {
        summary = summarizeJobRow(jobRow)
        jobDetails = buildJobDetails([jobRow])
      }
    }

    if (!summary) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: '未找到对应的抽取任务',
        data: null,
      })
    }

    let llmCalls: LLMCallPair[] = []
    const llmSource: 'db' = 'db'
    if (includeLlm) {
      const jobIds = jobDetails.map((j) => j.id)
      llmCalls = readLlmCallsFromDb(jobIds).sort((a, b) => {
        const aTs = a.started_at || ''
        const bTs = b.started_at || ''
        return aTs.localeCompare(bTs)
      })
    }

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data: {
        summary,
        jobs: jobDetails,
        llm_calls: llmCalls,
        llm_source: llmSource,
      },
    })
  } catch (err: any) {
    console.error('[admin/extraction-tasks/:id] detail error:', err)
    return res.status(500).json({
      success: false,
      code: 500,
      message: err?.message || '查询任务详情失败',
      data: null,
    })
  }
})

/**
 * GET /api/v1/admin/extraction-tasks/:id/progress
 * SSE 反代：把 crf-service `/api/extract/{job_id}/progress` 的事件流
 * 原样转发给前端。这样前端只需认识同源的一个地址，不必直接跨域连 crf-service。
 *
 * id 可以是：
 *   - project_extraction_tasks.id → 用该任务的 primary_job_id 作为订阅频道
 *     （批量任务可能有多个并发 job；此处只跟踪 primary，列表里的详细 jobs 状态
 *     仍靠 REST 轮询看到；如果需要多 job 同时跟踪，可以未来扩展 EventSource 组）
 *   - ehr_extraction_jobs.id → 直接使用该 job id
 *
 * 终态（status=completed|failed|cancelled）时 upstream 会自然结束，此接口同步 end。
 */
router.get('/extraction-tasks/:id/progress', async (req: Request, res: Response) => {
  const id = req.params.id

  // 1) 把 public task id 映射成 crf-service 用的 job_id
  //
  // 优先级：project_extraction_tasks.job_ids_json[0] → ehr_extraction_jobs.id
  // （批量任务可能同时跑多个 job，这里只跟踪第一个；详情页里的各 job 状态仍由 REST 刷新体现）
  let jobId: string | null = null
  try {
    const projectRow = db
      .prepare(`SELECT id, job_ids_json FROM project_extraction_tasks WHERE id = ?`)
      .get(id) as any
    if (projectRow) {
      const jobIds = normalizeStringList(parseJsonArray(projectRow.job_ids_json))
      jobId = jobIds[0] || null
    }
    if (!jobId) {
      const jobRow = db.prepare(`SELECT id FROM ehr_extraction_jobs WHERE id = ?`).get(id) as any
      if (jobRow) jobId = String(jobRow.id)
    }
  } catch (err) {
    console.error('[admin/extraction-tasks/:id/progress] id→job_id 解析失败:', err)
  }

  // 统一 SSE 头（即便接下来 404 / upstream 失败，前端 EventSource 也需要这套头才能正确识别连接）
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof (res as any).flushHeaders === 'function') {
    ;(res as any).flushHeaders()
  }

  if (!jobId) {
    // 推一条 error 事件后结束，前端 hook 可以据此展示"未关联 job"。
    res.write(`event: error\ndata: ${JSON.stringify({ message: '未找到对应的抽取任务或尚未关联 job_id' })}\n\n`)
    res.end()
    return
  }

  // 2) 反代到 crf-service
  const upstreamUrl = `${CRF_SERVICE_URL}/api/extract/${encodeURIComponent(jobId)}/progress`
  const abort = new AbortController()
  req.on('close', () => abort.abort())

  try {
    const upstream = await fetch(upstreamUrl, {
      signal: abort.signal,
      headers: { Accept: 'text/event-stream' },
    })

    if (!upstream.ok || !upstream.body) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          message: `upstream ${upstream.status} ${upstream.statusText || ''}`.trim(),
        })}\n\n`,
      )
      res.end()
      return
    }

    // 初始化事件：告诉前端现在订阅到了哪个 job_id，方便调试。
    res.write(`event: meta\ndata: ${JSON.stringify({ job_id: jobId, task_id: id })}\n\n`)

    const reader = (upstream.body as any).getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        // 原样透传：upstream 已经是 SSE 格式（"data: ...\n\n"）。
        res.write(decoder.decode(value, { stream: true }))
      }
    }
    res.end()
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // 客户端主动断开：正常结束，不刷日志。
      try { res.end() } catch { /* ignore */ }
      return
    }
    console.error('[admin/extraction-tasks/:id/progress] SSE proxy error:', err)
    try {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: String(err?.message || err) })}\n\n`,
      )
    } catch { /* ignore */ }
    try { res.end() } catch { /* ignore */ }
  }
})

export default router
