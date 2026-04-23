/**
 * 项目元数据表单工具。
 */
import dayjs from 'dayjs'

/**
 * 从项目对象中提取模板名称。
 *
 * @param {object} project 项目对象
 * @returns {string} 模板名称
 */
const resolveProjectTemplateName = (project = {}) => {
  return project?.template_info?.template_name
    || project?.template_scope_config?.template_name
    || project?.template_scope_config?.template_id
    || project?.crfTemplate
    || (project?.crf_template_id ? '已关联模板' : '未关联模板')
}

/**
 * 构造项目编辑表单初始值。
 *
 * @param {object} project 项目对象
 * @returns {object} 表单初始值
 */
export const buildProjectMetaFormValues = (project = {}) => {
  const startDate = project?.start_date ? dayjs(project.start_date) : null
  const endDate = project?.end_date ? dayjs(project.end_date) : null
  const projectPeriod = startDate && endDate ? [startDate, endDate] : undefined

  return {
    name: project?.project_name || project?.name || '',
    description: project?.description || '',
    status: project?.status || 'planning',
    principal_investigator_id: project?.principal_investigator_id || '',
    expected_patient_count: project?.expected_patient_count ?? null,
    project_period: projectPeriod,
    crfTemplate: resolveProjectTemplateName(project),
  }
}

/**
 * 构造项目更新接口 payload。
 *
 * @param {object} values 表单值
 * @returns {object} 更新 payload
 */
export const buildProjectMetaUpdatePayload = (values = {}) => {
  const payload = {
    project_name: values?.name || '',
    description: values?.description || '',
    status: values?.status || 'planning',
    expected_patient_count: values?.expected_patient_count == null || values?.expected_patient_count === ''
      ? null
      : Number(values.expected_patient_count),
    start_date: values?.project_period?.[0] ? values.project_period[0].format('YYYY-MM-DD') : null,
    end_date: values?.project_period?.[1] ? values.project_period[1].format('YYYY-MM-DD') : null,
  }

  if (Object.prototype.hasOwnProperty.call(values, 'principal_investigator_id')) {
    payload.principal_investigator_id = values?.principal_investigator_id || null
  }

  return payload
}

