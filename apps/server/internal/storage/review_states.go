package storage

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

// GetProblemReviewState returns the review state for a problem
func (db *DB) GetProblemReviewState(problemID int64) (models.ProblemReviewState, error) {
	row := db.conn.QueryRow(`
SELECT problem_id, status, notes, next_review_at, last_updated_at,
       COALESCE(ease_factor, 2.5), COALESCE(interval_days, 0), COALESCE(repetition_count, 0), last_quality,
	       COALESCE(quality_history, '[]')
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

	qh := state.QualityHistory
	if qh == "" {
		qh = "[]"
	}

	_, err := db.conn.Exec(`
INSERT INTO problem_review_states(problem_id, status, notes, next_review_at, last_updated_at,
	ease_factor, interval_days, repetition_count, last_quality, quality_history)
VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
ON CONFLICT(problem_id) DO UPDATE SET
	status = excluded.status,
	notes = excluded.notes,
	next_review_at = excluded.next_review_at,
	last_updated_at = CURRENT_TIMESTAMP,
	ease_factor = excluded.ease_factor,
	interval_days = excluded.interval_days,
	repetition_count = excluded.repetition_count,
	last_quality = excluded.last_quality,
		quality_history = excluded.quality_history`,
		state.ProblemID,
		status,
		notes,
		nextReviewAt,
		ef,
		state.IntervalDays,
		state.RepetitionCount,
		lastQuality,
		qh,
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

// ReviewCalendarDay holds the review counts for a single day
type ReviewCalendarDay struct {
	Date      string `json:"date"`
	Due       int    `json:"due"`
	Completed int    `json:"completed"`
}

// GetReviewCalendar returns daily due and completed review counts for a given month
func (db *DB) GetReviewCalendar(year int, month int) ([]ReviewCalendarDay, error) {
	startDate := fmt.Sprintf("%04d-%02d-01", year, month)
	lastDay := time.Date(year, time.Month(month)+1, 0, 0, 0, 0, 0, time.UTC).Day()
	endDate := fmt.Sprintf("%04d-%02d-%02d", year, month, lastDay)

	dayMap := make(map[string]*ReviewCalendarDay)

	dueRows, err := db.conn.Query(`
SELECT DATE(next_review_at) as review_date,
       COUNT(*) as due_count
FROM problem_review_states
WHERE next_review_at IS NOT NULL
  AND DATE(next_review_at) BETWEEN ? AND ?
GROUP BY DATE(next_review_at)
ORDER BY review_date`, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer dueRows.Close()
	for dueRows.Next() {
		var date string
		var count int
		if err := dueRows.Scan(&date, &count); err != nil {
			return nil, err
		}
		dayMap[date] = &ReviewCalendarDay{Date: date, Due: count}
	}
	if err := dueRows.Err(); err != nil {
		return nil, err
	}

	compRows, err := db.conn.Query(`
SELECT DATE(last_updated_at) as review_date,
       COUNT(*) as completed_count
FROM problem_review_states
WHERE last_updated_at IS NOT NULL
  AND DATE(last_updated_at) BETWEEN ? AND ?
  AND last_quality IS NOT NULL
GROUP BY DATE(last_updated_at)
ORDER BY review_date`, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer compRows.Close()
	for compRows.Next() {
		var date string
		var count int
		if err := compRows.Scan(&date, &count); err != nil {
			return nil, err
		}
		if d, ok := dayMap[date]; ok {
			d.Completed = count
		} else {
			dayMap[date] = &ReviewCalendarDay{Date: date, Completed: count}
		}
	}
	if err := compRows.Err(); err != nil {
		return nil, err
	}

	days := make([]ReviewCalendarDay, 0, len(dayMap))
	for d := 1; d <= lastDay; d++ {
		dateStr := fmt.Sprintf("%04d-%02d-%02d", year, month, d)
		if entry, ok := dayMap[dateStr]; ok {
			days = append(days, *entry)
		}
	}
	return days, nil
}

// GetReviewStreak calculates the current and longest consecutive review day streaks
func (db *DB) GetReviewStreak() (currentStreak int, longestStreak int, err error) {
	rows, err := db.conn.Query(`
SELECT DISTINCT DATE(last_updated_at) as review_date
FROM problem_review_states
WHERE last_quality IS NOT NULL
ORDER BY review_date DESC`)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	var dates []time.Time
	for rows.Next() {
		var dateStr string
		if err := rows.Scan(&dateStr); err != nil {
			return 0, 0, err
		}
		t, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			continue
		}
		dates = append(dates, t)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}

	if len(dates) == 0 {
		return 0, 0, nil
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	currentStreak = 0
	expected := today
	for _, d := range dates {
		dt := d.UTC().Truncate(24 * time.Hour)
		if dt.Equal(expected) {
			currentStreak++
			expected = expected.AddDate(0, 0, -1)
		} else if dt.Before(expected) {
			if currentStreak == 0 && dt.Equal(today.AddDate(0, 0, -1)) {
				currentStreak++
				expected = dt.AddDate(0, 0, -1)
			} else {
				break
			}
		}
	}

	longestStreak = 1
	streak := 1
	for i := len(dates) - 1; i > 0; i-- {
		prev := dates[i].UTC().Truncate(24 * time.Hour)
		curr := dates[i-1].UTC().Truncate(24 * time.Hour)
		if curr.Equal(prev.AddDate(0, 0, 1)) {
			streak++
		} else {
			streak = 1
		}
		if streak > longestStreak {
			longestStreak = streak
		}
	}

	if currentStreak > longestStreak {
		longestStreak = currentStreak
	}

	return currentStreak, longestStreak, nil
}
