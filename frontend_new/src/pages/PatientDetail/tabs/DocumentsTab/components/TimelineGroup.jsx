/**
 * 时间轴分组组件
 * 左侧垂直线条式展示文档分组
 */
import React, { useState } from 'react'
import { Typography, Button, Space } from 'antd'
import { DownOutlined, RightOutlined } from '@ant-design/icons'
import DocumentCard from './DocumentCard'
import { appThemeToken } from '../../../../../styles/themeTokens'
import './TimelineGroup.css'

const { Text, Title } = Typography

const TimelineGroup = ({ 
  groupTitle, 
  groupSubtitle, 
  documents, 
  groupType = 'date',
  onDocumentClick,
  defaultExpanded = true 
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded)

  // 获取分组图标颜色
  const getGroupColor = (groupType) => {
    switch (groupType) {
      case 'date':
      case 'effectiveDate':
        return appThemeToken.colorPrimary
      case 'type':
        return appThemeToken.colorSuccess
      case 'organization':
        return appThemeToken.colorWarning
      case 'status':
        return appThemeToken.colorError
      case 'confidence':
        return appThemeToken.colorInfo
      default:
        return appThemeToken.colorPrimary
    }
  }

  const groupColor = getGroupColor(groupType)

  return (
    <div className="timeline-group">
      {/* 分组标题 */}
      <div className="timeline-group-header">
        <div 
          className="timeline-node"
          style={{ backgroundColor: groupColor }}
        />
        <div className="timeline-header-content">
          <div className="timeline-title-row">
            <Title level={5} className="timeline-group-title">
              {groupTitle}
            </Title>
            <Space size="small">
              <Text type="secondary" className="timeline-group-count">
                {documents.length} 个文档
              </Text>
              <Button
                type="text"
                size="small"
                icon={expanded ? <DownOutlined /> : <RightOutlined />}
                onClick={() => setExpanded(!expanded)}
                className="timeline-expand-btn"
              />
            </Space>
          </div>
          {groupSubtitle && (
            <Text type="secondary" className="timeline-group-subtitle">
              {groupSubtitle}
            </Text>
          )}
        </div>
      </div>

      {/* 分组内容 */}
      {expanded && (
        <div className="timeline-group-content">
          <div 
            className="timeline-line"
            style={{ backgroundColor: groupColor }}
          />
          <div className="timeline-documents">
            {documents.map((document, index) => (
              <div 
                key={document.id} 
                className="timeline-document-item"
                style={{ 
                  marginBottom: index === documents.length - 1 ? 0 : 16 
                }}
              >
                <div 
                  className="timeline-document-dot"
                  style={{ backgroundColor: groupColor }}
                />
                <div className="timeline-document-card">
                  <DocumentCard
                    document={document}
                    onClick={onDocumentClick}
                    showTimeline={false}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default TimelineGroup