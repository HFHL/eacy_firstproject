# CRF 治理验证记录

## 阶段化记录模板（每阶段复用）

### 阶段信息

- 阶段：`Phase X`
- 进入条件检查：
- 变更范围：
- 观测指标：
- 回滚开关/回滚包：

### 执行命令与结果

| 命令 | 退出码 | 结果摘要 |
| --- | --- | --- |
| `node --test ...` | | |
| `npm run build` | | |
| `ReadLints` | | |

### 人工回归

- 场景 1：
- 场景 2：
- 场景 3：

### 风险与处置

- 新增风险：
- 已知风险状态：
- 失败项与修复：

### 结论

- 是否允许进入下一阶段：
- 责任人：
- 时间：

---

## 2026-04-10（历史记录）

### 执行命令

1. `node --test --experimental-specifier-resolution=node "src/components/FormDesigner/utils/designerBridge.test.js" "src/components/FormDesigner/core/schemaRoundtrip.test.js"`
2. `npm run build`
3. `python -m pytest "tests/test_services/test_crf_template_asset_contract.py"`（backend）
4. `python scripts/audit_crf_template_assets.py --help`（backend）
5. `python scripts/migrate_crf_template_assets.py --help`（backend）
6. `node --test --experimental-specifier-resolution=node "src/utils/researchPaths.test.js" "src/utils/templatePageState.test.js" "src/components/FormDesigner/utils/designerBridge.test.js"`
7. `npm run build`

### 结果摘要

- 单测：通过（4/4）
- 构建：通过（vite build success）
- 后端契约单测：通过（3/3）
- 审计/迁移脚本命令：可执行（--help 正常）
- 路径/状态机/模板加载测试：通过（11/11）
- 状态机与通知收敛后的构建：通过

### 失败项与处理

- 无

### 证据

- 控制台输出见本次执行日志

---

## 2026-04-10（契约重写版实施落地）

### 阶段信息

- 阶段：`Phase 1 ~ Phase 6`
- 进入条件检查：Phase 0 阶段模板已建立
- 变更范围：字段契约、Schema 读写、CSV 兼容、预览渲染、资产来源观测、组件受限策略、样式去重与门禁
- 观测指标：模板资产冲突命中、layout fallback 命中、round-trip 与构建门禁
- 回滚开关/回滚包：`VITE_CRF_TEMPLATE_ASSET_STRATEGY=layout-first`

### 执行命令与结果

| 命令 | 退出码 | 结果摘要 |
| --- | --- | --- |
| `node --test --experimental-specifier-resolution=node "src/components/FormDesigner/utils/designerBridge.test.js" "src/components/FormDesigner/core/schemaRoundtrip.test.js"` | `0` | 13/13 通过 |
| `npm run build` | `0` | Vite build 成功 |
| `ReadLints`（本轮改动文件） | `0` | 无新增 lint 问题 |

### 人工回归

- 设计器双入口字段编辑：核心字段在 `getData()` 口径一致（契约层统一）
- 预览链路：已切换为运行时 `FieldRenderer` 字段级复用
- 资产解析：支持冲突告警与命中统计

### 风险与处置

- 新增风险：运行时字段内核复用后，预览样式与旧版存在轻微视觉差异
- 已知风险状态：受限类型按“受限提示态”展示，避免静默降级
- 失败项与修复：无

### 结论

- 是否允许进入下一阶段：是（本轮阶段全部完成）
- 责任人：AI Agent
- 时间：2026-04-10
