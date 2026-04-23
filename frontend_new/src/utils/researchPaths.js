/**
 * 科研域路径常量与构造函数。
 */

export const RESEARCH_HOME_PATH = '/research/projects'
export const RESEARCH_TEMPLATE_CREATE_PATH = '/research/templates/create'

/**
 * 获取科研域首页路径。
 *
 * @returns {string}
 */
export const researchHome = () => RESEARCH_HOME_PATH

/**
 * 获取模板创建页路径。
 *
 * @returns {string}
 */
export const templateCreate = () => RESEARCH_TEMPLATE_CREATE_PATH

/**
 * 获取模板详情页路径。
 *
 * @param {string} templateId 模板 ID
 * @returns {string}
 */
export const templateView = (templateId) => `/research/templates/${templateId}/view`

/**
 * 获取模板编辑页路径。
 *
 * @param {string} templateId 模板 ID
 * @returns {string}
 */
export const templateEdit = (templateId) => `/research/templates/${templateId}/edit`

/**
 * 获取模板链路的默认 fallback 路径。
 *
 * @returns {string}
 */
export const templateFallback = () => RESEARCH_HOME_PATH

/**
 * 获取科研项目详情路径。
 *
 * @param {string} projectId 项目 ID
 * @returns {string}
 */
export const researchProjectDetail = (projectId) => `/research/projects/${projectId}`

/**
 * 获取科研项目模板编辑页路径。
 *
 * @param {string} projectId 项目 ID
 * @returns {string}
 */
export const researchProjectTemplateEdit = (projectId) => `/research/projects/${projectId}/template/edit`

/**
 * 获取科研项目患者详情路径。
 *
 * @param {string} projectId 项目 ID
 * @param {string} patientId 患者 ID
 * @returns {string}
 */
export const researchProjectPatientDetail = (projectId, patientId) => `/research/projects/${projectId}/patients/${patientId}`
