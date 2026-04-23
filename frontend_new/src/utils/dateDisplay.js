/**
 * 日期展示工具。
 */

/**
 * 将 ISO 日期字符串格式化为短文案与完整文案。
 *
 * @param {string | null | undefined} value ISO 日期字符串
 * @returns {{shortText: string, fullText: string}} 展示文本
 */
export const formatIsoDateDisplay = (value) => {
  const raw = String(value || '').trim()
  if (!raw) {
    return {
      shortText: '-',
      fullText: '-',
    }
  }

  const normalized = raw.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '')
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return {
      shortText: normalized.slice(0, 16),
      fullText: normalized,
    }
  }

  return {
    shortText: raw,
    fullText: raw,
  }
}
