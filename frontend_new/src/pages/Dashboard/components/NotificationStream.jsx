import React from 'react'
import { Empty, List, Space, Tag, Typography } from 'antd'
import { DASHBOARD_COLORS } from '../styleTokens'
import { formatTimeAgo } from '../utils'

const { Text } = Typography

/**
 * 通知流组件。
 *
 * @param {{
 *   items: Array<{
 *     key: string,
 *     title: string,
 *     description: string,
 *     created_at?: string,
 *     color?: string,
 *     tagColor?: string,
 *     tagLabel?: string
 *   }>,
 *   onClick: (item: any) => void
 * }} props 组件参数
 * @returns {JSX.Element} 渲染结果
 */
const NotificationStream = ({ items, onClick }) => {
  if (!items.length) {
    return <Empty description="暂无任务通知" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <List
      dataSource={items}
      renderItem={(item) => (
        <List.Item
          style={{ padding: '12px 0', cursor: 'pointer' }}
          onClick={() => onClick(item)}
        >
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: item.color || DASHBOARD_COLORS.primary,
                marginTop: 6,
                flexShrink: 0,
                boxShadow: '0 0 0 4px rgba(0, 0, 0, 0.06)',
              }}
            />
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Space size={8} wrap>
                  <Text strong>{item.title}</Text>
                  <Tag color={item.tagColor || 'default'}>{item.tagLabel || '任务消息'}</Tag>
                </Space>
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                  {formatTimeAgo(item.created_at)}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {item.description}
              </Text>
            </div>
          </div>
        </List.Item>
      )}
    />
  )
}

export default NotificationStream
