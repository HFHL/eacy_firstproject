/**
 * 字段渲染器组件
 * 根据Schema的x-display类型渲染不同的表单控件
 * 使用传统研究表单的一字段一行模式
 */
import React, { useMemo, useCallback, useState } from 'react'
import {
  Input,
  InputNumber,
  Select,
  DatePicker,
  Radio,
  Checkbox,
  Upload,
  Button,
  Slider,
  Cascader,
  Divider,
  Typography,
  Tooltip,
  Tag,
  Space,
  Row,
  Col
} from 'antd'
import {
  LockOutlined,
  FileSearchOutlined,
  EyeOutlined,
  EyeInvisibleOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useSchemaForm } from './SchemaFormContext'
import { maskSensitiveField } from '@/utils/sensitiveUtils'
import { RESTRICTED_DISPLAY_TYPES } from '../FormDesigner/core/constants'
import { appThemeToken } from '../../styles/themeTokens'

const { Text } = Typography
const { TextArea } = Input

// 选项数量阈值：超过此数量时自动使用下拉菜单
const RADIO_OPTIONS_THRESHOLD = 15

/**
 * 从Schema定义中获取显示类型
 */
function getDisplayType(fieldSchema, optionsCount = 0) {
  // 优先使用 x-display
  if (fieldSchema['x-display']) {
    const display = fieldSchema['x-display']
    // 如果指定了radio但选项过多，自动转为select
    if (display === 'radio' && optionsCount > RADIO_OPTIONS_THRESHOLD) {
      return 'select'
    }
    return display
  }
  
  // 根据type和format推断
  if (fieldSchema.format === 'date-time') return 'datetime'
  if (fieldSchema.format === 'date') return 'date'
  if (fieldSchema.type === 'number' || fieldSchema.type === 'integer') return 'number'
  if (fieldSchema.type === 'boolean') return 'checkbox'
  if (fieldSchema.allOf || fieldSchema.enum) return 'select'
  
  return 'text'
}

/**
 * 从枚举引用中获取选项
 */
function getOptionsFromSchema(fieldSchema, enums) {
  // 直接定义的enum
  if (fieldSchema.enum) {
    return fieldSchema.enum.map(v => ({ label: v, value: v }))
  }
  
  // 通过 x-options-id 引用
  if (fieldSchema['x-options-id'] && enums) {
    const enumDef = enums[fieldSchema['x-options-id']]
    if (enumDef?.values) {
      return enumDef.values.map(v => ({ label: v, value: v }))
    }
  }
  
  // 通过 allOf.$ref 引用
  if (fieldSchema.allOf?.[0]?.$ref) {
    const refId = fieldSchema.allOf[0].$ref.replace('#/$defs/', '')
    if (enums && enums[refId]?.values) {
      return enums[refId].values.map(v => ({ label: v, value: v }))
    }
  }
  
  return []
}

/**
 * 文本输入组件
 */
const TextInput = ({ value, onChange, disabled, placeholder }) => (
  <Input
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    placeholder={placeholder || '请输入'}
    style={{ width: '100%' }}
  />
)

/**
 * 敏感字段输入组件（脱敏展示，使用密码框默认隐藏值）
 */
/**
 * 敏感字段输入组件
 * 默认展示部分 * 脱敏值，点击眼睛图标切换为可编辑的明文输入框
 */
const SensitiveInput = ({ value, onChange, disabled, fieldName }) => {
  const [revealed, setRevealed] = useState(false)
  const maskedDisplay = useMemo(
    () => (value ? maskSensitiveField(String(value), fieldName || '') : ''),
    [value, fieldName]
  )

  return (
    <Input
      value={revealed ? value : maskedDisplay}
      onChange={e => {
        if (revealed) onChange(e.target.value)
      }}
      onFocus={() => setRevealed(true)}
      onBlur={() => setRevealed(false)}
      disabled={disabled}
      placeholder="请输入"
      readOnly={!revealed}
      style={{ width: '100%', cursor: revealed ? 'text' : 'pointer', fontFamily: revealed ? 'inherit' : 'monospace' }}
      suffix={
        !disabled && (
          <span
            style={{ cursor: 'pointer', color: appThemeToken.colorTextTertiary }}
            onMouseDown={e => {
              e.preventDefault()
              setRevealed(r => !r)
            }}
          >
            {revealed ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </span>
        )
      }
    />
  )
}

/**
 * 多行文本输入组件
 */
const TextAreaInput = ({ value, onChange, disabled, placeholder }) => (
  <TextArea
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    placeholder={placeholder || '请输入'}
    rows={3}
    style={{ width: '100%' }}
  />
)

/**
 * 数字输入组件
 */
const NumberInput = ({ value, onChange, disabled, fieldSchema }) => {
  const unit = fieldSchema['x-unit']
  
  return (
    <InputNumber
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder="请输入数字"
      style={{ width: '100%' }}
      addonAfter={unit}
      min={typeof fieldSchema.minimum === 'number' ? fieldSchema.minimum : undefined}
      max={typeof fieldSchema.maximum === 'number' ? fieldSchema.maximum : undefined}
    />
  )
}

/**
 * 文件上传组件（仅选择文件，保留文件名）
 */
const FileInput = ({ value, onChange, disabled, fieldSchema }) => {
  const fileType = fieldSchema['x-file-type']
  const acceptMap = {
    image: '.jpg,.jpeg,.png,.gif,.webp',
    pdf: '.pdf',
    dicom: '.dcm',
    pathology: '.svs,.tif,.tiff',
    any: undefined
  }
  const accept = acceptMap[fileType] || acceptMap.any
  
  const handleBeforeUpload = (file) => {
    if (onChange) {
      onChange(file?.name || '')
    }
    return false
  }
  
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Input
        value={value}
        placeholder="请选择文件"
        disabled={disabled}
        readOnly
      />
      <Upload
        accept={accept}
        showUploadList={false}
        beforeUpload={handleBeforeUpload}
        disabled={disabled}
      >
        <Button disabled={disabled}>选择文件</Button>
      </Upload>
    </Space.Compact>
  )
}

/**
 * 滑块组件
 */
const SliderInput = ({ value, onChange, disabled }) => (
  <Slider
    value={typeof value === 'number' ? value : 0}
    onChange={onChange}
    disabled={disabled}
  />
)

/**
 * 级联选择组件
 */
const CascaderInput = ({ value, onChange, disabled, options }) => (
  <Cascader
    value={value}
    onChange={onChange}
    disabled={disabled}
    options={options}
    placeholder="请选择"
    style={{ width: '100%' }}
    changeOnSelect
  />
)

/**
 * 段落展示组件
 */
const ParagraphDisplay = ({ fieldSchema, fieldName }) => (
  <Typography.Paragraph style={{ marginBottom: 0, color: appThemeToken.colorTextSecondary }}>
    {fieldSchema.description || fieldSchema.title || fieldName}
  </Typography.Paragraph>
)

/**
 * 分割线展示组件
 */
const DividerDisplay = () => <Divider style={{ margin: '8px 0' }} />

/**
 * 日期选择组件
 */
const DateInput = ({ value, onChange, disabled }) => {
  const dateValue = value ? dayjs(value) : null
  
  return (
    <DatePicker
      value={dateValue}
      onChange={(date) => onChange(date ? date.format('YYYY-MM-DD') : '')}
      disabled={disabled}
      placeholder="请选择日期"
      style={{ width: '100%' }}
      format="YYYY-MM-DD"
    />
  )
}

/**
 * 日期时间选择组件
 */
const DateTimeInput = ({ value, onChange, disabled }) => {
  const dateTimeValue = value ? dayjs(value) : null

  return (
    <DatePicker
      showTime
      value={dateTimeValue}
      onChange={(date) => onChange(date ? date.format('YYYY-MM-DD HH:mm:ss') : '')}
      disabled={disabled}
      placeholder="请选择日期时间"
      style={{ width: '100%' }}
      format="YYYY-MM-DD HH:mm:ss"
    />
  )
}

/**
 * 受限字段类型提示。
 * @param {{ type: string }} props
 * @returns {JSX.Element}
 */
const RestrictedTypeNotice = ({ type }) => (
  <div style={{ padding: '10px 12px', border: `1px dashed ${appThemeToken.colorWarning}`, borderRadius: 6, background: 'rgba(250, 173, 20, 0.1)' }}>
    <Space size={8}>
      <Tag color="orange">受限类型</Tag>
      <Text>{type} 暂未纳入运行时基础能力集</Text>
    </Space>
  </div>
)

/**
 * 下拉选择组件
 */
const SelectInput = ({ value, onChange, disabled, options, multiple }) => (
  <Select
    value={value}
    onChange={onChange}
    disabled={disabled}
    options={options}
    placeholder="请选择"
    style={{ width: '100%' }}
    mode={multiple ? 'multiple' : undefined}
    allowClear
    showSearch
    filterOption={(input, option) =>
      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
    }
  />
)

/**
 * 单选组件（仅用于选项数量 <= RADIO_OPTIONS_THRESHOLD 时）
 */
const RadioInput = ({ value, onChange, disabled, options }) => (
  <Radio.Group
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
  >
    <Space wrap>
      {options.map(opt => (
        <Radio key={opt.value} value={opt.value}>
          {opt.label}
        </Radio>
      ))}
    </Space>
  </Radio.Group>
)

/**
 * 复选框组件（多选）- 选项过多时转为多选下拉
 */
const CheckboxGroupInput = ({ value, onChange, disabled, options }) => {
  // 选项过多时使用多选下拉
  if (options.length > RADIO_OPTIONS_THRESHOLD) {
    return (
      <Select
        mode="multiple"
        value={value || []}
        onChange={onChange}
        disabled={disabled}
        options={options}
        placeholder="请选择（可多选）"
        style={{ width: '100%' }}
        allowClear
        showSearch
        filterOption={(input, option) =>
          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
        }
      />
    )
  }
  
  return (
    <Checkbox.Group
      value={value || []}
      onChange={onChange}
      disabled={disabled}
      options={options}
    />
  )
}

/**
 * 单个复选框组件
 */
const CheckboxInput = ({ value, onChange, disabled, label }) => (
  <Checkbox
    checked={value === true || value === 'true' || value === '是'}
    onChange={e => onChange(e.target.checked)}
    disabled={disabled}
  >
    {label || '是'}
  </Checkbox>
)

/**
 * 字段渲染器主组件 - 一字段一行布局
 * 点击字段卡片任意位置选中+定位，点击值框直接可编辑
 */
const FieldRenderer = ({
  fieldName,
  fieldSchema,
  path,
  value,
  onChange,
  disabled = false,
  required = false,
  onSourceClick, // 点击溯源回调
  isSelected = false, // 是否选中状态
  showSourceIcon = true
}) => {
  const { enums } = useSchemaForm()
  
  // 获取选项（先获取选项，以便判断是否需要转换显示类型）
  const options = useMemo(() => 
    getOptionsFromSchema(fieldSchema, enums), 
    [fieldSchema, enums]
  )
  
  // 获取显示类型（传入选项数量以判断是否需要转换）
  const displayType = useMemo(() => 
    getDisplayType(fieldSchema, options.length), 
    [fieldSchema, options.length]
  )
  
  // 是否只读
  const isReadOnly = fieldSchema['x-editable'] === false || disabled
  
  // 字段属性
  const isSensitive = fieldSchema['x-sensitive']
  const isPrimary = fieldSchema['x-primary']
  const unit = fieldSchema['x-unit']
  
  // 处理值变化
  const handleChange = useCallback((newValue) => {
    if (!isReadOnly && onChange) {
      onChange(newValue)
    }
  }, [isReadOnly, onChange])

  /**
   * 选中当前字段并触发溯源回调。
   *
   * @param {{ forceOpen?: boolean, trigger?: string }} [options] 触发选项。
   * @returns {void}
   */
  const handleSelectField = useCallback((options = {}) => {
    if (onSourceClick) {
      onSourceClick(path, fieldSchema, fieldName, options)
    }
  }, [onSourceClick, path, fieldSchema, fieldName])

  
  // 渲染输入控件
  const renderInput = () => {
    const commonProps = {
      value,
      onChange: handleChange,
      disabled: isReadOnly,
      fieldSchema
    }

  /**
   * 仅文本类控件使用敏感脱敏输入。
   * 说明：
   * - 枚举/单选/多选类字段应优先保持其交互语义（radio/select/checkbox），
   *   不能被敏感输入框覆盖为普通文本框；
   * - 例如“证件类型”这类字段即使标记了 x-sensitive，也应继续按单选渲染。
   */
  if (isSensitive && ['text', 'textarea'].includes(displayType)) {
    return <SensitiveInput value={value} onChange={handleChange} disabled={isReadOnly} fieldName={fieldName} />
  }
    
    switch (displayType) {
      case 'textarea':
        return <TextAreaInput {...commonProps} />
      
      case 'number':
        return <NumberInput {...commonProps} />
      
      case 'date':
        return <DateInput {...commonProps} />

      case 'datetime':
        return <DateTimeInput {...commonProps} />
      
      case 'select':
        return <SelectInput {...commonProps} options={options} />
      
      case 'radio':
        // 选项过多时自动使用下拉
        if (options.length > RADIO_OPTIONS_THRESHOLD) {
          return <SelectInput {...commonProps} options={options} />
        }
        return <RadioInput {...commonProps} options={options} />
      
      case 'checkbox':
        // 如果有options则是多选，否则是单选
        if (options.length > 0) {
          return <CheckboxGroupInput {...commonProps} options={options} />
        }
        return <CheckboxInput {...commonProps} label={fieldName} />
      
      case 'multiselect':
        return <SelectInput {...commonProps} options={options} multiple />
      
      case 'file':
        return <FileInput {...commonProps} />
      
      case 'slider':
        return <SliderInput {...commonProps} />
      
      case 'cascader':
        return <CascaderInput {...commonProps} options={options} />
      
      case 'multi_text':
      case 'matrix_radio':
      case 'matrix_checkbox':
      case 'randomization':
        return <RestrictedTypeNotice type={displayType} />
      
      case 'paragraph':
        return <ParagraphDisplay fieldSchema={fieldSchema} fieldName={fieldName} />
      
      case 'divider':
        return <DividerDisplay />
      
      case 'text':
      default:
        if (RESTRICTED_DISPLAY_TYPES.includes(displayType)) {
          return <RestrictedTypeNotice type={displayType} />
        }
        return <TextInput {...commonProps} />
    }
  }

  // 计算卡片样式
  const cardStyle = useMemo(() => ({
    marginBottom: 12,
    padding: '10px 12px',
    background: isSelected ? appThemeToken.colorPrimaryBg : appThemeToken.colorFillTertiary,
    borderRadius: 6,
    border: isSelected ? `1px solid ${appThemeToken.colorPrimary}` : `1px solid ${appThemeToken.colorBorder}`,
    boxShadow: isSelected ? '0 0 0 2px rgba(24, 144, 255, 0.2)' : 'none',
    transition: 'all 0.2s',
    cursor: onSourceClick ? 'pointer' : 'default',
  }), [isSelected, onSourceClick])
  
  return (
    <div 
      style={cardStyle}
      onClick={() => handleSelectField({ forceOpen: false, trigger: 'field-card' })}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = appThemeToken.colorBorder
          e.currentTarget.style.background = appThemeToken.colorFillSecondary
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.borderColor = appThemeToken.colorBorder
          e.currentTarget.style.background = appThemeToken.colorFillTertiary
        }
      }}
    >
      <Row gutter={16} align="middle">
        {/* 字段标签 - 固定宽度 */}
        <Col flex="180px">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 4
          }}>
            {/* 字段名 - 悬停显示描述 */}
            <Tooltip 
              title={fieldSchema.description}
              placement="topLeft"
              mouseEnterDelay={0.3}
            >
              <Text 
                strong 
                style={{ 
                  fontSize: 14, 
                  color: appThemeToken.colorText,
                  lineHeight: '22px',
                  cursor: fieldSchema.description ? 'help' : 'default'
                }}
              >
                {fieldName}
                {required && <span style={{ color: appThemeToken.colorError, marginLeft: 2 }}>*</span>}
              </Text>
            </Tooltip>
            
            {/* 单位标签 */}
            {unit && (
              <Tag 
                size="small" 
                color="blue" 
                style={{ fontSize: 12, marginLeft: 4 }}
              >
                {unit}
              </Tag>
            )}
          </div>
          
          {/* 字段标记 */}
          <Space size={4} style={{ marginTop: 2 }}>
            {isSensitive && (
              <Tooltip title="敏感信息（已脱敏）">
                <LockOutlined style={{ fontSize: 12, color: appThemeToken.colorWarning }} />
              </Tooltip>
            )}
            
            {isReadOnly && (
              <Tooltip title="只读字段">
                <LockOutlined style={{ fontSize: 12, color: appThemeToken.colorTextTertiary }} />
              </Tooltip>
            )}
            
            {showSourceIcon && (
              <Tooltip title="查看溯源">
                <FileSearchOutlined
                  style={{ fontSize: 12, color: appThemeToken.colorPrimary, cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectField({ forceOpen: true, trigger: 'source-icon' })
                  }}
                />
              </Tooltip>
            )}
          </Space>
        </Col>
        
        {/* 输入控件 - 自适应宽度，点击可直接编辑 */}
        <Col flex="auto">
          {renderInput()}
        </Col>
      </Row>
    </div>
  )
}

export default FieldRenderer
export { getDisplayType, getOptionsFromSchema, RADIO_OPTIONS_THRESHOLD }
