package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

// CreateReviewSnapshot creates a new global review snapshot
func (db *DB) CreateReviewSnapshot(summary map[string]any) (models.ReviewSnapshot, error) {
	bytes, err := json.Marshal(summary)
	if err != nil {
		return models.ReviewSnapshot{}, err
	}
	_, err = db.conn.Exec(`INSERT INTO review_snapshots(summary_json, snapshot_type) VALUES (?, 'global')`, string(bytes))
	if err != nil {
		return models.ReviewSnapshot{}, err
	}
	row := db.conn.QueryRow(`SELECT id, generated_at, summary_json FROM review_snapshots WHERE id = last_insert_rowid()`)
	return scanReviewSnapshot(row)
}

// GetReviewSnapshot returns a review snapshot by ID
func (db *DB) GetReviewSnapshot(id int64) (models.ReviewSnapshot, error) {
	row := db.conn.QueryRow(`SELECT id, generated_at, summary_json FROM review_snapshots WHERE id = ?`, id)
	return scanReviewSnapshot(row)
}

// CreateTypedSnapshotJSON stores a pre-serialised JSON blob with explicit snapshot_type and optional problem_id
func (db *DB) CreateTypedSnapshotJSON(summaryJSON, snapshotType string, problemID *int64) (models.ReviewSnapshot, error) {
	var err error
	if problemID != nil {
		_, err = db.conn.Exec(
			`INSERT INTO review_snapshots(summary_json, snapshot_type, problem_id) VALUES (?, ?, ?)`,
			summaryJSON, snapshotType, *problemID,
		)
	} else {
		_, err = db.conn.Exec(
			`INSERT INTO review_snapshots(summary_json, snapshot_type) VALUES (?, ?)`,
			summaryJSON, snapshotType,
		)
	}
	if err != nil {
		return models.ReviewSnapshot{}, err
	}
	row := db.conn.QueryRow(`SELECT id, generated_at, summary_json FROM review_snapshots WHERE id = last_insert_rowid()`)
	return scanReviewSnapshot(row)
}

// GetReviewSummary aggregates review statistics
func (db *DB) GetReviewSummary() (map[string]any, error) {
	summary := map[string]any{
		"totalSubmissions":     0,
		"acRate":               0.0,
		"weakTags":             []map[string]any{},
		"repeatedFailures":     []map[string]any{},
		"recentUnsolved":       []map[string]any{},
		"problemSummaries":     []map[string]any{},
		"contestGroups":        []map[string]any{},
		"reviewStatusCounts":   map[string]int{},
		"dueReviewCount":       0,
		"scheduledReviewCount": 0,
	}

	// 1. totalSubmissions + acRate
	var totalSubmissions int
	var acCount int
	if err := db.conn.QueryRow(`
		SELECT
			COUNT(*) AS total_submissions,
			COALESCE(SUM(CASE WHEN verdict = ? THEN 1 ELSE 0 END), 0) AS ac_count
		FROM submissions`, models.VerdictAC).Scan(&totalSubmissions, &acCount); err != nil {
		return nil, fmt.Errorf("get review summary: query totals: %w", err)
	}
	summary["totalSubmissions"] = totalSubmissions
	if totalSubmissions > 0 {
		acRate := (float64(acCount) * 100.0) / float64(totalSubmissions)
		summary["acRate"] = math.Round(acRate*10) / 10
	}

	// 2. weakTags: top 5 lowest AC rate, min 3 attempts
	weakTagRows, err := db.conn.Query(`
		SELECT
			pt.tag_name,
			COUNT(*) AS attempts,
			SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count
		FROM problem_tags pt
		JOIN submissions s ON s.problem_id = pt.problem_id
		GROUP BY pt.tag_name
		HAVING COUNT(*) >= 3
		ORDER BY (SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) ASC
		LIMIT 5`, models.VerdictAC, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query weak tags: %w", err)
	}
	defer weakTagRows.Close()

	weakTags := make([]map[string]any, 0, 5)
	for weakTagRows.Next() {
		var tagName string
		var attempts int
		var tagAC int
		if err := weakTagRows.Scan(&tagName, &attempts, &tagAC); err != nil {
			return nil, fmt.Errorf("get review summary: scan weak tags row: %w", err)
		}
		acRate := 0.0
		if attempts > 0 {
			acRate = math.Round(((float64(tagAC) * 100.0 / float64(attempts)) * 10)) / 10
		}
		weakTags = append(weakTags, map[string]any{
			"tag":      tagName,
			"attempts": attempts,
			"acCount":  tagAC,
			"acRate":   acRate,
		})
	}
	summary["weakTags"] = weakTags

	// 3. repeatedFailures: >=3 WA/RE/TLE and no AC
	repeatedRows, err := db.conn.Query(`
		SELECT
			s.problem_id,
			p.external_problem_id,
			p.title,
			COUNT(*) AS failed_count
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		WHERE s.verdict IN (?, ?, ?)
		GROUP BY s.problem_id, p.external_problem_id, p.title
		HAVING COUNT(*) >= 3
		AND NOT EXISTS (
			SELECT 1 FROM submissions s2
			WHERE s2.problem_id = s.problem_id AND s2.verdict = ?
		)
		ORDER BY failed_count DESC
		LIMIT 20`, models.VerdictWA, models.VerdictRE, models.VerdictTLE, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query repeated failures: %w", err)
	}
	defer repeatedRows.Close()

	repeatedFailures := make([]map[string]any, 0)
	for repeatedRows.Next() {
		var problemID int64
		var externalProblemID string
		var title string
		var failedCount int
		if err := repeatedRows.Scan(&problemID, &externalProblemID, &title, &failedCount); err != nil {
			return nil, fmt.Errorf("get review summary: scan repeated failures row: %w", err)
		}
		repeatedFailures = append(repeatedFailures, map[string]any{
			"problemId":         problemID,
			"externalProblemId": externalProblemID,
			"title":             title,
			"failedCount":       failedCount,
		})
	}
	summary["repeatedFailures"] = repeatedFailures

	// 4. recentUnsolved: latest 10 unique problems from non-AC submissions
	recentRows, err := db.conn.Query(`
		SELECT
			s.problem_id,
			p.external_problem_id,
			p.title,
			MAX(s.submitted_at) AS last_submitted_at
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		WHERE s.verdict != ?
		GROUP BY s.problem_id, p.external_problem_id, p.title
		ORDER BY last_submitted_at DESC
		LIMIT 10`, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query recent unsolved: %w", err)
	}
	defer recentRows.Close()

	recentUnsolved := make([]map[string]any, 0, 10)
	for recentRows.Next() {
		var problemID int64
		var externalProblemID string
		var title string
		var lastSubmittedAt string
		if err := recentRows.Scan(&problemID, &externalProblemID, &title, &lastSubmittedAt); err != nil {
			return nil, fmt.Errorf("get review summary: scan recent unsolved row: %w", err)
		}
		recentUnsolved = append(recentUnsolved, map[string]any{
			"problemId":         problemID,
			"externalProblemId": externalProblemID,
			"title":             title,
			"lastSubmittedAt":   lastSubmittedAt,
		})
	}
	summary["recentUnsolved"] = recentUnsolved

	problemRows, err := db.conn.Query(`
		SELECT
			p.id,
			p.external_problem_id,
			p.title,
			p.platform,
			COALESCE(p.external_contest_id, ''),
			COUNT(s.id) AS attempt_count,
			SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count,
			MAX(CASE WHEN s.verdict != ? THEN s.submitted_at END) AS last_failed_at,
			MAX(s.submitted_at) AS last_submitted_at,
			COALESCE((
				SELECT s2.verdict
				FROM submissions s2
				WHERE s2.problem_id = p.id
				ORDER BY s2.submitted_at DESC, s2.id DESC
				LIMIT 1
			), ?) AS latest_verdict,
			COALESCE(GROUP_CONCAT(DISTINCT pt.tag_name), '') AS tags_csv,
			COALESCE(prs.status, ?) AS review_status,
			prs.next_review_at,
			prs.last_updated_at
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		LEFT JOIN problem_tags pt ON pt.problem_id = p.id
		LEFT JOIN problem_review_states prs ON prs.problem_id = p.id
		GROUP BY p.id, p.external_problem_id, p.title, p.platform, p.external_contest_id
		ORDER BY last_submitted_at DESC, p.id DESC
		LIMIT 100`, models.VerdictAC, models.VerdictAC, models.VerdictUnknown, models.ReviewStatusTodo)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query problem summaries: %w", err)
	}
	defer problemRows.Close()

	problemSummaries := make([]map[string]any, 0, 100)
	reviewStatusCounts := map[string]int{
		string(models.ReviewStatusTodo):      0,
		string(models.ReviewStatusReviewing): 0,
		string(models.ReviewStatusScheduled): 0,
		string(models.ReviewStatusDone):      0,
	}
	dueReviewCount := 0
	scheduledReviewCount := 0
	now := time.Now().UTC()
	for problemRows.Next() {
		var problemID int64
		var externalProblemID string
		var title string
		var platform models.Platform
		var contestID string
		var attemptCount int
		var acCount int
		var lastFailedAt sql.NullString
		var lastSubmittedAt string
		var latestVerdict models.Verdict
		var tagsCSV string
		var reviewStatusRaw string
		var nextReviewAtRaw sql.NullString
		var lastReviewUpdatedAtRaw sql.NullString
		if err := problemRows.Scan(
			&problemID,
			&externalProblemID,
			&title,
			&platform,
			&contestID,
			&attemptCount,
			&acCount,
			&lastFailedAt,
			&lastSubmittedAt,
			&latestVerdict,
			&tagsCSV,
			&reviewStatusRaw,
			&nextReviewAtRaw,
			&lastReviewUpdatedAtRaw,
		); err != nil {
			return nil, fmt.Errorf("get review summary: scan problem summary row: %w", err)
		}

		reviewStatus := normalizeReviewStatus(models.ReviewStatus(reviewStatusRaw))
		reviewStatusCounts[string(reviewStatus)]++

		var nextReviewAt any
		reviewDue := false
		if nextReviewAtRaw.Valid && strings.TrimSpace(nextReviewAtRaw.String) != "" {
			parsed, err := parseSQLiteTimestamp(nextReviewAtRaw.String)
			if err != nil {
				return nil, fmt.Errorf("get review summary: parse problem summary next review: %w", err)
			}
			nextReviewAt = parsed
			if !parsed.After(now) {
				reviewDue = true
				dueReviewCount++
			}
			scheduledReviewCount++
		}

		var lastReviewUpdatedAt any
		if lastReviewUpdatedAtRaw.Valid && strings.TrimSpace(lastReviewUpdatedAtRaw.String) != "" {
			parsed, err := parseSQLiteTimestamp(lastReviewUpdatedAtRaw.String)
			if err != nil {
				return nil, fmt.Errorf("get review summary: parse problem summary review update: %w", err)
			}
			lastReviewUpdatedAt = parsed
		}

		problemSummaries = append(problemSummaries, map[string]any{
			"problemId":           problemID,
			"externalProblemId":   externalProblemID,
			"title":               title,
			"platform":            platform,
			"contestId":           contestID,
			"attemptCount":        attemptCount,
			"acCount":             acCount,
			"solvedLater":         acCount > 0,
			"lastFailedAt":        nullableNullString(lastFailedAt),
			"lastSubmittedAt":     lastSubmittedAt,
			"latestVerdict":       latestVerdict,
			"tags":                splitTagsCSV(tagsCSV),
			"reviewStatus":        reviewStatus,
			"nextReviewAt":        nextReviewAt,
			"lastReviewUpdatedAt": lastReviewUpdatedAt,
			"reviewDue":           reviewDue,
		})
	}
	summary["problemSummaries"] = problemSummaries
	summary["reviewStatusCounts"] = reviewStatusCounts
	summary["dueReviewCount"] = dueReviewCount
	summary["scheduledReviewCount"] = scheduledReviewCount

	contestRows, err := db.conn.Query(`
		SELECT
			COALESCE(p.external_contest_id, COALESCE(s.source_contest_id, '')) AS contest_id,
			p.platform,
			COALESCE(c.name, COALESCE(p.external_contest_id, COALESCE(s.source_contest_id, ''))) AS contest_name,
			COUNT(DISTINCT p.id) AS problem_count,
			COUNT(s.id) AS attempt_count,
			SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		LEFT JOIN contests c ON c.platform = p.platform AND c.external_contest_id = COALESCE(p.external_contest_id, s.source_contest_id)
		WHERE COALESCE(p.external_contest_id, COALESCE(s.source_contest_id, '')) != ''
		GROUP BY contest_id, p.platform, contest_name
		ORDER BY attempt_count DESC, contest_name ASC
		LIMIT 50`, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary: query contest groups: %w", err)
	}
	defer contestRows.Close()

	contestGroups := make([]map[string]any, 0, 50)
	for contestRows.Next() {
		var contestID string
		var platform models.Platform
		var contestName string
		var problemCount int
		var attemptCount int
		var acCount int
		if err := contestRows.Scan(&contestID, &platform, &contestName, &problemCount, &attemptCount, &acCount); err != nil {
			return nil, fmt.Errorf("get review summary: scan contest group row: %w", err)
		}
		contestGroups = append(contestGroups, map[string]any{
			"contestId":    contestID,
			"platform":     platform,
			"contestName":  contestName,
			"problemCount": problemCount,
			"attemptCount": attemptCount,
			"acCount":      acCount,
			"solvedRate":   solveRate(problemCount, acCount),
		})
	}
	summary["contestGroups"] = contestGroups

	return summary, nil
}

// GetReviewSummaryForPeriod is like GetReviewSummary but restricts submission data to the half-open interval [start, end]
func (db *DB) GetReviewSummaryForPeriod(start, end time.Time) (map[string]any, error) {
	startStr := start.UTC().Format(time.RFC3339)
	endStr := end.UTC().Format(time.RFC3339)

	summary := map[string]any{
		"totalSubmissions":     0,
		"acRate":               0.0,
		"weakTags":             []map[string]any{},
		"repeatedFailures":     []map[string]any{},
		"recentUnsolved":       []map[string]any{},
		"problemSummaries":     []map[string]any{},
		"contestGroups":        []map[string]any{},
		"reviewStatusCounts":   map[string]int{},
		"dueReviewCount":       0,
		"scheduledReviewCount": 0,
		"periodStart":          startStr,
		"periodEnd":            endStr,
	}

	// 1. totalSubmissions + acRate (period-scoped)
	var totalSubmissions int
	var acCount int
	if err := db.conn.QueryRow(`
		SELECT
			COUNT(*) AS total_submissions,
			COALESCE(SUM(CASE WHEN verdict = ? THEN 1 ELSE 0 END), 0) AS ac_count
		FROM submissions
		WHERE submitted_at BETWEEN ? AND ?`,
		models.VerdictAC, startStr, endStr).Scan(&totalSubmissions, &acCount); err != nil {
		return nil, fmt.Errorf("get review summary period: query totals: %w", err)
	}
	summary["totalSubmissions"] = totalSubmissions
	if totalSubmissions > 0 {
		acRate := math.Round((float64(acCount)*100.0/float64(totalSubmissions))*10) / 10
		summary["acRate"] = acRate
	}

	// 2. weakTags (period-scoped)
	weakTagRows, err := db.conn.Query(`
		SELECT
			pt.tag_name,
			COUNT(*) AS attempts,
			SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) AS ac_count
		FROM problem_tags pt
		JOIN submissions s ON s.problem_id = pt.problem_id
		WHERE s.submitted_at BETWEEN ? AND ?
		GROUP BY pt.tag_name
		HAVING COUNT(*) >= 2
		ORDER BY (SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) ASC
		LIMIT 5`,
		models.VerdictAC, startStr, endStr, models.VerdictAC)
	if err != nil {
		return nil, fmt.Errorf("get review summary period: query weak tags: %w", err)
	}
	defer weakTagRows.Close()

	weakTags := make([]map[string]any, 0, 5)
	for weakTagRows.Next() {
		var tagName string
		var attempts int
		var tagAC int
		if err := weakTagRows.Scan(&tagName, &attempts, &tagAC); err != nil {
			return nil, fmt.Errorf("get review summary period: scan weak tags: %w", err)
		}
		acRate := 0.0
		if attempts > 0 {
			acRate = math.Round(float64(tagAC)*100.0/float64(attempts)*10) / 10
		}
		weakTags = append(weakTags, map[string]any{
			"tag":      tagName,
			"attempts": attempts,
			"acCount":  tagAC,
			"acRate":   acRate,
		})
	}
	summary["weakTags"] = weakTags

	// 3. repeatedFailures (period-scoped)
	repeatedRows, err := db.conn.Query(`
		SELECT
			s.problem_id,
			p.external_problem_id,
			p.title,
			COUNT(*) AS failed_count
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		WHERE s.verdict IN (?, ?, ?) AND s.submitted_at BETWEEN ? AND ?
		GROUP BY s.problem_id, p.external_problem_id, p.title
		HAVING COUNT(*) >= 2
		AND NOT EXISTS (
			SELECT 1 FROM submissions s2
			WHERE s2.problem_id = s.problem_id AND s2.verdict = ?
			  AND s2.submitted_at BETWEEN ? AND ?
		)
		ORDER BY failed_count DESC
		LIMIT 10`,
		models.VerdictWA, models.VerdictRE, models.VerdictTLE, startStr, endStr,
		models.VerdictAC, startStr, endStr)
	if err != nil {
		return nil, fmt.Errorf("get review summary period: query repeated failures: %w", err)
	}
	defer repeatedRows.Close()

	repeatedFailures := make([]map[string]any, 0)
	for repeatedRows.Next() {
		var problemID int64
		var externalProblemID, title string
		var failedCount int
		if err := repeatedRows.Scan(&problemID, &externalProblemID, &title, &failedCount); err != nil {
			return nil, fmt.Errorf("get review summary period: scan repeated failures: %w", err)
		}
		repeatedFailures = append(repeatedFailures, map[string]any{
			"problemId":         problemID,
			"externalProblemId": externalProblemID,
			"title":             title,
			"failedCount":       failedCount,
		})
	}
	summary["repeatedFailures"] = repeatedFailures

	// 4. recentUnsolved (period-scoped)
	recentRows, err := db.conn.Query(`
		SELECT
			s.problem_id,
			p.external_problem_id,
			p.title,
			MAX(s.submitted_at) AS last_submitted_at
		FROM submissions s
		JOIN problems p ON p.id = s.problem_id
		WHERE s.verdict != ? AND s.submitted_at BETWEEN ? AND ?
		GROUP BY s.problem_id, p.external_problem_id, p.title
		ORDER BY last_submitted_at DESC
		LIMIT 10`,
		models.VerdictAC, startStr, endStr)
	if err != nil {
		return nil, fmt.Errorf("get review summary period: query recent unsolved: %w", err)
	}
	defer recentRows.Close()

	recentUnsolved := make([]map[string]any, 0, 10)
	for recentRows.Next() {
		var problemID int64
		var externalProblemID, title, lastSubmittedAt string
		if err := recentRows.Scan(&problemID, &externalProblemID, &title, &lastSubmittedAt); err != nil {
			return nil, fmt.Errorf("get review summary period: scan recent unsolved: %w", err)
		}
		recentUnsolved = append(recentUnsolved, map[string]any{
			"problemId":         problemID,
			"externalProblemId": externalProblemID,
			"title":             title,
			"lastSubmittedAt":   lastSubmittedAt,
		})
	}
	summary["recentUnsolved"] = recentUnsolved

	return summary, nil
}
