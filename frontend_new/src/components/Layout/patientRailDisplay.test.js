/**
 * 患者 rail 姓名展示测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { getPatientRailDisplayName } from './patientRailDisplay.js'

test('getPatientRailDisplayName 应按详情页一致规则脱敏', () => {
  assert.equal(getPatientRailDisplayName('张三'), '张*')
  assert.equal(getPatientRailDisplayName('张三丰'), '张*丰')
})

test('getPatientRailDisplayName 不应修改原始姓名值', () => {
  const rawName = '王小明'
  const displayName = getPatientRailDisplayName(rawName)

  assert.equal(rawName, '王小明')
  assert.equal(displayName, '王*明')
})

