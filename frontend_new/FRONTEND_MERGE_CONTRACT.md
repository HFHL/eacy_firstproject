# Frontend Merge Contract

本文件用于冻结 `first-project/frontend` 在本轮前端合并中的功能契约边界，避免把 `first-project-main` 的布局优化错误地升级为整文件覆盖。

## Baseline

- 唯一产品基线：`first-project/frontend`
- 合并策略：只迁移展示层与导航体验，不回退接口、路由、权限、管理台入口和任务流协议

## Do Not Replace

以下文件禁止用 `first-project-main` 整文件覆盖：

- `src/router/index.jsx`
- `src/api/request.js`
- `src/api/patient.js`
- `src/api/admin.js`
- `src/components/SchemaForm/SchemaForm.jsx`
- `src/pages/Admin/index.jsx`

## Allowed Safe Migrations

当前白名单仅允许迁入以下类型改动：

- `MainLayout` 的顶层域导航、上下文 rail、搜索跳转体验
- `PatientDetail` 的返回来源链路
- `Dashboard` 的展示层优化和保留细粒度跳转
- `FileList` 的纯前端视图切换与布局组织
- 局部样式、空状态、文案和非契约型交互

## Review Rule

凡是涉及以下内容的改动，必须按功能变更审查，而不是按样式迁移处理：

- URL 参数协议
- API 函数名或接口版本
- Redux 状态语义
- 轮询与 WebSocket 逻辑
- 任务中心与归档流程
- `/admin` 菜单、权限或入口
