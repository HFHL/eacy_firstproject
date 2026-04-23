/**
 * 模板页面状态机测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCreateTemplateInfo,
  createDefaultTemplateInfo,
  resolveTemplateBackTarget,
  resolveTemplatePageMode,
  TEMPLATE_PAGE_MODES,
} from './templatePageState.js'

test('template page mode 能区分 create/view/edit 状态', () => {
  assert.equal(
    resolveTemplatePageMode({ templateId: '', isViewMode: false, hasPendingMeta: false }),
    TEMPLATE_PAGE_MODES.CREATE_PENDING_META
  )
  assert.equal(
    resolveTemplatePageMode({ templateId: '', isViewMode: false, hasPendingMeta: true }),
    TEMPLATE_PAGE_MODES.CREATE_EDITING
  )
  assert.equal(
    resolveTemplatePageMode({ templateId: 'tpl-1', isViewMode: true, hasPendingMeta: false }),
    TEMPLATE_PAGE_MODES.EXISTING_VIEW
  )
  assert.equal(
    resolveTemplatePageMode({ templateId: 'tpl-1', isViewMode: false, hasPendingMeta: false }),
    TEMPLATE_PAGE_MODES.EXISTING_EDIT
  )
})

test('template page back target 优先 returnTo，再回退 history 和 fallback', () => {
  assert.deepEqual(
    resolveTemplateBackTarget({ templateId: '', isViewMode: false, returnTo: '/research/projects?tab=templates', canGoBack: true }),
    { type: 'route', target: '/research/projects?tab=templates' }
  )
  assert.deepEqual(
    resolveTemplateBackTarget({ templateId: '', isViewMode: false, returnTo: '', canGoBack: true }),
    { type: 'history' }
  )
  assert.deepEqual(
    resolveTemplateBackTarget({ templateId: '', isViewMode: false, returnTo: '', canGoBack: false }),
    { type: 'route', target: '/research/projects' }
  )
  assert.deepEqual(
    resolveTemplateBackTarget({ templateId: 'tpl-1', isViewMode: false, returnTo: '', canGoBack: false }),
    { type: 'route', target: '/research/templates/tpl-1/view' }
  )
})

test('template page default info 会构造默认新建模板信息', () => {
  assert.equal(createDefaultTemplateInfo().name, '新建 CRF 模板')
  const built = buildCreateTemplateInfo({ name: '肝胆模板', category: '肝胆外科', description: 'desc' })
  assert.equal(built.name, '肝胆模板')
  assert.equal(built.category, '肝胆外科')
  assert.equal(built.description, 'desc')
})
