/**
 * 将时间值转换为可比较的时间戳。
 *
 * @param {unknown} value 时间值
 * @returns {number} 时间戳；无效时返回 0
 */
const toTimestamp = (value) => {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

/**
 * 选择最近更新的列表项。
 *
 * `selectors` 按优先级依次读取时间字段，例如先取更新时间，再回退创建时间。
 *
 * @template T
 * @param {T[]} items 待选择的列表
 * @param {Array<(item: T) => unknown>} selectors 时间字段选择器
 * @returns {T | null} 最近更新的列表项
 */
export const pickMostRecentlyUpdatedItem = (items = [], selectors = []) => {
  if (!Array.isArray(items) || items.length === 0) return null
  if (!Array.isArray(selectors) || selectors.length === 0) return items[0] ?? null

  return items.reduce((latestItem, currentItem) => {
    if (!latestItem) return currentItem

    const latestTimestamp = selectors.reduce((timestamp, selector) => {
      return timestamp || toTimestamp(selector(latestItem))
    }, 0)

    const currentTimestamp = selectors.reduce((timestamp, selector) => {
      return timestamp || toTimestamp(selector(currentItem))
    }, 0)

    return currentTimestamp > latestTimestamp ? currentItem : latestItem
  }, null)
}
