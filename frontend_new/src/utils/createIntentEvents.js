/**
 * 新建患者请求事件名。
 * @type {string}
 */
export const REQUEST_PATIENT_CREATE_EVENT = 'app:request-patient-create'

/**
 * 新建项目请求事件名。
 * @type {string}
 */
export const REQUEST_PROJECT_CREATE_EVENT = 'app:request-project-create'

/**
 * 编辑项目请求事件名。
 * @type {string}
 */
export const REQUEST_PROJECT_EDIT_EVENT = 'app:request-project-edit'

/**
 * 新建模板请求事件名。
 * @type {string}
 */
export const REQUEST_TEMPLATE_CREATE_EVENT = 'app:request-template-create'

/**
 * 触发“请求新建患者”事件。
 *
 * @returns {void}
 */
export const dispatchRequestPatientCreate = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REQUEST_PATIENT_CREATE_EVENT))
}

/**
 * 触发“请求新建项目”事件。
 *
 * @returns {void}
 */
export const dispatchRequestProjectCreate = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REQUEST_PROJECT_CREATE_EVENT))
}

/**
 * 触发“请求编辑项目”事件。
 *
 * @param {string} projectId 项目 ID
 * @returns {void}
 */
export const dispatchRequestProjectEdit = (projectId) => {
  if (typeof window === 'undefined' || !projectId) return
  window.dispatchEvent(new CustomEvent(REQUEST_PROJECT_EDIT_EVENT, {
    detail: { projectId },
  }))
}

/**
 * 触发“请求新建模板”事件。
 *
 * @returns {void}
 */
export const dispatchRequestTemplateCreate = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REQUEST_TEMPLATE_CREATE_EVENT))
}

