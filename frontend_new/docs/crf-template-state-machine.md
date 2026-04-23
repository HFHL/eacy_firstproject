# CRF 模板页面状态机

## 状态定义

| 状态 | 触发条件 | 说明 |
|---|---|---|
| `create:pendingMeta` | 路由为 `templateCreate()` 且不存在待创建元信息 | 新建页空背景，等待用户补模板信息 |
| `create:editing` | 路由为 `templateCreate()` 且已消费待创建元信息 | 新建模板设计态，尚未产生真实 `templateId` |
| `existing:view` | 存在 `templateId` 且路径以 `/view` 结尾 | 已有模板只读查看态 |
| `existing:edit` | 存在 `templateId` 且非 `/view` | 已有模板编辑态 |

## 关键规则

- 新建模板入口先弹模板元信息弹窗，背景页不跳转。
- 确认后进入 `templateCreate()`，并通过 `templateCreateFlow` 传入 `meta + returnTo`。
- `save(create)` 成功后跳转到 `templateEdit(newId)`。
- `handleBack` 规则：
  - create：优先 `returnTo`，其次浏览器历史，最后 `templateFallback()`
  - existing:view：优先浏览器历史，最后 `templateFallback()`
  - existing:edit：返回 `templateView(templateId)`

## 相关文件

- `frontend/src/pages/CRFDesigner/index.jsx`
- `frontend/src/utils/templateCreateFlow.js`
- `frontend/src/utils/templatePageState.js`
- `frontend/src/utils/researchPaths.js`
