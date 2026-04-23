/**
 * 模板元信息弹窗。
 * 统一承载“新建模板”和“编辑模板信息”的表单结构，避免页面各自维护重复弹窗。
 */
import React, { useEffect } from 'react'
import { Form, Input, Modal } from 'antd'

/**
 * 可复用的模板元信息弹窗。
 *
 * @param {Object} props 组件属性
 * @param {boolean} props.open 是否显示弹窗
 * @param {import('antd').FormInstance} props.form 外部传入的表单实例
 * @param {string} props.title 弹窗标题
 * @param {string} props.confirmText 确认按钮文案
 * @param {{name?: string, category?: string, description?: string}=} props.initialValues 初始值
 * @param {() => void} props.onCancel 取消回调
 * @param {() => void} props.onOk 确认回调
 * @returns {JSX.Element}
 */
const TemplateMetaModal = ({
  open,
  form,
  title,
  confirmText,
  initialValues = {},
  onCancel,
  onOk,
}) => {
  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue({
      name: initialValues.name || '',
      category: initialValues.category || '通用',
      description: initialValues.description || '',
    })
  }, [form, initialValues.category, initialValues.description, initialValues.name, open])

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      width={600}
      okText={confirmText}
      cancelText="取消"
      destroyOnHidden={false}
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item label="模板名称" name="name" rules={[{ required: true, message: '请输入模板名称' }]}>
          <Input placeholder="请输入模板名称" />
        </Form.Item>
        <Form.Item label="分类" name="category">
          <Input placeholder="如: 肝胆外科" />
        </Form.Item>
        <Form.Item label="描述" name="description">
          <Input.TextArea rows={3} placeholder="模板描述" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default TemplateMetaModal
