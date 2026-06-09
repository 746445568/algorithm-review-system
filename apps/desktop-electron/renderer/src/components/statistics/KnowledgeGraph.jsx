import { useMemo } from "react";

/**
 * KnowledgeGraph — 树形知识点可视化组件。
 *
 * Props:
 *   nodes: Array<{ id, name, parentId, description, problemCount, avgMastery }>
 *
 * 每个节点显示：名称、掌握度百分比、关联题目数。
 * 掌握度用颜色深浅表示：红色（低）→ 黄色（中）→ 绿色（高）。
 */
export default function KnowledgeGraph({ nodes = [] }) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="kg-empty">
        <p>暂无知识点数据。同步 OJ 账户后，点击「同步知识点」生成知识图谱。</p>
      </div>
    );
  }

  return (
    <div className="kg-container">
      <div className="kg-tree">
        {tree.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
}

function TreeNode({ node, depth }) {
  const masteryPct = Math.round((node.avgMastery || 0) * 100);
  const masteryColor = masteryColorFor(node.avgMastery || 0);

  return (
    <div className="kg-node-group">
      <div
        className="kg-node"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        <span
          className="kg-mastery-dot"
          style={{ backgroundColor: masteryColor }}
          title={`掌握度: ${masteryPct}%`}
        />
        <span className="kg-name">{node.name}</span>
        <span className="kg-meta">
          {masteryPct}% · {node.problemCount}题
        </span>
      </div>
      {node.children?.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

function masteryColorFor(level) {
  if (level >= 0.7) return "#22c55e";
  if (level >= 0.4) return "#eab308";
  return "#ef4444";
}

function buildTree(nodes) {
  const map = {};
  const roots = [];

  for (const n of nodes) {
    map[n.id] = { ...n, children: [] };
  }

  for (const n of nodes) {
    const node = map[n.id];
    if (n.parentId && map[n.parentId]) {
      map[n.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
