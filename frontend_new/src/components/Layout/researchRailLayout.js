/**
 * 计算科研目录在未手动调整时的默认上半区高度。
 *
 * @param {object} options 配置项
 * @param {number} options.totalHeight 侧栏总高度
 * @param {number} options.minPaneHeight 单个分区最小高度
 * @param {number} options.splitterHeight 分隔条高度
 * @returns {number} 默认上半区高度
 */
export const getDefaultResearchPaneHeight = ({
  totalHeight,
  minPaneHeight,
  splitterHeight,
}) => {
  if (!Number.isFinite(totalHeight) || totalHeight <= 0) return minPaneHeight

  const availableHeight = totalHeight - splitterHeight
  const halfHeight = availableHeight / 2
  const maxHeight = Math.max(minPaneHeight, availableHeight - minPaneHeight)

  return Math.min(maxHeight, Math.max(minPaneHeight, Math.round(halfHeight)))
}

/**
 * 判断科研目录高度是否允许从本地存储恢复。
 *
 * @param {object} options 配置项
 * @param {number} options.storedHeight 已存储高度
 * @param {boolean} options.hasUserAdjusted 是否确认来自用户手动拖拽
 * @param {number} options.minPaneHeight 单个分区最小高度
 * @param {number} options.maxStoredHeight 可恢复的最大高度
 * @returns {boolean} 是否允许恢复
 */
export const isResearchPaneHeightRestorable = ({
  storedHeight,
  hasUserAdjusted,
  minPaneHeight,
  maxStoredHeight,
}) => {
  if (!hasUserAdjusted) return false
  if (!Number.isFinite(storedHeight)) return false
  return storedHeight >= minPaneHeight && storedHeight <= maxStoredHeight
}

/**
 * 判断一次科研目录高度测量是否可信。
 *
 * @param {object} options 配置项
 * @param {number} options.rawHeight ResizeObserver 读取到的原始高度
 * @param {number} options.minContainerHeight 允许生效的最小容器高度
 * @returns {boolean} 是否接受这次测量
 */
export const shouldAcceptResearchContainerHeight = ({
  rawHeight,
  minContainerHeight,
}) => {
  if (!Number.isFinite(rawHeight)) return false
  return rawHeight >= minContainerHeight
}
