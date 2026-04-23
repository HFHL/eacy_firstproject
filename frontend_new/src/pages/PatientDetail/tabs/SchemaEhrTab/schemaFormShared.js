/**
 * SchemaEhrTab 共享工具：
 * 1) 解析 Schema $defs 枚举
 * 2) 统一三栏布局 props 协议
 */

/**
 * 患者详情页 SchemaForm 布局默认配置。
 * @type {{siderWidth:number, sourcePanelWidth:undefined|number, collapsible:boolean, showSourcePanel:boolean, contentAdaptive:boolean, collapsedTitle:string}}
 */
export const PATIENT_SCHEMA_FORM_LAYOUT_DEFAULTS = Object.freeze({
  siderWidth: 220,
  sourcePanelWidth: undefined,
  collapsible: true,
  showSourcePanel: true,
  contentAdaptive: false,
  collapsedTitle: '目录'
})

/**
 * 科研患者详情页 SchemaForm 布局默认配置。
 * @type {{siderWidth:number, sourcePanelWidth:undefined|number, collapsible:boolean, showSourcePanel:boolean, contentAdaptive:boolean, collapsedTitle:string}}
 */
export const PROJECT_SCHEMA_FORM_LAYOUT_DEFAULTS = Object.freeze({
  siderWidth: 260,
  sourcePanelWidth: undefined,
  collapsible: true,
  showSourcePanel: true,
  contentAdaptive: false,
  collapsedTitle: '目录'
})

/**
 * 解析 Schema 中的 $defs 枚举定义。
 * @param {Object} schema - JSON Schema 对象。
 * @returns {Record<string, {id:string, type:string, values:Array}>} 枚举映射。
 */
export function parseSchemaDefsToEnums(schema) {
  const enums = {}
  if (schema?.$defs) {
    for (const [enumId, enumDef] of Object.entries(schema.$defs)) {
      if (enumDef?.enum) {
        enums[enumId] = {
          id: enumId,
          type: enumDef.type || 'string',
          values: [...enumDef.enum]
        }
      }
    }
  }
  return enums
}

/**
 * 合并并标准化三栏布局 props（忽略 undefined 覆盖）。
 * @param {Object} defaults - 默认布局配置。
 * @param {Object} [overrides={}] - 页面级覆盖配置。
 * @returns {{siderWidth:number, sourcePanelWidth:undefined|number, collapsible:boolean, showSourcePanel:boolean, contentAdaptive:boolean, collapsedTitle:string}} 标准化后的配置。
 */
export function createSchemaFormLayoutProps(defaults, overrides = {}) {
  const normalizedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, value]) => value !== undefined)
  )
  return {
    ...defaults,
    ...normalizedOverrides
  }
}
