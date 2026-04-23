## Dashboard 样式映射清单

本文档用于 Dashboard 改版的样式收敛，确保只调整展示层，不改变业务数据与行为。

### 颜色映射

| 旧值/用途 | 新来源 |
| --- | --- |
| `#6366f1`（KPI 患者） | `appThemeToken.colorPrimary` |
| `#10b981`（KPI 文档） | `STATUS_COLORS.success.main` |
| `#f59e0b`（KPI 项目） | `STATUS_COLORS.warning.main` |
| `#1677ff`（主操作/解析中） | `appThemeToken.colorPrimary` |
| `#52c41a`（成功态） | `appThemeToken.colorSuccess` |
| `#faad14`（警告态） | `appThemeToken.colorWarning` |
| `#ff4d4f`（失败态） | `appThemeToken.colorError` |
| `#f0f0f0`（边框） | `appThemeToken.colorBorder` |
| `#fff`（容器背景） | `appThemeToken.colorBgContainer` |
| `rgba(0,0,0,0.45)`（次级文本） | `appThemeToken.colorTextSecondary` |

### 字号映射

| 旧值/用途 | 新来源 |
| --- | --- |
| `12` | `--font-size-caption` |
| `14` | `appThemeToken.fontSize` |
| `16` | `--font-size-subtitle` |
| `20` | `--font-size-title` |
| `24` | `--font-size-hero` |
| `30`（KPI 大数字） | 调整为 `24`（规范内最大标题档） |

### 圆角与间距映射

| 旧值/用途 | 新来源 |
| --- | --- |
| `14/16/18`（卡片圆角混用） | `8`（卡片统一） |
| `12`（标签/辅助块） | `6` 或 `999`（胶囊形） |
| `8/12/16/20/24/32` 间距 | 保持，统一使用 8px 基数体系 |

### 行为契约（不可变更）

- 轮询频率：Dashboard 60s、任务 15s。
- 文件列表参数协议：`tab`、`taskStatus`、`statusInfo`、`openUpload`。
- 快捷入口事件：`request-patient-create`、`request-project-create`、`request-template-create`。
- 通知与最近活动点击分流逻辑保持不变。
