package storage

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

// scanOwnerProfile scans owner profile from database row
func scanOwnerProfile(scanner interface{ Scan(dest ...any) error }) (models.OwnerProfile, error) {
	var owner models.OwnerProfile
	var createdAtRaw string
	if err := scanner.Scan(&owner.ID, &owner.Name, &createdAtRaw); err != nil {
		return owner, err
	}
	createdAt, err := parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return owner, fmt.Errorf("parse owner created_at: %w", err)
	}
	owner.CreatedAt = createdAt
	return owner, nil
}

// scanPlatformAccount scans platform account from database row
func scanPlatformAccount(scanner interface{ Scan(dest ...any) error }) (models.PlatformAccount, error) {
	var item models.PlatformAccount
	var lastSyncedAtRaw sql.NullString
	var rating sql.NullInt64
	var maxRating sql.NullInt64
	var createdAtRaw string
	var updatedAtRaw string
	if err := scanner.Scan(&item.ID, &item.Platform, &item.ExternalHandle, &item.Status, &lastSyncedAtRaw, &item.LastCursor, &rating, &maxRating, &createdAtRaw, &updatedAtRaw); err != nil {
		return item, err
	}
	if lastSyncedAtRaw.Valid && strings.TrimSpace(lastSyncedAtRaw.String) != "" {
		parsed, err := parseSQLiteTimestamp(lastSyncedAtRaw.String)
		if err != nil {
			return item, fmt.Errorf("parse account last_synced_at: %w", err)
		}
		value := parsed
		item.LastSyncedAt = &value
	}
	if rating.Valid {
		value := int(rating.Int64)
		item.Rating = &value
	}
	if maxRating.Valid {
		value := int(maxRating.Int64)
		item.MaxRating = &value
	}
	createdAt, err := parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse account created_at: %w", err)
	}
	updatedAt, err := parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse account updated_at: %w", err)
	}
	item.CreatedAt = createdAt
	item.UpdatedAt = updatedAt
	return item, nil
}

// scanReviewSnapshot scans review snapshot from database row
func scanReviewSnapshot(scanner interface{ Scan(dest ...any) error }) (models.ReviewSnapshot, error) {
	var snapshot models.ReviewSnapshot
	var generatedAtRaw string
	if err := scanner.Scan(&snapshot.ID, &generatedAtRaw, &snapshot.SummaryJSON); err != nil {
		return snapshot, err
	}
	generatedAt, err := parseSQLiteTimestamp(generatedAtRaw)
	if err != nil {
		return snapshot, fmt.Errorf("parse review snapshot generated_at: %w", err)
	}
	snapshot.GeneratedAt = generatedAt
	return snapshot, nil
}

// scanProblemReviewState scans problem review state from database row
func scanProblemReviewState(scanner interface{ Scan(dest ...any) error }) (models.ProblemReviewState, error) {
	var state models.ProblemReviewState
	var nextReviewAtRaw sql.NullString
	var lastUpdatedAtRaw string
	var lastQuality sql.NullInt64
	if err := scanner.Scan(
		&state.ProblemID, &state.Status, &state.Notes, &nextReviewAtRaw, &lastUpdatedAtRaw,
		&state.EaseFactor, &state.IntervalDays, &state.RepetitionCount, &lastQuality,
	); err != nil {
		return state, err
	}

	lastUpdatedAt, err := parseSQLiteTimestamp(lastUpdatedAtRaw)
	if err != nil {
		return state, fmt.Errorf("parse review state last_updated_at: %w", err)
	}
	state.LastUpdatedAt = lastUpdatedAt

	if nextReviewAtRaw.Valid && strings.TrimSpace(nextReviewAtRaw.String) != "" {
		parsed, err := parseSQLiteTimestamp(nextReviewAtRaw.String)
		if err != nil {
			return state, fmt.Errorf("parse review state next_review_at: %w", err)
		}
		state.NextReviewAt = &parsed
	}

	if lastQuality.Valid {
		q := int(lastQuality.Int64)
		state.LastQuality = &q
	}

	return state, nil
}

// scanContestRecord scans contest from database row
func scanContestRecord(scanner interface{ Scan(dest ...any) error }) (models.Contest, error) {
	var item models.Contest
	var startTimeRaw string
	var createdAtRaw string
	var updatedAtRaw string
	var lastSyncedAtRaw string
	if err := scanner.Scan(
		&item.ID,
		&item.Platform,
		&item.ExternalContestID,
		&item.Name,
		&startTimeRaw,
		&item.DurationMinutes,
		&item.URL,
		&item.Status,
		&createdAtRaw,
		&updatedAtRaw,
		&lastSyncedAtRaw,
	); err != nil {
		return item, err
	}
	startTime, err := parseSQLiteTimestamp(startTimeRaw)
	if err != nil {
		return item, fmt.Errorf("parse contest start_time: %w", err)
	}
	createdAt, err := parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse contest created_at: %w", err)
	}
	updatedAt, err := parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse contest updated_at: %w", err)
	}
	lastSyncedAt, err := parseSQLiteTimestamp(lastSyncedAtRaw)
	if err != nil {
		return item, fmt.Errorf("parse contest last_synced_at: %w", err)
	}
	item.StartTime = startTime
	item.CreatedAt = createdAt
	item.UpdatedAt = updatedAt
	item.LastSyncedAt = &lastSyncedAt
	return item, nil
}

// scanProblemRecord scans problem from database row
func scanProblemRecord(scanner interface{ Scan(dest ...any) error }) (models.Problem, error) {
	var item models.Problem
	var createdAtRaw string
	var updatedAtRaw string

	err := scanner.Scan(
		&item.ID,
		&item.Platform,
		&item.ExternalProblemID,
		&item.ExternalContestID,
		&item.Title,
		&item.URL,
		&item.Difficulty,
		&item.RawTagsJSON,
		&createdAtRaw,
		&updatedAtRaw,
	)
	if err != nil {
		return models.Problem{}, err
	}

	item.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return models.Problem{}, fmt.Errorf("parse created_at: %w", err)
	}
	item.UpdatedAt, err = parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return models.Problem{}, fmt.Errorf("parse updated_at: %w", err)
	}

	return item, nil
}

// scanSubmissionRecord scans submission from database row
func scanSubmissionRecord(scanner interface{ Scan(dest ...any) error }) (models.Submission, error) {
	var item models.Submission
	var platformAccountID sql.NullInt64
	var executionTimeMS sql.NullInt64
	var memoryKB sql.NullInt64
	var submittedAtRaw string
	var createdAtRaw string
	var updatedAtRaw string

	err := scanner.Scan(
		&item.ID,
		&platformAccountID,
		&item.Platform,
		&item.ExternalSubmissionID,
		&item.ProblemID,
		&item.Verdict,
		&item.Language,
		&submittedAtRaw,
		&executionTimeMS,
		&memoryKB,
		&item.SourceContestID,
		&item.RawJSON,
		&createdAtRaw,
		&updatedAtRaw,
	)
	if err != nil {
		return models.Submission{}, err
	}

	if platformAccountID.Valid {
		item.PlatformAccountID = &platformAccountID.Int64
	}
	if executionTimeMS.Valid {
		value := int(executionTimeMS.Int64)
		item.ExecutionTimeMS = &value
	}
	if memoryKB.Valid {
		value := int(memoryKB.Int64)
		item.MemoryKB = &value
	}

	item.SubmittedAt, err = parseSQLiteTimestamp(submittedAtRaw)
	if err != nil {
		return models.Submission{}, fmt.Errorf("parse submitted_at: %w", err)
	}
	item.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return models.Submission{}, fmt.Errorf("parse created_at: %w", err)
	}
	item.UpdatedAt, err = parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return models.Submission{}, fmt.Errorf("parse updated_at: %w", err)
	}

	return item, nil
}

// scanSyncTask scans sync task from database row
func scanSyncTask(scanner interface{ Scan(dest ...any) error }) (models.SyncTask, error) {
	var task models.SyncTask
	var createdAtRaw string
	var startedAtRaw sql.NullString
	var finishedAtRaw sql.NullString
	err := scanner.Scan(&task.ID, &task.PlatformAccountID, &task.TaskType, &task.Status, &task.CursorBefore, &task.CursorAfter, &task.FetchedCount, &task.InsertedCount, &task.RetryCount, &task.ErrorMessage, &createdAtRaw, &startedAtRaw, &finishedAtRaw)
	if err != nil {
		return task, err
	}
	task.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return task, fmt.Errorf("parse sync task created_at: %w", err)
	}
	if startedAtRaw.Valid {
		parsed, parseErr := parseSQLiteTimestamp(startedAtRaw.String)
		if parseErr != nil {
			return task, fmt.Errorf("parse sync task started_at: %w", parseErr)
		}
		task.StartedAt = &parsed
	}
	if finishedAtRaw.Valid {
		parsed, parseErr := parseSQLiteTimestamp(finishedAtRaw.String)
		if parseErr != nil {
			return task, fmt.Errorf("parse sync task finished_at: %w", parseErr)
		}
		task.FinishedAt = &parsed
	}
	return task, nil
}

// scanAnalysisTask scans analysis task from database row
func scanAnalysisTask(scanner interface{ Scan(dest ...any) error }) (models.AnalysisTask, error) {
	var task models.AnalysisTask
	var createdAtRaw string
	var updatedAtRaw string
	err := scanner.Scan(&task.ID, &task.Status, &task.Provider, &task.Model, &task.InputSnapshotID, &task.ResultText, &task.ResultJSON, &task.ErrorMessage, &task.RetryCount, &createdAtRaw, &updatedAtRaw)
	if err != nil {
		return task, err
	}
	task.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return task, fmt.Errorf("parse analysis task created_at: %w", err)
	}
	task.UpdatedAt, err = parseSQLiteTimestamp(updatedAtRaw)
	if err != nil {
		return task, fmt.Errorf("parse analysis task updated_at: %w", err)
	}
	return task, nil
}

// scanProblemChat scans problem chat from database row
func scanProblemChat(scanner interface{ Scan(dest ...any) error }) (models.ProblemChat, error) {
	var c models.ProblemChat
	var createdAtRaw string
	if err := scanner.Scan(&c.ID, &c.ProblemID, &c.Role, &c.Content, &createdAtRaw); err != nil {
		return c, err
	}
	var err error
	c.CreatedAt, err = parseSQLiteTimestamp(createdAtRaw)
	if err != nil {
		return c, fmt.Errorf("parse problem chat created_at: %w", err)
	}
	return c, nil
}

// parseSQLiteTimestamp parses SQLite timestamp string to time.Time
func parseSQLiteTimestamp(raw string) (time.Time, error) {
	if strings.TrimSpace(raw) == "" {
		return time.Time{}, errors.New("empty timestamp")
	}

	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05",
	}
	for _, layout := range layouts {
		if ts, err := time.Parse(layout, raw); err == nil {
			return ts.UTC(), nil
		}
	}

	return time.Time{}, fmt.Errorf("unsupported timestamp format: %q", raw)
}

// parseRawTags parses JSON tags array and deduplicates
func parseRawTags(raw string) ([]string, error) {
	var parsed []any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil, err
	}

	seen := make(map[string]struct{}, len(parsed))
	tags := make([]string, 0, len(parsed))
	for _, token := range parsed {
		tag := strings.TrimSpace(fmt.Sprint(token))
		if tag == "" {
			continue
		}
		if _, exists := seen[tag]; exists {
			continue
		}
		seen[tag] = struct{}{}
		tags = append(tags, tag)
	}

	return tags, nil
}

// splitTagsCSV splits comma-separated tags and deduplicates
func splitTagsCSV(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	parts := strings.Split(raw, ",")
	seen := make(map[string]struct{}, len(parts))
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		tag := strings.TrimSpace(part)
		if tag == "" {
			continue
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		out = append(out, tag)
	}
	return out
}

// nullableString returns nil for empty strings
func nullableString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

// nullableIntPtr returns nil for nil pointers
func nullableIntPtr(value *int) any {
	if value == nil {
		return nil
	}
	return *value
}

// nullableInt64Ptr returns nil for nil pointers
func nullableInt64Ptr(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

// nullableNullString returns nil for empty or invalid strings
func nullableNullString(value sql.NullString) any {
	if !value.Valid || strings.TrimSpace(value.String) == "" {
		return nil
	}
	return value.String
}

// solveRate calculates solve rate percentage
func solveRate(problemCount int, acCount int) float64 {
	if problemCount <= 0 {
		return 0
	}
	rate := (float64(acCount) * 100.0) / float64(problemCount)
	return math.Round(rate*10) / 10
}

// normalizeReviewStatus normalizes review status string
func normalizeReviewStatus(status models.ReviewStatus) models.ReviewStatus {
	switch strings.ToUpper(strings.TrimSpace(string(status))) {
	case string(models.ReviewStatusReviewing):
		return models.ReviewStatusReviewing
	case string(models.ReviewStatusScheduled):
		return models.ReviewStatusScheduled
	case string(models.ReviewStatusDone):
		return models.ReviewStatusDone
	default:
		return models.ReviewStatusTodo
	}
}
