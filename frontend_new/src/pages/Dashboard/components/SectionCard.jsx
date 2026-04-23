import React from 'react'
import { Card, Space, Typography } from 'antd'
import { DASHBOARD_SIZES } from '../styleTokens'

const { Text } = Typography

/**
 * Dashboard 区块卡片。
 *
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   extra?: React.ReactNode,
 *   className?: string,
 *   style?: React.CSSProperties,
 *   children: React.ReactNode
 * }} props 组件参数
 * @returns {JSX.Element} 渲染结果
 */
const SectionCard = ({ title, subtitle, extra, className, style, children }) => (
  <Card
    bordered={false}
    className={`dashboard-section-card ${className || ''}`.trim()}
    style={{ borderRadius: DASHBOARD_SIZES.cardRadius, ...(style || {}) }}
    title={(
      <Space direction="vertical" size={0}>
        <Text strong style={{ fontSize: 16 }}>{title}</Text>
        {subtitle ? <Text type="secondary" style={{ fontSize: 12 }}>{subtitle}</Text> : null}
      </Space>
    )}
    extra={extra}
  >
    {children}
  </Card>
)

export default SectionCard
