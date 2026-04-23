/**
 * 科研患者详情候选值固化联动契约测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const projectPatientDetailPath = resolve(
  process.cwd(),
  'src/pages/ResearchDataset/ProjectPatientDetail.jsx',
)

test('ProjectPatientDetail 应将候选固化回调传递到 SchemaForm 容器', () => {
  const content = readFileSync(projectPatientDetailPath, 'utf-8')
  assert.match(content, /const handleFieldCandidateSolidified = useCallback/)
  assert.match(content, /onFieldCandidateSolidified=\{handleFieldCandidateSolidified\}/)
  assert.match(content, /schemaData=\{projectSchema\}/)
})
