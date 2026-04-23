/**
 * 科研路径构造测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  researchHome,
  templateCreate,
  templateEdit,
  templateFallback,
  templateView,
  researchProjectDetail,
  researchProjectPatientDetail,
  researchProjectTemplateEdit,
} from './researchPaths.js'

test('research paths 返回稳定的科研与模板路径', () => {
  assert.equal(researchHome(), '/research/projects')
  assert.equal(templateCreate(), '/research/templates/create')
  assert.equal(templateView('tpl-1'), '/research/templates/tpl-1/view')
  assert.equal(templateEdit('tpl-1'), '/research/templates/tpl-1/edit')
  assert.equal(templateFallback(), '/research/projects')
  assert.equal(researchProjectDetail('p1'), '/research/projects/p1')
  assert.equal(researchProjectTemplateEdit('p1'), '/research/projects/p1/template/edit')
  assert.equal(researchProjectPatientDetail('p1', 'pt1'), '/research/projects/p1/patients/pt1')
})

test('researchProjectTemplateEdit 保持项目模板编辑入口稳定', () => {
  assert.equal(researchProjectTemplateEdit('project-xyz'), '/research/projects/project-xyz/template/edit')
})
