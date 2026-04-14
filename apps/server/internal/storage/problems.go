package storage

import (
	"fmt"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

// UpsertProblem inserts or updates a problem and its tags
func (db *DB) UpsertProblem(p models.Problem) (models.Problem, error) {
	rawTagsJSON := strings.TrimSpace(p.RawTagsJSON)
	if rawTagsJSON == "" {
		rawTagsJSON = "[]"
	}

	now := time.Now().UTC().Format(time.RFC3339)
	tx, err := db.conn.Begin()
	if err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: begin transaction: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	_, err = tx.Exec(`
INSERT INTO problems(platform, external_problem_id, external_contest_id, title, url, difficulty, raw_tags_json, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(platform, external_problem_id) DO UPDATE SET
	external_contest_id = excluded.external_contest_id,
	title = excluded.title,
	url = excluded.url,
	difficulty = excluded.difficulty,
	raw_tags_json = excluded.raw_tags_json,
	updated_at = excluded.updated_at`,
		p.Platform,
		p.ExternalProblemID,
		nullableString(p.ExternalContestID),
		p.Title,
		nullableString(p.URL),
		nullableString(p.Difficulty),
		rawTagsJSON,
		now,
		now,
	)
	if err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: save problem row: %w", err)
	}

	row := tx.QueryRow(`
SELECT id, platform, external_problem_id, COALESCE(external_contest_id, ''), title, COALESCE(url, ''), COALESCE(difficulty, ''), raw_tags_json, created_at, updated_at
FROM problems
WHERE platform = ? AND external_problem_id = ?`, p.Platform, p.ExternalProblemID)

	saved, err := scanProblemRecord(row)
	if err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: fetch saved problem: %w", err)
	}

	tags, err := parseRawTags(rawTagsJSON)
	if err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: parse raw_tags_json: %w", err)
	}

	for _, tag := range tags {
		if _, err = tx.Exec(`
INSERT INTO problem_tags(problem_id, tag_name, tag_source, created_at)
VALUES (?, ?, 'platform_raw', ?)
ON CONFLICT(problem_id, tag_name, tag_source) DO NOTHING`, saved.ID, tag, now); err != nil {
			return models.Problem{}, fmt.Errorf("upsert problem: upsert problem tag %q: %w", tag, err)
		}
	}

	if err = tx.Commit(); err != nil {
		return models.Problem{}, fmt.Errorf("upsert problem: commit transaction: %w", err)
	}

	return saved, nil
}

// GetProblems returns problems with optional filters
func (db *DB) GetProblems(opts ProblemQueryOptions) ([]models.Problem, error) {
	var conditions []string
	args := make([]any, 0)

	if opts.Platform != nil {
		conditions = append(conditions, "p.platform = ?")
		args = append(args, *opts.Platform)
	}
	if strings.TrimSpace(opts.TagName) != "" {
		conditions = append(conditions, "EXISTS (SELECT 1 FROM problem_tags pt WHERE pt.problem_id = p.id AND pt.tag_name = ?)")
		args = append(args, strings.TrimSpace(opts.TagName))
	}
	if strings.TrimSpace(opts.Search) != "" {
		conditions = append(conditions, "p.title LIKE ?")
		args = append(args, "%"+strings.TrimSpace(opts.Search)+"%")
	}

	query := `
SELECT p.id, p.platform, p.external_problem_id, COALESCE(p.external_contest_id, ''), p.title, COALESCE(p.url, ''), COALESCE(p.difficulty, ''), p.raw_tags_json, p.created_at, p.updated_at
FROM problems p`
	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}
	query += " ORDER BY p.updated_at DESC, p.id DESC"
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
		return nil, fmt.Errorf("get problems: query rows: %w", err)
	}
	defer rows.Close()

	items := make([]models.Problem, 0)
	for rows.Next() {
		item, err := scanProblemRecord(rows)
		if err != nil {
			return nil, fmt.Errorf("get problems: scan row: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get problems: iterate rows: %w", err)
	}

	return items, nil
}

// GetProblemByID returns a single problem by its primary key
func (db *DB) GetProblemByID(id int64) (models.Problem, error) {
	row := db.conn.QueryRow(`
SELECT id, platform, external_problem_id, COALESCE(external_contest_id,''), title,
       COALESCE(url,''), COALESCE(difficulty,''), COALESCE(raw_tags_json,'[]'),
       created_at, updated_at
FROM problems WHERE id = ?`, id)
	var p models.Problem
	var createdAtRaw, updatedAtRaw string
	err := row.Scan(
		&p.ID, &p.Platform, &p.ExternalProblemID, &p.ExternalContestID, &p.Title,
		&p.URL, &p.Difficulty, &p.RawTagsJSON,
		&createdAtRaw, &updatedAtRaw,
	)
	if err != nil {
		return p, err
	}
	p.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return p, fmt.Errorf("parse problem created_at: %w", err)
	}
	p.UpdatedAt, err = parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return p, fmt.Errorf("parse problem updated_at: %w", err)
	}
	return p, nil
}

// ProblemAnalysisData holds all data needed for single-problem AI analysis
type ProblemAnalysisData struct {
	ProblemID         int64            `json:"problemId"`
	ExternalProblemID string           `json:"externalProblemId"`
	Title             string           `json:"title"`
	Platform          string           `json:"platform"`
	Tags              []string         `json:"tags"`
	Notes             string           `json:"notes"`
	Submissions       []map[string]any `json:"submissions"`
}

// GetProblemAnalysisData returns all data needed for AI analysis of a problem
func (db *DB) GetProblemAnalysisData(problemID int64) (*ProblemAnalysisData, error) {
	// 1. Problem metadata
	row := db.conn.QueryRow(`
SELECT id, COALESCE(external_problem_id,''), COALESCE(title,''), COALESCE(platform,'')
FROM problems WHERE id = ?`, problemID)
	var d ProblemAnalysisData
	d.ProblemID = problemID
	if err := row.Scan(&d.ProblemID, &d.ExternalProblemID, &d.Title, &d.Platform); err != nil {
		return nil, fmt.Errorf("get problem analysis data: problem not found: %w", err)
	}

	// 2. Tags
	tagRows, err := db.conn.Query(`SELECT tag_name FROM problem_tags WHERE problem_id = ?`, problemID)
	if err != nil {
		return nil, fmt.Errorf("get problem analysis data: tags: %w", err)
	}
	defer tagRows.Close()
	d.Tags = make([]string, 0)
	for tagRows.Next() {
		var t string
		if err := tagRows.Scan(&t); err != nil {
			return nil, err
		}
		d.Tags = append(d.Tags, t)
	}

	// 3. Notes from review state
	noteRow := db.conn.QueryRow(`SELECT COALESCE(notes,'') FROM problem_review_states WHERE problem_id = ?`, problemID)
	_ = noteRow.Scan(&d.Notes) // ok if no row (notes stays "")

	// 4. Submissions (all, ordered by time)
	subRows, err := db.conn.Query(`
SELECT verdict, COALESCE(language,''), submitted_at,
     COALESCE(exec_time_ms, 0), COALESCE(memory_kb, 0)
FROM submissions WHERE problem_id = ? ORDER BY submitted_at ASC`, problemID)
	if err != nil {
		return nil, fmt.Errorf("get problem analysis data: submissions: %w", err)
	}
	defer subRows.Close()
	d.Submissions = make([]map[string]any, 0)
	for subRows.Next() {
		var verdict, lang, submittedAt string
		var execMs, memKb int
		if err := subRows.Scan(&verdict, &lang, &submittedAt, &execMs, &memKb); err != nil {
			return nil, err
		}
		d.Submissions = append(d.Submissions, map[string]any{
			"verdict":         verdict,
			"language":        lang,
			"submittedAt":     submittedAt,
			"executionTimeMs": execMs,
			"memoryKb":        memKb,
		})
	}

	return &d, nil
}
