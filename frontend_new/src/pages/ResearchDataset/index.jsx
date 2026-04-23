import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getProjects, createProject, updateProject, deleteProject, toggleProjectStatus, enrollPatient } from '../../api/project'
import { getCRFTemplates, assignTemplateToProject, getCRFTemplate, importCrfTemplateFromCsv, deleteCrfTemplate, listCrfTemplateVersions, activateCrfTemplateVersion, cloneCrfTemplate, convertTemplate } from '../../api/crfTemplate'
import { getPatientList } from '../../api/patient'
import { pickMostRecentlyUpdatedItem } from '../../utils/researchProjectSelection'
import { dispatchRequestProjectCreate, dispatchRequestTemplateCreate } from '../../utils/createIntentEvents'
import {
  researchProjectDetail,
  templateEdit,
} from '../../utils/researchPaths'
import { resolveTemplateAssets } from '../../utils/templateAssetResolver'
import {
  buildProjectMetaFormValues,
  buildProjectMetaUpdatePayload,
} from '../../utils/projectMetaForm'
import {
  Card,
  Typography,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Modal,
  Form,
  Input,
  Select,
  Row,
  Col,
  Statistic,
  Tabs,
  List,
  Avatar,
  Divider,
  Steps,
  Popconfirm,
  message,
  Alert,
  Tooltip,
  Badge,
  Empty,
  DatePicker,
  Radio,
  Dropdown,
  InputNumber,
  Switch,
  Upload,
  theme
} from 'antd'
import {
  PlusOutlined,
  ExperimentOutlined,
  TeamOutlined,
  FileTextOutlined,
  DownloadOutlined,
  UploadOutlined,
  SettingOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  FilterOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  CalendarOutlined,
  RobotOutlined,
  HeartOutlined,
  MedicineBoxOutlined,
  ThunderboltOutlined,
  FormOutlined,
  CloseCircleOutlined,
  BarChartOutlined,
  BulbOutlined,
  AppstoreOutlined,
  UnorderedListOutlined,
  MoreOutlined,
  UpOutlined,
  DownOutlined,
  CopyOutlined
} from '@ant-design/icons'
import { modalBodyPreset, modalWidthPreset } from '../../styles/themeTokens'
import {
  getProjectStatusMeta as getProjectStatusDisplayMeta,
  getProjectStatusOptions,
} from '../../constants/projectStatusMeta'

const { Title, Text } = Typography
const { Step } = Steps
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 判断给定值是否为 UUID 字符串。
 *
 * @param {unknown} value 待判断值
 * @returns {boolean} 是否为 UUID
 */
const isUuidString = (value) => {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim())
}

const ResearchDataset = () => {
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createProjectVisible, setCreateProjectVisible] = useState(false)
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectWizardVisible, setProjectWizardVisible] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [creatingProject, setCreatingProject] = useState(false)
  const [projectForm, setProjectForm] = useState({
    basicInfo: {},
    crfTemplate: null,
    selectedPatients: [],
  })
  const [editProjectVisible, setEditProjectVisible] = useState(false)
  const [projectStatusFilter, setProjectStatusFilter] = useState('')
  const [activeTab, setActiveTab] = useState('projects')
  const [projectViewMode, setProjectViewMode] = useState('card') // 'card' | 'table'
  const [templatePreviewVisible, setTemplatePreviewVisible] = useState(false)
  const [currentTemplate, setCurrentTemplate] = useState(null)
  const [templateVersionsVisible, setTemplateVersionsVisible] = useState(false)
  const [currentTemplateForVersions, setCurrentTemplateForVersions] = useState(null)
  const [currentTemplateVersions, setCurrentTemplateVersions] = useState([])
  const [templateVersionsLoading, setTemplateVersionsLoading] = useState(false)
  const [statisticsCollapsed, setStatisticsCollapsed] = useState(false)
  const projectStatusOptions = getProjectStatusOptions()

  // 模板复制（clone/convert）
  const [cloneTemplateVisible, setCloneTemplateVisible] = useState(false)
  const [cloningTemplate, setCloningTemplate] = useState(false)
  const [cloneSourceTemplate, setCloneSourceTemplate] = useState(null)
  const [cloneForm] = Form.useForm()
  
  // 患者池状态（用于创建项目时选择患者）
  const [patientPool, setPatientPool] = useState([])
  const [patientPoolLoading, setPatientPoolLoading] = useState(false)
  
  // 项目数据状态
  const [projectData, setProjectData] = useState([])
  const [loading, setLoading] = useState(true) // 初始为 true，确保首次加载时显示骨架屏
  const [searchKeyword, setSearchKeyword] = useState('')
  const [debouncedSearchKeyword, setDebouncedSearchKeyword] = useState('')
  const [editForm] = Form.useForm()
  const [wizardForm] = Form.useForm()
  
  // CRF 模板状态
  const [crfTemplates, setCrfTemplates] = useState([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [importTemplateVisible, setImportTemplateVisible] = useState(false)
  const [importingTemplate, setImportingTemplate] = useState(false)
  const [importForm] = Form.useForm()
  

  // 搜索关键词防抖：输入后 400ms 才真正触发搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchKeyword(searchKeyword)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchKeyword])

  // 加载项目列表
  const fetchProjects = useCallback(async (overrideParams = {}) => {
    setLoading(true)
    try {
      const params = {
        page: 1,
        page_size: 100,
        ...overrideParams,
      }
      if (!overrideParams.status && projectStatusFilter) {
        params.status = projectStatusFilter
      }
      if (!overrideParams.search && debouncedSearchKeyword) {
        params.search = debouncedSearchKeyword
      }
      const response = await getProjects(params)
      if (response?.success) {
        // 转换数据格式适配前端显示
        const rawList = Array.isArray(response.data) ? response.data : []
        const projects = rawList.map(project => {
          // 从 template_scope_config 获取模板名称
          const templateConfig = project.template_scope_config || {}
          const templateName = templateConfig.template_name
          
          return {
            key: project.id,
            id: project.project_code,
            projectId: project.id,  // 保留原始 UUID
            name: project.project_name,
            description: project.description || '',
            status: project.status_key || project.status || 'planning',
            statusLabel: project.status_label || '',
            statusColor: project.status_color || '',
            patients: project.actual_patient_count || 0,
            extractedPatients: project.actual_patient_count || 0,
            completeness: project.avg_completeness != null ? Math.round(project.avg_completeness) : 0,
            crfTemplate: templateName || (project.crf_template_id ? '已关联模板' : '未关联模板'),
            crfTemplateId: templateConfig.template_id || project.crf_template_id,
            createdBy: project.principal_investigator_name || '未知',
            createdAt: project.created_at?.split('T')[0] || '',
            lastUpdate: project.updated_at?.split('T')[0] || '',
            updatedAtRaw: project.updated_at || project.created_at || '',
            // 保留原始数据用于编辑
            _raw: project,
          }
        })
        setProjectData(projects)
      }
    } catch (error) {
      console.error('获取项目列表失败:', error)
      // 首次加载失败时不弹 toast，避免遮盖页面；只在用户主动操作时提示
    } finally {
      setLoading(false)
    }
  }, [projectStatusFilter, debouncedSearchKeyword])

  // 加载 CRF 模板列表
  const fetchCRFTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    try {
      const response = await getCRFTemplates()
      if (response.success) {
        setCrfTemplates(response.data || [])
      }
    } catch (error) {
      console.error('获取 CRF 模板列表失败:', error)
    } finally {
      setTemplatesLoading(false)
    }
  }, [])

  // 加载患者池（用于创建项目时选择患者）
  const fetchPatientPool = useCallback(async () => {
    setPatientPoolLoading(true)
    try {
      const response = await getPatientList({ page: 1, page_size: 100 })
      if (response.success) {
        // 转换数据格式
        const patients = (response.data || []).map(p => ({
          key: p.id,
          id: p.id,
          name: p.name || p.patient_name || '未知',
          gender: p.gender || '未知',
          age: p.age || '-',
          diagnosis: p.diagnosis || p.primary_diagnosis || '未知',
          completeness: parseFloat(p.data_completeness) || 0
        }))
        setPatientPool(patients)
      }
    } catch (error) {
      console.error('获取患者列表失败:', error)
      message.error('获取患者列表失败')
    } finally {
      setPatientPoolLoading(false)
    }
  }, [])

  // 初始加载 CRF 模板（仅挂载时）
  useEffect(() => {
    fetchCRFTemplates()
  }, [fetchCRFTemplates])

  // 加载项目列表：挂载 + 筛选条件变化时重新获取
  const fetchProjectsRef = useRef(fetchProjects)
  fetchProjectsRef.current = fetchProjects
  useEffect(() => {
    // 使用 ref 确保调用最新的 fetchProjects，同时不会因函数引用变化导致重复触发
    let cancelled = false
    const doFetch = async () => {
      try {
        await fetchProjectsRef.current()
      } catch (err) {
        if (!cancelled) {
          console.error('项目列表加载异常:', err)
        }
      }
    }
    doFetch()
    return () => { cancelled = true }
  }, [projectStatusFilter, debouncedSearchKeyword])

  // URL tab 参数与 activeTab 同步（支持从仪表盘「CRF设计」跳转并选中 CRF模版 tab）
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'templates' || tab === 'projects') {
      setActiveTab(tab)
    }
  }, [searchParams])

  const handleCreateProject = () => {
    setCreateProjectVisible(true)
  }

  /**
   * 通过统一的 URL 参数协议打开新建项目向导。
   *
   * 与左侧科研目录栏的“新建项目”入口保持同一流程。
   *
   * @returns {void}
   */
  const openProjectCreateWizard = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('emptyState')
    nextParams.set('tab', 'projects')
    setSearchParams(nextParams, { replace: true })
    dispatchRequestProjectCreate()
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (searchParams.get('openCreate') !== '1') return

    if (searchParams.get('tab') === 'templates') {
      dispatchRequestTemplateCreate()
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('openCreate')
      setSearchParams(nextParams, { replace: true })
      return
    }

    dispatchRequestProjectCreate()
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('openCreate')
    setSearchParams(nextParams, { replace: true })
  }, [navigate, searchParams, setSearchParams])

  /**
   * 防止新建/编辑项目流程与自动跳转最近项目详情产生竞态。
   * 向导或编辑弹窗开启时保持在列表页，避免弹窗被路由切换打断。
   */
  useEffect(() => {
    const isOpenCreate = searchParams.get('openCreate') === '1'
    const currentTab = searchParams.get('tab') || 'projects'
    const emptyState = searchParams.get('emptyState')
    const returnFromTemplate = typeof window !== 'undefined' && window.sessionStorage.getItem('research:return-from-template-once') === '1'
    if (loading || isOpenCreate || projectWizardVisible || editProjectVisible) return
    if (currentTab === 'templates') return
    if (returnFromTemplate) {
      window.sessionStorage.removeItem('research:return-from-template-once')
      return
    }

    const latestProject = pickMostRecentlyUpdatedItem(projectData, [
      (item) => item.updatedAtRaw,
    ])

    if (latestProject?.projectId) {
      if (emptyState) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('emptyState')
        setSearchParams(nextParams, { replace: true })
      }
      navigate(researchProjectDetail(latestProject.projectId), { replace: true })
      return
    }

    if (emptyState !== 'project') {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('emptyState', 'project')
      nextParams.set('tab', 'projects')
      setSearchParams(nextParams, { replace: true })
    }
  }, [editProjectVisible, loading, navigate, projectData, projectWizardVisible, searchParams, setSearchParams])

  // 向导下一步
  const handleWizardNext = async () => {
    if (creatingProject) return
    // 保存当前步骤的表单数据
    if (wizardStep === 0) {
      try {
        const values = await wizardForm.validateFields()
        setProjectForm(prev => ({
          ...prev,
          basicInfo: values
        }))
      } catch (error) {
        // 表单验证失败，不进入下一步
        return
      }
    }
    
    // 进入患者选择步骤时加载患者列表
    if (wizardStep === 1 && patientPool.length === 0) {
      fetchPatientPool()
    }
    
    setWizardStep(wizardStep + 1)
  }

  // 向导上一步
  const handleWizardPrev = () => {
    if (creatingProject) return
    setWizardStep(wizardStep - 1)
  }

  /**
   * 通知主布局刷新科研项目侧栏。
   *
   * @returns {void}
   */
  const emitResearchProjectRailRefresh = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('research-project-rail-refresh'))
  }, [])

  // 完成项目创建
  const handleCompleteProjectCreation = async () => {
    if (creatingProject) return
    setCreatingProject(true)
    try {
      // 从保存的 basicInfo 获取数据
      const basicInfo = projectForm.basicInfo
      
      if (!basicInfo.project_name) {
        message.error('请填写项目名称')
        setWizardStep(0)  // 返回第一步
        return
      }
      
      const projectCreateData = {
        project_name: basicInfo.project_name,
        description: basicInfo.description || '',
        principal_investigator_id: basicInfo.principal_investigator_id || null,
        expected_patient_count: basicInfo.expected_patient_count ? parseInt(basicInfo.expected_patient_count) : null,
        start_date: basicInfo.project_period?.[0]?.format('YYYY-MM-DD') || null,
        end_date: basicInfo.project_period?.[1]?.format('YYYY-MM-DD') || null,
        crf_template_id: null,
        patient_criteria: {},
      }
      
      console.log('创建项目数据:', projectCreateData)
      
      const response = await createProject(projectCreateData)
      if (response.success) {
        const projectId = response.data?.id

        // 将勾选的患者真正入组到项目（写入 /projects/{projectId}/patients/enroll）
        // 这里必须串行入组：后端默认按“当前人数+1”生成 subject_id，
        // 并发请求会导致多个患者拿到相同编号（如都为 001）
        if (projectId && Array.isArray(projectForm.selectedPatients) && projectForm.selectedPatients.length > 0) {
          let successCount = 0
          let failCount = 0
          const failedItems = []

          for (const p of projectForm.selectedPatients) {
            try {
              const res = await enrollPatient(projectId, { patient_id: p.id })
              if (res?.success) {
                successCount += 1
              } else {
                failCount += 1
                failedItems.push({ patientId: p.id, response: res })
              }
            } catch (err) {
              failCount += 1
              failedItems.push({ patientId: p.id, error: err?.message || String(err) })
            }
          }

          if (failCount > 0) {
            console.error('部分患者入组失败:', failedItems)
            message.warning(`项目创建成功：已入组 ${successCount} 人，失败 ${failCount} 人（可在项目内继续添加）`)
          } else {
            message.success(`已自动入组 ${successCount} 名患者`)
          }
        }
        
        // 如果选择了 CRF 模板，关联到项目
        if (projectId && projectForm.crfTemplate) {
          try {
            await assignTemplateToProject(projectId, projectForm.crfTemplate)
            message.success('项目创建成功，已关联 CRF 模板！')
          } catch (err) {
            console.error('关联模板失败:', err)
            message.warning('项目创建成功，但模板关联失败')
          }
        } else {
          message.success('项目创建成功！')
        }
        
        setProjectWizardVisible(false)
        await fetchProjects()  // 刷新列表
        emitResearchProjectRailRefresh()
      } else {
        message.error(response.message || '创建项目失败')
      }
    } catch (error) {
      console.error('创建项目失败:', error)
      message.error('创建项目失败: ' + (error.message || '未知错误'))
    } finally {
      setCreatingProject(false)
    }
  }

  // 编辑项目
  const handleEditProject = (project) => {
    setSelectedProject(project)
    setEditProjectVisible(true)
    editForm.setFieldsValue(buildProjectMetaFormValues({
      ...(project._raw || project),
      crfTemplate: project.crfTemplate || '',
    }))
  }

  // 保存编辑
  const handleSaveEdit = async () => {
    try {
      const values = await editForm.validateFields()
      const updateData = buildProjectMetaUpdatePayload(values)
      
      const response = await updateProject(selectedProject.projectId, updateData)
      if (response.success) {
        message.success('项目更新成功')
        setEditProjectVisible(false)
        await fetchProjects()  // 刷新列表
        emitResearchProjectRailRefresh()
      } else {
        message.error(response.message || '更新项目失败')
      }
    } catch (error) {
      console.error('更新项目失败:', error)
      message.error('更新项目失败')
    }
  }

  // 删除项目
  const handleDeleteProject = async (projectId) => {
    try {
      // 查找真实的 UUID
      const project = projectData.find(p => p.id === projectId)
      if (!project) {
        message.error('项目不存在')
        return
      }
      
      const response = await deleteProject(project.projectId)
      if (response.success) {
        message.success('项目已删除')
        await fetchProjects()  // 刷新列表
        emitResearchProjectRailRefresh()
      } else {
        message.error(response.message || '删除项目失败')
      }
    } catch (error) {
      console.error('删除项目失败:', error)
      message.error('删除项目失败')
    }
  }

  // 启动/暂停项目
  const handleToggleProjectStatus = async (projectId, currentStatus) => {
    try {
      // 查找真实的 UUID
      const project = projectData.find(p => p.id === projectId)
      if (!project) {
        message.error('项目不存在')
        return
      }
      
      const newStatus = currentStatus === 'active' ? 'paused' : 'active'
      const response = await toggleProjectStatus(project.projectId, newStatus)
      if (response.success) {
        message.success(`项目已${newStatus === 'active' ? '启动' : '暂停'}`)
        await fetchProjects()  // 刷新列表
        emitResearchProjectRailRefresh()
      } else {
        message.error(response.message || '切换状态失败')
      }
    } catch (error) {
      console.error('切换状态失败:', error)
      message.error('切换状态失败')
    }
  }

  // 项目数据现在通过 API 加载，存储在 projectData state 中

  // 项目表格列定义
  const projectColumns = [
    {
      title: '项目ID',
      dataIndex: 'id',
      key: 'id',
      width: 100
    },
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <Button 
            type="link" 
            style={{ padding: 0, height: 'auto' }}
            onClick={() => navigate(`/research/projects/${record.projectId}`)}
          >
            {text}
          </Button>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.description}
          </Text>
        </div>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status, record) => {
        const statusMeta = getProjectStatusDisplayMeta(status)
        return <Tag color={record.statusColor || statusMeta.color}>{record.statusLabel || statusMeta.label}</Tag>
      }
    },
    {
      title: '患者数量',
      dataIndex: 'patients',
      key: 'patients',
      width: 100,
      render: (count, record) => (
        <Space direction="vertical" size="small">
          <Text>{count}名患者</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            已抽取: {record.extractedPatients}名
          </Text>
        </Space>
      )
    },
    {
      title: '数据完整度',
      dataIndex: 'completeness',
      key: 'completeness',
      width: 120,
      render: (completeness) => (
        <Progress
          percent={completeness}
          size="small"
          strokeColor={completeness >= 90 ? token.colorSuccess : completeness >= 70 ? token.colorWarning : token.colorError}
        />
      )
    },
    {
      title: 'CRF模版',
      dataIndex: 'crfTemplate',
      key: 'crfTemplate',
      width: 120
    },
    {
      title: '创建者',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 80
    },
    {
      title: '最近更新',
      dataIndex: 'lastUpdate',
      key: 'lastUpdate',
      width: 100
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => navigate(`/research/projects/${record.projectId}`)}
          >
            查看
          </Button>
          <Button 
            type="link" 
            size="small" 
            icon={<EditOutlined />}
            onClick={() => handleEditProject(record)}
          >
            编辑
          </Button>
          {record.status === 'active' ? (
            <Button 
              type="link" 
              size="small" 
              onClick={() => handleToggleProjectStatus(record.id, record.status)}
            >
              暂停
            </Button>
          ) : record.status === 'paused' ? (
            <Button 
              type="link" 
              size="small" 
              onClick={() => handleToggleProjectStatus(record.id, record.status)}
            >
              启动
            </Button>
          ) : null}
          <Popconfirm
            title="确定要删除这个项目吗？"
            description="删除后无法恢复"
            onConfirm={() => handleDeleteProject(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button 
              type="link" 
              size="small" 
              icon={<DeleteOutlined />}
              danger
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]


  // CRF模版详细数据
  const templateDetails = {
    'template1': {
      id: 'template1',
      name: '肿瘤研究模版',
      fields: 45,
      usage: 3,
      status: 'published',
      description: '专门用于肿瘤相关研究的标准化CRF模版',
      version: 'v2.1',
      createdBy: '张医生',
      fieldGroups: [
        {
          id: 'basic',
          name: '基本信息组',
          description: '患者基础信息',
          required: true,
          repeatable: false,
          fields: [
            { id: 'name', name: '患者姓名', type: 'text', required: true, example: '张三' },
            { id: 'gender', name: '性别', type: 'radio', required: true, options: ['男', '女'] },
            { id: 'age', name: '年龄', type: 'number', required: true, example: '45' },
            { id: 'diagnosis_date', name: '诊断日期', type: 'date', required: true }
          ]
        },
        {
          id: 'tumor',
          name: '肿瘤信息组',
          description: '肿瘤相关医学信息',
          required: true,
          repeatable: false,
          fields: [
            { id: 'primary_site', name: '原发部位', type: 'select', required: true, options: ['肺', '肝', '胃', '结肠'] },
            { id: 'pathology', name: '病理类型', type: 'select', required: true, options: ['腺癌', '鳞癌', '小细胞癌'] },
            { id: 'tnm_stage', name: 'TNM分期', type: 'select', required: true, options: ['T1N0M0', 'T2N1M0', 'T3N2M1'] },
            { id: 'biomarker', name: '分子标记物', type: 'checkbox', options: ['EGFR+', 'ALK+', 'ROS1+', 'PD-L1+'] }
          ]
        },
        {
           id: 'treatment',
           name: '治疗记录组',
           description: '治疗方案和疗效记录',
           required: false,
           repeatable: true,
           fields: [
             { id: 'treatment_plan', name: '治疗方案', type: 'select', required: true, options: ['手术', '化疗', '放疗', '靶向治疗', '免疫治疗'] },
             { id: 'cycles', name: '周期数', type: 'number', required: true, example: '6' },
             { id: 'start_date', name: '开始日期', type: 'date', required: true },
             { id: 'response', name: '疗效评估', type: 'select', options: ['完全缓解', '部分缓解', '稳定', '进展'] },
             { id: 'adverse_events', name: '不良反应', type: 'textarea', example: '皮疹、腹泻等' }
           ]
         },
         {
           id: 'lab_blood',
           name: '血常规检查',
           description: '血液常规检验指标（表单字段）',
           required: false,
           repeatable: true,
           isFormField: true,
           fields: [
             { id: 'test_date', name: '检查日期', type: 'date', required: true },
             { id: 'wbc', name: '白细胞计数', type: 'number', required: true, example: '6.5', unit: '×10⁹/L' },
             { id: 'rbc', name: '红细胞计数', type: 'number', required: true, example: '4.2', unit: '×10¹²/L' },
             { id: 'hgb', name: '血红蛋白', type: 'number', required: true, example: '125', unit: 'g/L' },
             { id: 'plt', name: '血小板计数', type: 'number', required: true, example: '280', unit: '×10⁹/L' }
           ]
         },
         {
           id: 'tumor_markers',
           name: '肿瘤标志物',
           description: '肿瘤相关血清标志物检测（表单字段）',
           required: false,
           repeatable: true,
           isFormField: true,
           fields: [
             { id: 'test_date', name: '检测日期', type: 'date', required: true },
             { id: 'cea', name: 'CEA', type: 'number', required: false, example: '3.2', unit: 'ng/mL' },
             { id: 'ca199', name: 'CA19-9', type: 'number', required: false, example: '25.8', unit: 'U/mL' },
             { id: 'ca125', name: 'CA125', type: 'number', required: false, example: '15.6', unit: 'U/mL' },
             { id: 'afp', name: 'AFP', type: 'number', required: false, example: '4.1', unit: 'ng/mL' },
             { id: 'psa', name: 'PSA', type: 'number', required: false, example: '2.8', unit: 'ng/mL' }
           ]
         }
      ]
    },
    'template2': {
      id: 'template2',
      name: '心血管研究模版',
      fields: 32,
      usage: 1,
      status: 'published',
      description: '心血管疾病研究专用CRF模版',
      version: 'v1.5',
      createdBy: '王医生',
      fieldGroups: [
        {
          id: 'basic',
          name: '基本信息组',
          description: '患者基础信息',
          required: true,
          repeatable: false,
          fields: [
            { id: 'name', name: '患者姓名', type: 'text', required: true, example: '李四' },
            { id: 'gender', name: '性别', type: 'radio', required: true, options: ['男', '女'] },
            { id: 'age', name: '年龄', type: 'number', required: true, example: '58' }
          ]
        },
        {
          id: 'cardio',
          name: '心血管信息组',
          description: '心血管相关检查和诊断',
          required: true,
          repeatable: false,
          fields: [
            { id: 'blood_pressure', name: '血压', type: 'text', required: true, example: '140/90 mmHg' },
            { id: 'heart_rate', name: '心率', type: 'number', required: true, example: '75' },
            { id: 'ecg_result', name: '心电图结果', type: 'textarea', example: '窦性心律，ST段轻度压低' }
          ]
        }
      ]
    },
    'template3': {
      id: 'template3',
      name: '免疫治疗模版',
      fields: 38,
      usage: 1,
      status: 'draft',
      description: '免疫治疗效果评估专用模版',
      version: 'v1.0',
      createdBy: '李医生',
      fieldGroups: [
        {
          id: 'basic',
          name: '基本信息组',
          description: '患者基础信息',
          required: true,
          repeatable: false,
          fields: [
            { id: 'name', name: '患者姓名', type: 'text', required: true, example: '王五' },
            { id: 'gender', name: '性别', type: 'radio', required: true, options: ['男', '女'] }
          ]
        }
      ]
    }
  }

  const buildTemplatePreviewSummary = (tpl, templateId) => {
    const rawFieldGroups = Array.isArray(tpl?.field_groups || tpl?.fieldGroups)
      ? (tpl.field_groups || tpl.fieldGroups)
      : []
    const fieldMap = tpl?.db_field_mapping?.field_map || tpl?.db_field_mapping || {}

    const fieldGroups = rawFieldGroups.map((g, idx) => {
      const rawFields = g.db_fields || g.fields || []
      const fieldNames = rawFields
        .map((fid) => fieldMap?.[fid] || String(fid || '').split('/').slice(-1)[0] || fid)
        .filter(Boolean)
      const fieldCount = Number.isFinite(g.field_count) ? g.field_count : rawFields.length

      return {
        id: g.group_id || g.id || `group_${idx}`,
        name: g.group_name || g.name || `分组${idx + 1}`,
        description: g.description || '',
        repeatable: !!(g.is_repeatable || g.repeatable),
        fieldCount,
        sampleFields: fieldNames.slice(0, 8)
      }
    })

    const fallbackFieldCount = fieldGroups.reduce((sum, group) => sum + (group.fieldCount || 0), 0)
    const totalFields = Number.isFinite(tpl?.field_count) ? tpl.field_count : fallbackFieldCount

    return {
      id: tpl.id || tpl.template_id || templateId,
      name: tpl.template_name || tpl.templateName || '未命名模板',
      description: tpl.description || '',
      version: tpl.version || '1.0.0',
      status: tpl.is_published ? 'published' : 'draft',
      category: tpl.category || '通用',
      fieldGroups,
      stats: {
        totalFields,
        groupCount: fieldGroups.length,
        repeatableGroupCount: fieldGroups.filter((group) => group.repeatable).length,
      }
    }
  }

  // 处理模版预览
  const handleTemplatePreview = async (templateId) => {
    try {
      const res = await getCRFTemplate(templateId)
      if (!res.success || !res.data) {
        message.error(res.message || '获取模板详情失败')
        return
      }

      const tpl = res.data
      setCurrentTemplate(buildTemplatePreviewSummary(tpl, templateId))
      setTemplatePreviewVisible(true)
    } catch (e) {
      console.error('获取模板详情失败:', e)
      message.error('获取模板详情失败')
    }
  }

  const handleImportTemplate = async () => {
    try {
      const values = await importForm.validateFields()
      const fileObj = values.file?.[0]?.originFileObj
      if (!fileObj) {
        message.error('请选择 CSV 文件')
        return
      }
      setImportingTemplate(true)
      const res = await importCrfTemplateFromCsv({
        template_name: values.template_name,
        category: values.category,
        description: values.description,
        publish: !!values.publish,
        file: fileObj
      })
      if (res.success) {
        message.success('模板导入成功')
        setImportTemplateVisible(false)
        importForm.resetFields()
        fetchCRFTemplates()
      } else {
        message.error(res.message || '模板导入失败')
      }
    } catch (e) {
      if (e?.errorFields) return
      console.error('模板导入失败:', e)
      message.error('模板导入失败')
    } finally {
      setImportingTemplate(false)
    }
  }

  const getTemplateSchemaVersion = (tpl) => {
    try {
      const { schema } = resolveTemplateAssets(tpl)
      const meta = schema?.['x-schema-meta']
      const v = meta?.version
      return typeof v === 'string' ? v : null
    } catch (e) {
      return null
    }
  }

  // 版本管理：打开版本列表
  const handleOpenTemplateVersions = async (templateId) => {
    setTemplateVersionsVisible(true)
    setTemplateVersionsLoading(true)
    setCurrentTemplateVersions([])
    try {
      const [tplRes, verRes] = await Promise.all([
        getCRFTemplate(templateId),
        listCrfTemplateVersions(templateId)
      ])
      setCurrentTemplateForVersions(tplRes?.success ? tplRes.data : null)
      setCurrentTemplateVersions(verRes?.success && Array.isArray(verRes.data) ? verRes.data : [])
    } catch (e) {
      console.error('加载模板版本失败:', e)
      message.error('加载模板版本失败')
    } finally {
      setTemplateVersionsLoading(false)
    }
  }

  const handleActivateTemplateVersion = async (templateId, schemaVersion) => {
    try {
      const res = await activateCrfTemplateVersion(templateId, schemaVersion)
      if (res?.success) {
        message.success(`已激活版本 ${schemaVersion}`)
        await handleOpenTemplateVersions(templateId)
        fetchCRFTemplates()
      } else {
        message.error(res?.message || '激活失败')
      }
    } catch (e) {
      console.error('激活版本失败:', e)
      message.error('激活版本失败')
    }
  }

  /**
   * 解析模板删除接口所需的数据库 UUID。
   *
   * @param {string} templateId 模板路由 ID 或数据库 UUID
   * @returns {Promise<string>} 可用于删除接口的数据库 UUID
   */
  const resolveTemplateDeleteId = async (templateId) => {
    if (isUuidString(templateId)) {
      return String(templateId).trim()
    }
    const detail = await getCRFTemplate(String(templateId), { _silent: true })
    const detailId = detail?.data?.id
    return isUuidString(detailId) ? String(detailId).trim() : ''
  }

  // 删除 CRF 模板
  const handleDeleteTemplate = async (templateId) => {
    try {
      const deleteId = await resolveTemplateDeleteId(templateId)
      if (!deleteId) {
        message.error('无法解析可删除的数据库模板 ID，请刷新后重试')
        return
      }
      await deleteCrfTemplate(deleteId, { _silent: true })
      message.success('模板已删除，如需恢复可联系管理员')
      fetchCRFTemplates()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('research-template-rail-refresh'))
      }
    } catch (e) {
      console.error('删除模板失败:', e)
      message.error(e instanceof Error && e.message ? e.message : '删除模板失败')
    }
  }

  const sanitizeTemplateCode = (code) => {
    let s = String(code || '').trim().toLowerCase()
    s = s.replace(/[^a-z0-9_-]+/g, '_')
    s = s.replace(/_+/g, '_').replace(/-+/g, '-')
    s = s.replace(/^[_-]+/, '')
    if (!s || !/^[a-z0-9]/.test(s)) s = `tpl_${s || 'copy'}`
    // 3-64
    if (s.length < 3) s = `${s}___`.slice(0, 3)
    if (s.length > 64) s = s.slice(0, 64)
    return s
  }

  const makeSuggestedCloneCode = (tpl) => {
    const base = sanitizeTemplateCode(tpl?.template_code || tpl?.id || 'tpl')
    const ts = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`
    let code = `${base}_${stamp}`
    code = sanitizeTemplateCode(code)
    return code
  }

  const handleCopyTemplate = async (tpl) => {
    if (!tpl) return

    // 文件/系统模板：走 convert（转换为数据库模板，便于编辑）
    if (tpl.source === 'file') {
      try {
        setCloningTemplate(true)
        const res = await convertTemplate(tpl.id)
        if (res?.success) {
          const newId = res?.data?.new_template_id
          message.success('复制成功（已转换为可编辑模板）')
          fetchCRFTemplates()
          if (newId) navigate(templateEdit(newId))
        } else {
          message.error(res?.message || '复制失败')
        }
      } catch (e) {
        console.error('复制模板失败:', e)
        message.error('复制模板失败')
      } finally {
        setCloningTemplate(false)
      }
      return
    }

    // 数据库模板：打开 clone 弹窗，允许编辑 name/code
    setCloneSourceTemplate(tpl)
    setCloneTemplateVisible(true)
    cloneForm.setFieldsValue({
      new_template_name: `${tpl.template_name || 'CRF模板'}_副本`,
      new_template_code: makeSuggestedCloneCode(tpl)
    })
  }

  const handleConfirmCloneTemplate = async () => {
    if (!cloneSourceTemplate) return
    try {
      const values = await cloneForm.validateFields()
      setCloningTemplate(true)
      const res = await cloneCrfTemplate(cloneSourceTemplate.id, values)
      if (res?.success) {
        const newId = res?.data?.id
        message.success('复制成功')
        setCloneTemplateVisible(false)
        setCloneSourceTemplate(null)
        cloneForm.resetFields()
        fetchCRFTemplates()
        if (newId) navigate(templateEdit(newId))
      } else {
        message.error(res?.message || '复制失败')
      }
    } catch (e) {
      if (e?.errorFields) return
      console.error('复制模板失败:', e)
      message.error('复制模板失败')
    } finally {
      setCloningTemplate(false)
    }
  }

  // 项目卡片组件
  const ProjectCard = ({ project }) => {
    const statusMeta = getProjectStatusDisplayMeta(project.status)
    const displayStatusColor = project.statusColor || statusMeta.color
    const displayStatusLabel = project.statusLabel || statusMeta.label

    const titleMaxLen = 12
    const useScrollTitle = (project.name || '').length > titleMaxLen

    return (
      <Card
        hoverable
        style={{
          height: '100%',
          borderLeft: `4px solid ${displayStatusColor}`,
          transition: 'all 0.3s ease',
          cursor: 'pointer'
        }}
        bodyStyle={{ padding: '16px', height: '100%' }}
        className="project-card"
      >
        <style>{`
          @keyframes research-project-title-scroll {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .research-project-title-marquee {
            display: inline-block;
            white-space: nowrap;
            padding-right: 2em;
            animation: research-project-title-scroll 22s linear infinite;
          }
          .research-project-title-marquee:hover {
            animation-play-state: paused;
          }
        `}</style>
        <div style={{ width: '100%' }}>
          {/* 极简信息显示 - 突出重点 */}
          <div style={{ marginBottom: 12 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 8
            }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  marginRight: 10
                }}
              >
                <Tooltip title={project.name} placement="topLeft">
                  <Button
                    type="link"
                    style={{
                      padding: 0,
                      height: 'auto',
                      fontSize: 16,
                      fontWeight: 'bold',
                      color: token.colorText,
                      display: 'block',
                      overflow: useScrollTitle ? 'visible' : 'hidden',
                      textOverflow: useScrollTitle ? 'unset' : 'ellipsis',
                      whiteSpace: useScrollTitle ? 'normal' : 'nowrap'
                    }}
                    onClick={() => navigate(`/research/projects/${project.projectId}`)}
                  >
                    {useScrollTitle ? (
                      <span className="research-project-title-marquee">
                        {project.name} &nbsp;&nbsp;&nbsp;&nbsp; {project.name}
                      </span>
                    ) : (
                      project.name
                    )}
                  </Button>
                </Tooltip>
              </div>
              <Tag
                color={displayStatusColor}
                style={{ fontSize: 12, flexShrink: 0 }}
              >
                {displayStatusLabel}
              </Tag>
            </div>
            
            {/* 核心指标 - 紧凑显示 */}
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
               <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: token.colorPrimary, marginBottom: 2 }}>
                   {project.patients}
                 </div>
                 <Text type="secondary" style={{ fontSize: 12 }}>患者数</Text>
               </div>
               
               <div style={{ textAlign: 'center' }}>
                 <Progress
                   type="circle"
                   percent={project.completeness}
                   size={45}
                  strokeColor={displayStatusColor}
                   format={percent => (
                    <span style={{ fontSize: 12, fontWeight: 'bold' }}>
                       {percent}%
                     </span>
                   )}
                 />
                 <div style={{ marginTop: 2 }}>
                   <Text type="secondary" style={{ fontSize: 12 }}>完整度</Text>
                 </div>
               </div>

               <div style={{ textAlign: 'center' }}>
                 <div style={{ fontSize: 14, fontWeight: 'bold', color: token.colorSuccess, marginBottom: 2 }}>
                   {project.extractedPatients}
                 </div>
                 <Text type="secondary" style={{ fontSize: 12 }}>已抽取</Text>
               </div>
             </div>

             {/* 操作按钮 - 紧凑布局 */}
             <div style={{ display: 'flex', gap: 8 }}>
               <Button 
                 type="primary" 
                 size="small"
                 icon={<EyeOutlined />}
                 onClick={() => navigate(`/research/projects/${project.projectId}`)}
                 style={{ 
                   flex: 1,
                   fontSize: 12
                 }}
               >
                 查看项目
               </Button>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'edit',
                      icon: <EditOutlined />,
                      label: '编辑项目',
                      onClick: () => handleEditProject(project)
                    },
                    {
                      type: 'divider'
                    },
                    ...(project.status === 'active' ? [{
                      key: 'pause',
                      icon: <PauseCircleOutlined />,
                      label: '暂停项目',
                      onClick: () => handleToggleProjectStatus(project.id, project.status)
                    }] : []),
                    ...(project.status === 'paused' ? [{
                      key: 'resume',
                      icon: <PlayCircleOutlined />,
                      label: '恢复项目',
                      onClick: () => handleToggleProjectStatus(project.id, project.status)
                    }] : []),
                    ...[{
                      type: 'divider'
                    }, {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      label: '删除项目',
                      danger: true,
                      onClick: () => {
                        Modal.confirm({
                          title: '确定要删除这个项目吗？',
                          content: '删除后无法恢复',
                          onOk: () => handleDeleteProject(project.id)
                        })
                      }
                    }]
                  ]
                }}
                trigger={['click']}
                placement="bottomRight"
              >
                 <Button size="small" icon={<MoreOutlined />}>
                   更多
                 </Button>
               </Dropdown>
             </div>
          </div>

          {/* 悬停显示的详细信息 */}
          <div 
            className="detailed-info"
            style={{
              opacity: 0,
              maxHeight: 0,
              overflow: 'hidden',
              transition: 'all 0.3s ease',
              background: token.colorBgLayout,
              borderRadius: 4,
              padding: 0,
              marginTop: 8
            }}
          >
            <div style={{ padding: '12px' }}>
              <Text style={{ fontSize: 12, color: token.colorTextSecondary, display: 'block', marginBottom: 8 }}>
                项目详情:
              </Text>
              <div style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>
                  📝 {project.description}
                </Text>
              </div>
              <Row gutter={16}>
                <Col span={8}>
                  <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>项目ID:</Text>
                  <div><Text style={{ fontSize: 12, color: token.colorText }}>{project.id}</Text></div>
                </Col>
                <Col span={8}>
                  <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>负责人:</Text>
                  <div><Text style={{ fontSize: 12, color: token.colorText }}>{project.createdBy}</Text></div>
                </Col>
                <Col span={8}>
                  <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>CRF模版:</Text>
                  <div><Text style={{ fontSize: 12, color: token.colorText }}>{project.crfTemplate}</Text></div>
                </Col>
              </Row>
              <div style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 12, color: token.colorTextSecondary }}>创建时间: </Text>
                <Text style={{ fontSize: 12, color: token.colorText }}>{project.createdAt}</Text>
                <Text style={{ fontSize: 12, color: token.colorTextSecondary, marginLeft: 12 }}>最近更新: </Text>
                <Text style={{ fontSize: 12, color: token.colorText }}>{project.lastUpdate}</Text>
              </div>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  const showProjectEmptyState =
    activeTab === 'projects' &&
    !loading &&
    projectData.length === 0 &&
    searchParams.get('emptyState') === 'project'
  const shouldShowProjectLandingEmptyState = showProjectEmptyState

  const showTemplateEmptyState =
    activeTab === 'templates' &&
    !templatesLoading &&
    crfTemplates.length === 0 &&
    searchParams.get('emptyState') === 'template'

  const tabItems = [
    {
      key: 'projects',
      forceRender: true,
      label: (
        <Space>
          <ExperimentOutlined />
          科研项目
          <Badge count={projectData.length} style={{ backgroundColor: token.colorPrimary }} />
        </Space>
      ),
      children: showProjectEmptyState ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={(
              <Space direction="vertical" size={4} style={{ textAlign: 'center' }}>
                <Text strong style={{ fontSize: 16 }}>暂无科研项目</Text>
                <Text type="secondary">请先创建首个科研项目后再进入数据详情</Text>
              </Space>
            )}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openProjectCreateWizard}
            >
              新建项目
            </Button>
          </Empty>
        </Card>
      ) : (
        <div>
          {/* 项目管理工具栏 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col flex={1}>
                <Space>
                  <Input.Search
                    placeholder="搜索项目名称或描述"
                    style={{ width: 250 }}
                    allowClear
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    onSearch={(value) => setSearchKeyword(value)}
                  />
                  <Select
                    placeholder="项目状态"
                    style={{ width: 120 }}
                    allowClear
                    value={projectStatusFilter}
                    onChange={setProjectStatusFilter}
                  >
                    {projectStatusOptions.map((option) => (
                      <Select.Option key={option.value} value={option.value}>
                        {option.label}
                      </Select.Option>
                    ))}
                  </Select>
                  <Button icon={<FilterOutlined />}>
                    高级筛选
                  </Button>
                </Space>
              </Col>
              <Col>
                <Space>
                  <Radio.Group 
                    value={projectViewMode} 
                    onChange={(e) => setProjectViewMode(e.target.value)}
                    size="small"
                  >
                    <Radio.Button value="card">
                      <AppstoreOutlined /> 卡片视图
                    </Radio.Button>
                    <Radio.Button value="table">
                      <UnorderedListOutlined /> 表格视图
                    </Radio.Button>
                  </Radio.Group>
                 {/*  <Button icon={<SettingOutlined />}>
                    项目设置
                  </Button>*/}
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    onClick={() => dispatchRequestProjectCreate()}
                  >
                    新建项目向导
                  </Button>
                 {/*  <Button 
                    icon={<PlusOutlined />} 
                    onClick={() => setCreateProjectVisible(true)}
                  >
                    快速创建
                  </Button>*/}
                </Space>
              </Col>
            </Row>
          </Card>

          {/* 项目列表 */}
          <Card loading={loading}> 
            {projectViewMode === 'card' ? (
              // 卡片视图 - 网格布局
              <div>
                <Row gutter={[16, 16]}>
                  {projectData
                    .filter(project => !projectStatusFilter || project.status === projectStatusFilter)
                    .map(project => (
                      <Col xs={24} lg={12} xl={8} key={project.key}>
                        <ProjectCard project={project} />
                      </Col>
                    ))
                  }
                </Row>
                {projectData.filter(project => !projectStatusFilter || project.status === projectStatusFilter).length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Text type="secondary">暂无符合条件的项目</Text>
                  </div>
                )}
              </div>
            ) : (
              // 表格视图
              <Table
                columns={projectColumns}
                dataSource={projectData.filter(project => 
                  !projectStatusFilter || project.status === projectStatusFilter
                )}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`
                }}
                size="small"
              />
            )}
          </Card>
        </div>
      )
    },
    {
      key: 'templates',
      forceRender: true,
      label: (
        <Space>
          <FileTextOutlined />
          CRF模版
          <Badge count={crfTemplates.length} style={{ backgroundColor: token.colorWarning }} />
        </Space>
      ),
      children: showTemplateEmptyState ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={(
              <Space direction="vertical" size={4} style={{ textAlign: 'center' }}>
                <Text strong style={{ fontSize: 16 }}>暂无 CRF 模板</Text>
                <Text type="secondary">请先创建首个模板后再进入模板查看页</Text>
              </Space>
            )}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={dispatchRequestTemplateCreate}
            >
              新建模板
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card 
          title="CRF模版管理"
          extra={
            <Space>
              <Button 
                icon={<ReloadOutlined />}
                onClick={fetchCRFTemplates}
                loading={templatesLoading}
              >
                刷新
              </Button>
              <Dropdown 
                menu={{
                  items: [
                    {
                      key: 'designer',
                      icon: <FormOutlined />,
                      label: '可视化设计器',
                      onClick: dispatchRequestTemplateCreate
                    },
                    {
                      key: 'csv',
                      icon: <UploadOutlined />,
                      label: 'CSV 导入',
                      onClick: () => setImportTemplateVisible(true)
                    }
                  ]
                }}
              >
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />}
                >
                  创建新模版 <DownOutlined />
                </Button>
              </Dropdown>
            </Space>
          }
        >
          {templatesLoading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Text type="secondary">加载中...</Text>
            </div>
          ) : (
            <List
              dataSource={crfTemplates}
              renderItem={item => (
                <List.Item
                  actions={[
                    <Button 
                      type="link"
                      onClick={() => handleTemplatePreview(item.id)}
                    >
                      预览
                    </Button>,
                    <Button
                      type="link"
                      icon={<CopyOutlined />}
                      loading={cloningTemplate && cloneSourceTemplate?.id === item.id}
                      onClick={() => handleCopyTemplate(item)}
                    >
                      复制
                    </Button>,
                    (item.source === 'file' || item.is_system) && (
                      <Tooltip title="系统模版不可编辑">
                        <Button type="link" disabled>编辑</Button>
                      </Tooltip>
                    ),
                    item.source === 'database' && !item.is_system && (
                      <Button 
                        type="link"
                        onClick={() => navigate(`/research/templates/${item.id}/edit`)}
                      >
                        编辑
                      </Button>
                    ),
                    item.source === 'database' && !item.is_system && (
                      <Button
                        type="link"
                        onClick={() => handleOpenTemplateVersions(item.id)}
                      >
                        版本管理
                      </Button>
                    ),
                    item.source === 'database' && !item.is_system && (
                      <Popconfirm
                        title="确定要删除这个模板吗？"
                        description="删除后模板将从前台隐藏，如需恢复可联系管理员处理"
                        onConfirm={() => handleDeleteTemplate(item.id)}
                        okText="确定"
                        cancelText="取消"
                      >
                        <Button type="link" danger>删除</Button>
                      </Popconfirm>
                    ),
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar 
                        icon={<FileTextOutlined />} 
                        style={{ 
                          backgroundColor: (item.source === 'file' || item.is_system) ? token.colorPrimary : token.colorSuccess
                        }}
                      />
                    }
                    title={
                      <Space>
                        {item.template_name}
                        <Tag color={item.is_published ? 'green' : 'orange'}>
                          {item.is_published ? '已发布' : '草稿'}
                        </Tag>
                        <Tag color={(item.source === 'file' || item.is_system) ? 'purple' : 'blue'}>
                          {(item.source === 'file' || item.is_system) ? '系统模版' : '自定义'}
                        </Tag>
                        {item.category && <Tag>{item.category}</Tag>}
                      </Space>
                    }
                    description={
                      <div>
                        <Text type="secondary">
                          {item.field_count || 0} 个字段
                          {item.custom_field_count > 0 && ` | ${item.custom_field_count} 个自定义字段`}
                          {item.version && ` | 版本 ${item.version}`}
                        </Text>
                        {item.description && (
                          <div style={{ marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {item.description.substring(0, 80)}...
                            </Text>
                          </div>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          )}
          
          {crfTemplates.length === 0 && !templatesLoading && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Text type="secondary">暂无 CRF 模版</Text>
            </div>
          )}
        </Card>
      )
    }
  ]

  return (
    <div className="page-container fade-in">
      {shouldShowProjectLandingEmptyState ? (
        <Card
          styles={{
            body: {
              minHeight: 420,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={(
              <Text strong style={{ fontSize: 16 }}>
                暂无科研项目
              </Text>
            )}
          >
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openProjectCreateWizard}
            >
              新建项目
            </Button>
          </Empty>
        </Card>
      ) : (
        <>
          {/* 统计面板 - 与患者数据池保持一致的设计风格 */}
          <Card 
            size="small" 
            style={{ marginBottom: 16 }}
            title={
              <Space>
                <Text strong>科研概览</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  实时统计 · 最近更新: {new Date().toLocaleTimeString()}
                </Text>
              </Space>
            }
            extra={
              <Button 
                type="text" 
                size="small"
                icon={statisticsCollapsed ? <DownOutlined /> : <UpOutlined />}
                onClick={() => setStatisticsCollapsed(!statisticsCollapsed)}
              >
                {statisticsCollapsed ? '展开' : '收起'}
              </Button>
            }
            styles={{ body: { padding: statisticsCollapsed ? 0 : undefined, display: statisticsCollapsed ? 'none' : 'block' } }}
          >
            {!statisticsCollapsed && (
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={6}>
                  <div style={{
                    background: token.colorPrimary,
                    borderRadius: 8,
                    padding: '20px',
                    color: 'rgb(255, 255, 255)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <ExperimentOutlined style={{ fontSize: 16, marginRight: 8 }} />
                      <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>活跃项目</Text>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>
                      {projectData.filter(p => p.status === 'active').length}
                    </div>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                      总项目: {projectData.length}个
                    </Text>
                  </div>
                </Col>
                <Col xs={24} sm={6}>
                  <div style={{
                    background: token.colorSuccess,
                    borderRadius: 8,
                    padding: '20px',
                    color: 'rgb(255, 255, 255)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <TeamOutlined style={{ fontSize: 16, marginRight: 8 }} />
                      <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>总患者数</Text>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>
                      {projectData.reduce((sum, p) => sum + p.patients, 0)}
                    </div>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                      已抽取: {projectData.reduce((sum, p) => sum + p.extractedPatients, 0)}名
                    </Text>
                  </div>
                </Col>
                <Col xs={24} sm={6}>
                  <div style={{
                    background: token.colorWarning,
                    borderRadius: 8,
                    padding: '20px',
                    color: 'rgb(255, 255, 255)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <CheckCircleOutlined style={{ fontSize: 16, marginRight: 8 }} />
                      <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>平均完整度</Text>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>
                      {projectData.length > 0 ? Math.round(projectData.reduce((sum, p) => sum + (p.completeness || 0), 0) / projectData.length) : 0}%
                    </div>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                      目标: 90% 以上
                    </Text>
                  </div>
                </Col>
                <Col xs={24} sm={6}>
                  <div style={{
                    background: token.colorInfo || token.colorPrimary,
                    borderRadius: 8,
                    padding: '20px',
                    color: 'rgb(255, 255, 255)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                      <FileTextOutlined style={{ fontSize: 16, marginRight: 8 }} />
                      <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>CRF模版</Text>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>
                      {crfTemplates.length}
                    </div>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                      已发布: {crfTemplates.filter(t => t.is_published).length}个
                    </Text>
                  </div>
                </Col>
              </Row>
            )}
          </Card>

          {/* 主内容区 */}
          <Tabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key)
              setSearchParams({ tab: key }, { replace: true })
            }}
            items={tabItems}
            size="large"
          />
        </>
      )}

      {/* 创建项目弹窗 */}
      <Modal
        title="创建新的科研项目"
        open={createProjectVisible}
        onCancel={() => setCreateProjectVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setCreateProjectVisible(false)}>
            取消
          </Button>,
          <Button key="next" type="primary">
            下一步：选择CRF模版
          </Button>
        ]}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
      >
        <Form layout="vertical">
          <Form.Item label="项目名称" required>
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item label="项目描述" required>
            <Input.TextArea placeholder="请描述项目的研究目标和范围" rows={3} />
          </Form.Item>
          <Form.Item label="预期患者数量">
            <Input placeholder="预估需要多少名患者" suffix="名" />
          </Form.Item>
          <Form.Item label="项目负责人">
            <Select placeholder="选择项目负责人">
              <Select.Option value="zhang">张医生</Select.Option>
              <Select.Option value="li">李医生</Select.Option>
              <Select.Option value="wang">王医生</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

        {/* 新建项目向导弹窗 */}
        <Modal
          title="新建科研项目向导"
          open={projectWizardVisible}
          onCancel={() => !creatingProject && setProjectWizardVisible(false)}
          footer={[
            <Button key="cancel" disabled={creatingProject} onClick={() => setProjectWizardVisible(false)}>
              取消
            </Button>,
            wizardStep > 0 && (
              <Button key="prev" disabled={creatingProject} onClick={handleWizardPrev}>
                上一步
              </Button>
            ),
            wizardStep < 2 ? (
              <Button key="next" type="primary" disabled={creatingProject} onClick={handleWizardNext}>
                下一步
              </Button>
            ) : (
              <Button key="finish" type="primary" loading={creatingProject} disabled={creatingProject} onClick={handleCompleteProjectCreation}>
                完成创建
              </Button>
            )
          ]}
          width={modalWidthPreset.wide}
          styles={modalBodyPreset}
          destroyOnHidden
        >
          <Steps
            current={wizardStep}
            style={{ marginBottom: 24 }}
            items={[
              {
                title: '项目信息',
                description: '填写基本信息',
                icon: <InfoCircleOutlined />
              },
              {
                title: 'CRF模版',
                description: '选择数据模版',
                icon: <FileTextOutlined />
              },
              {
                title: '患者筛选',
                description: '选择研究对象',
                icon: <TeamOutlined />
              }
            ]}
          />

          {/* 步骤1：项目基本信息 */}
          {wizardStep === 0 && (
            <Form form={wizardForm} layout="vertical">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="项目名称" name="project_name" rules={[{ required: true, message: '请输入项目名称' }]}>
                    <Input placeholder="请输入项目名称" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="项目负责人" name="principal_investigator_id">
                    <Select placeholder="选择负责人（默认为创建者）" allowClear>
                      <Select.Option value="">默认（当前用户）</Select.Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="项目描述" name="description" rules={[{ required: true, message: '请输入项目描述' }]}>
                    <Input.TextArea 
                      rows={3} 
                      placeholder="请描述项目的研究目标、方法和预期成果"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="预期患者数量" name="expected_patient_count">
                    <InputNumber min={0} placeholder="预估参与研究的患者数量" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="项目周期" name="project_period">
                    <DatePicker.RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          )}

          {/* 步骤2：CRF模版选择 */}
          {wizardStep === 1 && (
            <div>
              <Alert
                message="选择CRF模版"
                description="选择适合您研究的CRF模版，系统将根据模版定义自动从患者文档中抽取数据"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              
              {templatesLoading ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <Text type="secondary">加载模版中...</Text>
                </div>
              ) : (
                <Row gutter={[16, 16]}>
                  {crfTemplates.map(template => {
                    const isSelected = projectForm.crfTemplate === template.id
                    const iconColor = template.category === '肺癌' ? token.colorPrimary :
                                     template.category === '糖尿病' ? token.colorSuccess :
                                     template.category === '心血管疾病' ? token.colorError : token.colorWarning
                    const Icon = template.category === '肺癌' ? MedicineBoxOutlined :
                                template.category === '糖尿病' ? ThunderboltOutlined :
                                template.category === '心血管疾病' ? HeartOutlined : ExperimentOutlined
                    
                    return (
                      <Col span={8} key={template.id}>
                        <Card 
                          size="small" 
                          hoverable
                          style={{ 
                            border: isSelected ? `2px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
                            cursor: 'pointer',
                            height: '100%'
                          }}
                          onClick={() => setProjectForm({...projectForm, crfTemplate: template.id})}
                        >
                          <div style={{ textAlign: 'center' }}>
                            <Icon style={{ fontSize: 16, color: iconColor }} />
                            <Title level={5} style={{ marginTop: 8, marginBottom: 4 }}>
                              {template.template_name}
                            </Title>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                              {template.description?.substring(0, 50) || '暂无描述'}...
                            </Text>
                            <div>
                              <Tag color={iconColor}>{template.category || '通用'}</Tag>
                              <Tag>{template.field_count || 0} 个字段</Tag>
                              {template.custom_field_count > 0 && (
                                <Tag color="orange">{template.custom_field_count} 自定义</Tag>
                              )}
                            </div>
                            {(template.source === 'file' || template.is_system) && (
                              <div style={{ marginTop: 4 }}>
                                <Tag color="green" style={{ fontSize: 12 }}>系统模版</Tag>
                              </div>
                            )}
                          </div>
                        </Card>
                      </Col>
                    )
                  })}
                  
                  {/* 自定义模版选项 */}
                  <Col span={8}>
                    <Card 
                      size="small" 
                      hoverable
                      style={{ 
                        border: projectForm.crfTemplate === 'custom' ? `2px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
                        cursor: 'pointer',
                        height: '100%'
                      }}
                      onClick={() => {
                        message.info('自定义模版功能开发中')
                        // setProjectForm({...projectForm, crfTemplate: 'custom'})
                      }}
                    >
                      <div style={{ textAlign: 'center' }}>
                        <SettingOutlined style={{ fontSize: 16, color: token.colorTextSecondary }} />
                        <Title level={5} style={{ marginTop: 8, marginBottom: 4 }}>
                          自定义模版
                        </Title>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                          从空白模版开始，自定义研究字段
                        </Text>
                        <div>
                          <Tag color="default">即将上线</Tag>
                        </div>
                      </div>
                    </Card>
                  </Col>
                </Row>
              )}

              {projectForm.crfTemplate && projectForm.crfTemplate !== 'custom' && (
                <Card size="small" style={{ marginTop: 16 }} title="已选择的模版">
                  {(() => {
                    const selected = crfTemplates.find(t => t.id === projectForm.crfTemplate)
                    if (!selected) return null
                    return (
                      <div>
                        <Row gutter={16}>
                          <Col span={8}>
                            <Text type="secondary">模版名称：</Text>
                            <Text strong>{selected.template_name}</Text>
                          </Col>
                          <Col span={8}>
                            <Text type="secondary">分类：</Text>
                            <Tag color="blue">{selected.category || '通用'}</Tag>
                          </Col>
                          <Col span={8}>
                            <Text type="secondary">版本：</Text>
                            <Text>{selected.version || '1.0.0'}</Text>
                          </Col>
                        </Row>
                        <div style={{ marginTop: 12 }}>
                          <Text type="secondary">字段组：</Text>
                          <div style={{ marginTop: 4 }}>
                            {(selected.field_groups || []).map(group => (
                              <Tag key={group.group_id} style={{ marginBottom: 4 }}>
                                {group.group_name} ({group.field_count}字段)
                              </Tag>
                            ))}
                          </div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <Button 
                            type="link" 
                            size="small"
                            onClick={() => handleTemplatePreview(selected.id)}
                          >
                            预览字段结构
                          </Button>
                        </div>
                      </div>
                    )
                  })()}
                </Card>
              )}
            </div>
          )}

          {/* 步骤3：患者筛选 */}
          {wizardStep === 2 && (
            <div>
              <Alert
                message="筛选研究患者"
                description="从患者数据池中筛选符合研究条件的患者"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Select placeholder="性别" style={{ width: '100%' }} allowClear>
                    <Select.Option value="男">男</Select.Option>
                    <Select.Option value="女">女</Select.Option>
                  </Select>
                </Col>
                <Col span={6}>
                  <Select placeholder="年龄范围" style={{ width: '100%' }} allowClear>
                    <Select.Option value="18-40">18-40岁</Select.Option>
                    <Select.Option value="41-60">41-60岁</Select.Option>
                    <Select.Option value="60+">60岁以上</Select.Option>
                  </Select>
                </Col>
                <Col span={6}>
                  <Select placeholder="科室" style={{ width: '100%' }} allowClear>
                    <Select.Option value="肿瘤科">肿瘤科</Select.Option>
                    <Select.Option value="心内科">心内科</Select.Option>
                    <Select.Option value="内分泌科">内分泌科</Select.Option>
                  </Select>
                </Col>
                <Col span={6}>
                  <Select placeholder="诊断" style={{ width: '100%' }} allowClear>
                    <Select.Option value="肺癌">肺癌</Select.Option>
                    <Select.Option value="高血压">高血压</Select.Option>
                    <Select.Option value="糖尿病">糖尿病</Select.Option>
                  </Select>
                </Col>
              </Row>

              <Table
                rowSelection={{
                  type: 'checkbox',
                  onChange: (selectedRowKeys, selectedRows) => {
                    setProjectForm({...projectForm, selectedPatients: selectedRows})
                  }
                }}
                columns={[
                  { title: '患者ID', dataIndex: 'id', key: 'id', width: 120,
                    render: (id) => <Text copyable={{ text: id }}>{id?.substring(0, 8)}...</Text>
                  },
                  { title: '姓名', dataIndex: 'name', key: 'name', width: 80 },
                  { title: '性别', dataIndex: 'gender', key: 'gender', width: 60 },
                  { title: '年龄', dataIndex: 'age', key: 'age', width: 60 },
                  { title: '诊断', dataIndex: 'diagnosis', key: 'diagnosis', width: 120 },
                  { title: '完整度', dataIndex: 'completeness', key: 'completeness', width: 100,
                    render: (completeness) => (
                      <Progress percent={completeness} size="small" />
                    )
                  }
                ]}
                dataSource={patientPool}
                loading={patientPoolLoading}
                pagination={{ pageSize: 10 }}
                size="small"
                locale={{ emptyText: patientPoolLoading ? '加载中...' : '暂无患者数据' }}
              />

              <div style={{ marginTop: 16 }}>
                <Text strong>已选择 {projectForm.selectedPatients.length} 名患者</Text>
              </div>
            </div>
          )}
        </Modal>

        {/* 编辑项目弹窗 */}
        <Modal
          title="编辑项目信息"
          open={editProjectVisible}
          onCancel={() => setEditProjectVisible(false)}
          footer={[
            <Button key="cancel" onClick={() => setEditProjectVisible(false)}>
              取消
            </Button>,
            <Button key="save" type="primary" onClick={handleSaveEdit}>
              保存修改
            </Button>
          ]}
          width={modalWidthPreset.standard}
          styles={modalBodyPreset}
        >
          {selectedProject && (
            <Form form={editForm} layout="vertical">
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item label="项目名称" name="name" rules={[{ required: true, message: '请输入项目名称' }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="项目描述" name="description">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="项目状态" name="status">
                    <Select>
                      {projectStatusOptions.map((option) => (
                        <Select.Option key={option.value} value={option.value}>
                          {option.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="CRF模版" name="crfTemplate">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="预期患者数量" name="expected_patient_count">
                    <InputNumber min={0} placeholder="预估参与研究的患者数量" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="项目周期" name="project_period">
                    <DatePicker.RangePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          )}
        </Modal>

      {/* CRF模版预览弹窗 */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            CRF模版预览 - {currentTemplate?.name}
          </Space>
        }
        open={templatePreviewVisible}
        onCancel={() => {
          setTemplatePreviewVisible(false)
          setCurrentTemplate(null)
        }}
        footer={[
          <Button key="close" onClick={() => {
            setTemplatePreviewVisible(false)
            setCurrentTemplate(null)
          }}>
            关闭
          </Button>
        ]}
        width={modalWidthPreset.xwide}
        styles={modalBodyPreset}
      >
        {currentTemplate && (
          <div>
            {/* 模版基本信息 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <div>
                    <Text type="secondary">模版名称:</Text>
                    <div><Text strong>{currentTemplate.name}</Text></div>
                  </div>
                </Col>
                <Col span={8}>
                  <div>
                    <Text type="secondary">版本:</Text>
                    <div><Text strong>{currentTemplate.version}</Text></div>
                  </div>
                </Col>
                <Col span={8}>
                  <div>
                    <Text type="secondary">字段总数:</Text>
                    <div><Text strong>{currentTemplate.stats.totalFields}个</Text></div>
                  </div>
                </Col>
                <Col span={24} style={{ marginTop: 8 }}>
                  <Text type="secondary">描述:</Text>
                  <div><Text>{currentTemplate.description}</Text></div>
                </Col>
              </Row>
            </Card>

            <Card size="small" title="字段组摘要">
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                {currentTemplate.fieldGroups.map(group => (
                  <Card key={group.id} size="small" style={{ marginBottom: 12 }}>
                    <Row justify="space-between" align="top" gutter={12}>
                      <Col flex="auto">
                        <Space wrap>
                          <Text strong>{group.name}</Text>
                          <Tag>{group.fieldCount} 个字段</Tag>
                          {group.repeatable && <Tag color="orange">可重复</Tag>}
                        </Space>
                        {group.description && (
                          <div style={{ marginTop: 6 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {group.description}
                            </Text>
                          </div>
                        )}
                        {group.sampleFields.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <Space size={[4, 8]} wrap>
                              {group.sampleFields.map((fieldName) => (
                                <Tag key={`${group.id}-${fieldName}`}>{fieldName}</Tag>
                              ))}
                              {group.fieldCount > group.sampleFields.length && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  仅显示前 {group.sampleFields.length} 个字段
                                </Text>
                              )}
                            </Space>
                          </div>
                        )}
                      </Col>
                    </Row>
                  </Card>
                ))}
              </div>
            </Card>

            {/* 模版统计信息 */}
            <Card size="small" title="模版统计" style={{ marginTop: 16 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="字段组数"
                    value={currentTemplate.stats.groupCount}
                    suffix="个"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="可重复组"
                    value={currentTemplate.stats.repeatableGroupCount}
                    suffix="个"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="模板状态"
                    value={currentTemplate.status === 'published' ? '已发布' : '草稿'}
                  />
                </Col>
              </Row>
            </Card>
          </div>
        )}
      </Modal>

      {/* CRF 模板版本管理 */}
      <Modal
        title="版本管理"
        open={templateVersionsVisible}
        onCancel={() => {
          setTemplateVersionsVisible(false)
          setCurrentTemplateForVersions(null)
          setCurrentTemplateVersions([])
        }}
        footer={[
          <Button key="close" onClick={() => setTemplateVersionsVisible(false)}>
            关闭
          </Button>
        ]}
        width={modalWidthPreset.xwide}
        styles={modalBodyPreset}
      >
        <div style={{ marginBottom: 12 }}>
          <Space>
            <Text strong>当前模板：</Text>
            <Text>
              {currentTemplateForVersions?.template_name ||
                currentTemplateForVersions?.templateName ||
                currentTemplateForVersions?.name ||
                '-'}
            </Text>
            <Tag color="blue">
              当前 Schema 版本: {getTemplateSchemaVersion(currentTemplateForVersions) || '-'}
            </Tag>
          </Space>
        </div>

        <Table
          rowKey="schema_version"
          loading={templateVersionsLoading}
          dataSource={currentTemplateVersions}
          pagination={{ pageSize: 8 }}
          size="small"
          columns={[
            {
              title: 'Schema版本',
              dataIndex: 'schema_version',
              key: 'schema_version',
              width: 140,
              render: (v) => <Text code>{v}</Text>
            },
            {
              title: '变更级别',
              dataIndex: 'bump',
              key: 'bump',
              width: 100,
              render: (b) =>
                b ? (
                  <Tag color={b === 'major' ? 'red' : b === 'minor' ? 'orange' : 'green'}>{b}</Tag>
                ) : (
                  <Text type="secondary">-</Text>
                )
            },
            {
              title: '变更数',
              dataIndex: 'changes',
              key: 'changes',
              width: 90,
              render: (changes) => (Array.isArray(changes) ? changes.length : 0)
            },
            {
              title: '动作',
              dataIndex: 'action',
              key: 'action',
              width: 140
            },
            {
              title: '创建时间',
              dataIndex: 'created_at',
              key: 'created_at',
              width: 200,
              render: (t) => <Text type="secondary">{t || '-'}</Text>
            },
            {
              title: '发布',
              dataIndex: 'is_published',
              key: 'is_published',
              width: 80,
              render: (p) => (p ? <Tag color="green">已发布</Tag> : <Tag color="default">草稿</Tag>)
            },
            {
              title: '操作',
              key: 'op',
              render: (_, row) => {
                const current = getTemplateSchemaVersion(currentTemplateForVersions)
                const isCurrent = current && row.schema_version === current
                const templateId =
                  currentTemplateForVersions?.id ||
                  currentTemplateForVersions?.template_id ||
                  currentTemplateForVersions?.templateId
                return (
                  <Space size="small">
                    <Button
                      type="link"
                      onClick={() => {
                        Modal.info({
                          title: `变更明细 - ${row.schema_version}`,
                          width: 900,
                          content: (
                            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 420, overflow: 'auto' }}>
                              {JSON.stringify(row.changes || [], null, 2)}
                            </pre>
                          )
                        })
                      }}
                    >
                      查看变更
                    </Button>
                    {isCurrent ? (
                      <Tag color="blue">当前</Tag>
                    ) : (
                      <Popconfirm
                        title={`激活版本 ${row.schema_version}？`}
                        description="只切换模板 Schema 版本，不做旧数据迁移。"
                        okText="激活"
                        cancelText="取消"
                        onConfirm={() => handleActivateTemplateVersion(templateId, row.schema_version)}
                      >
                        <Button type="link">激活</Button>
                      </Popconfirm>
                    )}
                  </Space>
                )
              }
            }
          ]}
        />
      </Modal>

      {/* CSV 导入创建 CRF 模板 */}
      <Modal
        title="导入 CSV 创建 CRF 模板"
        open={importTemplateVisible}
        onCancel={() => setImportTemplateVisible(false)}
        onOk={handleImportTemplate}
        okText="导入"
        confirmLoading={importingTemplate}
        width={modalWidthPreset.wide}
        styles={modalBodyPreset}
      >
        <Form form={importForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="模板名称"
                name="template_name"
                rules={[{ required: true, message: '请输入模板名称' }]}
              >
                <Input placeholder="例如: 肝胆外科字段集 v1" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="分类" name="category">
                <Input placeholder="例如: 肝胆外科" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="导入后直接发布" name="publish" valuePropName="checked" initialValue={false}>
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>

          <Form.Item
            label="CSV 文件"
            name="file"
            valuePropName="fileList"
            getValueFromEvent={(e) => (Array.isArray(e) ? e : e?.fileList)}
            rules={[
              {
                validator: async (_, fileList) => {
                  if (Array.isArray(fileList) && fileList.length > 0) return
                  throw new Error('请选择 CSV 文件')
                }
              }
            ]}
          >
            <Upload
              beforeUpload={() => false}
              maxCount={1}
              accept=".csv,text/csv"
            >
              <Button icon={<UploadOutlined />}>选择 CSV 文件</Button>
            </Upload>
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message="说明"
            description="CSV 为权威来源。系统会按“文件夹+层级1..10”生成字段路径（用 / 分隔并清洗），并生成 schema/枚举集/字段组信息。"
          />
        </Form>
      </Modal>

      {/* 复制 CRF 模板（数据库模板 clone） */}
      <Modal
        title="复制 CRF 模板"
        open={cloneTemplateVisible}
        onCancel={() => {
          if (cloningTemplate) return
          setCloneTemplateVisible(false)
          setCloneSourceTemplate(null)
          cloneForm.resetFields()
        }}
        onOk={handleConfirmCloneTemplate}
        okText="创建副本"
        cancelText="取消"
        confirmLoading={cloningTemplate}
        centered
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="将创建一个新的草稿模板副本，复制完成后会自动跳转到编辑页。"
        />
        <Form form={cloneForm} layout="vertical">
          <Form.Item label="来源模板" style={{ marginBottom: 12 }}>
            <Text strong>{cloneSourceTemplate?.template_name || '--'}</Text>
            <Text type="secondary" style={{ marginLeft: 8 }}>
              {cloneSourceTemplate?.template_code ? `(${cloneSourceTemplate.template_code})` : ''}
            </Text>
          </Form.Item>
          <Form.Item
            name="new_template_name"
            label="新模板名称"
            rules={[{ required: true, message: '请输入新模板名称' }]}
          >
            <Input placeholder="例如：肺癌随访表_副本" maxLength={80} />
          </Form.Item>
          <Form.Item
            name="new_template_code"
            label="新模板 code（全局唯一）"
            tooltip="仅支持小写字母/数字/下划线/短横线，3-64 位，且必须以字母或数字开头"
            rules={[
              { required: true, message: '请输入新模板 code' },
              { pattern: /^[a-z0-9][a-z0-9_-]{2,63}$/, message: '格式不正确：需满足 ^[a-z0-9][a-z0-9_-]{2,63}$' }
            ]}
          >
            <Input placeholder="例如：lung_followup_20260209143001" />
          </Form.Item>
        </Form>
      </Modal>
      </div>
    )
  }
  
  export default ResearchDataset