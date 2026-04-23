/**
 * ResizablePanels - 可调整大小的三栏布局组件
 * 支持拖拽调整左中右三栏的宽度
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import SplitterHandle from '../../Common/SplitterHandle';
import { appThemeToken } from '../../../styles/themeTokens';

const ResizablePanels = ({
  leftPanel,
  centerPanel,
  rightPanel,
  defaultLeftWidth = 240,
  defaultRightWidth = 360,
  minLeftWidth = 200,
  maxLeftWidth = 400,
  minRightWidth = 300,
  maxRightWidth = 500,
  className = ''
}) => {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [rightWidth, setRightWidth] = useState(defaultRightWidth);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const containerRef = useRef(null);

  // 处理左侧拖拽
  const handleLeftMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingLeft(true);
  }, []);

  // 处理右侧拖拽
  const handleRightMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingRight(true);
  }, []);

  // 处理鼠标移动
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerX = containerRect.left;
      const containerWidth = containerRect.width;

      if (isResizingLeft) {
        const newLeftWidth = e.clientX - containerX;
        const clampedWidth = Math.max(
          minLeftWidth,
          Math.min(maxLeftWidth, newLeftWidth)
        );
        // 确保左侧不超过右侧边界
        const maxAllowedLeft = containerWidth - rightWidth - 100; // 至少留100px给中间
        if (clampedWidth < maxAllowedLeft) {
          setLeftWidth(clampedWidth);
        }
      }

      if (isResizingRight) {
        const newRightWidth = containerX + containerWidth - e.clientX;
        const clampedWidth = Math.max(
          minRightWidth,
          Math.min(maxRightWidth, newRightWidth)
        );
        // 确保右侧不超过左侧边界
        const maxAllowedRight = containerWidth - leftWidth - 100; // 至少留100px给中间
        if (clampedWidth < maxAllowedRight) {
          setRightWidth(clampedWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };

    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingLeft, isResizingRight, leftWidth, rightWidth, minLeftWidth, maxLeftWidth, minRightWidth, maxRightWidth]);

  return (
    <div
      ref={containerRef}
      className={`resizable-panels ${className}`}
      style={{ display: 'flex', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      {/* 左侧面板 */}
      <div
        className="left-panel-wrapper"
        style={{
          width: leftWidth,
          minWidth: minLeftWidth,
          maxWidth: maxLeftWidth,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {leftPanel}
      </div>

      {/* 左侧拖拽分隔条 */}
      <SplitterHandle
        className="resize-handle resize-handle-left"
        axis="vertical"
        thickness={6}
        isActive={isResizingLeft}
        showOnHover
        onMouseDown={handleLeftMouseDown}
        style={{ margin: '0 1px' }}
        ariaLabel="调整左侧与中间面板宽度"
      />

      {/* 中间面板 */}
      <div
        className="center-panel-wrapper"
        style={{
          flex: 1,
          minWidth: 400,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: appThemeToken.colorBgContainer
        }}
      >
        {centerPanel}
      </div>

      {/* 右侧拖拽分隔条 */}
      <SplitterHandle
        className="resize-handle resize-handle-right"
        axis="vertical"
        thickness={6}
        isActive={isResizingRight}
        showOnHover
        onMouseDown={handleRightMouseDown}
        style={{ margin: '0 1px' }}
        ariaLabel="调整中间与右侧面板宽度"
      />

      {/* 右侧面板 */}
      <div
        className="right-panel-wrapper"
        style={{
          width: rightWidth,
          minWidth: minRightWidth,
          maxWidth: maxRightWidth,
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {rightPanel}
      </div>
    </div>
  );
};

export default ResizablePanels;
