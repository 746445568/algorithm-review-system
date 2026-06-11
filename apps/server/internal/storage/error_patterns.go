package storage

import (
	"fmt"

	"ojreviewdesktop/internal/models"
)

// SaveErrorPatterns replaces error patterns for a problem.
func (db *DB) SaveErrorPatterns(problemID int64, patterns []models.ErrorPattern) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM error_patterns WHERE problem_id = ?`, problemID); err != nil {
		return fmt.Errorf("delete existing error patterns: %w", err)
	}

	for _, p := range patterns {
		_, err := tx.Exec(`
INSERT INTO error_patterns(problem_id, submission_id, pattern_type, description, ai_confidence)
VALUES (?, ?, ?, ?, ?)`,
			problemID, p.SubmissionID, p.PatternType, p.Description, p.Confidence,
		)
		if err != nil {
			return fmt.Errorf("insert error pattern: %w", err)
		}
	}

	return tx.Commit()
}

// GetErrorPatternStats returns aggregated stats grouped by pattern type.
func (db *DB) GetErrorPatternStats() ([]models.ErrorPatternStats, error) {
	rows, err := db.conn.Query(`
SELECT pattern_type, COUNT(*) AS cnt, AVG(ai_confidence) AS avg_conf
FROM error_patterns
GROUP BY pattern_type
ORDER BY cnt DESC`)
	if err != nil {
		return nil, fmt.Errorf("query error pattern stats: %w", err)
	}
	defer rows.Close()

	stats := make([]models.ErrorPatternStats, 0)
	for rows.Next() {
		var s models.ErrorPatternStats
		if err := rows.Scan(&s.PatternType, &s.Count, &s.AvgConfidence); err != nil {
			return nil, fmt.Errorf("scan error pattern stats: %w", err)
		}
		stats = append(stats, s)
	}
	return stats, rows.Err()
}

// GetErrorPatternsByProblem returns all error patterns for a given problem.
func (db *DB) GetErrorPatternsByProblem(problemID int64) ([]models.ErrorPattern, error) {
	rows, err := db.conn.Query(`
SELECT id, problem_id, submission_id, pattern_type, description, ai_confidence, created_at
FROM error_patterns
WHERE problem_id = ?
ORDER BY created_at DESC`, problemID)
	if err != nil {
		return nil, fmt.Errorf("query error patterns by problem: %w", err)
	}
	defer rows.Close()

	patterns := make([]models.ErrorPattern, 0)
	for rows.Next() {
		var p models.ErrorPattern
		if err := rows.Scan(&p.ID, &p.ProblemID, &p.SubmissionID, &p.PatternType, &p.Description, &p.Confidence, &p.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan error pattern: %w", err)
		}
		patterns = append(patterns, p)
	}
	return patterns, rows.Err()
}
