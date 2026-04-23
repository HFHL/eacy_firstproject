import React from 'react'
import { Empty, Space, Typography } from 'antd'
import { DASHBOARD_COLORS } from '../styleTokens'
import { toNumber } from '../utils'

const { Text } = Typography

/**
 * 分段进度条组件。
 *
 * @param {{
 *   segments: Array<{ key: string, label: string, value: number, color: string, onClick?: () => void }>,
 *   emptyText?: string,
 *   showLegend?: boolean,
 *   height?: number
 * }} props 组件参数
 * @returns {JSX.Element} 渲染结果
 */
const SegmentedBar = ({ segments, emptyText = '暂无数据', showLegend = true, height = 12 }) => {
  const total = segments.reduce((sum, item) => sum + toNumber(item.value), 0)
  if (!segments.length || total === 0) {
    return <Empty description={emptyText} image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <Space direction="vertical" size={showLegend ? 10 : 0} style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          width: '100%',
          height,
          overflow: 'hidden',
          borderRadius: 999,
          background: DASHBOARD_COLORS.bgSubtle,
        }}
      >
        {segments.map((segment) => {
          const value = toNumber(segment.value)
          const percent = (value / Math.max(total, 1)) * 100
          if (value <= 0) return null
          return (
            <div
              key={segment.key}
              onClick={segment.onClick}
              role={segment.onClick ? 'button' : undefined}
              style={{
                width: `${percent}%`,
                minWidth: percent > 0 ? 6 : 0,
                background: segment.color,
                cursor: segment.onClick ? 'pointer' : 'default',
              }}
            />
          )
        })}
      </div>
      {showLegend ? (
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {segments.map((segment) => (
            <div
              key={segment.key}
              onClick={segment.onClick}
              role={segment.onClick ? 'button' : undefined}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 10px',
                borderRadius: 6,
                background: DASHBOARD_COLORS.bgSubtle,
                cursor: segment.onClick ? 'pointer' : 'default',
              }}
            >
              <Space size={8}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: segment.color,
                  }}
                />
                <Text>{segment.label}</Text>
              </Space>
              <Text strong>{toNumber(segment.value).toLocaleString()}</Text>
            </div>
          ))}
        </Space>
      ) : null}
    </Space>
  )
}

export default SegmentedBar
