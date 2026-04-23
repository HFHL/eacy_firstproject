/**
 * 模板新建流程的跨页面状态工具。
 */

export const PENDING_TEMPLATE_CREATE_META_KEY = 'research:template-create:meta'
export const PENDING_TEMPLATE_CREATE_RETURN_TO_KEY = 'research:template-create:return-to'

/**
 * 写入待消费的模板元信息与返回目标。
 *
 * @param {{name?: string, category?: string, description?: string}} meta 模板元信息
 * @param {string} returnTo 确认进入设计器后，未保存时的返回页
 * @returns {void}
 */
export const storePendingTemplateCreateFlow = (meta, returnTo) => {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(
    PENDING_TEMPLATE_CREATE_META_KEY,
    JSON.stringify({
      name: meta?.name || '',
      category: meta?.category || '通用',
      description: meta?.description || '',
    })
  )
  if (returnTo) {
    window.sessionStorage.setItem(PENDING_TEMPLATE_CREATE_RETURN_TO_KEY, returnTo)
  }
}

/**
 * 读取待消费的模板元信息（不立即清空，避免开发态 StrictMode 双挂载导致状态丢失）。
 *
 * @returns {{name: string, category: string, description: string}|null}
 */
export const consumePendingTemplateCreateMeta = () => {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(PENDING_TEMPLATE_CREATE_META_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return {
      name: parsed?.name || '',
      category: parsed?.category || '通用',
      description: parsed?.description || '',
    }
  } catch (_error) {
    return null
  }
}

/**
 * 清空当前新建流程的模板元信息。
 *
 * @returns {void}
 */
export const clearPendingTemplateCreateMeta = () => {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PENDING_TEMPLATE_CREATE_META_KEY)
}

/**
 * 读取当前新建流程的返回页。
 *
 * @returns {string}
 */
export const readPendingTemplateCreateReturnTo = () => {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem(PENDING_TEMPLATE_CREATE_RETURN_TO_KEY) || ''
}

/**
 * 清空新建流程的返回页记录。
 *
 * @returns {void}
 */
export const clearPendingTemplateCreateReturnTo = () => {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PENDING_TEMPLATE_CREATE_RETURN_TO_KEY)
}
