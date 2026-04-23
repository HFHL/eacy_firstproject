/**
 * ComponentLibrary - 组件库面板
 * 左侧面板：显示可拖拽的表单组件库
 */

import React, { useState, useMemo } from 'react';
import { Empty, Input, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import {
  FontSizeOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  CaretDownOutlined,
  ControlOutlined,
  ApartmentOutlined,
  BorderOutlined,
  AppstoreOutlined,
  TableOutlined,
  PictureOutlined,
  FilePdfOutlined,
  FileOutlined,
  MedicineBoxOutlined,
  ExperimentOutlined,
  BranchesOutlined,
  InfoCircleOutlined,
  MinusOutlined,
  HolderOutlined
} from '@ant-design/icons';
import { appThemeToken } from '../../../../styles/themeTokens';

// 扩展组件分类（带图标和更详细的信息）
const COMPONENT_LIBRARY_CATEGORIES = [
  {
    key: 'fill',
    label: '填空',
    components: [
      { type: 'text', label: '填空题', icon: <FontSizeOutlined /> },
      { type: 'date', label: '日期题', icon: <CalendarOutlined /> },
      { type: 'multi_text', label: '多项填空', icon: <AppstoreOutlined />, comingSoon: true }
    ]
  },
  {
    key: 'select',
    label: '选择',
    components: [
      { type: 'radio', label: '单选题', icon: <CheckCircleOutlined /> },
      { type: 'checkbox', label: '多选题', icon: <CheckSquareOutlined /> },
      { type: 'select', label: '下拉题', icon: <CaretDownOutlined /> },
      { type: 'slider', label: '滑块评分', icon: <ControlOutlined />, comingSoon: true },
      { type: 'cascader', label: '省-市-区', icon: <ApartmentOutlined />, comingSoon: true }
    ]
  },
  {
    key: 'matrix',
    label: '矩阵',
    components: [
      { type: 'matrix_radio', label: '矩阵单选', icon: <BorderOutlined />, comingSoon: true },
      { type: 'matrix_checkbox', label: '矩阵多选', icon: <AppstoreOutlined />, comingSoon: true },
      { type: 'table', label: '固定表格', icon: <TableOutlined />, subType: 'fixed' },
      { type: 'table', label: '自增表格', icon: <TableOutlined />, subType: 'dynamic' }
    ]
  },
  {
    key: 'file',
    label: '文件',
    components: [
      { type: 'file', label: '图片', icon: <PictureOutlined />, subType: 'image' },
      { type: 'file', label: 'PDF文件', icon: <FilePdfOutlined />, subType: 'pdf' },
      { type: 'file', label: '文件题', icon: <FileOutlined />, subType: 'any' },
      { type: 'file', label: 'DICOM影像', icon: <MedicineBoxOutlined />, subType: 'dicom', comingSoon: true },
      { type: 'file', label: '病理切片', icon: <ExperimentOutlined />, subType: 'pathology', comingSoon: true }
    ]
  },
  {
    key: 'randomization',
    label: '随机化',
    components: [
      { type: 'randomization', label: '分组', icon: <BranchesOutlined />, comingSoon: true }
    ]
  },
  {
    key: 'auxiliary',
    label: '辅助布局',
    components: [
      { type: 'paragraph', label: '段落说明', icon: <InfoCircleOutlined /> },
      { type: 'divider', label: '分割线', icon: <MinusOutlined /> }
    ]
  }
];

/**
 * 组件库面板
 */
const ComponentLibrary = ({
  onDragStart = null,
  draggable = true
}) => {
  const [searchText, setSearchText] = useState('');

  // 过滤组件分类
  const filteredCategories = useMemo(() => {
    if (!searchText) return COMPONENT_LIBRARY_CATEGORIES;

    return COMPONENT_LIBRARY_CATEGORIES
      .map(category => ({
        ...category,
        components: category.components.filter(comp =>
          comp.label.toLowerCase().includes(searchText.toLowerCase())
        )
      }))
      .filter(category => category.components.length > 0);
  }, [searchText]);

  // 处理拖拽开始
  const handleDragStart = (e, component) => {
    if (onDragStart) {
      onDragStart(e, component.type);
    }
    e.dataTransfer.setData('fieldType', component.type);
    if (component.subType) {
      e.dataTransfer.setData('fieldSubType', component.subType);
    }
    e.dataTransfer.effectAllowed = 'copy';
  };

  // 渲染组件卡片
  const renderComponentCard = (component, index) => {
    const isDraggable = draggable && !component.comingSoon;

    return (
      <div className="component-library-item" key={`${component.type}-${component.subType || index}`}>
        <div
          className={`component-card ${isDraggable ? 'is-draggable' : 'is-disabled'}${component.comingSoon ? ' coming-soon' : ''}`}
          draggable={isDraggable}
          onDragStart={(e) => isDraggable && handleDragStart(e, component)}
          title={component.label}
          aria-disabled={!isDraggable}
        >
          <span className="component-card__handle" aria-hidden="true">
            <HolderOutlined />
          </span>
          <span className="component-card__icon" aria-hidden="true">
            {component.icon}
          </span>
          <span className="component-card__label">
            {component.label}
          </span>
          {component.comingSoon && (
            <Tag 
              color="orange" 
              className="component-card__status"
            >
              开发中
            </Tag>
          )}
        </div>
      </div>
    );
  };

  // 渲染分类
  const renderCategory = (category) => {
    if (!category.components || category.components.length === 0) return null;

    return (
      <div key={category.key} className="component-library-section">
        <div className="component-library-section__title">
          {category.label}
        </div>
        <div className="component-library-grid">
          {category.components.map((comp, index) => renderComponentCard(comp, index))}
        </div>
      </div>
    );
  };

  const hasComponents = filteredCategories.length > 0;

  return (
    <div className="component-library">
      <Input
        placeholder="搜索组件..."
        prefix={<SearchOutlined style={{ color: appThemeToken.colorTextTertiary }} />}
        allowClear
        size="small"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        className="component-library__search"
      />

      {hasComponents ? (
        <div className="component-library__scroll hover-scrollbar">
          {filteredCategories.map(renderCategory)}
        </div>
      ) : (
        <div className="component-library__empty">
          <Empty
            description="未找到匹配组件"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        </div>
      )}
    </div>
  );
};

export default ComponentLibrary;
