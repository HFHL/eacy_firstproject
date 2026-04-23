/**
 * 科研目录分割布局规则测试。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getDefaultResearchPaneHeight,
  isResearchPaneHeightRestorable,
  shouldAcceptResearchContainerHeight,
} from './researchRailLayout.js'

test('getDefaultResearchPaneHeight 应在首次进入时返回上下均分高度', () => {
  const result = getDefaultResearchPaneHeight({
    totalHeight: 610,
    minPaneHeight: 56,
    splitterHeight: 10,
  })

  assert.equal(result, 300)
})

test('isResearchPaneHeightRestorable 仅在用户手动调整且高度合法时恢复', () => {
  assert.equal(isResearchPaneHeightRestorable({
    storedHeight: 240,
    hasUserAdjusted: true,
    minPaneHeight: 56,
    maxStoredHeight: 2000,
  }), true)

  assert.equal(isResearchPaneHeightRestorable({
    storedHeight: 56,
    hasUserAdjusted: false,
    minPaneHeight: 56,
    maxStoredHeight: 2000,
  }), false)
})

test('shouldAcceptResearchContainerHeight 应忽略异常过小的临时高度', () => {
  assert.equal(shouldAcceptResearchContainerHeight({
    rawHeight: 0,
    minContainerHeight: 122,
  }), false)

  assert.equal(shouldAcceptResearchContainerHeight({
    rawHeight: 120,
    minContainerHeight: 122,
  }), false)

  assert.equal(shouldAcceptResearchContainerHeight({
    rawHeight: 520,
    minContainerHeight: 122,
  }), true)
})
