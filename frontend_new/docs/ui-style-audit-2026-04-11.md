# 前端样式统一性审计报告（2026-04-11）

## 审计摘要

**核心发现**：当前前端处于"**有统一基础，但未形成统一执行**"状态。

**量化指标（全量扫描口径，含备份/副本文件）**：
- 硬编码颜色：**1559 次**（75 个文件）
- 硬编码字号：**939 次**（62 个文件）
- 硬编码间距：**348 次**（62 个文件）
- 内联样式密集度：PatientDetail **1186 处**，ResearchDataset **382 处**
- Modal 宽度范围：**450px - 1100px**（12 种不同宽度）

**主要问题**：
1. `colors.js` 配色常量文件**未被任何业务代码消费**
2. 主色冲突：存在 **3 个不同主色值**（#1890ff / #1677ff / #6366f1）
3. 状态色高频重复：成功/警告/错误色各重复 **65-88 次**
4. 字号梯度混乱：大量非标准字号（11/13/15/17/18）
5. Modal 宽度无规范：**12 种不同宽度**（450px - 1100px），同类弹窗宽度不一致
6. Modal API 混用：`bodyStyle` 与 `styles={{ body: {} }}` 新旧 API 并存

**整改建议**：
- P0（1-2周）：建立规范文档，冻结新增硬编码
- P1（2-4周）：统一核心页面，硬编码减少 80%+
- P2（持续）：引入自动化检查，建立验收流程

**预期收益**：修改品牌色成本从"全局搜索替换"降低为"修改一个 token"，视觉一致性显著提升。

---

## 1. 审计范围

- 目录：`frontend/src`
- 关注点：字体、字号、颜色、间距、布局、组件样式来源
- 目标：判断是否形成“统一设计规范 + 统一落地机制”

### 1.1 统计口径说明

- **全量扫描口径（用于风险画像）**：包含 `backupfiles`、`index copy`、测试/原型性质文件。
- **主干运行口径（用于改造排期）**：优先关注路由主干与当前实际运行组件，不以备份/副本文件作为 P1 优先级依据。
- 本文若未特殊说明，统计数字默认采用“全量扫描口径”。

## 2. 现状结论

当前前端是**“有统一基础，但未形成统一执行”**的状态。

- 已有统一基础：
  - `src/main.jsx` 通过 Ant Design `ConfigProvider` 提供全局 `theme.token`
  - `src/styles/global.css` 提供基础 CSS 变量与全局基线样式
  - `src/constants/pageLayout.js` 对部分核心页面做了高度/偏移统一
- 未形成统一执行：
  - 大量页面存在内联样式和硬编码颜色/字号
  - `src/styles/colors.js` 作为配色常量文件，当前几乎未被业务代码消费
  - 主题 token 在少量布局组件使用，覆盖范围有限

## 3. 关键证据

### 3.1 统一机制入口

- `src/main.jsx`：定义并注入 `theme.token`（主色、字体、间距、圆角、组件 token）
- `src/styles/global.css`：定义 `:root` 颜色变量和 `body` 字体基线
- `src/constants/pageLayout.js`：部分页面布局高度常量化

### 3.2 统一性不足热点（示例）

- `src/pages/PatientDetail/index.jsx`：样式密集，局部样式定义较多
- `src/pages/ResearchDataset/ProjectDatasetView.jsx`：样式密集，布局/颜色定义较多
- `src/components/Layout/MainLayout.jsx`：既有 `theme.useToken`，也存在较多局部样式与硬编码色值

### 3.3 设计文档现状

- `frontend/docs/` 当前主要是 CRF 流程/治理/验证文档，不是全站 UI 设计规范
- `frontend/README.md` 中提及的 `design-specs.md`、`component-library.md`、`user-flows.md` 当前未落地
- 根目录 `project_design.md` 更偏系统级架构设计，不是前端可执行设计系统文档

### 3.4 全站硬编码规模统计

> 注：本节数字采用“全量扫描口径”，用于说明债务总体规模，不直接等同于主干运行页面改造工作量。

**颜色硬编码**：
- 总计：**1559 次**（分布在 75 个文件）
- 示例文件（非严格 Top 排序）：MainLayout.jsx (55处), ProjectDatasetView.jsx (105处), PatientDetail/index.jsx (24处)

**字号硬编码**：
- 总计：**939 次**（分布在 62 个文件）
- 大量非标准字号：11, 13, 15, 17, 18 等

**间距硬编码**：
- 总计：**348 次**（分布在 62 个文件）
- padding/margin 直接数字赋值

**独立样式文件**：
- CSS/LESS/SCSS 文件：**14 个**
- className 使用：54 个文件（与内联样式并存，来源不统一）

### 3.5 字号梯度违规示例

规范要求：12 / 14 / 16 / 20 / 24

**实际违规案例**（部分）：
- `fontSize: 11` - ProjectDatasetView.jsx:902, 1477, 1486
- `fontSize: 13` - 多处次要文本
- `fontSize: 15` - 部分标题
- `fontSize: 17, 18` - 特殊强调文本

违规原因：无统一字号 token，开发者按视觉直觉选择字号。

### 3.6 颜色重复使用模式

**高频重复但未统一的颜色**：

| 颜色值 | 语义 | 出现场景 | 问题 |
|--------|------|----------|------|
| `#52c41a` | 成功色 | 状态指示、置信度、完整度 | 与 `colorSuccess` token 重复定义 |
| `#faad14` | 警告色 | 状态指示、置信度 | 与 `colorWarning` token 重复定义 |
| `#ff4d4f` | 错误色 | 状态指示、置信度 | 与 `colorError` token 重复定义 |
| `#999` | 次级文本 | 辅助信息、占位符 | 未映射到 `colorTextSecondary` |
| `#d9d9d9` | 边框色 | 分割线、边框 | 未映射到 `colorBorder` |
| `#f0f0f0` | 背景色 | 容器背景、分割线 | 未映射到 `colorBgLayout` |

**主色冲突**：
- `#1890ff` - main.jsx theme.token.colorPrimary
- `#1677ff` - 实际业务代码大量使用
- `#6366f1` - 部分组件使用（侧边栏渐变）

**影响**：
- 未来改色需要全局搜索替换，成本高
- 不同模块视觉风格不统一
- colors.js 定义的颜色常量未被消费，形成"文档化但未工程化"的状态

### 3.7 弹窗（Modal）设计统一性审计

**使用规模**：
- Modal 组件使用：**28 个文件**
- 独立 Modal 组件文件：**6 个**
- Modal.confirm/info/warning 调用：**33 处**

**宽度不统一问题**：

| 宽度值 | 使用次数 | 说明 |
|--------|----------|------|
| 450px | 1 | 特窄弹窗 |
| 480px | 3 | 窄弹窗 |
| 520px | 2 | 窄弹窗 |
| 600px | 8 | 标准弹窗 |
| 640px | 2 | 中等弹窗 |
| 700px | 2 | 中等弹窗 |
| 720px | 1 | 中等弹窗 |
| 800px | 11 | 宽弹窗（最常用） |
| 860px | 1 | 宽弹窗 |
| 900px | 6 | 超宽弹窗 |
| 1000px | 1 | 超宽弹窗 |
| 1100px | 1 | 极宽弹窗 |

**问题分析**：
- 宽度范围过大：450px - 1100px（差距 650px）
- 没有统一的宽度梯度规范
- 同类功能弹窗宽度不一致（如不同页面的表单弹窗）
- 未在 ConfigProvider 中配置 Modal 全局样式 token

**body 样式不统一**：
- **旧 API**：`bodyStyle={{ padding: 16, maxHeight: '70vh' }}`（多处使用）
- **新 API**：`styles={{ body: { padding: 16, maxHeight: '70vh' } }}`（部分使用）
- **问题**：混用新旧 API，维护成本高
- **滚动策略不统一**：
  - `maxHeight: '70vh'` - 部分弹窗
  - `maxHeight: 'calc(100vh - 380px)'` - 部分弹窗
  - `height: 200` - 固定高度
  - 无滚动限制 - 部分弹窗

**Modal.confirm 样式问题**：
- 33 处调用，未统一配置：
  - 按钮文本：okText/cancelText 各自定义
  - 危险操作样式：部分设置 `okButtonProps: { danger: true }`，部分未设置
  - 图标：部分自定义，部分使用默认

**组件命名不统一**：
- ✅ 标准命名：`PatientCreateModal.jsx`, `ProjectCreateWizardModal.jsx`
- ❌ 内联定义：大量弹窗直接在页面组件内定义（如 `AIProcessing/index.jsx` 中多个 Modal）

**影响**：
- 用户在不同功能间切换时，弹窗宽度跳变明显，体验不一致
- Modal 样式散落在各文件，无法全局调整
- 新旧 API 混用增加维护成本

## 4. 风险评估

- 一致性风险：不同页面视觉风格与交互密度不一致
- 维护风险：后续改色/改字号需要多点修改，回归成本高
  - 量化指标：修改一个状态色需要搜索替换 **88+ 处**（仅统计状态色）
  - 修改主色需要处理 **3 个不同的色值变体**
- 扩展风险：新页面容易继续复制硬编码，技术债持续累积
  - 当前硬编码密度：平均每个 JSX 文件有 **21 处硬编码颜色**
- 性能风险：大量内联样式可能导致 React 重渲染性能下降
- 协作风险：colors.js 与实际使用脱节，开发者可能误以为"没有配色规范"
- 品牌一致性风险：主色冲突（#1890ff vs #1677ff vs #6366f1）影响视觉识别
- **Modal 体验风险**：
  - 宽度跳变明显：用户在不同功能间切换时，弹窗宽度差异达 **650px**
  - API 迁移风险：`bodyStyle` 与 `styles` 混用会增加升级成本，建议提前统一到 `styles` 写法
  - 滚动体验不一致：部分弹窗可滚动，部分固定高度，部分无限制

## 5. 建议整改路线（按优先级）

## P0（先做，1-2 周）

- 建立唯一规范文档：`frontend/DESIGN.md`（本次已创建首版）
- 冻结新增硬编码：新代码禁止新增十六进制颜色与随意字号
- 将核心语义色收敛到 token（主色、成功、警告、错误、正文、次级正文、边框、页面底色）
- **验收指标**：新提交代码中硬编码颜色数量为 0

## P1（再做，2-4 周）

- 统一高频页面（建议先做）：
  - `PatientDetail`（全量口径 **1186 处**；主干页 `index.jsx` 约 **80 处**）
  - `ResearchDataset/ProjectDatasetView`（全量口径 **382 处**；主干页约 **197 处**）
  - `MainLayout`（当前 **55 处硬编码颜色**）
- 替换规则：
  - 颜色：优先 `token` / CSS 变量，禁止直接写 `#xxxxxx`
  - 字号：统一到字号梯度（12/14/16/20/24），消除 11/13/15/17/18 等非标字号
  - 间距：统一到 8px 系统
- **Modal 弹窗统一**：
  - 宽度收敛到梯度：**480px（窄）/ 600px（标准）/ 800px（宽）/ 1000px（超宽）**
  - body 样式统一使用新 API：`styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}`
  - 在 ConfigProvider 中配置 Modal 全局 token（宽度、圆角、padding）
  - 统一 Modal.confirm 按钮文本和样式（建立封装函数）
- **验收指标**：
  - 核心页面硬编码颜色减少 80%（1559 → ~300）
  - 非标准字号减少 90%（939 → ~90）
  - Modal 宽度减少到 4 种（12 → 4）

## P2（持续）

- 引入样式规范检查（ESLint/stylelint 规则或脚本巡检）
- 建立页面级视觉验收清单（发布前检查字体、颜色、间距、对齐）
- 将 `colors.js` 与 `ConfigProvider theme` 合并为单一 token 源，避免双轨
- 建立 Modal 组件库：
  - 封装常用 Modal 变体（FormModal、ConfirmModal、PreviewModal）
  - 建立 Modal.confirm/info/warning 统一调用函数
  - 配置 Modal 全局样式 token（在 ConfigProvider 中）
- 建立 Modal 宽度选择指南文档

## 6. 验收标准（建议）

### 定量指标

- **新增页面**：硬编码颜色为 0
- **存量核心页面**：硬编码颜色减少 80%+（当前 1559 → 目标 <300）
- **字号统一**：非标准字号减少 90%（当前 939 → 目标 <90）
- **间距统一**：核心页面间距 100% 符合 8px 倍数体系
- **全局文本主字号**：统一为 14（特殊标题按规范升级）
- **主布局间距**：统一到 8px 倍数体系
- **Modal 宽度统一**：收敛到 4 种标准宽度（480/600/800/1000），减少率 67%（12 → 4）
- **Modal API 统一**：100% 使用 `styles` 新 API，废弃 `bodyStyle`
- **Modal.confirm 统一**：封装统一调用函数，按钮文本和样式一致性 100%

### 定性指标

- 所有颜色使用必须能追溯到 token 或 CSS 变量
- 所有字号必须来自规范梯度（12/14/16/20/24）
- `colors.js` 定义的颜色常量被实际消费（import 次数 > 0）
- 主色唯一：消除 #1677ff 和 #6366f1，统一到 #1890ff 或重新定义品牌色

## 7. 下一步执行建议

### 分批迁移策略

- **第一批**（1周）：`MainLayout` 和 `ResearchDataset`
  - 目标：减少硬编码颜色 ~200 处
  - 沉淀”改造范式”和”替换映射表”（旧值 → token）

- **第二批**（2周）：`PatientDetail` 核心模块
  - 目标：减少硬编码颜色 ~800 处，减少内联样式 ~600 处
  - 重点：患者详情页、文档管理、电子病历

- **第三批**（持续）：剩余模块
  - 按硬编码密度降序处理
  - 每次迁移都附带”替换映射表”（旧值 → token），便于审计

### 技术保障措施

- 引入 ESLint 规则检测硬编码颜色和字号
- 建立 PR 检查清单：新增代码必须符合 DESIGN.md 规范
- 定期运行脚本巡检：统计硬编码数量趋势

### 风险规避

- 避免一次性大改带来回归风险
- 每批迁移后进行视觉回归测试
- 保留旧值映射表，便于快速定位问题

---

## 附录：统计详情

### A. 硬编码颜色热点文件 Top 10

| 文件路径 | 硬编码次数 | 说明 |
|---------|-----------|------|
| MainLayout.jsx | 55 | 主布局，全站影响面最大 |
| ProjectDatasetView.jsx | 105 | 科研数据集核心页面 |
| PatientDetail/index.jsx | 24 | 患者详情主页 |
| Dashboard/index.jsx | 47 | 仪表盘页面 |
| DocumentUpload/index.jsx | 27 | 文档上传中心 |
| AIProcessing/index.jsx | 128 | AI 处理流程 |
| ExtractionDashboard/index.jsx | 38 | 抽取仪表盘 |
| PatientPool/index.jsx | 23 | 患者数据池 |
| UserSystem/Login.jsx | 45 | 登录页面 |
| FormDesigner 组件 | 100+ | 表单设计器相关 |

**说明**：该表为审计摘录，并非严格按次数降序排列的完整 Top10 清单。

### B. 状态色重复统计

| 颜色值 | 出现次数 | 应映射到 token |
|--------|----------|----------------|
| #52c41a | 88+ | colorSuccess |
| #faad14 | 65+ | colorWarning |
| #ff4d4f | 75+ | colorError |

### C. 字号使用分布

- fontSize: 11 - 大量（辅助文本）
- fontSize: 12 - 标准 ✓
- fontSize: 13 - 较多（违规）
- fontSize: 14 - 标准 ✓（正文字号）
- fontSize: 15 - 较多（违规）
- fontSize: 16 - 标准 ✓
- fontSize: 17, 18 - 较少（违规）
- fontSize: 20 - 标准 ✓
- fontSize: 24 - 标准 ✓

### D. 内联样式密集度

| 模块 | 内联样式次数 | 文件数 |
|------|-------------|--------|
| PatientDetail | 1186 | 36 |
| ResearchDataset | 382 | 4 |
| FormDesigner | 200+ | 15+ |
| MainLayout | 150+ | 1 |

**说明**：
- 上表为“全量扫描口径”，包含备份/副本文件。
- 按“主干运行口径”看，`PatientDetail/index.jsx` 约 80 处内联样式，`ResearchDataset/ProjectDatasetView.jsx` 约 197 处，`MainLayout.jsx` 约 112 处。
- 内联样式过多会增加维护成本，且难以统一收敛到 token 体系。

### E. Modal 宽度分布详情

| 宽度 | 文件数 | 典型场景 |
|------|--------|----------|
| 450px | 1 | 简单确认弹窗 |
| 480px | 3 | 上传面板、图片预览 |
| 520px | 2 | 文件列表操作 |
| 600px | 8 | 标准表单、患者创建、模板编辑 |
| 640px | 2 | 中等复杂度表单 |
| 700px | 2 | 数据展示弹窗 |
| 720px | 1 | Schema 编辑 |
| 800px | 11 | **最常用**：文档详情、患者编辑、批量操作 |
| 860px | 1 | 项目创建向导 |
| 900px | 6 | 大型数据展示、AI 处理 |
| 1000px | 1 | 超宽数据展示 |
| 1100px | 1 | 科研项目详情 |

**建议收敛方案**：
- **480px**：简单表单、确认弹窗、上传面板
- **600px**：标准表单、患者创建、模板编辑
- **800px**：文档详情、批量操作、复杂表单
- **1000px**：大型数据展示、AI 处理结果

### F. Modal API 使用情况

**旧 API（bodyStyle）**：
- 使用次数：**20+ 处**
- 典型文件：Dashboard/index.jsx, ExtractionDashboard/index.jsx, SchemaForm/FormPanel.jsx
- 问题：与 `styles` 新写法混用，不利于统一治理与后续升级

**新 API（styles）**：
- 使用次数：**10+ 处**
- 典型文件：FieldSourceViewer/index.jsx, AIProcessing/index.jsx, ResearchDataset/index.jsx
- 优势：官方推荐，支持更灵活的样式配置

**滚动策略**：
- `maxHeight: '70vh'` - 最常用
- `maxHeight: 'calc(100vh - XXXpx)'` - 动态计算
- `height: 固定值` - 少数使用
- 无限制 - 部分简单弹窗

**建议统一方案**：
```jsx
// 标准弹窗
<Modal
  width={600}  // 或 480/800/1000
  styles={{
    body: {
      maxHeight: '70vh',
      overflowY: 'auto',
      overflowX: 'hidden'
    }
  }}
>
```

### G. Modal.confirm 样式不统一示例

**不一致项**：
1. **按钮文本**：
   - okText: '确定' / '确认' / '删除' / '提交'
   - cancelText: '取消'（大部分统一）

2. **危险操作样式**：
   ```jsx
   // 部分使用
   okButtonProps: { danger: true }
   // 部分未使用
   ```

3. **图标自定义**：
   ```jsx
   // 部分自定义
   icon: <ExclamationCircleOutlined />
   // 部分使用默认
   ```

**建议封装**：
```jsx
// utils/modalConfirm.js
export const confirmDelete = (onOk) => Modal.confirm({
  title: '确认删除',
  content: '此操作不可恢复',
  okText: '删除',
  okButtonProps: { danger: true },
  icon: <ExclamationCircleOutlined />,
  onOk
})
```
