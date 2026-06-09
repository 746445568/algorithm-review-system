import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api.js';

const PATTERN_COLORS = {
  logic: 'var(--bad)',
  boundary: 'var(--warn)',
  implementation: 'var(--accent)',
  complexity: '#a78bfa',
  understanding: '#f472b6',
  other: 'var(--muted)',
};

function getColor(patternType) {
  const key = patternType?.toLowerCase() || '';
  for (const [k, v] of Object.entries(PATTERN_COLORS)) {
    if (key.includes(k)) return v;
  }
  return PATTERN_COLORS.other;
}

export function ErrorPatternChart() {
  const { t } = useTranslation();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.getErrorPatternStats()
      .then(data => {
        if (!cancelled) setStats(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="skeleton-chart"><div className="skeleton-shimmer" /></div>;
  if (!stats.length) return null;

  const maxCount = Math.max(...stats.map(s => s.count), 1);

  return (
    <div className="panel error-pattern-chart">
      <div className="panel-header">
        <div>
          <h3>{t('statistics.errorPatterns', '错误模式分类')}</h3>
          <span className="caption">{t('statistics.errorPatternsDesc', 'AI 分析识别的常见错误类型')}</span>
        </div>
      </div>
      <div className="error-pattern-bars">
        {stats.map((s, i) => (
          <div key={s.pattern_type} className="error-pattern-row">
            <span className="error-pattern-label">{s.pattern_type}</span>
            <div className="error-pattern-bar-track">
              <div
                className="error-pattern-bar-fill"
                style={{
                  width: `${(s.count / maxCount) * 100}%`,
                  background: getColor(s.pattern_type),
                  animationDelay: `${i * 60}ms`,
                }}
              />
            </div>
            <span className="error-pattern-count">{s.count}</span>
            <span className="error-pattern-confidence" title={t('statistics.avgConfidence', '平均置信度')}>
              {(s.avg_confidence * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
