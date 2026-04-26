package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"ojreviewdesktop/internal/models"
)

func (s *Server) handleSyncAccount(w http.ResponseWriter, r *http.Request) {
	platform := parsePlatform(r.PathValue("platform"))
	if platform == "" || platform == models.PlatformManual {
		writeError(w, http.StatusBadRequest, "unsupported platform")
		return
	}
	var payload struct {
		AccountID int64 `json:"accountId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	account, err := s.db.GetAccount(payload.AccountID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "account not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	task, err := s.enqueueSyncTask(account)
	if err != nil {
		if isSyncAlreadyQueuedError(err) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"platform": platform,
		"task":     task,
		"note":     "sync execution queued",
	})
}

func (s *Server) handleSyncTasks(w http.ResponseWriter, _ *http.Request) {
	tasks, err := s.db.ListSyncTasks()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

func (s *Server) ResumeSyncTask(ctx context.Context, taskID int64) error {
	task, err := s.db.GetSyncTask(taskID)
	if err != nil {
		return err
	}
	account, err := s.db.GetAccount(task.PlatformAccountID)
	if err != nil {
		return err
	}
	return s.runSyncTask(ctx, account.ID, task.ID, account.Platform)
}

// runSyncTask executes the actual sync with platform adapters
func (s *Server) runSyncTask(ctx context.Context, accountID, taskID int64, platform models.Platform) error {
	account, err := s.db.GetAccount(accountID)
	if err != nil {
		return s.db.MarkSyncTaskFinished(taskID, models.TaskFailed, 0, 0, "account not found: "+err.Error())
	}

	adapter, ok := s.adapters[platform]
	if !ok {
		return s.db.MarkSyncTaskFinished(taskID, models.TaskFailed, 0, 0, "no adapter for platform: "+string(platform))
	}

	fetchedCount := 0
	insertedCount := 0
	cursor := account.LastCursor

	for {
		submissions, nextCursor, err := adapter.FetchSubmissions(ctx, account.ExternalHandle, cursor)
		if err != nil {
			return s.db.MarkSyncTaskFinished(taskID, models.TaskFailed, fetchedCount, insertedCount, "fetch failed: "+err.Error())
		}

		for _, sub := range submissions {
			fetchedCount++

			problemExtID, err := extractProblemID(platform, sub.RawJSON)
			if err != nil {
				continue
			}

			problem, tags, err := adapter.FetchProblemMetadata(ctx, problemExtID)
			if err != nil {
				continue
			}
			if problem.RawTagsJSON == "" && len(tags) > 0 {
				if rawTags, marshalErr := json.Marshal(tags); marshalErr == nil {
					problem.RawTagsJSON = string(rawTags)
				}
			}

			savedProblem, err := s.db.UpsertProblem(problem)
			if err != nil {
				continue
			}

			sub.ProblemID = savedProblem.ID
			sub.PlatformAccountID = &accountID
			_, err = s.db.UpsertSubmission(sub)
			if err == nil {
				insertedCount++
			}

			if fetchedCount%10 == 0 {
				_ = s.db.UpdateSyncTaskProgress(taskID, fetchedCount, insertedCount, cursor)
			}
		}

		_ = s.db.UpdateSyncTaskProgress(taskID, fetchedCount, insertedCount, nextCursor)
		if nextCursor == "" || nextCursor == cursor {
			break
		}
		cursor = nextCursor
	}

	if err := s.db.UpdateAccountCursor(accountID, cursor); err != nil {
		return s.db.MarkSyncTaskFinished(taskID, models.TaskPartialSuccess, fetchedCount, insertedCount, "synced but cursor update failed: "+err.Error())
	}

	return s.db.MarkSyncTaskFinished(taskID, models.TaskSuccess, fetchedCount, insertedCount, "")
}

// extractProblemID extracts the external problem ID from platform-specific raw JSON
func extractProblemID(platform models.Platform, rawJSON string) (string, error) {
	switch platform {
	case models.PlatformCodeforces:
		return extractCodeforcesProblemID(rawJSON)
	case models.PlatformAtCoder:
		return extractAtCoderProblemID(rawJSON)
	default:
		return "", fmt.Errorf("unsupported platform: %s", platform)
	}
}

// extractCodeforcesProblemID extracts problem ID from Codeforces submission JSON
func extractCodeforcesProblemID(rawJSON string) (string, error) {
	// Quick extraction from raw JSON string
	// Looking for "contestId":123,"index":"A" pattern
	var result struct {
		Problem struct {
			ContestID int    `json:"contestId"`
			Index     string `json:"index"`
		} `json:"problem"`
	}
	if err := json.Unmarshal([]byte(rawJSON), &result); err != nil {
		return "", err
	}
	if result.Problem.ContestID == 0 || result.Problem.Index == "" {
		return "", fmt.Errorf("invalid problem data")
	}
	return fmt.Sprintf("%d/%s", result.Problem.ContestID, strings.ToUpper(result.Problem.Index)), nil
}

// extractAtCoderProblemID extracts problem ID from AtCoder submission
func extractAtCoderProblemID(rawJSON string) (string, error) {
	var result struct {
		ProblemID string `json:"problem_id"`
	}
	if err := json.Unmarshal([]byte(rawJSON), &result); err != nil {
		return "", err
	}
	if result.ProblemID == "" {
		return "", fmt.Errorf("invalid problem data")
	}
	return result.ProblemID, nil
}

