/**
 * 统一页面布局高度配置（单位：px 偏移量）。
 */
export const PAGE_LAYOUT_HEIGHTS = {
  researchDataset: {
    cardOffset: 100,
    tableScrollOffset: 560,
    cardMinHeight: 540,
  },
  fileList: {
    containerOffset: 80,
    tableScrollOffset: 290,
  },
  patientDetail: {
    cardOffset: 96,
    cardMinHeight: 700,
  },
  templateDesigner: {
    containerOffset: 88,
    containerMinHeight: 600,
  },
}

/**
 * 生成基于视口高度的 CSS 高度表达式。
 *
 * @param {number} offset - 需要从 100vh 中减去的像素值。
 * @returns {string} 形如 calc(100vh - xxxpx) 的高度字符串。
 */
export const toViewportHeight = (offset) => `calc(100vh - ${offset}px)`
