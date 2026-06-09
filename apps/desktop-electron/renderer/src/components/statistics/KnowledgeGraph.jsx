import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export function KnowledgeGraph({ nodes = [] }) {
  const { t } = useTranslation();
  const tree = useMemo(() => buildTree(nodes), [nodes]);

  if (!nodes.length) {
    return <p className="muted-text stats-empty">{t("statistics.noKnowledgeGraphData")}</p>;
  }

  return (
    <div className="knowledge-graph" data-testid="knowledge-graph" aria-label={t("statistics.knowledgeGraph")}>
      {tree.map((node) => (
        <KnowledgeNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}

function KnowledgeNode({ node, depth }) {
  const { t } = useTranslation();
  const mastery = Math.max(0, Math.min(1, Number(node.avgMastery) || 0));
  const masteryPct = Math.round(mastery * 100);

  return (
    <div className="knowledge-node-group">
      <div className="knowledge-node" style={{ paddingLeft: `${depth * 22 + 12}px` }}>
        <span className={`knowledge-node-dot ${masteryClass(mastery)}`} aria-hidden="true" />
        <span className="knowledge-node-name">{node.name}</span>
        <span className="knowledge-node-meta">
          {t("statistics.knowledgeNodeMeta", {
            mastery: masteryPct,
            count: node.problemCount ?? 0,
          })}
        </span>
      </div>
      {node.children.map((child) => (
        <KnowledgeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function masteryClass(level) {
  if (level >= 0.7) return "knowledge-node-dot--high";
  if (level >= 0.4) return "knowledge-node-dot--medium";
  return "knowledge-node-dot--low";
}

function buildTree(nodes) {
  const byID = new Map();
  const roots = [];

  for (const node of nodes) {
    byID.set(node.id, { ...node, children: [] });
  }

  for (const node of nodes) {
    const current = byID.get(node.id);
    const parentID = node.parentId;
    if (parentID && byID.has(parentID)) {
      byID.get(parentID).children.push(current);
    } else {
      roots.push(current);
    }
  }

  return roots;
}
