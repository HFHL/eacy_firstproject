/**
 * 科研项目默认选中规则测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickMostRecentlyUpdatedItem } from '../../utils/researchProjectSelection.js'

test('pickMostRecentlyUpdatedItem 应返回最近更新的项目', () => {
  const projects = [
    { projectId: 'project-1', updatedAtRaw: '2026-04-01T08:00:00.000Z' },
    { projectId: 'project-2', updatedAtRaw: '2026-04-05T08:00:00.000Z' },
    { projectId: 'project-3', updatedAtRaw: '2026-04-03T08:00:00.000Z' },
  ]

  const result = pickMostRecentlyUpdatedItem(projects, [
    (item) => item.updatedAtRaw,
  ])

  assert.equal(result?.projectId, 'project-2')
})

test('pickMostRecentlyUpdatedItem 应在更新时间缺失时回退到创建时间', () => {
  const projects = [
    { id: 'project-1', updated_at: '', created_at: '2026-03-01T08:00:00.000Z' },
    { id: 'project-2', updated_at: null, created_at: '2026-04-02T08:00:00.000Z' },
    { id: 'project-3', updated_at: '2026-04-01T08:00:00.000Z', created_at: '2026-01-01T08:00:00.000Z' },
  ]

  const result = pickMostRecentlyUpdatedItem(projects, [
    (item) => item.updated_at,
    (item) => item.created_at,
  ])

  assert.equal(result?.id, 'project-2')
})

test('pickMostRecentlyUpdatedItem 在无有效项目时返回 null', () => {
  const result = pickMostRecentlyUpdatedItem([], [
    (item) => item.updatedAtRaw,
  ])

  assert.equal(result, null)
})
