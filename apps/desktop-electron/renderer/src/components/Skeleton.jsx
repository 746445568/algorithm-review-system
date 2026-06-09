export function Skeleton({ variant = 'line', count = 1, width, height }) {
  const items = Array.from({ length: count }, (_, i) => i);

  if (variant === 'card') {
    return (
      <div className="skeleton-grid">
        {items.map(i => (
          <div key={i} className="skeleton-card" style={{ width, height: height || 120 }}>
            <div className="skeleton-shimmer" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className="skeleton-chart" style={{ width, height: height || 200 }}>
        <div className="skeleton-shimmer" />
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className="skeleton-table">
        {items.map(i => (
          <div key={i} className="skeleton-table-row">
            <div className="skeleton-cell" style={{ width: '30%' }}><div className="skeleton-shimmer" /></div>
            <div className="skeleton-cell" style={{ width: '20%' }}><div className="skeleton-shimmer" /></div>
            <div className="skeleton-cell" style={{ width: '15%' }}><div className="skeleton-shimmer" /></div>
            <div className="skeleton-cell" style={{ width: '25%' }}><div className="skeleton-shimmer" /></div>
          </div>
        ))}
      </div>
    );
  }

  // default: line
  return (
    <div className="skeleton-lines">
      {items.map(i => (
        <div
          key={i}
          className="skeleton-line"
          style={{
            width: width || (i === count - 1 ? '60%' : '100%'),
            height: height || 14,
          }}
        >
          <div className="skeleton-shimmer" />
        </div>
      ))}
    </div>
  );
}
