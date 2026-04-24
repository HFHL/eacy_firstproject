/**
 * @file 项目详情页 V2 数据适配器。
 */

import { normalizeTemplateFieldGroups, normalizeTemplateFieldMapping } from '../config/datasetContract'

/**
 * 判断字段值是否已填写。
 *
 * @param {any} value 字段值。
 * @returns {boolean}
 */
const hasFieldValue = (value) => {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && value !== ''
}

/**
 * 计算字段组完整度。
 *
 * @param {Record<string, any>} groups 分组字典。
 * @param {string} groupId 分组 ID。
 * @returns {{percent:number,filled:number,total:number}}
 */
const calcGroupStats = (groups, groupId) => {
  const group = groups?.[groupId]
  if (!group || !group.fields || typeof group.fields !== 'object') {
    return { percent: 0, filled: 0, total: 0 }
  }
  const fields = Object.values(group.fields)
  const filledCount = fields.filter((item) => hasFieldValue(item?.value)).length
  const totalCount = fields.length
  const percent = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0
  return { percent, filled: filledCount, total: totalCount }
}

/**
 * 规范化单个患者数据。
 *
 * @param {Record<string, any>} patient API 原始患者数据。
 * @returns {Record<string, any>}
 */
export const adaptProjectPatient = (patient) => {
  const crfData = patient?.crf_data || {}
  const groups = crfData?.groups || {}

  const crfGroups = {}
  Object.keys(groups).forEach((groupId) => {
    const group = groups[groupId] || {}
    const stats = calcGroupStats(groups, groupId)
    crfGroups[groupId] = {
      group_id: groupId,
      group_name: group.group_name || groupId,
      completeness: stats.percent,
      filled_count: stats.filled,
      total_count: stats.total,
      fields: group.fields || {},
      records: Array.isArray(group.records) ? group.records : [],
      is_repeatable: Boolean(group.is_repeatable),
    }
  })

  const extractedAt = crfData?._extracted_at || null
  const extractionErrors = crfData?._errors
  const extractionMode = crfData?._extraction_mode || null
  const completeness = parseFloat(patient?.crf_completeness) || 0
  let extractionStatus = 'pending'
  if (extractedAt && completeness > 0) {
    extractionStatus = extractionErrors ? 'partial' : 'done'
  } else if (extractedAt) {
    extractionStatus = 'empty'
  }

  return {
    key: patient?.id,
    id: patient?.id,
    patientId: patient?.subject_id || patient?.id,
    patient_id: patient?.patient_id,
    name: patient?.patient_name,
    subject_id: patient?.subject_id,
    group_name: patient?.group_name,
    status: patient?.status,
    enrollment_date: patient?.enrollment_date,
    overallCompleteness: completeness,
    extractionStatus,
    extractedAt,
    extractionMode,
    crf_data: crfData,
    crfGroups,
    document_count: patient?.document_count,
    patient_gender: patient?.patient_gender ?? null,
    patient_age: patient?.patient_age ?? null,
    patient_birth_date: patient?.patient_birth_date ?? null,
  }
}

/**
 * 规范化患者列表。
 *
 * @param {Array<Record<string, any>>} patients API 患者列表。
 * @returns {Array<Record<string, any>>}
 */
export const adaptProjectPatients = (patients) => {
  if (!Array.isArray(patients)) return []
  return patients.map(adaptProjectPatient)
}

/**
 * 规范化模板字段定义。
 *
 * @param {Array<Record<string, any>>} fieldGroups 模板字段组。
 * @param {Record<string, any>} fieldMapping 字段映射。
 * @returns {{fieldGroups:Array<Record<string, any>>, fieldMapping:Record<string,string>}}
 */
export const adaptTemplateMeta = (fieldGroups, fieldMapping) => {
  return {
    fieldGroups: normalizeTemplateFieldGroups(fieldGroups),
    fieldMapping: normalizeTemplateFieldMapping(fieldMapping),
  }
}
