/**
 * 模板页面状态机工具。
 */
import { templateFallback, templateView } from './researchPaths.js'

export const TEMPLATE_PAGE_MODES = {
  CREATE_PENDING_META: 'create:pendingMeta',
  CREATE_EDITING: 'create:editing',
  EXISTING_VIEW: 'existing:view',
  EXISTING_EDIT: 'existing:edit',
}

/**
 * 创建模板默认元信息。
 *
 * @param {string=} id 模板 ID
 * @returns {{id: string, name: string, category: string, description: string, version: string, status: string}}
 */
export const createDefaultTemplateInfo = (id = '') => ({
  id,
  name: '新建 CRF 模板',
  category: '通用',
  description: '',
  version: '1',
  status: 'draft',
})

/**
 * 基于待创建元信息构造新建页显示数据。
 *
 * @param {{name?: string, category?: string, description?: string}|null} pendingMeta 待创建元信息
 * @returns {{id: string, name: string, category: string, description: string, version: string, status: string}}
 */
export const buildCreateTemplateInfo = (pendingMeta) => ({
  ...createDefaultTemplateInfo(),
  name: pendingMeta?.name || '新建 CRF 模板',
  category: pendingMeta?.category || '通用',
  description: pendingMeta?.description || '',
})

/**
 * 解析模板页面当前模式。
 *
 * @param {{templateId?: string|null, isViewMode?: boolean, hasPendingMeta?: boolean}} options 解析参数
 * @returns {string}
 */
export const resolveTemplatePageMode = ({ templateId, isViewMode, hasPendingMeta }) => {
  if (!templateId) {
    return hasPendingMeta ? TEMPLATE_PAGE_MODES.CREATE_EDITING : TEMPLATE_PAGE_MODES.CREATE_PENDING_META
  }
  return isViewMode ? TEMPLATE_PAGE_MODES.EXISTING_VIEW : TEMPLATE_PAGE_MODES.EXISTING_EDIT
}

/**
 * 解析模板页面返回目标。
 *
 * @param {{templateId?: string|null, isViewMode?: boolean, returnTo?: string, canGoBack?: boolean}} options 返回参数
 * @returns {{type: 'history'} | {type: 'route', target: string}}
 */
export const resolveTemplateBackTarget = ({ templateId, isViewMode, returnTo, canGoBack }) => {
  if (!templateId) {
    if (returnTo) return { type: 'route', target: returnTo }
    if (canGoBack) return { type: 'history' }
    return { type: 'route', target: templateFallback() }
  }
  if (isViewMode) {
    if (canGoBack) return { type: 'history' }
    return { type: 'route', target: templateFallback() }
  }
  return { type: 'route', target: templateView(templateId) }
}
