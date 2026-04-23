# CRF 设计器治理验证清单

## 1. 自动化验证命令

在 `first-project/frontend` 目录执行：

1. `node --test --experimental-specifier-resolution=node "src/components/FormDesigner/utils/designerBridge.test.js"`
2. `node --test --experimental-specifier-resolution=node "src/components/FormDesigner/core/schemaRoundtrip.test.js"`
3. `npm run build`

## 2. 通过标准

- 所有测试命令退出码为 `0`
- 构建命令退出码为 `0`
- 关键断言覆盖：
  - 模板资产解析优先级（顶层优先与 `layout_config` 优先模式）
  - 字符串 JSON 资产解析
  - `generateSchema -> parseSchema` round-trip 的目录顺序与字段形态

## 3. 人工回归清单

### A. 资产读取一致性
- 全局设计器页加载同一模板，确认读取结果与项目模板设计器一致
- 项目运行页加载同一模板，确认 schema 来源一致
- 模板同时存在顶层与 `layout_config` 资产时，优先级符合统一策略

### B. 配置面板收敛
- 字段配置中不再出现已下线的伪配置编辑项
- 组配置面板结构正常渲染（无嵌套错位、无异常警告）

### C. 预览一致化
- 设计态预览可正常显示
- Schema 回放预览可正常显示
- 选项型字段在两种预览中均可渲染（字符串数组与对象数组均可）

## 4. 证据记录模板

每次阶段验收记录以下内容：

- 执行时间
- 执行命令
- 退出码
- 关键输出摘要
- 人工回归结论
- 未通过项与处置方案
