import React from 'react'
import { Empty, Space, Tooltip, Typography } from 'antd'
import { DASHBOARD_COLORS } from '../styleTokens'
import { clampPercent, toNumber } from '../utils'

const { Text } = Typography

/**
 * 小型环形图组件。
 *
 * @param {{
 *   items: Array<{ key: string, label: string, value: number, color: string }>,
 *   emptyText?: string,
 *   showDetails?: boolean
 * }} props 组件参数
 * @returns {JSX.Element} 渲染结果
 */
const MiniDonutChart = ({ items, emptyText = '暂无数据', showDetails = true }) => {
  const total = items.reduce((sum, item) => sum + toNumber(item.value), 0)
  if (!items.length || total === 0) {
    return <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const chartSize = 120
  const strokeWidth = 16
  const radius = (chartSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  let currentRatio = 0
  const chartItems = items
    .filter((item) => toNumber(item.value) > 0)
    .map((item) => {
      const value = toNumber(item.value)
      const ratio = value / total
      const length = ratio * circumference
      const dashOffset = circumference * (1 - currentRatio)
      currentRatio += ratio
      return {
        ...item,
        value,
        percent: clampPercent(ratio * 100),
        length,
        dashOffset,
      }
    })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: showDetails ? '120px minmax(0, 1fr)' : '1fr',
        gap: 16,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: chartSize,
          height: chartSize,
          position: 'relative',
          margin: '0 auto',
        }}
      >
        <svg
          width={chartSize}
          height={chartSize}
          viewBox={`0 0 ${chartSize} ${chartSize}`}
          style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}
        >
          <circle
            cx={chartSize / 2}
            cy={chartSize / 2}
            r={radius}
            fill="none"
            stroke={DASHBOARD_COLORS.border}
            strokeWidth={strokeWidth}
          />
          {chartItems.map((item) => (
            <Tooltip
              key={item.key}
              title={`${item.label}: ${item.value.toLocaleString()} (${item.percent}%)`}
            >
              <circle
                cx={chartSize / 2}
                cy={chartSize / 2}
                r={radius}
                fill="none"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${item.length} ${circumference - item.length}`}
                strokeDashoffset={item.dashOffset}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s ease' }}
              />
            </Tooltip>
          ))}
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 20,
            borderRadius: '50%',
            background: DASHBOARD_COLORS.bgContainer,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.04)',
            pointerEvents: 'none',
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>总量</Text>
          <Text strong style={{ fontSize: 20, lineHeight: 1.3 }}>
            {total.toLocaleString()}
          </Text>
        </div>
      </div>
      {showDetails ? (
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          {items.map((item) => {
            const percent = clampPercent((toNumber(item.value) / Math.max(total, 1)) * 100)
            return (
              <div key={item.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                  <Space size={8}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: item.color,
                      }}
                    />
                    <Text>{item.label}</Text>
                  </Space>
                  <Text type="secondary">
                    {toNumber(item.value).toLocaleString()} / {percent}%
                  </Text>
                </div>
                <div
                  style={{
                    height: 8,
                    borderRadius: 999,
                    background: DASHBOARD_COLORS.bgSubtle,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${percent}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: item.color,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </Space>
      ) : (
        <Space wrap size={[12, 8]} style={{ width: '100%', justifyContent: 'center' }}>
          {items.map((item) => {
            const value = toNumber(item.value)
            const percent = clampPercent((value / Math.max(total, 1)) * 100)
            return (
              <Space
                key={item.key}
                size={6}
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: DASHBOARD_COLORS.bgSubtle,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: item.color,
                  }}
                />
                <Text style={{ fontSize: 12 }}>
                  {item.label}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {value.toLocaleString()} / {percent}%
                </Text>
              </Space>
            )
          })}
        </Space>
      )}
    </div>
  )
}

export default MiniDonutChart
