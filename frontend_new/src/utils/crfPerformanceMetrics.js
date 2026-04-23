/**
 * @file CRF 渲染性能采集工具
 */

const PERF_KEY = '__CRF_PERF_BASELINE__'

/**
 * 记录一次阶段指标。
 * @param {string} name
 * @param {number} durationMs
 */
export const recordCrfPerfMetric = (name, durationMs) => {
  if (typeof window === 'undefined') return
  if (!window[PERF_KEY]) {
    window[PERF_KEY] = {}
  }
  const metrics = window[PERF_KEY]
  if (!metrics[name]) {
    metrics[name] = {
      baselineMs: durationMs,
      latestMs: durationMs,
      deltaPercent: 0,
      exceeded: false,
    }
    return
  }
  const baseline = metrics[name].baselineMs || durationMs
  const deltaPercent = baseline > 0 ? ((durationMs - baseline) / baseline) * 100 : 0
  metrics[name] = {
    baselineMs: baseline,
    latestMs: durationMs,
    deltaPercent,
    exceeded: deltaPercent > 15,
  }
}

/**
 * 读取当前性能快照。
 * @returns {Record<string, any>}
 */
export const getCrfPerfSnapshot = () => {
  if (typeof window === 'undefined') return {}
  return window[PERF_KEY] || {}
}
