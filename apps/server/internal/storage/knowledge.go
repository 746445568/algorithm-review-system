package storage

import (
	"database/sql"
	"fmt"

	"ojreviewdesktop/internal/models"
)

// UpsertKnowledgeNode inserts a knowledge node or updates the existing node
// with the same name. Returns the node ID.
func (db *DB) UpsertKnowledgeNode(name string, parentID *int64, description string) (int64, error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	_, err := db.conn.Exec(`
INSERT INTO knowledge_nodes(name, parent_id, description)
VALUES (?, ?, ?)
ON CONFLICT(name) DO UPDATE SET
	parent_id = excluded.parent_id,
	description = excluded.description`,
		name, nullableInt64Ptr(parentID), description,
	)
	if err != nil {
		return 0, fmt.Errorf("upsert knowledge node: %w", err)
	}

	var id int64
	if err := db.conn.QueryRow(`SELECT id FROM knowledge_nodes WHERE name = ?`, name).Scan(&id); err != nil {
		return 0, fmt.Errorf("upsert knowledge node: fetch id: %w", err)
	}
	return id, nil
}

// GetKnowledgeNodes returns all knowledge nodes ordered by name.
func (db *DB) GetKnowledgeNodes() ([]models.KnowledgeNode, error) {
	rows, err := db.conn.Query(`
SELECT id, name, parent_id, description, created_at
FROM knowledge_nodes
ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("get knowledge nodes: %w", err)
	}
	defer rows.Close()

	nodes := make([]models.KnowledgeNode, 0)
	for rows.Next() {
		var node models.KnowledgeNode
		var parentID sql.NullInt64
		if err := rows.Scan(&node.ID, &node.Name, &parentID, &node.Description, &node.CreatedAt); err != nil {
			return nil, fmt.Errorf("get knowledge nodes: scan row: %w", err)
		}
		if parentID.Valid {
			node.ParentID = &parentID.Int64
		}
		nodes = append(nodes, node)
	}
	return nodes, rows.Err()
}

// SaveProblemKnowledge replaces all knowledge associations for a problem.
func (db *DB) SaveProblemKnowledge(problemID int64, knowledgeIDs []int64) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("save problem knowledge: begin: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM problem_knowledge WHERE problem_id = ?`, problemID); err != nil {
		return fmt.Errorf("save problem knowledge: clear existing: %w", err)
	}
	for _, knowledgeID := range knowledgeIDs {
		if _, err := tx.Exec(`
INSERT OR IGNORE INTO problem_knowledge(problem_id, knowledge_id)
VALUES (?, ?)`, problemID, knowledgeID); err != nil {
			return fmt.Errorf("save problem knowledge: insert link: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("save problem knowledge: commit: %w", err)
	}
	return nil
}

// GetKnowledgeGraph returns nodes with associated problem counts and mastery.
func (db *DB) GetKnowledgeGraph() ([]map[string]any, error) {
	rows, err := db.conn.Query(`
SELECT kn.id, kn.name, kn.parent_id, kn.description,
       COUNT(DISTINCT pk.problem_id) AS problem_count,
       COALESCE(AVG(pk.mastery_level), 0) AS avg_mastery
FROM knowledge_nodes kn
LEFT JOIN problem_knowledge pk ON pk.knowledge_id = kn.id
GROUP BY kn.id, kn.name, kn.parent_id, kn.description
ORDER BY kn.name`)
	if err != nil {
		return nil, fmt.Errorf("get knowledge graph: %w", err)
	}
	defer rows.Close()

	graph := make([]map[string]any, 0)
	for rows.Next() {
		var id int64
		var name string
		var parentID sql.NullInt64
		var description string
		var problemCount int
		var avgMastery float64
		if err := rows.Scan(&id, &name, &parentID, &description, &problemCount, &avgMastery); err != nil {
			return nil, fmt.Errorf("get knowledge graph: scan row: %w", err)
		}
		var parent any
		if parentID.Valid {
			parent = parentID.Int64
		}
		graph = append(graph, map[string]any{
			"id":           id,
			"name":         name,
			"parentId":     parent,
			"description":  description,
			"problemCount": problemCount,
			"avgMastery":   avgMastery,
		})
	}
	return graph, rows.Err()
}

// UpdateMasteryLevels recalculates mastery for every problem-knowledge link.
func (db *DB) UpdateMasteryLevels() error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	if _, err := db.conn.Exec(masteryUpdateSQL, models.VerdictAC); err != nil {
		return fmt.Errorf("update mastery levels: %w", err)
	}
	return nil
}

// SyncTagsToKnowledgeGraph creates knowledge nodes from problem tags and links
// each problem to its tagged knowledge nodes.
func (db *DB) SyncTagsToKnowledgeGraph() (nodesCreated int, linksCreated int, err error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	tx, err := db.conn.Begin()
	if err != nil {
		return 0, 0, fmt.Errorf("sync tags to knowledge graph: begin: %w", err)
	}
	defer tx.Rollback()

	nodeResult, err := tx.Exec(`
INSERT OR IGNORE INTO knowledge_nodes(name, description)
SELECT DISTINCT tag_name, ''
FROM problem_tags
WHERE TRIM(tag_name) <> ''`)
	if err != nil {
		return 0, 0, fmt.Errorf("sync tags to knowledge nodes: %w", err)
	}
	nodesCreated64, _ := nodeResult.RowsAffected()

	linkResult, err := tx.Exec(`
INSERT OR IGNORE INTO problem_knowledge(problem_id, knowledge_id)
SELECT pt.problem_id, kn.id
FROM problem_tags pt
JOIN knowledge_nodes kn ON kn.name = pt.tag_name`)
	if err != nil {
		return 0, 0, fmt.Errorf("sync problem knowledge links: %w", err)
	}
	linksCreated64, _ := linkResult.RowsAffected()

	if _, err := tx.Exec(masteryUpdateSQL, models.VerdictAC); err != nil {
		return 0, 0, fmt.Errorf("sync tags to knowledge graph: update mastery: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return 0, 0, fmt.Errorf("sync tags to knowledge graph: commit: %w", err)
	}
	return int(nodesCreated64), int(linksCreated64), nil
}

type RadarItem struct {
	Name     string  `json:"name"`
	Mastery  float64 `json:"mastery"`
	Problems int     `json:"problems"`
}

func (db *DB) GetRadarData(limit int) ([]RadarItem, error) {
	if limit <= 0 {
		limit = 8
	}
	rows, err := db.conn.Query(`
SELECT kn.name, COALESCE(AVG(pk.mastery_level), 0) AS avg_mastery, COUNT(pk.problem_id) AS problem_count
FROM knowledge_nodes kn
LEFT JOIN problem_knowledge pk ON pk.knowledge_id = kn.id
GROUP BY kn.id
HAVING problem_count > 0
ORDER BY problem_count DESC
LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("query radar data: %w", err)
	}
	defer rows.Close()

	items := make([]RadarItem, 0)
	for rows.Next() {
		var item RadarItem
		if err := rows.Scan(&item.Name, &item.Mastery, &item.Problems); err != nil {
			return nil, fmt.Errorf("scan radar item: %w", err)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

const masteryUpdateSQL = `
UPDATE problem_knowledge
SET mastery_level = (
	SELECT COALESCE(
		SUM(CASE WHEN s.verdict = ? THEN 1.0 ELSE 0.0 END) / COUNT(*),
		0
	)
	FROM submissions s
	WHERE s.problem_id = problem_knowledge.problem_id
)
WHERE EXISTS (
	SELECT 1 FROM submissions s
	WHERE s.problem_id = problem_knowledge.problem_id
)`
