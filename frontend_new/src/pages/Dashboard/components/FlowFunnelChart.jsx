import React from 'react'
import { Empty, Typography } from 'antd'
import { toNumber } from '../utils'

const { Text } = Typography

/**
 * 文档流转横向漏斗图（快照分布）。
 *
 * @param {{
 *   stages: Array<{
 *     key: string,
 *     label: string,
 *     total: number,
 *     onClick?: () => void,
 *     segments?: Array<{ key: string, label: string, value: number, color: string, onClick?: () => void }>
 *   }>
 * }} props 组件参数
 * @returns {JSX.Element} 渲染结果
 */
const FlowFunnelChart = ({ stages }) => {
  if (!stages?.length) {
    return <Empty description="暂无流转数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const totals = stages.map((stage) => toNumber(stage.total))
  const maxTotal = Math.max(...totals, 1)
  const totalDocuments = totals.reduce((sum, value) => sum + value, 0)
  const allZero = totals.every((value) => value === 0)

  if (allZero) {
    return <Empty description="暂无流转数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  const renderSegmentBlocks = (stage) => {
    const stageTotal = toNumber(stage.total)
    const segments = (stage.segments || []).filter((segment) => toNumber(segment.value) > 0)
    if (!segments.length || stageTotal <= 0) {
      return <div className="dashboard-funnel-bar-fill" />
    }
    return (
      <div className="dashboard-funnel-segments">
        {segments.map((segment) => {
          const ratio = Math.max((toNumber(segment.value) / stageTotal) * 100, 3)
          return (
            <div
              key={segment.key}
              className="dashboard-funnel-segment"
              style={{ height: `${ratio}%`, background: segment.color }}
              onClick={(event) => {
                event.stopPropagation()
                segment.onClick?.()
              }}
              role={segment.onClick ? 'button' : undefined}
              title={`${segment.label}: ${toNumber(segment.value)}`}
            />
          )
        })}
      </div>
    )
  }

  return (
    <div className="dashboard-funnel">
      <div className="dashboard-funnel-grid">
        {stages.map((stage, index) => {
          const current = toNumber(stage.total)
          const next = toNumber(stages[index + 1]?.total)
          const height = Math.max(Math.round((current / maxTotal) * 120), current > 0 ? 28 : 10)
          const nextHeight = Math.max(Math.round((next / maxTotal) * 120), next > 0 ? 28 : 10)
          const stagePercent = totalDocuments > 0 ? `${((current / totalDocuments) * 100).toFixed(2)}%` : '--'

          return (
            <div key={stage.key} className="dashboard-funnel-stage-wrap">
              <div className="dashboard-funnel-stage-head">
                <Text className="dashboard-funnel-stage-label">{stage.label}</Text>
                <Text className="dashboard-funnel-stage-total">{current.toLocaleString()}</Text>
              </div>
              <div
                className="dashboard-funnel-stage"
                onClick={stage.onClick}
                role={stage.onClick ? 'button' : undefined}
                style={{ cursor: stage.onClick ? 'pointer' : 'default' }}
              >
                <div className="dashboard-funnel-stage-visual">
                  <div className="dashboard-funnel-bar" style={{ height }}>
                    {renderSegmentBlocks(stage)}
                  </div>
                  {index < stages.length - 1 ? (
                    <div
                      className="dashboard-funnel-connector"
                      style={{
                        '--from-bar-height': `${height}px`,
                        '--to-bar-height': `${nextHeight}px`,
                      }}
                    />
                  ) : null}
                </div>
              </div>
              <div className={`dashboard-funnel-rate${index === stages.length - 1 ? ' dashboard-funnel-rate-last' : ''}`}>
                {stagePercent}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FlowFunnelChart
