/**
 * @file designerBridge 资产解析单测
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveTemplateAssets,
  TEMPLATE_ASSET_STRATEGY,
  getTemplateAssetMetricsSummary,
} from '../../../utils/templateAssetResolver.js'
import {
  loadTemplateIntoDesigner,
  loadTemplateIntoDesignerDetailed,
} from '../../../utils/templateDesignerLoader.js'

test('resolveTemplateAssets 默认优先使用顶层 schema_json 与 designer', () => {
  const payload = {
    schema_json: { $id: 'top-schema', $schema: 'https://json-schema.org/draft/2020-12/schema', properties: { a: { type: 'string' } } },
    designer: { folders: [{ id: 'f1', groups: [] }] },
    layout_config: {
      schema_json: { $id: 'layout-schema' },
      designer: { folders: [{ id: 'layout', groups: [] }] },
    },
  }

  const result = resolveTemplateAssets(payload)
  assert.equal(result.schema.$id, 'top-schema')
  assert.equal(result.designer.folders[0].id, 'f1')
  assert.equal(result.sources.schema, 'top.schema_json')
  assert.equal(result.sources.designer, 'top.designer')
})

test('resolveTemplateAssets 支持 preferLayoutConfig 模式', () => {
  const payload = {
    schema_json: { $id: 'top-schema' },
    designer: { folders: [{ id: 'top', groups: [] }] },
    layout_config: {
      schema_json: { $id: 'layout-schema', $schema: 'https://json-schema.org/draft/2020-12/schema', properties: { b: { type: 'string' } } },
      designer: { folders: [{ id: 'layout', groups: [] }] },
    },
  }

  const result = resolveTemplateAssets(payload, { preferLayoutConfig: true })
  assert.equal(result.schema.$id, 'layout-schema')
  assert.equal(result.designer.folders[0].id, 'layout')
  assert.equal(result.sources.schema, 'layout_config.schema_json')
  assert.equal(result.sources.designer, 'layout_config.designer')
})

test('resolveTemplateAssets 支持 strategy 回滚到 layout-first', () => {
  const payload = {
    schema_json: { $id: 'top-schema' },
    layout_config: {
      schema_json: { $id: 'layout-schema' },
    },
  }

  const result = resolveTemplateAssets(payload, {
    strategy: TEMPLATE_ASSET_STRATEGY.LAYOUT_FIRST,
    collectTelemetry: false,
  })

  assert.equal(result.schema.$id, 'layout-schema')
  assert.equal(result.contract.strategy, TEMPLATE_ASSET_STRATEGY.LAYOUT_FIRST)
})

test('resolveTemplateAssets 在缺失 schema 时返回告警码', () => {
  const payload = {
    designer: { folders: [] },
  }
  const result = resolveTemplateAssets(payload, { collectTelemetry: false })
  assert.ok(result.warnings.includes('CRF_ASSET_MISSING_SCHEMA'))
})

test('resolveTemplateAssets 顶层与 layout 冲突时返回冲突告警', () => {
  const payload = {
    schema_json: { $id: 'top-schema', $schema: 'https://json-schema.org/draft/2020-12/schema', properties: { a: { type: 'string' } } },
    designer: { folders: [{ id: 'f1', groups: [] }] },
    layout_config: {
      schema_json: { $id: 'layout-schema', $schema: 'https://json-schema.org/draft/2020-12/schema', properties: { b: { type: 'string' } } },
      designer: { folders: [{ id: 'f2', groups: [] }] },
    },
  }
  const result = resolveTemplateAssets(payload, { collectTelemetry: false })
  assert.ok(result.warnings.includes('CRF_ASSET_CONFLICT_SCHEMA'))
  assert.ok(result.warnings.includes('CRF_ASSET_CONFLICT_DESIGNER'))
})

test('resolveTemplateAssets 能解析字符串 JSON 资产', () => {
  const payload = {
    schema_json: '{"$id":"top-schema","$schema":"https://json-schema.org/draft/2020-12/schema","properties":{"a":{"type":"string"}}}',
    designer: '{"folders":[{"id":"f1","groups":[]}]}',
  }
  const result = resolveTemplateAssets(payload)
  assert.equal(result.schema.$id, 'top-schema')
  assert.equal(result.designer.folders[0].id, 'f1')
})

test('loadTemplateIntoDesigner 会把空白 designer 当作合法初始模板加载', async () => {
  const calls = {
    loadData: [],
    loadSchema: 0,
    clearData: 0,
  }
  const formDesignerRef = {
    current: {
      loadData: (data, options) => {
        calls.loadData.push({ data, options })
        return data
      },
      loadSchema: async () => {
        calls.loadSchema += 1
        return null
      },
      clearData: () => {
        calls.clearData += 1
      },
    },
  }

  const result = await loadTemplateIntoDesigner(formDesignerRef, {
    designer: {
      meta: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
      },
      folders: [],
      enums: {},
    },
    schema: null,
    mode: 'auto',
  })

  assert.equal(result, 'designer')
  assert.equal(calls.loadSchema, 0)
  assert.equal(calls.clearData, 0)
  assert.equal(calls.loadData.length, 1)
  assert.deepEqual(calls.loadData[0].data.folders, [])
})

test('loadTemplateIntoDesignerDetailed 在 schema 解析失败且无 designer 时返回 parse failed 原因', async () => {
  const formDesignerRef = {
    current: {
      loadData: () => null,
      loadSchema: async () => null,
      clearData: () => null,
    },
  }

  const result = await loadTemplateIntoDesignerDetailed(formDesignerRef, {
    designer: null,
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      properties: {
        foo: { type: 'string' },
      },
    },
    mode: 'auto',
  })

  assert.equal(result.loadedFrom, null)
  assert.equal(result.reason, 'schema-parse-failed')
})

test('getTemplateAssetMetricsSummary 在无 window 环境下返回默认值', () => {
  const summary = getTemplateAssetMetricsSummary()
  assert.equal(summary.total >= 0, true)
  assert.equal(summary.conflictHits >= 0, true)
})
