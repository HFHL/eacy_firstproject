# CRF 预览与运行时支持矩阵

## 三条链路

| 链路 | 入口 | 渲染组件 | 当前定位 |
|---|---|---|---|
| 设计态预览 | `PreviewModal` 设计态 Tab | `components/FormDesigner/components/PreviewModal/FormRenderer.jsx` | 反映设计器内存模型 |
| Schema 回放预览 | `PreviewModal` Schema 回放 Tab | 同上 | 反映 generate -> parse 后的设计器模型 |
| 运行时渲染 | `SchemaForm` | `components/SchemaForm/FieldRenderer.jsx` | 真实业务填写与查看 |

## 核心字段支持矩阵

| 类型 | 设计态预览 | Schema 回放预览 | 运行时 | 当前结论 |
|---|---|---|---|---|
| `text` | 支持 | 支持 | 支持 | 一致 |
| `textarea` | 支持 | 支持 | 支持 | 一致 |
| `number` | 支持 | 支持 | 支持 | 一致 |
| `date` | 支持 | 支持 | 支持 | 需继续核对 value 绑定 |
| `radio` | 支持 | 支持 | 支持 | 运行时有大选项自动降级为 select |
| `checkbox` | 支持 | 支持 | 支持 | 一致 |
| `select` | 支持 | 支持 | 支持 | 一致 |
| `multiselect` | 支持 | 支持 | 支持 | 一致 |
| `file` | 支持 | 支持 | 支持 | 一致 |
| `table` | 暂不完整 | 暂不完整 | 支持 | 优先修复 |

## 已知差异

- 预览侧 `table` 尚未做到与运行时同级支持。
- 运行时 `radio` 在选项过多时可自动转 `select`，预览侧未复用该阈值。
- `description` 在预览中更接近 placeholder，在运行时更接近帮助说明/tooltip。
- `matrix_*`、`multi_text`、`randomization` 等复杂类型在两侧都存在降级，但降级 UI 不统一。

## 下一步优先级

1. `table`
2. 大选项集阈值复用
3. `description` 口径统一
4. 复杂类型降级白名单
