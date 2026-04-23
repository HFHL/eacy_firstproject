# Frontend Design Foundations

## 1. 文档定位

本文件定义长期稳定的视觉基础规范，是前端样式实现的**长期基线**。  
迁移排期、批次执行、阶段目标请参考 `DESIGN-MIGRATION.md`。

## 2. 适用范围

- 目录范围：`frontend/src`
- 适用对象：主干路由页面、共享组件、全局布局
- 规则优先级：组件 token > 语义变量 > 局部样式

## 3. 设计原则

- 一致性优先：同语义元素使用同来源样式
- 语义化优先：颜色/字号统一映射 token
- 可维护优先：可追溯、可替换、可审计
- 渐进治理：增量先规范、存量分批收敛

## 4. Token 体系

### 4.1 单一来源

- 单一事实来源（SSOT）：`src/styles/themeTokens.js`
- 全局注入入口：`src/main.jsx` 中 `ConfigProvider.theme`
- CSS 变量层：`src/styles/global.css`（仅镜像语义变量，不作为并行来源）

### 4.2 色彩语义

- `colorPrimary`: 品牌主色
- `colorSuccess`: 成功态
- `colorWarning`: 警告态
- `colorError`: 错误态
- `colorText`: 正文
- `colorTextSecondary`: 次级正文
- `colorBgLayout`: 页面底色
- `colorBgContainer`: 容器底色
- `colorBorder`: 边框

### 4.3 字号与排版

- 正文字号：14
- 字号梯度：12 / 14 / 16 / 20 / 24
- 字重：400 / 500 / 600
- 行高建议：正文 1.5，标题 1.3

### 4.4 间距体系

- 8px 基数：8 / 12 / 16 / 20 / 24 / 32
- 圆角基线：6（卡片可 8）

## 5. 组件规范

### 5.1 Modal（强制）

- 宽度档位仅允许：480 / 600 / 800 / 1000
- 默认宽度：600
- body 样式统一：

```jsx
<Modal
  width={600}
  styles={{
    body: {
      maxHeight: '70vh',
      overflowY: 'auto',
      overflowX: 'hidden',
    },
  }}
/>
```

- 禁止新增 `bodyStyle` 写法

### 5.2 内联样式约束

- 允许：运行时动态值（坐标、拖拽尺寸、临时动画）
- 禁止：品牌色、状态色、主字号等静态硬编码

## 6. 禁止项

- 禁止新增十六进制硬编码颜色
- 禁止新增非规范字号（11/13/15/17/18）
- 禁止在同一组件混用多套颜色体系
- 禁止在业务页面新增 `bodyStyle`

## 7. 例外机制

仅允许短期例外，且必须在 PR 标注：

- 例外原因
- 影响范围
- 预计移除时间

## 8. 与迁移文档关系

- 本文件：长期规范（What）
- `DESIGN-MIGRATION.md`：执行路径（How/When）
- 两者冲突时，发布判定以迁移文档中的“主干运行口径”为准
