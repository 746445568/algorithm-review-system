package storage

import (
	"fmt"

	"ojreviewdesktop/internal/models"
)

// UpsertKnowledgeNode inserts a knowledge node or updates its description
// if a node with the same name already exists. Returns the node ID.
func (db *DB) UpsertKnowledgeNode(name string, parentID *int64, description string) (int64, error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	_, err := db.conn.Exec(`
INSERT INTO knowledge_nodes(name, parent_id, description) VALUES (?, ?, ?)
ON CONFLICT(name) DO UPDATE SET description = excluded.description, parent_id = COALESCE(excluded.parent_id, knowledge_nodes.parent_id)`,
		name, parentID, description,
	)
	if err != nil {
		return 0, err
	}

	var id int64
	if err := db.conn.QueryRow(`SELECT id FROM knowledge_nodes WHERE name = ?`, name).Scan(&id); err != nil {
		return 0, err
	}
	return id, nil
}

// GetKnowledgeNodes returns all knowledge nodes.
func (db *DB) GetKnowledgeNodes() ([]models.KnowledgeNode, error) {
	rows, err := db.conn.Query(`SELECT id, name, parent_id, description, created_at FROM knowledge_nodes ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []models.KnowledgeNode
	for rows.Next() {
		var n models.KnowledgeNode
		if err := rows.Scan(&n.ID, &n.Name, &n.ParentID, &n.Description, &n.CreatedAt); err != nil {
			return nil, err
		}
		nodes = append(nodes, n)
	}
	return nodes, rows.Err()
}

// SaveProblemKnowledge replaces all knowledge associations for a problem.
func (db *DB) SaveProblemKnowledge(problemID int64, knowledgeIDs []int64) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM problem_knowledge WHERE problem_id = ?`, problemID); err != nil {
		return err
	}

	for _, kid := range knowledgeIDs {
		if _, err := tx.Exec(`INSERT OR IGNORE INTO problem_knowledge(problem_id, knowledge_id) VALUES (?, ?)`, problemID, kid); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// GetKnowledgeGraph returns the full knowledge graph with node info,
// problem counts, and average mastery levels.
func (db *DB) GetKnowledgeGraph() ([]map[string]any, error) {
	rows, err := db.conn.Query(`
SELECT kn.id, kn.name, kn.parent_id, kn.description,
       COUNT(DISTINCT pk.problem_id) AS problem_count,
       COALESCE(AVG(pk.mastery_level), 0) AS avg_mastery
FROM knowledge_nodes kn
LEFT JOIN problem_knowledge pk ON pk.knowledge_id = kn.id
GROUP BY kn.id
ORDER BY kn.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []map[string]any
	for rows.Next() {
		var id int64
		var name, description string
		var parentID *int64
		var problemCount int
		var avgMastery float64
		if err := rows.Scan(&id, &name, &parentID, &description, &problemCount, &avgMastery); err != nil {
			return nil, err
		}
		entry := map[string]any{
			"id":           id,
			"name":         name,
			"parentId":     parentID,
			"description":  description,
			"problemCount": problemCount,
			"avgMastery":   avgMastery,
		}
		result = append(result, entry)
	}
	return result, rows.Err()
}

// UpdateMasteryLevels recalculates mastery_level for all problem-knowledge
// associations based on submission verdicts. A problem is "mastered" for a
// knowledge point if it has an ACCEPTED submission; mastery = AC_count / total_count.
func (db *DB) UpdateMasteryLevels() error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	_, err := db.conn.Exec(`
UPDATE problem_knowledge
SET mastery_level = (
    SELECT COALESCE(
        SUM(CASE WHEN s.verdict = 'ACCEPTED' THEN 1.0 ELSE 0.0 END) / COUNT(*),
        0
    )
    FROM submissions s
    WHERE s.problem_id = problem_knowledge.problem_id
)
WHERE EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.problem_id = problem_knowledge.problem_id
)`)
	return err
}

// SyncTagsToKnowledgeGraph creates knowledge_nodes from distinct tag names
// in problem_tags and populates problem_knowledge. This is the primary way
// the knowledge graph is populated — no AI call needed.
func (db *DB) SyncTagsToKnowledgeGraph() (nodesCreated int, linksCreated int, err error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	tx, err := db.conn.Begin()
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback()

	// 1. Insert distinct tag names as knowledge nodes
	nodeResult, err := tx.Exec(`
INSERT OR IGNORE INTO knowledge_nodes(name, description)
SELECT DISTINCT tag_name, ''
FROM problem_tags
WHERE tag_name NOT IN (SELECT name FROM knowledge_nodes)`)
	if err != nil {
		return 0, 0, fmt.Errorf("sync tags to knowledge_nodes: %w", err)
	}
	nodesCreated64, _ := nodeResult.RowsAffected()
	nodesCreated = int(nodesCreated64)

	// 2. Link problems to their knowledge nodes
	linkResult, err := tx.Exec(`
INSERT OR IGNORE INTO problem_knowledge(problem_id, knowledge_id)
SELECT pt.problem_id, kn.id
FROM problem_tags pt
JOIN knowledge_nodes kn ON kn.name = pt.tag_name`)
	if err != nil {
		return 0, 0, fmt.Errorf("sync problem_knowledge links: %w", err)
	}
	linksCreated64, _ := linkResult.RowsAffected()
	linksCreated = int(linksCreated64)

	// 3. Recalculate mastery levels
	if _, err := tx.Exec(`
UPDATE problem_knowledge
SET mastery_level = (
    SELECT COALESCE(
        SUM(CASE WHEN s.verdict = 'ACCEPTED' THEN 1.0 ELSE 0.0 END) / COUNT(*),
        0
    )
    FROM submissions s
    WHERE s.problem_id = problem_knowledge.problem_id
)
WHERE EXISTS (
    SELECT 1 FROM submissions s
    WHERE s.problem_id = problem_knowledge.problem_id
)`); err != nil {
		return 0, 0, fmt.Errorf("recalculate mastery: %w", err)
	}

	return nodesCreated, linksCreated, tx.Commit()
}
