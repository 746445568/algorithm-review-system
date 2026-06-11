package storage

import (
	"fmt"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

// UpsertContest inserts or updates a contest
func (db *DB) UpsertContest(c models.Contest) (models.Contest, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	startTime := c.StartTime.UTC().Format(time.RFC3339)
	_, err := db.conn.Exec(`
INSERT INTO contests(platform, external_contest_id, name, start_time, duration_minutes, url, status, last_synced_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(platform, external_contest_id) DO UPDATE SET
	name = excluded.name,
	start_time = excluded.start_time,
	duration_minutes = excluded.duration_minutes,
	url = excluded.url,
	status = excluded.status,
	last_synced_at = excluded.last_synced_at,
	updated_at = excluded.updated_at`,
		c.Platform,
		c.ExternalContestID,
		c.Name,
		startTime,
		c.DurationMinutes,
		nullableString(c.URL),
		c.Status,
		now,
		now,
		now,
	)
	if err != nil {
		return models.Contest{}, fmt.Errorf("upsert contest: save contest row: %w", err)
	}

	row := db.conn.QueryRow(`
SELECT id, platform, external_contest_id, name, start_time, duration_minutes, COALESCE(url, ''), status, created_at, updated_at, last_synced_at
FROM contests
WHERE platform = ? AND external_contest_id = ?`, c.Platform, c.ExternalContestID)
	return scanContestRecord(row)
}

// GetContests returns contests with optional filters
func (db *DB) GetContests(opts ContestQueryOptions) ([]models.Contest, error) {
	var conditions []string
	args := make([]any, 0)
	statusFilter := strings.TrimSpace(strings.ToUpper(opts.Status))

	if opts.Platform != nil {
		conditions = append(conditions, "platform = ?")
		args = append(args, *opts.Platform)
	}

	query := `
SELECT id, platform, external_contest_id, name, start_time, duration_minutes, COALESCE(url, ''), status, created_at, updated_at, last_synced_at
FROM contests`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY start_time ASC, id ASC"

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("get contests: query rows: %w", err)
	}
	defer rows.Close()

	items := make([]models.Contest, 0)
	now := time.Now().UTC()
	for rows.Next() {
		item, err := scanContestRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("get contests: scan row: %w", err)
		}
		item.Status = currentContestStatus(item, now)
		if statusFilter != "" && item.Status != statusFilter {
			continue
		}
		if opts.Offset > 0 {
			opts.Offset--
			continue
		}
		items = append(items, item)
		if opts.Limit > 0 && len(items) >= opts.Limit {
			break
		}
	}
	return items, rows.Err()
}

func currentContestStatus(contest models.Contest, now time.Time) string {
	start := contest.StartTime.UTC()
	if start.After(now) {
		return "UPCOMING"
	}
	if contest.DurationMinutes > 0 && start.Add(time.Duration(contest.DurationMinutes)*time.Minute).After(now) {
		return "ONGOING"
	}
	return "FINISHED"
}
