package storage

import (
	"fmt"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

// GetSubmissions returns submissions with optional filters
func (db *DB) GetSubmissions(opts SubmissionQueryOptions) ([]models.Submission, error) {
	var conditions []string
	args := make([]any, 0)

	if opts.PlatformAccountID != nil {
		conditions = append(conditions, "platform_account_id = ?")
		args = append(args, *opts.PlatformAccountID)
	}
	if opts.Platform != nil {
		conditions = append(conditions, "platform = ?")
		args = append(args, *opts.Platform)
	}
	if opts.ProblemID != nil {
		conditions = append(conditions, "problem_id = ?")
		args = append(args, *opts.ProblemID)
	}
	if opts.Verdict != nil {
		conditions = append(conditions, "verdict = ?")
		args = append(args, *opts.Verdict)
	}

	query := `
SELECT id, platform_account_id, platform, external_submission_id, problem_id, verdict, COALESCE(language, ''), submitted_at, exec_time_ms, memory_kb, COALESCE(source_contest_id, ''), raw_json, created_at, updated_at
FROM submissions`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY submitted_at DESC, id DESC"
	if opts.Limit > 0 {
		query += " LIMIT ?"
		args = append(args, opts.Limit)
		if opts.Offset > 0 {
			query += " OFFSET ?"
			args = append(args, opts.Offset)
		}
	} else if opts.Offset > 0 {
		query += " LIMIT -1 OFFSET ?"
		args = append(args, opts.Offset)
	}

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("get submissions: query rows: %w", err)
	}
	defer rows.Close()

	items := make([]models.Submission, 0)
	for rows.Next() {
		item, err := scanSubmissionRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("get submissions: scan row: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get submissions: iterate rows: %w", err)
	}

	return items, nil
}

// UpsertSubmission inserts or updates a submission
func (db *DB) UpsertSubmission(s models.Submission) (models.Submission, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	submittedAt := s.SubmittedAt.UTC().Format(time.RFC3339)

	_, err := db.conn.Exec(`
INSERT INTO submissions(platform_account_id, platform, external_submission_id, problem_id, verdict, language, submitted_at, exec_time_ms, memory_kb, source_contest_id, raw_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(platform, external_submission_id) DO UPDATE SET
	verdict = excluded.verdict,
	language = excluded.language,
	exec_time_ms = excluded.exec_time_ms,
	memory_kb = excluded.memory_kb,
	raw_json = excluded.raw_json,
	updated_at = excluded.updated_at`,
		nullableInt64Ptr(s.PlatformAccountID),
		s.Platform,
		s.ExternalSubmissionID,
		s.ProblemID,
		s.Verdict,
		nullableString(s.Language),
		submittedAt,
		nullableIntPtr(s.ExecutionTimeMS),
		nullableIntPtr(s.MemoryKB),
		nullableString(s.SourceContestID),
		s.RawJSON,
		now,
		now,
	)
	if err != nil {
		return models.Submission{}, fmt.Errorf("upsert submission: save submission row: %w", err)
	}

	row := db.conn.QueryRow(`
SELECT id, platform_account_id, platform, external_submission_id, problem_id, verdict, COALESCE(language, ''), submitted_at, exec_time_ms, memory_kb, COALESCE(source_contest_id, ''), raw_json, created_at, updated_at
FROM submissions
WHERE platform = ? AND external_submission_id = ?`, s.Platform, s.ExternalSubmissionID)

	saved, err := scanSubmissionRecord(row)
	if err != nil {
		return models.Submission{}, fmt.Errorf("upsert submission: fetch saved submission: %w", err)
	}
	return saved, nil
}

// ProblemSummary aggregates submission statistics per problem
type ProblemSummary struct {
	ProblemID       int64
	ExternalProbID  string
	Title           string
	Platform        models.Platform
	AttemptCount    int
	ACCount         int
	LastSubmittedAt time.Time
	Tags            []string
}

// GetProblemSubmissionsSummary returns submission summary grouped by problem
func (db *DB) GetProblemSubmissionsSummary(platformAccountID int64) ([]ProblemSummary, error) {
	rows, err := db.conn.Query(`
SELECT
	p.id,
	p.external_problem_id,
	p.title,
	p.platform,
	COUNT(s.id) AS attempt_count,
	SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count,
	MAX(s.submitted_at) AS last_submitted_at,
	COALESCE(GROUP_CONCAT(DISTINCT pt.tag_name), '') AS tags_csv
FROM submissions s
JOIN problems p ON p.id = s.problem_id
LEFT JOIN problem_tags pt ON pt.problem_id = p.id
WHERE s.platform_account_id = ?
GROUP BY p.id, p.external_problem_id, p.title, p.platform
ORDER BY last_submitted_at DESC, p.id DESC`, models.VerdictAC, platformAccountID)
	if err != nil {
		return nil, fmt.Errorf("get problem submissions summary: query rows: %w", err)
	}
	defer rows.Close()

	items := make([]ProblemSummary, 0)
	for rows.Next() {
		var item ProblemSummary
		var lastSubmittedAtRaw string
		var tagsCSV string
		if err := rows.Scan(
			&item.ProblemID,
			&item.ExternalProbID,
			&item.Title,
			&item.Platform,
			&item.AttemptCount,
			&item.ACCount,
			&lastSubmittedAtRaw,
			&tagsCSV,
		); err != nil {
			return nil, fmt.Errorf("get problem submissions summary: scan row: %w", err)
		}

		item.LastSubmittedAt, err = parseSQLiteTimestamp(lastSubmittedAtRaw)
		if err != nil {
			return nil, fmt.Errorf("get problem submissions summary: parse last_submitted_at: %w", err)
		}
		item.Tags = splitTagsCSV(tagsCSV)
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get problem submissions summary: iterate rows: %w", err)
	}

	return items, nil
}

// GetSubmissionStatsByWeek returns submission statistics grouped by week
func (db *DB) GetSubmissionStatsByWeek(weeks int) ([]map[string]any, error) {
	rows, err := db.conn.Query(`
        SELECT strftime('%Y-W%W', submitted_at) AS week,
               COUNT(*) AS total,
               SUM(CASE WHEN verdict='AC' THEN 1 ELSE 0 END) AS ac_count
        FROM submissions
        WHERE submitted_at >= ?
        GROUP BY week ORDER BY week ASC`,
		time.Now().UTC().AddDate(0, 0, -weeks*7).Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []map[string]any
	for rows.Next() {
		var week string
		var total, acCount int
		if err := rows.Scan(&week, &total, &acCount); err != nil {
			return nil, err
		}
		result = append(result, map[string]any{"week": week, "total": total, "acCount": acCount})
	}
	return result, rows.Err()
}

// GetTagAccuracyStats returns accuracy statistics per tag
func (db *DB) GetTagAccuracyStats() ([]map[string]any, error) {
	rows, err := db.conn.Query(`
        SELECT pt.tag_name, COUNT(DISTINCT s.id) AS attempts,
               SUM(CASE WHEN s.verdict='AC' THEN 1 ELSE 0 END) AS ac_count
        FROM submissions s
        JOIN problem_tags pt ON pt.problem_id = s.problem_id
        GROUP BY pt.tag_name HAVING COUNT(DISTINCT s.id) >= 2
        ORDER BY (CAST(ac_count AS REAL)/attempts) ASC LIMIT 15`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []map[string]any
	for rows.Next() {
		var tag string
		var attempts, acCount int
		if err := rows.Scan(&tag, &attempts, &acCount); err != nil {
			return nil, err
		}
		result = append(result, map[string]any{"tag": tag, "attempts": attempts, "acCount": acCount})
	}
	return result, rows.Err()
}
