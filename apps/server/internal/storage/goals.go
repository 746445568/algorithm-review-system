package storage

import (
	"context"
	"database/sql"
	"strings"

	"ojreviewdesktop/internal/models"
)

// GetGoals returns all goals ordered by creation date
func (db *DB) GetGoals(ctx context.Context) ([]models.Goal, error) {
	rows, err := db.conn.QueryContext(ctx, `SELECT id, platform, title, target_rating, deadline, created_at FROM goals ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	goals := make([]models.Goal, 0)
	for rows.Next() {
		var g models.Goal
		var deadline sql.NullString
		if err := rows.Scan(&g.ID, &g.Platform, &g.Title, &g.TargetRating, &deadline, &g.CreatedAt); err != nil {
			return nil, err
		}
		if deadline.Valid {
			g.Deadline = deadline.String
		}
		goals = append(goals, g)
	}
	return goals, rows.Err()
}

// CreateGoal creates a new goal
func (db *DB) CreateGoal(ctx context.Context, g models.Goal) (models.Goal, error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	var deadline any
	if strings.TrimSpace(g.Deadline) != "" {
		deadline = g.Deadline
	}

	res, err := db.conn.ExecContext(ctx, `INSERT INTO goals (platform, title, target_rating, deadline) VALUES (?, ?, ?, ?)`, g.Platform, g.Title, g.TargetRating, deadline)
	if err != nil {
		return g, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return g, err
	}

	created := models.Goal{}
	if err := db.conn.QueryRowContext(ctx, `SELECT id, platform, title, target_rating, COALESCE(deadline, ''), created_at FROM goals WHERE id = ?`, id).
		Scan(&created.ID, &created.Platform, &created.Title, &created.TargetRating, &created.Deadline, &created.CreatedAt); err != nil {
		return g, err
	}
	return created, nil
}

// DeleteGoal deletes a goal by ID
func (db *DB) DeleteGoal(ctx context.Context, id int64) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()
	_, err := db.conn.ExecContext(ctx, `DELETE FROM goals WHERE id = ?`, id)
	return err
}
