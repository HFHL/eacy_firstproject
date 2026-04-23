/**
 * 布局Hook测试页面
 * 用于验证useEhrLayout Hook的功能
 */
import React from 'react'
import { Card, Button, Space, Typography } from 'antd'
import { useEhrLayout } from './hooks/useEhrLayout'
import { appThemeToken } from '@/styles/themeTokens'

const { Text } = Typography

const LayoutTest = () => {
  const {
    ehrLeftWidth,
    ehrRightWidth,
    handleLeftResize,
    handleRightResize,
    resetLayout,
    setPresetLayout
  } = useEhrLayout()

  return (
    <div style={{ padding: 20 }}>
      <Card title="布局Hook测试" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text>左侧宽度: {ehrLeftWidth}px</Text>
          <Text>右侧宽度: {ehrRightWidth}px</Text>
          <Button onClick={resetLayout}>重置布局</Button>
          <Button onClick={() => setPresetLayout('compact')}>紧凑布局</Button>
          <Button onClick={() => setPresetLayout('wide')}>宽松布局</Button>
          <Button onClick={() => setPresetLayout('focus-middle')}>聚焦中间</Button>
        </Space>
      </Card>
      
      {/* 模拟三栏布局 */}
      <div style={{ display: 'flex', gap: '8px', height: '300px' }}>
        {/* 左侧面板 */}
        <div style={{ 
          width: `${ehrLeftWidth}px`, 
          minWidth: '250px',
          background: appThemeToken.colorPrimaryBg,
          border: `1px solid ${appThemeToken.colorPrimary}`,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Text>左侧面板 ({ehrLeftWidth}px)</Text>
        </div>

        {/* 左侧拖拽条 */}
        <div 
          style={{ 
            width: '4px', 
            background: appThemeToken.colorBorder, 
            cursor: 'col-resize',
            borderRadius: '2px',
            transition: 'background 0.2s'
          }}
          onMouseDown={handleLeftResize}
          onMouseEnter={(e) => e.target.style.background = appThemeToken.colorBorderSecondary}
          onMouseLeave={(e) => e.target.style.background = appThemeToken.colorBorder}
        />

        {/* 中间面板 */}
        <div style={{ 
          flex: 1, 
          minWidth: '400px',
          background: 'rgba(82, 196, 26, 0.1)',
          border: `1px solid ${appThemeToken.colorSuccess}`,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Text>中间面板 (自适应)</Text>
        </div>

        {/* 右侧拖拽条 */}
        <div 
          style={{ 
            width: '4px', 
            background: appThemeToken.colorBorder, 
            cursor: 'col-resize',
            borderRadius: '2px',
            transition: 'background 0.2s'
          }}
          onMouseDown={handleRightResize}
          onMouseEnter={(e) => e.target.style.background = appThemeToken.colorBorderSecondary}
          onMouseLeave={(e) => e.target.style.background = appThemeToken.colorBorder}
        />

        {/* 右侧面板 */}
        <div style={{ 
          width: `${ehrRightWidth}px`, 
          minWidth: '300px',
          background: 'rgba(250, 140, 22, 0.1)',
          border: `1px solid ${appThemeToken.colorWarning}`,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Text>右侧面板 ({ehrRightWidth}px)</Text>
        </div>
      </div>
    </div>
  )
}

export default LayoutTest