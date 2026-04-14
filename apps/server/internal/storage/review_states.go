package storage

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

// GetProblemReviewState returns the review state for a problem
func (db *DB) GetProblemReviewState(problemID int64) (models.ProblemReviewState, error) {
	row := db.conn.QueryRow(`
SELECT problem_id, status, notes, next_review_at, last_updated_at,
       COALESCE(ease_factor, 2.5), COALESCE(interval_days, 0), COALESCE(repetition_count, 0), last_quality
FROM problem_review_states
WHERE problem_id = ?`, problemID)

	state, err := scanProblemReviewState(row)
	if err == nil {
		return state, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return models.ProblemReviewState{}, err
	}

	return models.ProblemReviewState{
		ProblemID:     problemID,
		Status:        models.ReviewStatusTodo,
		Notes:         "",
		EaseFactor:    2.5,
		LastUpdatedAt: time.Now().UTC(),
	}, nil
}

// SaveProblemReviewState inserts or updates a problem review state
func (db *DB) SaveProblemReviewState(state models.ProblemReviewState) (models.ProblemReviewState, error) {
	if state.ProblemID == 0 {
		return models.ProblemReviewState{}, errors.New("problem id is required")
	}

	status := normalizeReviewStatus(state.Status)
	notes := strings.TrimSpace(state.Notes)
	var nextReviewAt any
	if state.NextReviewAt != nil && !state.NextReviewAt.IsZero() {
		nextReviewAt = state.NextReviewAt.UTC().Format(time.RFC3339)
	}

	ef := state.EaseFactor
	if ef < 1.3 {
		ef = 2.5
	}
	var lastQuality any
	if state.LastQuality != nil {
		lastQuality = *state.LastQuality
	}

	_, err := db.conn.Exec(`
INSERT INTO problem_review_states(problem_id, status, notes, next_review_at, last_updated_at,
	ease_factor, interval_days, repetition_count, last_quality)
VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)
ON CONFLICT(problem_id) DO UPDATE SET
	status = excluded.status,
	notes = excluded.notes,
	next_review_at = excluded.next_review_at,
	last_updated_at = CURRENT_TIMESTAMP,
	ease_factor = excluded.ease_factor,
	interval_days = excluded.interval_days,
	repetition_count = excluded.repetition_count,
	last_quality = excluded.last_quality`,
		state.ProblemID,
		status,
		notes,
		nextReviewAt,
		ef,
		state.IntervalDays,
		state.RepetitionCount,
		lastQuality,
	)
	if err != nil {
		return models.ProblemReviewState{}, err
	}

	return db.GetProblemReviewState(state.ProblemID)
}

// GetDailyReviewCounts returns daily review counts for the last 90 days
func (db *DB) GetDailyReviewCounts() ([]map[string]any, error) {
	rows, err := db.conn.Query(`
        SELECT date(last_updated_at) AS day, COUNT(*) AS count
        FROM problem_review_states
        WHERE last_updated_at >= date('now', '-90 days')
        GROUP BY day ORDER BY day ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []map[string]any
	for rows.Next() {
		var day string
		var count int
		if err := rows.Scan(&day, &count); err != nil {
			return nil, err
		}
		result = append(result, map[string]any{"day": day, "count": count})
	}
	return result, rows.Err()
}
