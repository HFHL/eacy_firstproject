/**
 * 日期展示工具测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatIsoDateDisplay } from './dateDisplay.js'

test('formatIsoDateDisplay 会把 ISO 时间压缩成可读短格式', () => {
  assert.deepEqual(
    formatIsoDateDisplay('2026-04-10T11:49:50.929673Z'),
    {
      shortText: '2026-04-10 11:49',
      fullText: '2026-04-10 11:49:50',
    }
  )
})

test('formatIsoDateDisplay 在缺失值时返回占位符', () => {
  assert.deepEqual(
    formatIsoDateDisplay(''),
    {
      shortText: '-',
      fullText: '-',
    }
  )
})
