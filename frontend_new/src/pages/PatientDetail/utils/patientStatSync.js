/**
 * 在文档新增/删除后同步刷新患者相关统计。
 *
 * 会并行刷新详情与文档列表，并在结束后触发左侧患者卡片刷新事件。
 * Promise 采用 allSettled，避免单个请求失败时中断整个刷新流程。
 *
 * @param {Object} options 刷新依赖项
 * @param {(() => Promise<unknown>) | undefined} options.fetchPatientDetail 刷新患者详情函数
 * @param {(() => Promise<unknown>) | undefined} options.fetchPatientDocuments 刷新患者文档函数
 * @param {(() => void) | undefined} options.emitPatientRailRefresh 通知左侧患者卡片刷新函数
 * @returns {Promise<void>}
 */
export async function syncPatientStatsAfterDocumentChange({
  fetchPatientDetail,
  fetchPatientDocuments,
  emitPatientRailRefresh,
} = {}) {
  await Promise.allSettled([
    Promise.resolve(fetchPatientDetail?.()),
    Promise.resolve(fetchPatientDocuments?.()),
  ])
  emitPatientRailRefresh?.()
}

