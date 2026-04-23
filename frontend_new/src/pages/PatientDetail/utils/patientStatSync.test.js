/**
 * 患者统计同步工具测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { syncPatientStatsAfterDocumentChange } from './patientStatSync.js'

test('syncPatientStatsAfterDocumentChange 应同时刷新详情、文档并触发 rail 刷新', async () => {
  const calls = []
  const fetchPatientDetail = async () => {
    calls.push('detail')
  }
  const fetchPatientDocuments = async () => {
    calls.push('documents')
  }
  const emitPatientRailRefresh = () => {
    calls.push('rail')
  }

  await syncPatientStatsAfterDocumentChange({
    fetchPatientDetail,
    fetchPatientDocuments,
    emitPatientRailRefresh,
  })

  assert.equal(calls.includes('detail'), true)
  assert.equal(calls.includes('documents'), true)
  assert.equal(calls.at(-1), 'rail')
})

test('syncPatientStatsAfterDocumentChange 在单个刷新失败时仍触发 rail 刷新', async () => {
  const calls = []
  const fetchPatientDetail = async () => {
    calls.push('detail')
    throw new Error('detail failed')
  }
  const fetchPatientDocuments = async () => {
    calls.push('documents')
  }
  const emitPatientRailRefresh = () => {
    calls.push('rail')
  }

  await syncPatientStatsAfterDocumentChange({
    fetchPatientDetail,
    fetchPatientDocuments,
    emitPatientRailRefresh,
  })

  assert.deepEqual(calls, ['detail', 'documents', 'rail'])
})

