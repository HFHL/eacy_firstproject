# Frontend Design Index

## 文档入口

前端样式治理已拆分为两份文档：

- 长期规范（What）：`DESIGN-FOUNDATIONS.md`
- 迁移执行（How/When）：`DESIGN-MIGRATION.md`

## 发布判定

- 发布门禁、阶段目标、回滚口径统一以 `DESIGN-MIGRATION.md` 为准。
- 视觉基础规范（token 语义、字号/间距、Modal 统一规则）以 `DESIGN-FOUNDATIONS.md` 为准。

## 基线审计

- 审计报告：`docs/ui-style-audit-2026-04-11.md`

## 变更治理要求

- 影响视觉基线的改动，需同步更新 Foundations。
- 影响阶段安排与验收指标的改动，需同步更新 Migration。
- PR 需附样式变更说明与回归验证结果（功能 + 视觉）。
