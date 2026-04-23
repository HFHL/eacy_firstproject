import React from 'react'
import { Card, Typography } from 'antd'
import { DASHBOARD_COLORS, DASHBOARD_SIZES } from '../styleTokens'

const { Text } = Typography

/**
 * Dashboard KPI 卡片。
 *
 * @param {{
 *   title: string,
 *   value: number | string | null | undefined,
 *   delta: string,
 *   icon: React.ReactNode,
 *   color: string,
 *   onClick: () => void
 * }} props 组件参数
 * @returns {JSX.Element} 渲染结果
 */
const KpiCard = ({ title, value, delta, icon, color, onClick }) => (
  <Card
    hoverable
    onClick={onClick}
    style={{
      borderRadius: DASHBOARD_SIZES.cardRadius,
      border: `1px solid ${DASHBOARD_COLORS.border}`,
      height: '100%',
      cursor: 'pointer',
      background: DASHBOARD_COLORS.bgContainer,
    }}
    styles={{ body: { padding: 20 } }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <Text type="secondary">{title}</Text>
        <div style={{ marginTop: 8, fontSize: 24, fontWeight: 600, lineHeight: 1.3 }}>
          {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          今日变化：{delta}
        </Text>
      </div>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: DASHBOARD_SIZES.blockRadius,
          background: color,
          color: DASHBOARD_COLORS.bgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
    </div>
  </Card>
)

export default KpiCard
