/**
 * 项目患者数据管理 Hook
 *
 * 作用：
 *  - 拉项目详情（包含 schema_json）
 *  - 拉项目患者详情（含 crf_data.groups[].fields[]）
 *  - 把后端返回的 crf_data 拍平成 SchemaForm 可直接消费的嵌套对象 schemaData
 *
 * 注意：该 Hook 专为「科研项目详情页」服务，只为 SchemaEhrTab 供给数据。
 * 之前为旧版 EhrTab 三栏组件准备的 getEhrFieldsData / getEhrFieldGroups
 * 已随 ProjectPatientDetail 重写而下线，如需重新引入请基于 crfData 自行派生。
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { message } from 'antd'
import { getProjectPatientDetail, getProject } from '@/api/project'

const emptyPatientInfo = {
  id: '',
  patientId: '',
  projectId: '',
  name: '',
  gender: '',
  age: null,
  birthDate: '',
  phone: '',
  patientCode: '',
  diagnosis: [],
  subjectId: '',
  groupName: '',
  status: '',
  enrollmentDate: '',
  crfCompleteness: 0,
  documentCount: 0,
}

const emptyCrfData = {
  groups: {},
}

/**
 * 取 schema 节点下指定 key 对应的子 schema。
 * 若当前节点是 array，就下钻到 items.properties；否则读 properties。
 */
function descendSchema(schemaNode, key) {
  if (!schemaNode || typeof schemaNode !== 'object') return null
  const props = schemaNode.type === 'array'
    ? schemaNode.items?.properties
    : schemaNode.properties
  return props?.[key] ?? null
}

/**
 * 把后端 crf_data.groups[groupKey].fields[fieldPath].value 的扁平结构
 * 转成 SchemaForm 需要的嵌套对象 draftData。
 *
 * 注意：
 *  - 后端 `buildProjectCrfData` 已经去掉顶层 groupKey 前缀，
 *    所以 fieldPath 就是"相对于该 group 的路径"，不需要再做前缀剥离。
 *  - schema 里很多中间节点是 array-of-object（如 `手术治疗`、`身份ID`、
 *    `紧急联系人`、`诊断记录.诊断记录`）。遇到这种节点要把值包成 `[{...}]`
 *    才能让 SchemaForm 按 array schema 渲染。
 *
 * @param {{groups: Record<string, any>}} crfData
 * @param {object|null} schema SchemaForm 的完整 JSON Schema（项目模板）
 */
function buildSchemaDataFromCrf(crfData, schema) {
  const result = {}
  const schemaProps = schema && typeof schema === 'object' ? (schema.properties || {}) : {}
  const groups = crfData?.groups || {}

  for (const [groupKey, group] of Object.entries(groups)) {
    const fields = group?.fields || {}
    const topSchemaNode = schemaProps[groupKey]

    // 顶层 group schema 缺失时降级：只用 object 嵌套，不包 array
    // （数据仍能部分显示，只是可重复组 UI 可能没值）
    const groupContainer = {}

    for (const [fieldPath, field] of Object.entries(fields)) {
      const parts = String(fieldPath).split('/').filter(Boolean)
      if (parts.length === 0) continue

      let schemaCursor = topSchemaNode
      let dataCursor = groupContainer

      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i]
        const nextSchema = descendSchema(schemaCursor, key)
        const nextIsArray = nextSchema?.type === 'array'

        if (nextIsArray) {
          // 目标是 array-of-object：第一次创建 [{}]，后续复用 [0]
          if (!Array.isArray(dataCursor[key])) {
            dataCursor[key] = [{}]
          } else if (dataCursor[key].length === 0 || typeof dataCursor[key][0] !== 'object') {
            dataCursor[key][0] = {}
          }
          dataCursor = dataCursor[key][0]
          schemaCursor = nextSchema
        } else {
          if (dataCursor[key] == null || typeof dataCursor[key] !== 'object' || Array.isArray(dataCursor[key])) {
            dataCursor[key] = {}
          }
          dataCursor = dataCursor[key]
          schemaCursor = nextSchema
        }
      }

      const leaf = parts[parts.length - 1]
      dataCursor[leaf] = field?.value ?? null
    }

    result[groupKey] = groupContainer
  }

  return result
}

export const useProjectPatientData = (projectId, patientId) => {
  const [loading, setLoading] = useState(false)
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectError, setProjectError] = useState(null)
  const [patientError, setPatientError] = useState(null)

  const [patientInfo, setPatientInfo] = useState(emptyPatientInfo)
  const [projectInfo, setProjectInfo] = useState(null)
  const [crfData, setCrfData] = useState(emptyCrfData)
  const [documents, setDocuments] = useState([])

  const fetchProjectDetail = useCallback(async () => {
    if (!projectId) return
    setProjectError(null)
    setProjectLoading(true)
    try {
      const res = await getProject(projectId)
      if (res?.success && res.data) {
        setProjectInfo(res.data)
      } else {
        setProjectError(res?.message || '获取项目详情失败')
      }
    } catch (error) {
      setProjectError(error?.message || '获取项目详情失败')
    } finally {
      setProjectLoading(false)
    }
  }, [projectId])

  const fetchPatientDetail = useCallback(async () => {
    if (!projectId || !patientId) return
    setPatientError(null)
    setLoading(true)
    try {
      const res = await getProjectPatientDetail(projectId, patientId)
      if (res?.success && res.data) {
        const data = res.data
        setPatientInfo({
          id: data.id,
          patientId: data.patient_id,
          projectId: data.project_id,
          name: data.patient_name,
          gender: data.patient_gender,
          age: data.patient_age,
          birthDate: data.patient_birth_date,
          phone: data.patient_phone,
          patientCode: data.patient_code,
          diagnosis: data.patient_diagnosis || [],
          subjectId: data.subject_id,
          groupName: data.group_name,
          status: data.status,
          enrollmentDate: data.enrollment_date,
          crfCompleteness: data.crf_completeness || 0,
          documentCount: data.document_count || 0,
        })
        setCrfData(data.crf_data || emptyCrfData)
        setDocuments(data.documents || [])
      } else {
        const errMsg = res?.message || '获取患者详情失败'
        setPatientError(errMsg)
        message.error(errMsg)
      }
    } catch (error) {
      const errMsg = error?.message || '获取患者详情失败'
      setPatientError(errMsg)
      message.error(errMsg)
    } finally {
      setLoading(false)
    }
  }, [projectId, patientId])

  const schemaData = useMemo(
    () => buildSchemaDataFromCrf(crfData, projectInfo?.schema_json || null),
    [crfData, projectInfo?.schema_json],
  )

  useEffect(() => {
    if (projectId) fetchProjectDetail()
  }, [projectId, fetchProjectDetail])

  useEffect(() => {
    if (projectId && patientId) fetchPatientDetail()
  }, [projectId, patientId, fetchPatientDetail])

  const refresh = useCallback(() => {
    fetchPatientDetail()
  }, [fetchPatientDetail])

  return {
    loading,
    projectLoading,
    projectError,
    patientError,

    patientInfo,
    projectInfo,
    crfData,
    schemaData,
    documents,

    refresh,
    fetchPatientDetail,
    fetchProjectDetail,
  }
}

export default useProjectPatientData
