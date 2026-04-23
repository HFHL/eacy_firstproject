/**
 * 全局创建/编辑意图事件测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  REQUEST_PROJECT_EDIT_EVENT,
  dispatchRequestProjectEdit,
} from './createIntentEvents.js'

test('dispatchRequestProjectEdit 会派发携带 projectId 的编辑事件', () => {
  const events = []
  const originalWindow = globalThis.window

  globalThis.window = {
    dispatchEvent(event) {
      events.push(event)
      return true
    },
  }

  try {
    dispatchRequestProjectEdit('project-123')
  } finally {
    globalThis.window = originalWindow
  }

  assert.equal(events.length, 1)
  assert.equal(events[0].type, REQUEST_PROJECT_EDIT_EVENT)
  assert.deepEqual(events[0].detail, { projectId: 'project-123' })
})
