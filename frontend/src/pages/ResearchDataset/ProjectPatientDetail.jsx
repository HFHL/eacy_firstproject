/**
 * 科研项目 - 项目内患者详情页
 *
 * UI 与电子病历夹（PatientDetail 的 Schema 版 Tab）对齐：
 *   顶部：返回按钮 + 项目/患者标识
 *   中部：患者信息概览卡片
 *   底部：SchemaEhrTab（基于 SchemaForm），schema 来自项目模板，data 来自项目 CRF 抽取
 */
import React, { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Progress,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons'

import SchemaEhrTab from '../PatientDetail/tabs/SchemaEhrTab'
import useProjectPatientData from './hooks/useProjectPatientData'

const { Title, Text } = Typography

const ProjectPatientDetail = () => {
  const { projectId, patientId } = useParams()
  const navigate = useNavigate()

  const {
    loading,
    projectLoading,
    projectError,
    patientError,
    patientInfo,
    projectInfo,
    schemaData,
    documents,
  } = useProjectPatientData(projectId, patientId)

  const projectName = projectInfo?.project_name || projectInfo?.name || '未知项目'
  const schemaJson = projectInfo?.schema_json || null
  const completeness = Number(patientInfo?.crfCompleteness) || 0

  const diagnosisTags = useMemo(() => {
    if (!Array.isArray(patientInfo?.diagnosis)) return []
    return patientInfo.diagnosis.filter(Boolean)
  }, [patientInfo])

  const fatalError = projectError || patientError

  return (
    <div style={{ padding: 16 }}>
      {/* 顶部操作栏 */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <Row align="middle" justify="space-between" gutter={16}>
          <Col>
            <Space size="middle" align="center">
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate(`/research/projects/${projectId}`)}
              >
                返回项目
              </Button>
              <Title level={4} style={{ margin: 0 }}>
                {patientInfo?.name || '加载中...'}
                {patientInfo?.subjectId && (
                  <Text type="secondary" style={{ fontSize: 14, marginLeft: 12 }}>
                    受试者编号：{patientInfo.subjectId}
                  </Text>
                )}
              </Title>
            </Space>
          </Col>
          <Col>
            <Text type="secondary">所属项目：{projectName}</Text>
          </Col>
        </Row>
      </Card>

      {/* 致命错误提示 */}
      {fatalError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="加载失败"
          description={fatalError}
        />
      )}

      {/* 患者信息概览 */}
      <Card
        size="small"
        title="患者信息"
        style={{ marginBottom: 16 }}
        loading={loading && !patientInfo?.name}
      >
        <Descriptions column={{ xs: 1, sm: 2, md: 3, lg: 4 }} size="small">
          <Descriptions.Item label="姓名">{patientInfo?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="性别">{patientInfo?.gender || '-'}</Descriptions.Item>
          <Descriptions.Item label="年龄">
            {patientInfo?.age != null ? `${patientInfo.age} 岁` : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="出生日期">{patientInfo?.birthDate || '-'}</Descriptions.Item>
          <Descriptions.Item label="患者编码">{patientInfo?.patientCode || '-'}</Descriptions.Item>
          <Descriptions.Item label="入组日期">{patientInfo?.enrollmentDate || '-'}</Descriptions.Item>
          <Descriptions.Item label="文档数">
            <Space>
              <FileTextOutlined />
              {documents?.length ?? patientInfo?.documentCount ?? 0}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="CRF 完整度">
            <Progress
              percent={completeness}
              size="small"
              style={{ minWidth: 160 }}
            />
          </Descriptions.Item>
          {diagnosisTags.length > 0 && (
            <Descriptions.Item label="诊断" span={4}>
              <Space size={[8, 8]} wrap>
                {diagnosisTags.map((d, idx) => (
                  <Tag key={idx} color="blue">{d}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {/* Schema 表单区（与病历夹保持一致） */}
      <Card styles={{ body: { padding: 0, overflow: 'hidden' } }}>
        {projectLoading && !schemaJson ? (
          <div
            style={{
              height: 400,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Spin tip="正在加载项目模板..." />
          </div>
        ) : (
          <SchemaEhrTab
            schema={schemaJson}
            data={schemaData}
            patientId={patientInfo?.patientId || null}
            projectId={projectId}
            documents={documents}
            readOnly
            readOnlyHint="项目 CRF 保存接口尚未开放，编辑不会落库"
          />
        )}
      </Card>
    </div>
  )
}

export default ProjectPatientDetail
