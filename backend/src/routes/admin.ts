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
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import db from '../db.js'

const router = Router()

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
      WHERE j.job_type = 'extract'
    `).all() as any[]

    const standaloneJobs: UnifiedTask[] = allJobRows
      .filter((r) => !projectJobIdSet.has(String(r.id)))
      .map(summarizeJobRow)

    // 3) 合并、筛选、排序
    let merged: UnifiedTask[] = [...projectTasks, ...standaloneJobs]

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

// ─── LLM JSONL 读取 ─────────────────────────────────────────────────────────
//
// 说明：crf-service 把每次 LLM 调用以 JSON 行格式写入 logs/ehr_extractor_llm.jsonl。
// 字段布局参考 app/core/extractor_agent.py：
//   llm_request   → kind, call_id, started_at, task_name, task_path, document_id, instruction, user_message
//   llm_response  → kind, call_id, started_at, finished_at, elapsed_ms, extracted_raw, parsed, validation_log
//   llm_exception → kind, call_id, started_at, finished_at, error, traceback
//
// 当前没有 job_id 关联字段，因此只能按 document_id + 时间窗口软关联。
// Step 3 会新增 llm_call_logs 表做双写，届时这里的"文件读"降级为 fallback。

type LLMLogEntry = Record<string, any>

const LLM_LOG_PATH = process.env.LLM_LOG_PATH
  ? path.resolve(process.env.LLM_LOG_PATH)
  : path.resolve(process.cwd(), '..', 'crf-service', 'logs', 'ehr_extractor_llm.jsonl')

// 简单内存缓存：按文件 size+mtime 失效。避免每次详情请求都重读 3MB。
let llmCache: { key: string; entries: LLMLogEntry[] } | null = null

async function readLlmLog(): Promise<LLMLogEntry[]> {
  let stat: fs.Stats
  try {
    stat = fs.statSync(LLM_LOG_PATH)
  } catch {
    return []
  }
  const key = `${stat.size}:${stat.mtimeMs}`
  if (llmCache && llmCache.key === key) return llmCache.entries

  const entries: LLMLogEntry[] = []
  const stream = fs.createReadStream(LLM_LOG_PATH, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  for await (const raw of rl) {
    const line = raw.trim()
    if (!line) continue
    try {
      const obj = JSON.parse(line)
      if (obj && typeof obj === 'object') entries.push(obj)
    } catch { /* skip malformed */ }
  }
  llmCache = { key, entries }
  return entries
}

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

/**
 * 把 JSONL 三种事件 (request / response / exception) 按 call_id 配成 LLMCallPair。
 */
function pairLlmEntries(entries: LLMLogEntry[]): LLMCallPair[] {
  const byCall = new Map<string, { req?: LLMLogEntry; resp?: LLMLogEntry; exc?: LLMLogEntry }>()
  const orphans: LLMLogEntry[] = []
  for (const e of entries) {
    const cid = e.call_id ? String(e.call_id) : ''
    if (!cid) { orphans.push(e); continue }
    if (!byCall.has(cid)) byCall.set(cid, {})
    const slot = byCall.get(cid)!
    if (e.kind === 'llm_request') slot.req = e
    else if (e.kind === 'llm_response') slot.resp = e
    else if (e.kind === 'llm_exception') slot.exc = e
  }
  const pairs: LLMCallPair[] = []
  for (const [cid, slot] of byCall.entries()) {
    const req = slot.req || {}
    const resp = slot.resp
    const exc = slot.exc
    const out: LLMCallPair = {
      call_id: cid,
      document_id: (req.document_id || resp?.document_id || exc?.document_id) || null,
      task_name: (req.task_name || resp?.task_name || exc?.task_name) || null,
      task_path: (req.task_path || resp?.task_path || exc?.task_path) || null,
      started_at: (req.started_at || resp?.started_at || exc?.started_at) || null,
      finished_at: (resp?.finished_at || exc?.finished_at) || null,
      elapsed_ms: resp?.elapsed_ms ?? exc?.elapsed_ms ?? null,
      status: exc ? 'error' : resp ? 'success' : 'pending',
      instruction: req.instruction ?? null,
      user_message: req.user_message ?? null,
      extracted_raw: resp?.extracted_raw ?? null,
      parsed: resp?.parsed ?? null,
      validation_log: resp?.validation_log ?? null,
      error: exc?.error ? String(exc.error).slice(0, 2000) : null,
    }
    pairs.push(out)
  }
  return pairs
}

/**
 * 根据文档 id 集合 + 时间窗口筛 pairs，避免同一文档历史日志全部拉出来。
 * window = 24h 兜底（文档跨天重复抽取的场景极少，同时避免长时间窗穿帮）。
 */
function pickLlmCallsForJobs(
  pairs: LLMCallPair[],
  jobs: JobDetail[],
): LLMCallPair[] {
  const docIds = new Set<string>(
    jobs.map((j) => j.document_id).filter((v): v is string => !!v)
  )
  if (docIds.size === 0) return []

  // 为每个文档建立允许的时间区间 = min(job.started_at) - 5min ~ max(job.completed_at || now) + 5min
  const WINDOW_MS = 24 * 60 * 60 * 1000
  const docWindows = new Map<string, { start: number; end: number }>()
  for (const j of jobs) {
    if (!j.document_id) continue
    const startMs = j.started_at ? Date.parse(j.started_at) : Date.parse(j.created_at)
    const endMs = j.completed_at ? Date.parse(j.completed_at) : startMs + WINDOW_MS
    if (!Number.isFinite(startMs)) continue
    const prev = docWindows.get(j.document_id) || { start: startMs, end: endMs }
    docWindows.set(j.document_id, {
      start: Math.min(prev.start, startMs) - 5 * 60 * 1000,
      end: Math.max(prev.end, endMs) + 5 * 60 * 1000,
    })
  }

  return pairs
    .filter((p) => {
      if (!p.document_id || !docIds.has(p.document_id)) return false
      const win = docWindows.get(p.document_id)
      if (!win) return true
      const ts = p.started_at ? Date.parse(p.started_at) : NaN
      if (!Number.isFinite(ts)) return true
      return ts >= win.start && ts <= win.end
    })
    .sort((a, b) => {
      const aTs = a.started_at || ''
      const bTs = b.started_at || ''
      return aTs.localeCompare(bTs)
    })
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
    if (includeLlm) {
      try {
        const entries = await readLlmLog()
        const pairs = pairLlmEntries(entries)
        llmCalls = pickLlmCallsForJobs(pairs, jobDetails)
      } catch (llmErr) {
        console.warn('[admin/extraction-tasks/:id] LLM 日志读取失败:', llmErr)
      }
    }

    return res.json({
      success: true,
      code: 0,
      message: 'ok',
      data: {
        summary,
        jobs: jobDetails,
        llm_calls: llmCalls,
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

export default router
