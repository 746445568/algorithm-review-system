package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/models"
)

func (s *Server) handleSyncProblemPool(w http.ResponseWriter, r *http.Request) {
	if s.queue == nil {
		writeError(w, http.StatusInternalServerError, "problem pool sync queue unavailable")
		return
	}

	platforms, err := s.parseProblemPoolSyncPlatforms(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if len(platforms) == 0 {
		writeError(w, http.StatusBadRequest, "no supported problem pool providers")
		return
	}

	task, err := s.db.CreateProblemPoolSyncTask(platforms)
	if err != nil {
		if isSyncAlreadyQueuedError(err) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	taskID := task.ID
	if !s.queue.Enqueue(jobs.Job{
		Key:      jobs.ProblemPoolSyncJobKey(),
		TaskType: models.TaskTypeProblemPoolSync,
		TaskID:   taskID,
		Run: func(ctx context.Context) error {
			return s.runProblemPoolSyncTask(ctx, taskID)
		},
	}) {
		_ = s.db.MarkProblemPoolSyncTaskFinished(taskID, models.TaskFailed, 0, 0, 0, "problem pool sync queue rejected job")
		writeError(w, http.StatusConflict, "problem pool sync task already queued")
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"task": task,
		"note": "problem pool sync execution queued",
	})
}

func (s *Server) handleProblemPoolSyncTasks(w http.ResponseWriter, _ *http.Request) {
	tasks, err := s.db.ListProblemPoolSyncTasks()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

func (s *Server) ResumeProblemPoolSyncTask(ctx context.Context, taskID int64) error {
	return s.runProblemPoolSyncTask(ctx, taskID)
}

func (s *Server) runProblemPoolSyncTask(ctx context.Context, taskID int64) error {
	task, err := s.db.GetProblemPoolSyncTask(taskID)
	if err != nil {
		return err
	}

	var platforms []models.Platform
	if err := json.Unmarshal([]byte(task.PlatformsJSON), &platforms); err != nil {
		return s.db.MarkProblemPoolSyncTaskFinished(taskID, models.TaskFailed, 0, 0, 0, "invalid task platforms: "+err.Error())
	}

	fetched := 0
	inserted := 0
	updated := 0
	for _, platform := range platforms {
		select {
		case <-ctx.Done():
			status := models.TaskFailed
			if fetched > 0 || inserted > 0 || updated > 0 {
				status = models.TaskPartialSuccess
			}
			return s.db.MarkProblemPoolSyncTaskFinished(taskID, status, fetched, inserted, updated, ctx.Err().Error())
		default:
		}

		adapter, ok := s.adapters[platform]
		if !ok {
			return s.finishProblemPoolSyncError(taskID, fetched, inserted, updated, fmt.Sprintf("no adapter for platform: %s", platform))
		}
		provider, ok := adapter.(judges.ProblemCatalogProvider)
		if !ok {
			return s.finishProblemPoolSyncError(taskID, fetched, inserted, updated, fmt.Sprintf("platform %s does not support problem catalog", platform))
		}

		items, err := provider.FetchProblemCatalog(ctx)
		if err != nil {
			return s.finishProblemPoolSyncError(taskID, fetched, inserted, updated, fmt.Sprintf("fetch problem catalog for %s failed: %v", platform, err))
		}
		result, err := s.db.UpsertProblemPoolItems(items)
		if err != nil {
			return s.finishProblemPoolSyncError(taskID, fetched, inserted, updated, fmt.Sprintf("save problem catalog for %s failed: %v", platform, err))
		}
		fetched += result.Fetched
		inserted += result.Inserted
		updated += result.Updated
		_ = s.db.UpdateProblemPoolSyncTaskProgress(taskID, fetched, inserted, updated)
	}

	return s.db.MarkProblemPoolSyncTaskFinished(taskID, models.TaskSuccess, fetched, inserted, updated, "")
}

func (s *Server) finishProblemPoolSyncError(taskID int64, fetched, inserted, updated int, message string) error {
	status := models.TaskFailed
	if fetched > 0 || inserted > 0 || updated > 0 {
		status = models.TaskPartialSuccess
	}
	return s.db.MarkProblemPoolSyncTaskFinished(taskID, status, fetched, inserted, updated, message)
}

func (s *Server) parseProblemPoolSyncPlatforms(r *http.Request) ([]models.Platform, error) {
	var payload struct {
		Platforms []string `json:"platforms"`
	}
	if r.Body != nil {
		err := json.NewDecoder(r.Body).Decode(&payload)
		if err != nil && !errors.Is(err, io.EOF) {
			return nil, errors.New("invalid json body")
		}
	}

	seen := make(map[models.Platform]struct{})
	platforms := make([]models.Platform, 0, len(payload.Platforms))
	if len(payload.Platforms) > 0 {
		for _, raw := range payload.Platforms {
			platform := parsePlatform(raw)
			if platform == "" || platform == models.PlatformManual {
				return nil, fmt.Errorf("unsupported platform: %s", strings.TrimSpace(raw))
			}
			if !s.supportsProblemCatalog(platform) {
				return nil, fmt.Errorf("platform %s does not support problem catalog", platform)
			}
			if _, ok := seen[platform]; ok {
				continue
			}
			seen[platform] = struct{}{}
			platforms = append(platforms, platform)
		}
		return platforms, nil
	}

	for _, platform := range []models.Platform{models.PlatformCodeforces, models.PlatformAtCoder} {
		if s.supportsProblemCatalog(platform) {
			platforms = append(platforms, platform)
		}
	}
	return platforms, nil
}

func (s *Server) supportsProblemCatalog(platform models.Platform) bool {
	adapter, ok := s.adapters[platform]
	if !ok {
		return false
	}
	_, ok = adapter.(judges.ProblemCatalogProvider)
	return ok
}
