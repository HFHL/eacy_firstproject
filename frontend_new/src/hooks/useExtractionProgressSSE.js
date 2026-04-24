/**
 * useExtractionProgressSSE —— 订阅单个抽取任务的实时进度流。
 *
 * 接入的是 backend 反代端点 `GET /api/v1/admin/extraction-tasks/:id/progress`，
 * 内部会把 id 映射到 crf-service 的 job_id 并转发 SSE 流。
 *
 * 返回值：
 *   events:      Array<ProgressEvent>         收到的事件列表（顺序追加，含时间戳）
 *   lastEvent:   ProgressEvent | null         最近一条（便于在列表/表头只展示当前状态）
 *   status:      'idle' | 'connecting'        EventSource 的连接状态
 *              | 'open' | 'closed' | 'error'
 *   terminal:    boolean                      是否已收到终态事件（completed/failed/cancelled）
 *   error:       string | null                传输层/业务层错误信息
 *
 * 调用方式：
 *   const { events, lastEvent, terminal } = useExtractionProgressSSE(taskId, { enabled })
 *
 * 注意：EventSource 不能携带自定义 header（无法带 Bearer token）。目前
 * `/api/v1/admin/*` 没有认证 middleware，直接连即可；若以后加上认证，
 * 需要改用 fetch + ReadableStream 或用 query-string token。
 *
 * ProgressEvent 的形状（与 crf-service tasks.py::_publish_progress 对齐）：
 *   {
 *     ts: number,                       // 本地收到时间
 *     type: 'meta' | 'progress' | 'error',
 *     status: 'running' | 'completed' | 'failed' | 'cancelled',
 *     node: string,                     // 'start' | 'load_schema_and_docs' | 'filter_units'
 *                                       //  | 'extract_units' | 'materialize' | 'done' | 'error' | 'timeout'
 *     message?: string,
 *     reason?: string,
 *     result?: object,                  // 终态时的完整返回
 *     raw: string,                      // 原始 data 字段，debug 用
 *   }
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { API_URL } from '../api/config'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export default function useExtractionProgressSSE(taskId, options = {}) {
  const { enabled = true } = options
  const [events, setEvents] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [terminal, setTerminal] = useState(false)
  const esRef = useRef(null)

  const reset = useCallback(() => {
    setEvents([])
    setStatus('idle')
    setError(null)
    setTerminal(false)
  }, [])

  useEffect(() => {
    if (!enabled || !taskId) {
      return undefined
    }

    // 每次 taskId 或启用状态切换都重置，避免把旧任务事件串到新任务里
    reset()
    setStatus('connecting')

    const url = `${API_URL}/admin/extraction-tasks/${encodeURIComponent(taskId)}/progress`
    let closed = false
    // EventSource 原生 API，会自动处理 CORS / 分帧
    const es = new EventSource(url, { withCredentials: false })
    esRef.current = es

    const append = (ev) => {
      setEvents((prev) => [...prev, ev])
      if (ev.status && TERMINAL_STATUSES.has(ev.status)) {
        setTerminal(true)
        // 终态到达：主动关闭，防止 EventSource 默认 3s 自动重连
        try { es.close() } catch { /* noop */ }
        setStatus('closed')
      }
    }

    es.onopen = () => { if (!closed) setStatus('open') }

    // 默认 data-only 消息（crf-service 推的进度都走这条通道）
    es.onmessage = (e) => {
      let parsed = null
      try { parsed = JSON.parse(e.data) } catch { /* 保留原串 */ }
      append({
        ts: Date.now(),
        type: 'progress',
        status: parsed?.status || null,
        node: parsed?.node || null,
        message: parsed?.message || null,
        reason: parsed?.reason || null,
        result: parsed?.result || null,
        raw: e.data,
      })
    }

    // 反代写的 `event: meta` —— 携带实际 job_id，便于调试显示
    es.addEventListener('meta', (e) => {
      let parsed = null
      try { parsed = JSON.parse(e.data) } catch { /* noop */ }
      append({
        ts: Date.now(),
        type: 'meta',
        status: null,
        node: 'meta',
        message: parsed?.job_id ? `订阅 job ${parsed.job_id}` : '已订阅进度频道',
        raw: e.data,
      })
    })

    // 反代 / upstream 异常：推一条 error 事件
    es.addEventListener('error', (e) => {
      let parsed = null
      try { parsed = JSON.parse(e.data) } catch { /* noop */ }
      const msg = parsed?.message || '上游进度流失败'
      setError(msg)
      append({
        ts: Date.now(),
        type: 'error',
        status: 'failed',
        node: 'proxy_error',
        message: msg,
        raw: e.data,
      })
      try { es.close() } catch { /* noop */ }
      setStatus('error')
    })

    // 连接层错误（readyState=CLOSED）。EventSource 的这个事件没有 data。
    es.onerror = () => {
      if (closed) return
      // 如果已经到了终态，是 upstream 主动关，别改 status
      if (es.readyState === EventSource.CLOSED) {
        setStatus((s) => (s === 'closed' ? s : 'closed'))
        return
      }
      // 真的是连接失败 / 被断开
      setError((prev) => prev || '连接中断')
      setStatus('error')
    }

    return () => {
      closed = true
      try { es.close() } catch { /* noop */ }
      esRef.current = null
    }
  }, [taskId, enabled, reset])

  const lastEvent = events.length > 0 ? events[events.length - 1] : null

  return { events, lastEvent, status, terminal, error }
}
