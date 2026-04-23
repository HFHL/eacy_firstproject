/**
 * @file 模板资产解析工具
 */

/**
 * 资产解析策略（灰度/回滚开关）。
 * - top-first: 顶层优先（目标策略）
 * - layout-first: layout_config 优先（兼容回滚策略）
 */
export const TEMPLATE_ASSET_STRATEGY = {
  TOP_FIRST: 'top-first',
  LAYOUT_FIRST: 'layout-first',
}

/**
 * 当前生效策略：默认 top-first，可通过环境变量回滚。
 * @type {string}
 */
export const ACTIVE_TEMPLATE_ASSET_STRATEGY = (
  import.meta?.env?.VITE_CRF_TEMPLATE_ASSET_STRATEGY || TEMPLATE_ASSET_STRATEGY.TOP_FIRST
).toLowerCase()

/**
 * 将字符串 JSON 资产解析为对象。
 * @param {any} asset
 * @returns {any}
 */
export const parseJsonAsset = (asset) => {
  if (typeof asset !== 'string') return asset
  const text = asset.trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (_error) {
    return asset
  }
}

/**
 * 从模板载荷中解析 designer/schema 资产，并给出来源标记。
 * 默认优先顶层资产，必要时可切到 layout_config 优先模式。
 * @param {Object} payload
 * @param {{preferLayoutConfig?: boolean}=} options
 * @returns {{designer: any, schema: any, sources: {designer: string|null, schema: string|null}}}
 */
export const resolveTemplateAssets = (payload, options = {}) => {
  const {
    preferLayoutConfig = false,
    strategy = ACTIVE_TEMPLATE_ASSET_STRATEGY,
    collectTelemetry = true,
  } = options
  const shouldPreferLayout = preferLayoutConfig || strategy === TEMPLATE_ASSET_STRATEGY.LAYOUT_FIRST
  const data = payload && typeof payload === 'object' ? payload : {}
  const layoutConfig = data.layout_config && typeof data.layout_config === 'object'
    ? data.layout_config
    : {}

  const designerCandidates = shouldPreferLayout
    ? [
      ['layout_config.designer', layoutConfig.designer],
      ['top.designer', data.designer],
    ]
    : [
      ['top.designer', data.designer],
      ['layout_config.designer', layoutConfig.designer],
    ]

  const schemaCandidates = shouldPreferLayout
    ? [
      ['layout_config.schema_json', layoutConfig.schema_json],
      ['layout_config.schema', layoutConfig.schema],
      ['top.schema_json', data.schema_json],
      ['top.schema', data.schema],
    ]
    : [
      ['top.schema_json', data.schema_json],
      ['top.schema', data.schema],
      ['layout_config.schema_json', layoutConfig.schema_json],
      ['layout_config.schema', layoutConfig.schema],
    ]

  let designer = null
  let schema = null
  let designerSource = null
  let schemaSource = null

  for (const [source, asset] of designerCandidates) {
    const parsed = parseJsonAsset(asset)
    if (parsed !== null && parsed !== undefined && parsed !== '') {
      designer = parsed
      designerSource = source
      break
    }
  }

  for (const [source, asset] of schemaCandidates) {
    const parsed = parseJsonAsset(asset)
    if (parsed !== null && parsed !== undefined && parsed !== '') {
      schema = parsed
      schemaSource = source
      break
    }
  }

  const warnings = []
  const hasTopSchema = data.schema_json !== null && data.schema_json !== undefined
  const hasLayoutSchema = layoutConfig.schema_json !== null && layoutConfig.schema_json !== undefined
  const hasTopDesigner = data.designer !== null && data.designer !== undefined
  const hasLayoutDesigner = layoutConfig.designer !== null && layoutConfig.designer !== undefined
  if (hasTopSchema && hasLayoutSchema && schemaSource === 'layout_config.schema_json') {
    warnings.push('CRF_ASSET_FALLBACK_LAYOUT_SCHEMA_JSON')
  }
  if (hasTopSchema && hasLayoutSchema && JSON.stringify(parseJsonAsset(data.schema_json)) !== JSON.stringify(parseJsonAsset(layoutConfig.schema_json))) {
    warnings.push('CRF_ASSET_CONFLICT_SCHEMA')
  }
  if (hasTopDesigner && hasLayoutDesigner && JSON.stringify(parseJsonAsset(data.designer)) !== JSON.stringify(parseJsonAsset(layoutConfig.designer))) {
    warnings.push('CRF_ASSET_CONFLICT_DESIGNER')
  }
  if (!schema) {
    warnings.push('CRF_ASSET_MISSING_SCHEMA')
  }
  if (
    warnings.includes('CRF_ASSET_FALLBACK_LAYOUT_SCHEMA_JSON')
    && collectTelemetry
    && typeof console !== 'undefined'
    && import.meta?.env?.MODE !== 'test'
  ) {
    console.warn('[CRF_ASSET_CONTRACT] fallback to layout_config.schema_json', {
      contractVersion: '2026-04-crf-template-assets-v1',
      schemaSource,
    })
  }

  if (collectTelemetry && typeof window !== 'undefined') {
    if (!window.__CRF_TEMPLATE_ASSET_METRICS__) {
      window.__CRF_TEMPLATE_ASSET_METRICS__ = {
        total: 0,
        topSchemaHits: 0,
        layoutSchemaHits: 0,
        missingSchemaHits: 0,
        conflictHits: 0,
      }
    }
    const metrics = window.__CRF_TEMPLATE_ASSET_METRICS__
    metrics.total += 1
    if (schemaSource && schemaSource.startsWith('top.')) metrics.topSchemaHits += 1
    if (schemaSource && schemaSource.startsWith('layout_config.')) metrics.layoutSchemaHits += 1
    if (!schema) metrics.missingSchemaHits += 1
    if (warnings.includes('CRF_ASSET_CONFLICT_SCHEMA') || warnings.includes('CRF_ASSET_CONFLICT_DESIGNER')) {
      metrics.conflictHits += 1
    }
  }

  return {
    designer,
    schema,
    sources: {
      designer: designerSource,
      schema: schemaSource,
    },
    warnings,
    contract: {
      version: '2026-04-crf-template-assets-v1',
      strategy: shouldPreferLayout ? TEMPLATE_ASSET_STRATEGY.LAYOUT_FIRST : TEMPLATE_ASSET_STRATEGY.TOP_FIRST,
      compatibilityWindow: 'layout_config fallback will be deprecated after migration hit-rate is stable',
    },
  }
}

/**
 * 读取模板资产命中率统计。
 * @returns {{
 * total: number,
 * topSchemaHits: number,
 * layoutSchemaHits: number,
 * missingSchemaHits: number,
 * conflictHits: number,
 * layoutFallbackHitRate: number
 * }}
 */
export const getTemplateAssetMetricsSummary = () => {
  if (typeof window === 'undefined' || !window.__CRF_TEMPLATE_ASSET_METRICS__) {
    return {
      total: 0,
      topSchemaHits: 0,
      layoutSchemaHits: 0,
      missingSchemaHits: 0,
      conflictHits: 0,
      layoutFallbackHitRate: 0,
    }
  }
  const metrics = window.__CRF_TEMPLATE_ASSET_METRICS__
  const total = Number(metrics.total || 0)
  const layoutSchemaHits = Number(metrics.layoutSchemaHits || 0)
  const layoutFallbackHitRate = total > 0 ? (layoutSchemaHits / total) * 100 : 0
  return {
    total,
    topSchemaHits: Number(metrics.topSchemaHits || 0),
    layoutSchemaHits,
    missingSchemaHits: Number(metrics.missingSchemaHits || 0),
    conflictHits: Number(metrics.conflictHits || 0),
    layoutFallbackHitRate,
  }
}
