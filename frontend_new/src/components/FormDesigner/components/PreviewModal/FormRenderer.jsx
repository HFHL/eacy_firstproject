/**
 * FormRenderer - 预览渲染器
 * 复用运行时 FieldRenderer 内核，仅保留预览容器与只读壳层。
 */

import React, { useMemo, useState } from 'react';
import { Card, Space, Tag } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import RuntimeFieldRenderer from '../../../SchemaForm/FieldRenderer';
import { SchemaFormProvider } from '../../../SchemaForm/SchemaFormContext';
import { appThemeToken } from '../../../../styles/themeTokens';

/**
 * 将设计器字段映射为运行时字段 schema。
 * @param {Object} field
 * @returns {Object}
 */
const toRuntimeFieldSchema = (field) => {
  const schema = {
    type: field.dataType || 'string',
    'x-display': field.displayType || 'text',
    'x-display-name': field.displayName || field.name,
    'x-unit': field.unit || undefined,
    'x-sensitive': !!field.sensitive,
    'x-primary': !!field.primary,
    'x-editable': false,
    'x-file-type': field.fileType || undefined,
    description: field.description || '',
    format: field.format || undefined,
    minimum: typeof field.minimum === 'number' ? field.minimum : undefined,
    maximum: typeof field.maximum === 'number' ? field.maximum : undefined,
    pattern: field.pattern || undefined,
  };
  if (Array.isArray(field.options) && field.options.length > 0) {
    const options = field.options.map((option) => String(option));
    if (field.displayType === 'checkbox' || field.displayType === 'multiselect') {
      schema.type = 'array';
      schema.items = { type: 'string', enum: options };
    } else {
      schema.type = 'string';
      schema.enum = options;
    }
  }
  return schema;
};

/**
 * 字段级运行时渲染适配器。
 * @param {{ field: Object, value: any, onChange: Function }} props
 * @returns {JSX.Element}
 */
const RuntimeFieldPreview = ({ field, value, onChange }) => {
  const fieldSchema = useMemo(() => toRuntimeFieldSchema(field), [field]);
  const fieldName = field.displayName || field.name;
  return (
    <RuntimeFieldRenderer
      fieldName={fieldName}
      fieldSchema={fieldSchema}
      path={field.id || field.name}
      value={value}
      onChange={onChange}
      disabled
      required={!!field.required}
      showSourceIcon={false}
    />
  );
};

/**
 * 表单组渲染器。
 * @param {{ group: Object }} props
 * @returns {JSX.Element}
 */
const FormRenderer = ({ group }) => {
  const [formValues, setFormValues] = useState({});
  const handleFieldChange = (fieldId, value) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: value }));
  };
  const providerSchema = useMemo(() => ({ type: 'object', properties: {} }), []);

  return (
    <Card
      title={(
        <Space>
          <AppstoreOutlined />
          <span>{group.name}</span>
          {group.fields?.length > 0 && <Tag color="blue">{group.fields.length} 个字段</Tag>}
        </Space>
      )}
      style={{ marginBottom: 16, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
    >
      {group.description && <div style={{ marginBottom: 16, color: appThemeToken.colorTextSecondary, fontSize: 14 }}>{group.description}</div>}
      <SchemaFormProvider schema={providerSchema} patientData={{}} enums={{}}>
        {group.fields && group.fields.length > 0 ? (
          group.fields.map((field) => (
            <RuntimeFieldPreview
              key={field.id || field.name}
              field={field}
              value={formValues[field.id]}
              onChange={(nextValue) => handleFieldChange(field.id, nextValue)}
            />
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 0', color: appThemeToken.colorTextTertiary }}>该表单下暂无字段</div>
        )}
      </SchemaFormProvider>
    </Card>
  );
};

export default FormRenderer;
