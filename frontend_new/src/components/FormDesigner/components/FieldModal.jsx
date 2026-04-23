/**
 * FieldModal - 字段编辑弹窗
 */

import React, { useEffect } from 'react';
import {
  Modal,
  Form,
  Row,
  Col,
  Input,
  Select,
  InputNumber,
  Switch,
  Divider,
  Alert
} from 'antd';
import { DISPLAY_TYPES } from '../core/constants';
import { getFieldTypeLabel } from '../utils/schemaHelpers';
import {
  fromFieldFormValues,
  isOptionDisplayType,
  isTableDisplayType,
  TABLE_MULTI_ROW_DISPLAY_TYPE,
  TABLE_SINGLE_ROW_DISPLAY_TYPE,
  toFieldFormValues,
} from '../utils/fieldContract';

const { TextArea } = Input;

/**
 * 按展示类型推断字段数据类型（弹窗版）。
 * @param {string} displayType
 * @param {string[]} [options=[]]
 * @returns {string}
 */
function inferDataTypeByDisplayType(displayType, options = []) {
  if (displayType === DISPLAY_TYPES.NUMBER) return 'number';
  if (displayType === DISPLAY_TYPES.DATETIME) return 'string';
  if (displayType === TABLE_SINGLE_ROW_DISPLAY_TYPE || displayType === TABLE_MULTI_ROW_DISPLAY_TYPE) return 'array';
  if (displayType === DISPLAY_TYPES.MULTISELECT) return 'array';
  if (displayType === DISPLAY_TYPES.CHECKBOX) {
    return Array.isArray(options) && options.length > 0 ? 'array' : 'boolean';
  }
  return 'string';
}

/**
 * 获取字段弹窗可选的展示类型列表。
 * @returns {{ label: string, value: string }[]}
 */
function getDisplayTypeOptions() {
  const baseOptions = Object.entries(DISPLAY_TYPES).map(([_key, value]) => ({
    label: getFieldTypeLabel(value),
    value,
  }));
  const optionsWithoutTable = baseOptions.filter((item) => item.value !== DISPLAY_TYPES.TABLE);
  return [
    ...optionsWithoutTable,
    { label: '单行表格', value: TABLE_SINGLE_ROW_DISPLAY_TYPE },
    { label: '多行表格', value: TABLE_MULTI_ROW_DISPLAY_TYPE },
  ];
}

/**
 * 字段编辑弹窗组件
 */
const FieldModal = ({
  visible,
  field,
  onCancel,
  onOk,
  mode = 'edit' // 'edit' | 'create'
}) => {
  const [form] = Form.useForm();

  const displayType = Form.useWatch('displayType', form);
  const options = Form.useWatch('options', form);
  const isOptionType = isOptionDisplayType(displayType);

  useEffect(() => {
    if (visible && field) {
      form.setFieldsValue(toFieldFormValues(field));
    }
  }, [visible, field, form]);

  useEffect(() => {
    if (!displayType) return;
    const inferredDataType = inferDataTypeByDisplayType(displayType, options);
    const currentDataType = form.getFieldValue('dataType');
    if (currentDataType !== inferredDataType) {
      form.setFieldValue('dataType', inferredDataType);
    }
  }, [displayType, options, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const normalized = fromFieldFormValues(values);
      if (values.name !== undefined) {
        normalized.displayName = values.name;
      }
      onOk({
        ...field,
        ...normalized,
      });
    } catch (error) {
      console.error('表单验证失败:', error);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel();
  };

  return (
    <Modal
      title={mode === 'create' ? '添加字段' : '编辑字段'}
      open={visible}
      onOk={handleOk}
      onCancel={handleCancel}
      width={700}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          dataType: 'string',
          isNullable: true,
          isEditable: true,
          isSensitive: false,
          isPrimary: false,
          isRequired: false
        }}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="字段名称"
              name="name"
              rules={[{ required: true, message: '请输入字段名称' }]}
            >
              <Input placeholder="请输入字段名称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="显示名称" name="displayName">
              <Input placeholder="用于界面展示" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="展示类型"
              name="displayType"
              rules={[{ required: true, message: '请选择展示类型' }]}
            >
              <Select placeholder="请选择展示类型">
                {getDisplayTypeOptions().map((option) => (
                  <Select.Option key={option.value} value={option.value}>
                    {option.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="字段ID (x-field-id)" name="fieldId">
              <Input placeholder="用于复用一致性校验" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="数据类型" name="dataType">
              <Input disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="数据单位" name="unit" hidden={isTableDisplayType(displayType)}>
              <Input placeholder="例如：岁、kg、元" />
            </Form.Item>
          </Col>
        </Row>

        {displayType === DISPLAY_TYPES.FILE && (
          <Form.Item label="文件类型 (x-file-type)" name="fileType">
            <Input placeholder="如: pdf,image" />
          </Form.Item>
        )}

        {isOptionType && (
          <Form.Item
            label="选项值"
            name="options"
            rules={[{ required: true, message: '请配置选项值' }]}
            tooltip="多个选项用逗号分隔"
          >
            <Select
              mode="tags"
              placeholder="输入选项，按回车添加"
              style={{ width: '100%' }}
            />
          </Form.Item>
        )}

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="必填"
              name="isRequired"
              valuePropName="checked"
            >
              <Switch checkedChildren="必填" unCheckedChildren="可选" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="可为空"
              name="isNullable"
              valuePropName="checked"
            >
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="敏感字段"
              name="isSensitive"
              valuePropName="checked"
              tooltip="敏感字段将进行脱敏处理"
            >
              <Switch checkedChildren="敏感" unCheckedChildren="普通" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              label="主键字段"
              name="isPrimary"
              valuePropName="checked"
              tooltip="主键字段用于数据去重"
            >
              <Switch checkedChildren="主键" unCheckedChildren="普通" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="可编辑"
              name="isEditable"
              valuePropName="checked"
            >
              <Switch checkedChildren="可编辑" unCheckedChildren="只读" />
            </Form.Item>
          </Col>
        </Row>

        <Divider orientation="left">字段说明</Divider>

        <Form.Item
          label="字段说明"
          name="description"
          tooltip="字段的业务含义说明，用于前端tooltip显示"
        >
          <TextArea rows={2} placeholder="请输入字段说明" />
        </Form.Item>

        <Form.Item
          label="抽取提示词"
          name="extractionPrompt"
          tooltip="LLM抽取该字段时的指导提示词"
        >
          <TextArea rows={3} placeholder="请输入抽取提示词" />
        </Form.Item>

        {field && field.uid && (
          <Alert
            message={`字段UID: ${field.uid}`}
            description="UID用于版本管理，确保数据兼容性。编辑时UID将保持不变。"
            type="info"
            showIcon
          />
        )}
      </Form>
    </Modal>
  );
};

export default FieldModal;
