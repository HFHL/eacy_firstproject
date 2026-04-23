import React, { useMemo, useState } from 'react';
import { appThemeToken } from '../../styles/themeTokens';

/**
 * 可复用分割条展示组件（模式 B）。
 * 仅负责视觉与交互反馈，不包含尺寸计算逻辑。
 *
 * @param {Object} props - 组件属性
 * @param {'vertical'|'horizontal'} [props.axis='vertical'] - 分割方向（vertical 对应左右拖拽）
 * @param {boolean} [props.isActive=false] - 是否处于拖拽激活状态
 * @param {boolean} [props.showOnHover=true] - 是否仅悬停时显现
 * @param {number} [props.thickness=6] - 分割条热区宽/高
 * @param {Function} [props.onMouseDown] - 鼠标按下回调
 * @param {string} [props.className=''] - 自定义类名
 * @param {Object} [props.style={}] - 自定义样式
 * @param {string} [props.ariaLabel='调整布局'] - 无障碍标签
 * @returns {JSX.Element}
 */
const SplitterHandle = ({
  axis = 'vertical',
  isActive = false,
  showOnHover = true,
  thickness = 6,
  onMouseDown,
  className = '',
  style = {},
  ariaLabel = '调整布局',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  /**
   * 计算视觉状态：默认弱化、悬停增强、拖拽高亮。
   * @returns {Object}
   */
  const visualState = useMemo(() => {
    if (isActive) {
      return {
        trackColor: appThemeToken.colorPrimaryBg,
        lineColor: appThemeToken.colorPrimary,
        opacity: 1,
      };
    }
    if (isHovered) {
      return {
        trackColor: appThemeToken.colorBorderSecondary,
        lineColor: appThemeToken.colorTextTertiary,
        opacity: 1,
      };
    }
    return {
      trackColor: appThemeToken.colorBorderSecondary,
      lineColor: appThemeToken.colorTextQuaternary,
      opacity: showOnHover ? 0.18 : 0.7,
    };
  }, [isActive, isHovered, showOnHover]);

  const isVertical = axis === 'vertical';

  return (
    <div
      role="separator"
      aria-label={ariaLabel}
      aria-orientation={isVertical ? 'vertical' : 'horizontal'}
      className={className}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: isVertical ? thickness : '100%',
        height: isVertical ? '100%' : thickness,
        cursor: isVertical ? 'col-resize' : 'row-resize',
        background: visualState.trackColor,
        opacity: visualState.opacity,
        borderRadius: 999,
        transition: 'background 0.2s ease, opacity 0.2s ease',
        flexShrink: 0,
        position: 'relative',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div
        className="splitter-handle-indicator"
        style={{
          width: isVertical ? 3 : 42,
          height: isVertical ? 24 : 3,
          borderRadius: 999,
          background: visualState.lineColor,
          transition: 'background 0.2s ease',
        }}
      />
    </div>
  );
};

export default SplitterHandle;
