# CRF 治理发布与回滚门禁

## 灰度开关

- 前端模板资产解析策略通过环境变量控制：
  - `VITE_CRF_TEMPLATE_ASSET_STRATEGY=top-first`（默认，目标策略）
  - `VITE_CRF_TEMPLATE_ASSET_STRATEGY=layout-first`（回滚策略）
- 浏览器命中统计：
  - `window.__CRF_TEMPLATE_ASSET_METRICS__`
  - `getTemplateAssetMetricsSummary().layoutFallbackHitRate`

## 回滚预案

1. 将环境变量切回 `layout-first`
2. 重新发布前端静态资源
3. 观察 `window.__CRF_TEMPLATE_ASSET_METRICS__` 的 `missingSchemaHits` 与 `layoutSchemaHits`
4. 若异常模板集中，临时加入问题模板白名单（后端返回 `asset_warnings` 供排查）

## 阶段门禁

进入下一环境前必须满足：

- 自动化测试通过（priority + round-trip + build）
- 人工回归通过（模板新建/编辑/发布/项目加载）
- 性能阈值通过（关键指标退化不超过 15%）
- 资产告警可解释（`asset_warnings` 无新增高风险）
- fallback 命中率满足切换阈值（建议 `< 5%` 后再考虑移除 legacy fallback）
