import React, { useMemo, useState } from 'react'
import {
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  message,
} from 'antd'
import { UserAddOutlined } from '@ant-design/icons'
import { createPatient, getDepartmentTree } from '../../api/patient'
import { PATIENT_DEPARTMENT_OPTIONS } from '../../constants/patientDepartments'
import { appThemeToken } from '../../styles/themeTokens'

/**
 * 全局患者新建弹窗。
 *
 * @param {object} props 组件属性
 * @param {boolean} props.open 是否显示
 * @param {() => void} props.onCancel 取消回调
 * @param {(patientId: string) => void} props.onSuccess 成功回调
 * @returns {JSX.Element}
 */
const PatientCreateModal = ({ open, onCancel, onSuccess }) => {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [departmentTreeData, setDepartmentTreeData] = useState([])
  const [departmentLoaded, setDepartmentLoaded] = useState(false)

  const diagnosisOptions = useMemo(() => ([
    '高血压', '糖尿病', '冠心病', '肺癌', '胃癌', '肝癌',
    '脑梗死', '心肌梗死', '慢性阻塞性肺疾病', '甲状腺功能亢进',
  ]), [])

  /**
   * 将后端科室树转换为前端 TreeSelect 所需格式。
   *
   * @param {Array} nodes 科室节点列表
   * @returns {Array<{title: string, value: string, key: string, children?: Array}>} 转换后的树结构
   */
  const formatDepartmentTree = (nodes = []) => {
    return nodes.map((node) => ({
      title: node.name,
      value: node.id,
      key: node.id,
      children: Array.isArray(node.children) && node.children.length > 0
        ? formatDepartmentTree(node.children)
        : undefined,
    }))
  }

  /**
   * 将树形科室结构拍平为“科室名称 -> 科室ID”映射。
   *
   * @param {Array} nodes 科室树节点
   * @returns {Map<string, string>} 名称到 ID 的映射
   */
  const buildDepartmentNameIdMap = (nodes = []) => {
    return nodes.reduce((mapping, node) => {
      if (node?.title && node?.value) {
        mapping.set(String(node.title), String(node.value))
      }
      if (Array.isArray(node.children) && node.children.length > 0) {
        const childMap = buildDepartmentNameIdMap(node.children)
        childMap.forEach((value, key) => mapping.set(key, value))
      }
      return mapping
    }, new Map())
  }

  /**
   * 按需加载科室树，仅首次打开时请求。
   *
   * @returns {Promise<void>}
   */
  const ensureDepartmentTree = async () => {
    if (departmentLoaded) return
    try {
      const response = await getDepartmentTree()
      if (response?.success && response?.code === 0 && Array.isArray(response.data)) {
        setDepartmentTreeData(formatDepartmentTree(response.data))
      }
    } catch (error) {
      console.error('获取科室树失败:', error)
    } finally {
      setDepartmentLoaded(true)
    }
  }

  /**
   * 关闭弹窗并重置内部状态。
   *
   * @returns {void}
   */
  const closeAndReset = () => {
    form.resetFields()
    onCancel()
  }

  /**
   * 提交创建患者。
   *
   * @returns {Promise<void>}
   */
  const handleSubmit = async () => {
    if (submitting) return
    try {
      const values = await form.validateFields()
      const departmentNameIdMap = buildDepartmentNameIdMap(departmentTreeData)
      const selectedDepartmentId = departmentNameIdMap.get(values.department)
      setSubmitting(true)
      const requestData = {
        name: values.name,
        gender: values.gender,
        age: Number(values.age),
        birth_date: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : null,
        id_card: values.idCard || '',
        phone: values.phone || '',
        address: values.address || '',
        diagnosis: values.diagnosis || [],
        attending_doctor_name: values.doctor || '',
        department_id: selectedDepartmentId || null,
        department_name: values.department || null,
        admission_date: values.admissionDate ? values.admissionDate.format('YYYY-MM-DD') : null,
        notes: values.notes || null,
      }
      const response = await createPatient(requestData)
      if (!(response?.success && response?.code === 0)) {
        message.error(response?.message || '患者创建失败，请稍后重试')
        return
      }
      const patientId = String(response?.data?.id || '')
      message.success('患者信息已成功添加')
      closeAndReset()
      if (patientId) {
        onSuccess(patientId)
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('patient-rail-refresh'))
      }
    } catch (error) {
      if (error?.errorFields) {
        message.error('请完善必填信息')
      } else {
        console.error('创建患者失败:', error)
        message.error('创建患者失败，请稍后重试')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title={(
        <Space>
          <UserAddOutlined />
          新建患者
        </Space>
      )}
      open={open}
      onCancel={closeAndReset}
      width={800}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (visible) {
          ensureDepartmentTree()
        }
      }}
      footer={[
        <Button key="cancel" onClick={closeAndReset} disabled={submitting}>
          取消
        </Button>,
        <Button
          key="save"
          type="primary"
          onClick={handleSubmit}
          loading={submitting}
          style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}
        >
          保存
        </Button>,
      ]}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={24}>
            <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${appThemeToken.colorBorder}` }}>
              <strong style={{ color: appThemeToken.colorPrimary }}>基础信息</strong>
            </div>
          </Col>
          <Col span={12}>
            <Form.Item label="患者姓名" name="name" rules={[{ required: true, message: '请输入患者姓名' }]}>
              <Input placeholder="请输入患者姓名" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="性别" name="gender" rules={[{ required: true, message: '请选择性别' }]}>
              <Select placeholder="选择性别">
                <Select.Option value="男">男</Select.Option>
                <Select.Option value="女">女</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="年龄" name="age" rules={[{ required: true, message: '请输入年龄' }]}>
              <InputNumber min={0} max={150} style={{ width: '100%' }} placeholder="年龄" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="出生日期" name="birthDate">
              <DatePicker style={{ width: '100%' }} placeholder="选择出生日期" format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="联系电话" name="phone">
              <Input placeholder="请输入联系电话" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="身份证号" name="idCard">
              <Input placeholder="请输入身份证号" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="地址" name="address">
              <Input.TextArea rows={2} placeholder="请输入地址" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${appThemeToken.colorBorder}` }}>
              <strong style={{ color: appThemeToken.colorPrimary }}>医疗信息</strong>
            </div>
          </Col>
          <Col span={12}>
            <Form.Item label="所属科室" name="department" rules={[{ required: true, message: '请选择科室' }]}>
              <Select
                placeholder="请选择科室"
                options={PATIENT_DEPARTMENT_OPTIONS}
                showSearch
                optionFilterProp="label"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="主治医生" name="doctor">
              <Input placeholder="请输入主治医生姓名" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="入组日期" name="admissionDate">
              <DatePicker style={{ width: '100%' }} placeholder="选择入组日期" format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="主要诊断" name="diagnosis">
              <Select mode="tags" placeholder="请输入或选择诊断（可多选）" options={diagnosisOptions.map((item) => ({ label: item, value: item }))} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="备注" name="notes">
              <Input.TextArea rows={3} placeholder="请输入备注信息，如特殊情况、注意事项等..." showCount maxLength={500} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}

export default PatientCreateModal

