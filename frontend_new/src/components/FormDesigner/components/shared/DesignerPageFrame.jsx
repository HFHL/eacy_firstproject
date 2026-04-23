import React from 'react'
import { Card, Row, Col, Button } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../../styles/themeTokens'

const DesignerPageFrame = ({
  backLabel = '返回',
  showBackButton = true,
  singleLineHeader = false,
  containerPadding = 16,
  containerHeight = 'calc(100vh - 88px)',
  containerMinHeight = 600,
  unifiedContainer = false,
  onBack,
  headerContent = null,
  actions = null,
  children
}) => {
  const renderHeaderRow = () => (
    <Row gutter={16} align="middle" wrap={!singleLineHeader}>
      {showBackButton && (
        <Col>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            {backLabel}
          </Button>
        </Col>
      )}
      <Col flex={1}>
        {headerContent}
      </Col>
      <Col>
        {actions}
      </Col>
    </Row>
  )

  if (unifiedContainer) {
    return (
      <div
        className="page-container fade-in"
        style={{ display: 'flex', flexDirection: 'column', height: containerHeight, minHeight: containerMinHeight, padding: containerPadding }}
      >
        <Card
          size="small"
          style={{ flex: 1, minHeight: 0 }}
          bodyStyle={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div style={{ flexShrink: 0 }}>
            {renderHeaderRow()}
          </div>
          <div style={{ borderTop: `1px solid ${appThemeToken.colorBorder}`, margin: '12px -16px 12px' }} />
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {children}
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div
      className="page-container fade-in"
      style={{ display: 'flex', flexDirection: 'column', height: containerHeight, minHeight: containerMinHeight, padding: containerPadding }}
    >
      <Card size="small" style={{ marginBottom: 16, flexShrink: 0 }}>
        {renderHeaderRow()}
      </Card>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

export default DesignerPageFrame
