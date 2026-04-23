# CRF 设计器治理基线

## 1. 配置资产地图

| 配置层 | 主要来源 | 写入点 | 读取点 | 最终消费 |
|---|---|---|---|---|
| 模板资产层 | `schema_json` / `schema` / `layout_config.*` / `designer` | 后端模板接口 | `CRFDesigner`、`ProjectTemplateDesigner`、`ProjectSchemaEhrTab` | 设计器加载与运行时 Schema 加载 |
| 设计器模型层 | `designData` (`folders/groups/fields`) | `FormDesigner` 编辑流程 | `FormDesigner.getData()` / `PreviewModal` | 设计器预览、保存前组装 |
| 生成层 | `SchemaGenerator.generateSchema(designData)` | 前端保存/导出链 | `SchemaParser.parseSchema(schema)`、SchemaForm 运行态 | 运行时渲染结构 |
| 运行时渲染层 | JSON Schema + enums + patientData | `SchemaEhrTab`/`ProjectSchemaEhrTab` | `SchemaForm` -> `FormPanel` -> `FieldRenderer` | 用户填写与溯源 |
| 页面布局层 | `schemaFormShared` 默认值 + 页面覆写 | 页面 props | `SchemaFormInner` | 三栏布局行为 |

## 2. 统一优先级（当前治理目标）

- 默认优先顶层模板资产：
  - `schema_json` -> `schema` -> `layout_config.schema_json` -> `layout_config.schema`
  - `designer` -> `layout_config.designer`
- 统一入口：`src/utils/templateAssetResolver.js`
- 所有页面通过统一解析函数获取 `designer/schema`，禁止页面内散落 `??` 回退链。

## 3. 字段生效矩阵（首版）

| 配置项 | 设计器可编辑 | 进入 schema | SchemaForm 运行时消费 | 结论 |
|---|---:|---:|---:|---|
| `displayType` / `x-display` | 是 | 是 | 是 | 生效 |
| `displayName` / `x-display-name` | 是 | 是 | 是 | 生效 |
| `options` / `$defs` / `allOf` | 是 | 是 | 是 | 生效 |
| `unit` / `x-unit` | 是 | 是 | 是 | 生效 |
| `editable` / `x-editable` | 是 | 是 | 是 | 生效 |
| `sensitive` / `x-sensitive` | 是 | 是 | 是 | 生效 |
| `primary` / `x-primary` | 是 | 是 | 是（标签/行为） | 生效 |
| `formTemplate` / `x-form-template` | 是 | 是 | 部分 | 半生效（依赖上下游） |
| `conflictPolicy` / `x-conflict-policy` | 是 | 是 | 部分 | 半生效（偏后端链） |
| `minimum/maximum/pattern` | 是 | 否（当前） | 否 | 伪配置（仅抽取链可用） |
| `compareType` | 是 | 否（当前） | 否 | 伪配置 |
| `dataSources/mergeBindings/enumRef/xProperties` | 是（原） | 否（当前） | 否 | 伪配置（已在 UI 下线） |

## 4. 风险分级

- `P0` 资产读取分叉：不同页面优先级不一致导致加载结果不一致。
- `P1` 伪配置误导：面板可配置但不进入运行时链路。
- `P2` 预览偏差：设计器预览与生成/解析链路不一致。
- `P3` 维护风险：参考副本与主线实现持续漂移。

## 5. 阶段 0 完成判定

- 能明确回答“运行时唯一权威输入”与“页面优先级”。
- 能按字段解释“为什么会/不会影响 SchemaForm”。
- 有统一资产解析函数与对应单测。
