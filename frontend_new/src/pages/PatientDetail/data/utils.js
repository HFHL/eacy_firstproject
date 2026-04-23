/**
 * 患者详情页面工具函数
 */
import React from 'react'
import { Tag, Button, Tooltip } from 'antd'
import {
  FileTextOutlined,
  PictureOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons'
import { CONFIDENCE_CONFIG } from './constants'
import { appThemeToken } from '../../../styles/themeTokens'

// 文档类型图标映射
export const getDocumentIcon = (type) => {
  switch (type) {
    case 'PDF':
      return <FileTextOutlined style={{ color: appThemeToken.colorError }} />
    case 'Image':
      return <PictureOutlined style={{ color: appThemeToken.colorSuccess }} />
    case 'Excel':
      return <FileTextOutlined style={{ color: appThemeToken.colorPrimary }} />
    default:
      return <FileTextOutlined />
  }
}

// 置信度标签
export const getConfidenceTag = (confidence) => {
  if (!confidence) return null
  const { color, text } = CONFIDENCE_CONFIG[confidence]
  return <Tag color={color} size="small">{text}</Tag>
}

// 获取状态图标
export const getEhrStatusIcon = (status) => {
  switch (status) {
    case 'completed': return <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess }} />
    case 'partial': return <ExclamationCircleOutlined style={{ color: appThemeToken.colorWarning }} />
    case 'incomplete': return <ExclamationCircleOutlined style={{ color: appThemeToken.colorError }} />
    default: return null
  }
}

// 获取置信度颜色
export const getEhrConfidenceColor = (confidence) => {
  switch (confidence) {
    case 'high': return appThemeToken.colorSuccess
    case 'medium': return appThemeToken.colorWarning
    case 'low': return appThemeToken.colorError
    default: return appThemeToken.colorBorder
  }
}

export default {
  getDocumentIcon,
  getConfidenceTag,
  getEhrStatusIcon,
  getEhrConfidenceColor
}