import { memo } from "react";

/**
 * 分析列容器组件
 * @param {{
 *   side: 'left' | 'right',
 *   children: React.ReactNode
 * }} props
 */
export const AnalysisColumn = memo(function AnalysisColumn({ side, children }) {
  return (
    <div className={`an-column an-column--${side}`}>
      {children}
    </div>
  );
});
