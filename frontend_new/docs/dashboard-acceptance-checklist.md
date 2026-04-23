## Dashboard 改版验收清单（仅展示层）

### 一、规范验收

- [ ] `src/pages/Dashboard` 目录新增硬编码十六进制颜色为 0。
- [ ] `src/pages/Dashboard` 目录新增 `bodyStyle` 为 0。
- [ ] 字号仅使用 `12/14/16/20/24`。
- [ ] 卡片圆角与间距遵循 `DESIGN-FOUNDATIONS.md` 基线（圆角 6/8，间距 8 基数体系）。

### 二、行为契约验收

- [ ] 顶部刷新按钮触发 Dashboard 与任务接口同时刷新。
- [ ] 最新任务通知区刷新按钮仅触发任务接口刷新。
- [ ] 最近活动区刷新按钮仅触发 Dashboard 接口刷新。
- [ ] 轮询频率保持不变：Dashboard 60s、任务 15s。

### 三、跳转与事件验收

- [ ] KPI「患者」跳转到 `/patient/pool`。
- [ ] KPI「文档」跳转到文件列表 `tab=all`。
- [ ] KPI「项目」与「任务」跳转到科研首页。
- [ ] 文档流转分段点击后，`tab/taskStatus/statusInfo/openUpload` 参数保持原协议。
- [ ] 快捷入口继续派发 `request-patient-create/request-project-create/request-template-create` 事件。
- [ ] 通知流与最近活动点击分流逻辑与改版前一致。

### 四、展示与布局验收

- [ ] 首页视觉顺序为：KPI -> 快捷入口/通知 + 文档流转 -> 患者/项目 -> 最近活动。
- [ ] 卡片标题、副标题、数值层级清晰，重点区域不拥挤。
- [ ] 小屏（`lg` 以下）布局自动回落为单列，不出现重叠和溢出。

### 五、回归建议

- [ ] 使用至少 1 组真实数据回归（包含任务失败、待归档、冲突三类通知）。
- [ ] 使用空数据回归（`dashboard = null` 与 `taskPayload` 为空结构）。
- [ ] 对比改版前后关键路径耗时，确保无明显交互退化。
