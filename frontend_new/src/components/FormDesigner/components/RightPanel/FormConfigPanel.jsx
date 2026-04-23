/**
 * FormConfigPanel - 表单配置面板
 * 右侧面板：配置表单/组的属性
 */

import React, { useEffect } from 'react';
import {
  Form,
  Input,
  Switch,
  InputNumber,
  Alert,
  Tooltip
} from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import DocTypeSelector from '../shared/DocTypeSelector';
import { appThemeToken } from '../../../../styles/themeTokens';

const { TextArea } = Input;
/**
 * 是否显示表单“抽取与复用”及其后续说明区域。
 * 仅控制前端展示，不影响底层字段数据结构与读写。
 * @type {boolean}
 */
const SHOW_EXTRACTION_REUSE_SECTION = false;

/**
 * 右侧配置分组标题。
 * 使用轻量化左对齐样式，避免默认 Divider 在窄面板中过重、视觉漂移的问题。
 *
 * @param {{ title: React.ReactNode }} props
 * @returns {JSX.Element}
 */
const SectionTitle = ({ title }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      margin: '16px 0 10px',
      paddingTop: 12,
      borderTop: `1px solid ${appThemeToken.colorBorder}`
    }}
  >
    <span
      style={{
        fontSize: 12,
        fontWeight: 500,
        lineHeight: '20px',
        color: appThemeToken.colorTextSecondary
      }}
    >
      {title}
    </span>
  </div>
);

/**
 * 表单配置面板组件
 */
const FormConfigPanel = ({
  folder = null,
  group = null,
  onUpdate = null,
  readonly = false,
  docTypeOptions = [],
  version = 0
}) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (group) {
      form.setFieldsValue({
        name: group.name,
        description: group.description,
        repeated: group.repeatable || false,
        minItems: group.minItems,
        maxItems: group.maxItems,
        isExtractionUnit: group.isExtractionUnit !== false,
        order: group.order || 0,
        // 数据来源配置
        primarySources: group.primarySources || group.sources?.primary || [],
        secondarySources: group.secondarySources || group.sources?.secondary || [],
        mergeBinding: group.mergeBinding || '',
        reuseMode: group.formTemplate?.reuse_mode || 'none',
        sourceForm: group.formTemplate?.source_form || ''
      });
    } else if (folder) {
      form.setFieldsValue({
        name: folder.name,
        description: folder.description,
        order: folder.order || 0
      });
    }
  }, [folder, group, form, version]);

  const handleValuesChange = (changedValues, allValues) => {
    if (!onUpdate) return;
    if (group) {
      const primarySources = allValues.primarySources || [];
      const secondarySources = allValues.secondarySources || [];
      const hasSources = primarySources.length > 0 || secondarySources.length > 0;
      const reuseMode = allValues.reuseMode && allValues.reuseMode !== 'none' ? allValues.reuseMode : undefined;
      const sourceForm = allValues.sourceForm || undefined;
      onUpdate({
        ...allValues,
        repeatable: allValues.repeated,
        isExtractionUnit: allValues.isExtractionUnit !== false,
        primarySources,
        secondarySources,
        sources: hasSources ? { primary: primarySources, secondary: secondarySources } : null,
        mergeBinding: allValues.mergeBinding || '',
        formTemplate: {
          reuse_mode: reuseMode,
          source_form: sourceForm
        }
      });
      return;
    }
    onUpdate(allValues);
  };

  if (!group && !folder) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: appThemeToken.colorBgContainer,
        borderRadius: 4,
        padding: 16
      }}>
        <Alert
          message="未选中配置项"
          description="请从左侧选择表单或访视进行配置"
          type="info"
          showIcon
          style={{ width: '100%' }}
        />
      </div>
    );
  }

  return (
    <div className="form-config-panel hover-scrollbar">
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        disabled={readonly}
      >
        <Form.Item
          label="名称"
          name="name"
          rules={[{ required: true, message: '请输入名称' }]}
        >
          <Input placeholder="请输入名称" />
        </Form.Item>

        <Form.Item
          label="描述"
          name="description"
        >
          <TextArea rows={3} placeholder="请输入描述" />
        </Form.Item>

        {group && (
          <>
            <SectionTitle title="重复配置" />

            <Form.Item
              label="可重复表单"
              name="repeated"
              valuePropName="checked"
              tooltip="启用后该表单可以添加多条记录"
            >
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>

            <Form.Item
              label="抽取单元"
              name="isExtractionUnit"
              valuePropName="checked"
              tooltip="仅表示该组是否作为抽取单元，不再通过空 x-sources 自动推断"
            >
              <Switch checkedChildren="是" unCheckedChildren="否" />
            </Form.Item>

            <Form.Item
              label="最少记录数"
              name="minItems"
              tooltip="限制最少添加的记录数量，0表示不限制"
            >
              <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>

            <Form.Item
              label="最多记录数"
              name="maxItems"
              tooltip="限制最多添加的记录数量，留空表示不限制"
            >
              <InputNumber min={1} style={{ width: '100%' }} placeholder="不限制" />
            </Form.Item>

            <SectionTitle
              title={
                <span>
                  数据来源
                  <Tooltip title="配置该表单字段的数据抽取来源文档类型，系统将优先从主要来源抽取数据">
                    <QuestionCircleOutlined style={{ marginLeft: 4, color: appThemeToken.colorTextTertiary }} />
                  </Tooltip>
                </span>
              }
            />

            <Form.Item
              label={
                <span>
                  主要来源
                  <Tooltip title="优先从这些文档类型中抽取字段数据">
                    <QuestionCircleOutlined style={{ marginLeft: 4, color: appThemeToken.colorTextTertiary }} />
                  </Tooltip>
                </span>
              }
              name="primarySources"
            >
              <DocTypeSelector placeholder="选择主要来源文档类型（可多选）" options={docTypeOptions} />
            </Form.Item>

            <Form.Item
              label={
                <span>
                  次要来源
                  <Tooltip title="当主要来源无法抽取到数据时，作为补充数据来源">
                    <QuestionCircleOutlined style={{ marginLeft: 4, color: appThemeToken.colorTextTertiary }} />
                  </Tooltip>
                </span>
              }
              name="secondarySources"
            >
              <DocTypeSelector placeholder="选择次要来源文档类型（可多选）" options={docTypeOptions} />
            </Form.Item>

            {SHOW_EXTRACTION_REUSE_SECTION && (
              <>
                <SectionTitle title="抽取与复用" />
                <Form.Item label="时间绑定 (x-merge-binding)" name="mergeBinding">
                  <Input placeholder="anchor=报告日期;granularity=day" />
                </Form.Item>
                <Form.Item label="复用模式 (x-form-template)" name="reuseMode">
                  <Input placeholder="full_reuse / original / copied_modified" />
                </Form.Item>
                <Form.Item label="来源表单 (source_form)" name="sourceForm">
                  <Input placeholder="可选" />
                </Form.Item>
              </>
            )}
          </>
        )}

        {(folder || group) && SHOW_EXTRACTION_REUSE_SECTION && (
          <Alert
            message={
              folder
                ? `访视ID: ${folder.id}`
                : `组ID: ${group.id}`
            }
            description="ID用于系统内部标识，编辑时保持不变"
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        )}
      </Form>
    </div>
  );
};

export default FormConfigPanel;
