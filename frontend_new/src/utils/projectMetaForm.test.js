/**
 * 项目元数据表单工具测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProjectMetaFormValues,
  buildProjectMetaUpdatePayload,
} from './projectMetaForm.js'

test('buildProjectMetaFormValues 会构造包含预期患者数与项目周期的表单初始值', () => {
  const values = buildProjectMetaFormValues({
    project_name: '肺癌研究',
    description: '描述',
    status: 'active',
    principal_investigator_id: 'pi-1',
    expected_patient_count: 120,
    start_date: '2026-01-02',
    end_date: '2026-06-30',
    template_info: { template_name: '肺癌CRF' },
  })

  assert.equal(values.name, '肺癌研究')
  assert.equal(values.description, '描述')
  assert.equal(values.status, 'active')
  assert.equal(values.principal_investigator_id, 'pi-1')
  assert.equal(values.expected_patient_count, 120)
  assert.equal(values.project_period?.length, 2)
  assert.equal(values.project_period?.[0]?.format('YYYY-MM-DD'), '2026-01-02')
  assert.equal(values.project_period?.[1]?.format('YYYY-MM-DD'), '2026-06-30')
  assert.equal(values.crfTemplate, '肺癌CRF')
})

test('buildProjectMetaUpdatePayload 会把日期范围转换为更新接口字段', () => {
  const payload = buildProjectMetaUpdatePayload({
    name: '新项目名',
    description: '新的描述',
    status: 'paused',
    principal_investigator_id: '',
    expected_patient_count: 80,
    project_period: [
      { format: () => '2026-03-01' },
      { format: () => '2026-09-30' },
    ],
  })

  assert.deepEqual(payload, {
    project_name: '新项目名',
    description: '新的描述',
    status: 'paused',
    principal_investigator_id: null,
    expected_patient_count: 80,
    start_date: '2026-03-01',
    end_date: '2026-09-30',
  })
})
