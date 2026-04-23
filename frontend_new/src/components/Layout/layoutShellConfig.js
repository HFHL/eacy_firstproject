/**
 * 顶层导航域配置，保持与 `first-project` 现有路由契约一致。
 */
import { RESEARCH_HOME_PATH, RESEARCH_TEMPLATE_CREATE_PATH } from '../../utils/researchPaths'

export const PRIMARY_NAV_CONFIG = {
  dashboard: { key: 'dashboard', label: '主页', path: '/dashboard' },
  document: { key: 'document', label: '文档', path: '/document/file-list' },
  patient: { key: 'patient', label: '患者', path: '/patient/pool' },
  research: { key: 'research', label: '科研', path: RESEARCH_HOME_PATH },
  admin: { key: 'admin', label: '管理', path: '/admin' },
}

/**
 * 顶层导航展示顺序。
 */
export const PRIMARY_NAV_ORDER = ['dashboard', 'document', 'patient', 'research', 'admin']

/**
 * 全站搜索的页面级快捷入口。
 */
export const PAGE_SEARCH_ENTRIES = [
  { label: '仪表板', path: '/dashboard', navKey: 'dashboard', iconKey: 'dashboard', keywords: '仪表板 首页 dashboard home' },
  { label: '文件列表', path: '/document/file-list', navKey: 'document', iconKey: 'document', keywords: '文件 文档 列表 file document list' },
  { label: '上传文档', path: '/document/upload', navKey: 'document', iconKey: 'upload', keywords: '上传 导入 upload import' },
  { label: '患者数据池', path: '/patient/pool', navKey: 'patient', iconKey: 'patient', keywords: '患者 数据池 patient pool' },
  { label: '科研数据集', path: RESEARCH_HOME_PATH, navKey: 'research', iconKey: 'research', keywords: '科研 项目 数据集 research project' },
  { label: '个人资料', path: '/user/profile', navKey: 'dashboard', iconKey: 'user', keywords: '个人 资料 profile' },
  { label: '系统设置', path: '/user/settings', navKey: 'dashboard', iconKey: 'settings', keywords: '设置 系统 settings' },
  { label: '管理后台', path: '/admin', navKey: 'admin', iconKey: 'admin', keywords: '管理 后台 admin 用户 抽取 模板' },
]

/**
 * 根据路径解析当前顶层导航域。
 *
 * @param {string} path 当前路径
 * @returns {string} 顶层导航 key
 */
export const resolvePrimaryNavKey = (path) => {
  if (path.startsWith('/document')) return 'document'
  if (path.startsWith('/patient')) return 'patient'
  if (path.startsWith('/research')) return 'research'
  if (path.startsWith('/admin')) return 'admin'
  return 'dashboard'
}

/**
 * 兼容原有 Redux `activeMenuKey` 语义，避免页面权限与菜单状态回退。
 *
 * @param {string} path 当前路径
 * @returns {string} 旧菜单 key
 */
export const resolveActiveMenuKey = (path) => {
  if (path.startsWith('/document')) return 'document-file-list'
  if (path.startsWith('/patient')) return 'patient-pool'
  if (path.startsWith('/research')) return 'research'
  if (path.startsWith('/admin')) return 'admin'
  return 'dashboard'
}

/**
 * 某些科研设计器页面不显示二级 rail，避免编辑空间被压缩。
 *
 * @param {string} path 当前路径
 * @returns {boolean} 是否为科研设计态页面
 */
export const isResearchDesignerRoute = (path) => {
  if (!path.startsWith('/research')) return false
  if (path === RESEARCH_TEMPLATE_CREATE_PATH) return true
  if (/^\/research\/templates\/[^/]+\/edit$/.test(path)) return true
  if (/^\/research\/projects\/[^/]+\/template\/edit$/.test(path)) return true
  return false
}

/**
 * 在路由句柄缺失时提供最小可用面包屑。
 *
 * @param {string} path 当前路径
 * @returns {string[]} 面包屑文案
 */
export const resolveFallbackBreadcrumbs = (path) => {
  if (path.startsWith('/document/upload')) return ['文件列表', '文档上传']
  if (path.startsWith('/document/processing')) return ['文件列表', '归档及审核']
  if (path.startsWith('/document')) return ['文件列表']
  if (path.startsWith('/patient/detail')) return ['患者数据池', '患者详情']
  if (path.startsWith('/patient')) return ['患者数据池']
  if (path.startsWith('/research/projects/')) return ['科研数据集管理', '项目数据集']
  if (path.startsWith(RESEARCH_TEMPLATE_CREATE_PATH)) return ['科研数据集管理', '创建 CRF 模版']
  if (path.startsWith('/research/templates/')) return ['科研数据集管理', '查看 CRF 模版']
  if (path.startsWith('/research')) return ['科研数据集管理']
  if (path.startsWith('/admin')) return ['管理后台']
  if (path.startsWith('/user/profile')) return ['用户中心', '个人资料']
  if (path.startsWith('/user/settings')) return ['用户中心', '系统设置']
  return ['仪表板']
}
