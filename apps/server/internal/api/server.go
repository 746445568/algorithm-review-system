package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"ojreviewdesktop/internal/adapters/ai"
	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/app"
	"ojreviewdesktop/internal/buildinfo"
	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/models"
	"ojreviewdesktop/internal/srs"
	"ojreviewdesktop/internal/storage"
)

const sqliteBusyUserMessage = "当前有并发分析或同步任务占用数据库，请稍后重试"

type Server struct {
	cfg      app.Config
	db       *storage.DB
	queue    *jobs.Queue
	adapters map[models.Platform]judges.Adapter
	mux      *http.ServeMux
}

func NewServer(cfg app.Config, db *storage.DB, queue *jobs.Queue) *Server {
	s := &Server{
		cfg:   cfg,
		db:    db,
		queue: queue,
		adapters: map[models.Platform]judges.Adapter{
			models.PlatformCodeforces: judges.NewCodeforcesAdapter(),
			models.PlatformAtCoder:    judges.NewAtCoderAdapter(),
		},
		mux: http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) Router() http.Handler { return s.corsMiddleware(s.mux) }

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Use configured allowed origins, default to "*" if not set
		origins := s.cfg.AllowedOrigins
		if len(origins) == 0 {
			origins = []string{"*"}
		}
		// For simplicity, use the first origin in the list or "*"
		origin := origins[0]
		if origin == "" {
			origin = "*"
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) Adapters() map[models.Platform]judges.Adapter { return s.adapters }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /health", s.handleHealth)
	s.mux.HandleFunc("GET /api/system/capabilities", s.handleCapabilities)
	s.mux.HandleFunc("GET /api/me", s.handleMe)
	s.mux.HandleFunc("GET /api/accounts", s.handleAccounts)
	s.mux.HandleFunc("PUT /api/accounts/{platform}", s.handleUpsertAccount)
	s.mux.HandleFunc("DELETE /api/accounts/{id}", s.handleDeleteAccount)
	s.mux.HandleFunc("POST /api/accounts/{platform}/sync", s.handleSyncAccount)
	s.mux.HandleFunc("GET /api/sync-tasks", s.handleSyncTasks)
	s.mux.HandleFunc("GET /api/submissions", s.handleSubmissions)
	s.mux.HandleFunc("GET /api/problems", s.handleProblems)
	s.mux.HandleFunc("GET /api/review/summary", s.handleReviewSummary)
	s.mux.HandleFunc("GET /api/review/items/{problemId}", s.handleGetProblemReviewState)
	s.mux.HandleFunc("PUT /api/review/items/{problemId}", s.handlePutProblemReviewState)
	s.mux.HandleFunc("POST /api/review/items/{problemId}/rate", s.handleRateReview)
	s.mux.HandleFunc("GET /api/contests", s.handleContests)
	s.mux.HandleFunc("POST /api/contests/sync", s.handleSyncContests)
	s.mux.HandleFunc("POST /api/analysis/generate", s.handleAnalysisGenerate)
	s.mux.HandleFunc("POST /api/analysis/generate-comparison", s.handleAnalysisGenerateComparison)
	s.mux.HandleFunc("POST /api/analysis/generate-problem/{problemId}", s.handleAnalysisGenerateProblem)
	s.mux.HandleFunc("GET /api/analysis/latest", s.handleAnalysisLatest)
	s.mux.HandleFunc("GET /api/analysis/{taskId}", s.handleAnalysisTask)
	s.mux.HandleFunc("GET /api/settings/ai", s.handleGetAISettings)
	s.mux.HandleFunc("PUT /api/settings/ai", s.handlePutAISettings)
	s.mux.HandleFunc("POST /api/settings/ai/test", s.handleTestAISettings)
	s.mux.HandleFunc("GET /api/settings/theme", s.handleGetTheme)
	s.mux.HandleFunc("PUT /api/settings/theme", s.handlePutTheme)
	s.mux.HandleFunc("POST /api/settings/data/backup", s.handleBackup)
	s.mux.HandleFunc("POST /api/settings/data/restore", s.handleRestore)
	s.mux.HandleFunc("POST /api/settings/data/export-diagnostics", s.handleExportDiagnostics)
	s.mux.HandleFunc("POST /api/accounts/{id}/refresh-rating", s.handleRefreshRating)
	s.mux.HandleFunc("GET /api/goals", s.handleGetGoals)
	s.mux.HandleFunc("POST /api/goals", s.handleCreateGoal)
	s.mux.HandleFunc("DELETE /api/goals/{id}", s.handleDeleteGoal)
	s.mux.HandleFunc("GET /api/statistics/submissions", s.handleSubmissionStats)
	s.mux.HandleFunc("GET /api/statistics/reviews", s.handleReviewStats)
	s.mux.HandleFunc("GET /api/problems/{problemId}/chats", s.handleListChats)
	s.mux.HandleFunc("POST /api/problems/{problemId}/chats", s.handleSendChat)
	s.mux.HandleFunc("DELETE /api/problems/{problemId}/chats", s.handleDeleteChats)
	s.mux.HandleFunc("GET /api/analysis/problem/{problemId}/history", s.handleAnalysisProblemHistory)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	settings, err := s.db.LoadAISettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	firstRun := settings.APIKey == ""

	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"version":   buildinfo.Version,
		"commit":    buildinfo.Commit,
		"firstRun":  firstRun,
	})
}

func (s *Server) handleCapabilities(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"reviewStateSupported":       true,
		"aiSettingsSupported":        true,
		"diagnosticsExportSupported": true,
		"serviceVersion":             buildinfo.Version,
		"serviceCommit":              buildinfo.Commit,
	})
}

func (s *Server) handleMe(w http.ResponseWriter, _ *http.Request) {
	owner, err := s.db.Owner()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"owner": owner,
		"app": map[string]any{
			"name":       "OJ Review Desktop",
			"dataDir":    s.cfg.DataDir,
			"logDir":     s.cfg.LogDir,
			"secureDir":  s.cfg.SecureDir,
			"version":    buildinfo.Version,
			"commit":     buildinfo.Commit,
			"singleUser": true,
		},
	})
}

func (s *Server) handleAccounts(w http.ResponseWriter, _ *http.Request) {
	accounts, err := s.db.ListAccounts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, accounts)
}

func (s *Server) handleUpsertAccount(w http.ResponseWriter, r *http.Request) {
	platform := parsePlatform(r.PathValue("platform"))
	if platform == "" || platform == models.PlatformManual {
		writeError(w, http.StatusBadRequest, "unsupported platform")
		return
	}
	var payload struct {
		Handle string `json:"handle"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	payload.Handle = strings.TrimSpace(payload.Handle)
	if payload.Handle == "" {
		writeError(w, http.StatusBadRequest, "handle is required")
		return
	}
	if adapter, ok := s.adapters[platform]; ok {
		if err := adapter.ValidateAccount(r.Context(), payload.Handle); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	account, err := s.db.UpsertAccount(platform, payload.Handle)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, account)
}

func (s *Server) handleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid account id")
		return
	}
	if err := s.db.DeleteAccount(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

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
	task, err := s.db.CreateSyncTask(payload.AccountID, account.LastCursor)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}

	taskID := task.ID
	accountID := account.ID
	enqueued := s.queue.Enqueue(jobs.Job{
		Key:      jobs.SyncJobKey(accountID),
		TaskType: models.TaskTypeSync,
		TaskID:   taskID,
		Run: func(ctx context.Context) error {
			return s.runSyncTask(ctx, accountID, taskID, platform)
		},
	})
	if !enqueued {
		writeError(w, http.StatusConflict, "sync task already queued for this account")
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

func (s *Server) handleReviewSummary(w http.ResponseWriter, _ *http.Request) {
	summary, err := s.db.GetReviewSummary()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, summary)
}

func (s *Server) handleGetProblemReviewState(w http.ResponseWriter, r *http.Request) {
	problemID, err := strconv.ParseInt(r.PathValue("problemId"), 10, 64)
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}

	state, err := s.db.GetProblemReviewState(problemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handlePutProblemReviewState(w http.ResponseWriter, r *http.Request) {
	problemID, err := strconv.ParseInt(r.PathValue("problemId"), 10, 64)
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}

	var payload struct {
		Status       models.ReviewStatus `json:"status"`
		Notes        string              `json:"notes"`
		NextReviewAt *time.Time          `json:"nextReviewAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}

	state, err := s.db.SaveProblemReviewState(models.ProblemReviewState{
		ProblemID:    problemID,
		Status:       payload.Status,
		Notes:        payload.Notes,
		NextReviewAt: payload.NextReviewAt,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleRateReview(w http.ResponseWriter, r *http.Request) {
	problemID, err := strconv.ParseInt(r.PathValue("problemId"), 10, 64)
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}

	var payload struct {
		Quality int `json:"quality"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.Quality < 0 || payload.Quality > 5 {
		writeError(w, http.StatusBadRequest, "quality must be between 0 and 5")
		return
	}

	current, err := s.db.GetProblemReviewState(problemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	result := srs.Calculate(srs.ReviewInput{
		Quality:         payload.Quality,
		EaseFactor:      current.EaseFactor,
		IntervalDays:    current.IntervalDays,
		RepetitionCount: current.RepetitionCount,
	})

	current.Status = models.ReviewStatusScheduled
	current.EaseFactor = result.EaseFactor
	current.IntervalDays = result.IntervalDays
	current.RepetitionCount = result.RepetitionCount
	current.LastQuality = &payload.Quality
	current.NextReviewAt = &result.NextReviewAt

	saved, err := s.db.SaveProblemReviewState(current)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) handleContests(w http.ResponseWriter, r *http.Request) {
	opts := storage.ContestQueryOptions{
		Status: strings.TrimSpace(r.URL.Query().Get("status")),
		Limit:  parseQueryInt(r, "limit", 20),
		Offset: parseQueryInt(r, "offset", 0),
	}
	if platform := parseQueryPlatform(r); platform != nil {
		opts.Platform = platform
	}
	contests, err := s.db.GetContests(opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, contests)
}

func (s *Server) handleSyncContests(w http.ResponseWriter, r *http.Request) {
	inserted := 0
	ctx := r.Context()
	for platform, adapter := range s.adapters {
		contestAdapter, ok := adapter.(judges.ContestAdapter)
		if !ok {
			continue
		}
		contests, err := contestAdapter.FetchContests(ctx)
		if err != nil {
			writeError(w, http.StatusBadGateway, fmt.Sprintf("sync contests for %s failed: %v", platform, err))
			return
		}
		for _, contest := range contests {
			if _, err := s.db.UpsertContest(contest); err == nil {
				inserted++
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"updated": inserted,
	})
}

// parsePeriodBounds returns the [start, end] of the requested calendar period
// relative to now. "week" = Mon–Sun of current ISO week; "month" = 1st–last of current month.
func parsePeriodBounds(period string, now time.Time) (start, end time.Time, err error) {
	now = now.UTC()
	switch period {
	case "week":
		weekday := int(now.Weekday())
		if weekday == 0 {
			weekday = 7 // Sunday → 7 in ISO week
		}
		monday := now.AddDate(0, 0, -(weekday - 1))
		start = time.Date(monday.Year(), monday.Month(), monday.Day(), 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 0, 7).Add(-time.Nanosecond)
		return
	case "month":
		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		end = start.AddDate(0, 1, 0).Add(-time.Nanosecond)
		return
	default:
		err = fmt.Errorf("unknown period %q: must be 'week' or 'month'", period)
		return
	}
}

func (s *Server) handleAnalysisGenerate(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Period          string `json:"period"`
		Provider        string `json:"provider"`
		Model           string `json:"model"`
		InputSnapshotID int64  `json:"inputSnapshotId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}

	settings, err := s.db.LoadAISettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if payload.Provider == "" {
		payload.Provider = settings.Provider
	}
	if payload.Model == "" {
		payload.Model = settings.Model
	}
	if payload.Provider == "" || payload.Model == "" {
		writeError(w, http.StatusBadRequest, "provider and model are required; configure AI settings first")
		return
	}
	if payload.InputSnapshotID == 0 {
		var summary map[string]any
		if payload.Period == "" || payload.Period == "all" {
			summary, err = s.db.GetReviewSummary()
		} else {
			var periodStart, periodEnd time.Time
			periodStart, periodEnd, err = parsePeriodBounds(payload.Period, time.Now())
			if err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}
			summary, err = s.db.GetReviewSummaryForPeriod(periodStart, periodEnd)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		summaryJSON, err := json.Marshal(summary)
		if err != nil {
			writeError(w, http.StatusInternalServerError, normalizeAnalysisCreationError(err).Error())
			return
		}
		task, reused, err := s.db.CreateAnalysisTaskWithTypedSnapshot(
			payload.Provider,
			payload.Model,
			string(summaryJSON),
			"global",
			nil,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, normalizeAnalysisCreationError(err).Error())
			return
		}
		if !reused {
			taskID := task.ID
			_ = s.queue.Enqueue(jobs.Job{
				Key:      jobs.AnalysisJobKey(taskID),
				TaskType: models.TaskTypeAnalysis,
				TaskID:   taskID,
				Run: func(ctx context.Context) error {
					return s.runAnalysisTask(ctx, taskID)
				},
			})
		}
		writeJSON(w, http.StatusAccepted, map[string]any{
			"task":   task,
			"reused": reused,
		})
		return
	}
	task, reused, err := s.db.CreateAnalysisTask(payload.Provider, payload.Model, payload.InputSnapshotID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, normalizeAnalysisCreationError(err).Error())
		return
	}
	if !reused {
		taskID := task.ID
		_ = s.queue.Enqueue(jobs.Job{
			Key:      jobs.AnalysisJobKey(taskID),
			TaskType: models.TaskTypeAnalysis,
			TaskID:   taskID,
			Run: func(ctx context.Context) error {
				return s.runAnalysisTask(ctx, taskID)
			},
		})
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"task":   task,
		"reused": reused,
	})
}

func (s *Server) handleAnalysisTask(w http.ResponseWriter, r *http.Request) {
	taskID, err := parseTaskID(r.PathValue("taskId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid task id")
		return
	}
	task, err := s.db.GetAnalysisTask(taskID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "analysis task not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) handleAnalysisGenerateComparison(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Period   string `json:"period"`
		Provider string `json:"provider"`
		Model    string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.Period == "" {
		writeError(w, http.StatusBadRequest, "period is required")
		return
	}

	settings, err := s.db.LoadAISettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if payload.Provider == "" {
		payload.Provider = settings.Provider
	}
	if payload.Model == "" {
		payload.Model = settings.Model
	}
	if payload.Provider == "" || payload.Model == "" {
		writeError(w, http.StatusBadRequest, "provider and model are required; configure AI settings first")
		return
	}

	now := time.Now()
	thisStart, thisEnd, err := parsePeriodBounds(payload.Period, now)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// Previous period: same duration, immediately before this one
	duration := thisEnd.Sub(thisStart) + time.Nanosecond
	prevEnd := thisStart.Add(-time.Nanosecond)
	prevStart := prevEnd.Add(-duration).Add(time.Nanosecond)

	thisSummary, err := s.db.GetReviewSummaryForPeriod(thisStart, thisEnd)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	prevSummary, err := s.db.GetReviewSummaryForPeriod(prevStart, prevEnd)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	combined := map[string]any{
		"type":       "comparison",
		"period":     payload.Period,
		"thisPeriod": thisSummary,
		"prevPeriod": prevSummary,
	}
	combinedJSON, err := json.Marshal(combined)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	task, reused, err := s.db.CreateAnalysisTaskWithTypedSnapshot(
		payload.Provider,
		payload.Model,
		string(combinedJSON),
		"global_comparison",
		nil,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, normalizeAnalysisCreationError(err).Error())
		return
	}
	if !reused {
		taskID := task.ID
		_ = s.queue.Enqueue(jobs.Job{
			Key:      jobs.AnalysisJobKey(taskID),
			TaskType: models.TaskTypeAnalysis,
			TaskID:   taskID,
			Run: func(ctx context.Context) error {
				return s.runAnalysisTask(ctx, taskID)
			},
		})
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"task": task, "reused": reused})
}

func (s *Server) handleAnalysisGenerateProblem(w http.ResponseWriter, r *http.Request) {
	problemID, err := parseTaskID(r.PathValue("problemId")) // reuses the int64 parser
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}

	var payload struct {
		Provider string `json:"provider"`
		Model    string `json:"model"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}

	settings, err := s.db.LoadAISettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if payload.Provider == "" {
		payload.Provider = settings.Provider
	}
	if payload.Model == "" {
		payload.Model = settings.Model
	}
	if payload.Provider == "" || payload.Model == "" {
		writeError(w, http.StatusBadRequest, "provider and model are required; configure AI settings first")
		return
	}

	data, err := s.db.GetProblemAnalysisData(problemID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "problem not found")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if len(data.Submissions) == 0 {
		writeError(w, http.StatusBadRequest, "该题暂无提交记录，无法进行 AI 分析")
		return
	}

	dataJSON, err := json.Marshal(data)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	task, reused, err := s.db.CreateAnalysisTaskWithTypedSnapshot(
		payload.Provider,
		payload.Model,
		string(dataJSON),
		"problem",
		&problemID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, normalizeAnalysisCreationError(err).Error())
		return
	}
	if !reused {
		taskID := task.ID
		_ = s.queue.Enqueue(jobs.Job{
			Key:      jobs.AnalysisJobKey(taskID),
			TaskType: models.TaskTypeAnalysis,
			TaskID:   taskID,
			Run: func(ctx context.Context) error {
				return s.runAnalysisTask(ctx, taskID)
			},
		})
	}
	writeJSON(w, http.StatusAccepted, map[string]any{"task": task, "reused": reused})
}

func (s *Server) handleAnalysisLatest(w http.ResponseWriter, _ *http.Request) {
	task, err := s.db.GetLatestGlobalAnalysisTask()
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, task)
}

func (s *Server) handleGetAISettings(w http.ResponseWriter, _ *http.Request) {
	settings, err := s.db.LoadAISettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, settings)
}

func (s *Server) handlePutAISettings(w http.ResponseWriter, r *http.Request) {
	var payload models.AISettings
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if payload.Provider == "" || payload.Model == "" {
		writeError(w, http.StatusBadRequest, "provider and model are required")
		return
	}
	if err := s.db.SaveAISettings(payload); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "saved"})
}

func (s *Server) handleTestAISettings(w http.ResponseWriter, r *http.Request) {
	var payload models.AISettings
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}

	provider, err := ai.NewProvider(payload.Provider)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      false,
			"message": err.Error(),
		})
		return
	}
	err = provider.ValidateConfig(ai.Settings{
		Provider: payload.Provider,
		Model:    payload.Model,
		BaseURL:  payload.BaseURL,
		APIKey:   payload.APIKey,
	})
	ok := err == nil
	message := "configuration is valid"
	if err != nil {
		message = err.Error()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      ok,
		"message": message,
	})
}

func (s *Server) handleGetTheme(w http.ResponseWriter, _ *http.Request) {
	mode, err := s.db.LoadThemeMode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"mode": mode})
}

func (s *Server) handlePutTheme(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		Mode string `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	if err := s.db.SaveThemeMode(payload.Mode); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"mode": strings.ToLower(strings.TrimSpace(payload.Mode))})
}

func (s *Server) handleExportDiagnostics(w http.ResponseWriter, _ *http.Request) {
	path, err := s.db.ExportDiagnostics()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": path})
}

func (s *Server) handleBackup(w http.ResponseWriter, _ *http.Request) {
	backupPath := s.cfg.DBPath + ".bak." + time.Now().Format("20060102-150405")

	src, err := os.Open(s.cfg.DBPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer src.Close()

	dst, err := os.Create(backupPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"backupPath": backupPath})
}

func (s *Server) handleRestore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		BackupPath string `json:"backupPath"`
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.BackupPath == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "backupPath required"})
		return
	}
	if filepath.Dir(body.BackupPath) != filepath.Dir(s.cfg.DBPath) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "invalid backup path"})
		return
	}

	src, err := os.Open(body.BackupPath)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"error": err.Error()})
		return
	}
	defer src.Close()

	dst, err := os.Create(s.cfg.DBPath)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"restored": true})
}

func (s *Server) notImplemented(feature string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "not_implemented",
			"feature": feature,
		})
	}
}

func parsePlatform(raw string) models.Platform {
	switch strings.ToUpper(raw) {
	case "CODEFORCES":
		return models.PlatformCodeforces
	case "ATCODER":
		return models.PlatformAtCoder
	case "MANUAL":
		return models.PlatformManual
	default:
		return ""
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func normalizeAnalysisCreationError(err error) error {
	if err == nil {
		return nil
	}

	message := strings.ToLower(err.Error())
	if strings.Contains(message, "database is locked") || strings.Contains(message, "sqlite_busy") {
		return errors.New(sqliteBusyUserMessage)
	}

	return err
}

func parseTaskID(raw string) (int64, error) {
	return strconv.ParseInt(raw, 10, 64)
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

func (s *Server) ResumeAnalysisTask(ctx context.Context, taskID int64) error {
	return s.runAnalysisTask(ctx, taskID)
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

// handleSubmissions returns submissions with filtering
func (s *Server) handleSubmissions(w http.ResponseWriter, r *http.Request) {
	opts := storage.SubmissionQueryOptions{
		Limit:  parseQueryInt(r, "limit", 50),
		Offset: parseQueryInt(r, "offset", 0),
	}
	if platform := parseQueryPlatform(r); platform != nil {
		opts.Platform = platform
	}
	if accountID := parseQueryInt64(r, "account_id"); accountID != nil {
		opts.PlatformAccountID = accountID
	}
	if verdict := parseQueryVerdict(r); verdict != nil {
		opts.Verdict = verdict
	}

	submissions, err := s.db.GetSubmissions(opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, submissions)
}

// handleProblems returns problems with filtering
func (s *Server) handleProblems(w http.ResponseWriter, r *http.Request) {
	opts := storage.ProblemQueryOptions{
		Limit:   parseQueryInt(r, "limit", 50),
		Offset:  parseQueryInt(r, "offset", 0),
		TagName: r.URL.Query().Get("tag"),
		Search:  r.URL.Query().Get("search"),
	}
	if platform := parseQueryPlatform(r); platform != nil {
		opts.Platform = platform
	}

	problems, err := s.db.GetProblems(opts)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, problems)
}

// parseQueryInt parses an integer query parameter with default
func parseQueryInt(r *http.Request, key string, defaultVal int) int {
	val := r.URL.Query().Get(key)
	if val == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return n
}

// parseQueryInt64 parses an int64 query parameter
func parseQueryInt64(r *http.Request, key string) *int64 {
	val := r.URL.Query().Get(key)
	if val == "" {
		return nil
	}
	n, err := strconv.ParseInt(val, 10, 64)
	if err != nil {
		return nil
	}
	return &n
}

// parseQueryPlatform parses a platform query parameter
func parseQueryPlatform(r *http.Request) *models.Platform {
	val := r.URL.Query().Get("platform")
	if val == "" {
		return nil
	}
	p := parsePlatform(val)
	if p == "" {
		return nil
	}
	return &p
}

// parseQueryVerdict parses a verdict query parameter
func parseQueryVerdict(r *http.Request) *models.Verdict {
	val := r.URL.Query().Get("verdict")
	if val == "" {
		return nil
	}
	v := models.Verdict(strings.ToUpper(val))
	return &v
}

func (s *Server) runAnalysisTask(ctx context.Context, taskID int64) error {
	task, err := s.db.GetAnalysisTask(taskID)
	if err != nil {
		return err
	}
	snapshot, err := s.db.GetReviewSnapshot(task.InputSnapshotID)
	if err != nil {
		return s.db.MarkAnalysisTaskFinished(taskID, models.TaskFailed, "", "", "load snapshot failed: "+err.Error())
	}

	settings, err := s.db.LoadAISettings()
	if err != nil {
		return s.db.MarkAnalysisTaskFinished(taskID, models.TaskFailed, "", "", "load AI settings failed: "+err.Error())
	}
	settings.Provider = task.Provider
	settings.Model = task.Model

	provider, err := ai.NewProvider(settings.Provider)
	if err != nil {
		return s.db.MarkAnalysisTaskFinished(taskID, models.TaskFailed, "", "", err.Error())
	}

	resultText, resultJSON, err := provider.Analyze(ctx, snapshot.SummaryJSON, ai.Settings{
		Provider: settings.Provider,
		Model:    settings.Model,
		BaseURL:  settings.BaseURL,
		APIKey:   settings.APIKey,
	})
	if err != nil {
		return s.db.MarkAnalysisTaskFinished(taskID, models.TaskFailed, "", resultJSON, err.Error())
	}

	return s.db.MarkAnalysisTaskFinished(taskID, models.TaskSuccess, resultText, resultJSON, "")
}

func (s *Server) handleRefreshRating(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid account id")
		return
	}
	acc, err := s.db.GetAccount(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "account not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	account := &acc
	adapter, ok := s.adapters[account.Platform]
	if !ok {
		writeError(w, http.StatusBadRequest, "unsupported platform")
		return
	}
	profile, err := adapter.FetchProfile(r.Context(), account.ExternalHandle)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.db.UpdateAccountRating(id, profile.Rating, profile.MaxRating); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rating": profile.Rating, "maxRating": profile.MaxRating})
}

func (s *Server) handleGetGoals(w http.ResponseWriter, r *http.Request) {
	goals, err := s.db.GetGoals(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if goals == nil {
		goals = []models.Goal{}
	}
	writeJSON(w, http.StatusOK, goals)
}

func (s *Server) handleCreateGoal(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Platform     string  `json:"platform"`
		Title        string  `json:"title"`
		TargetRating int     `json:"targetRating"`
		Deadline     *string `json:"deadline"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if input.Title == "" || input.TargetRating <= 0 {
		writeError(w, http.StatusBadRequest, "title and targetRating are required")
		return
	}
	g := models.Goal{
		Platform:     input.Platform,
		Title:        input.Title,
		TargetRating: input.TargetRating,
	}
	if input.Deadline != nil {
		g.Deadline = *input.Deadline
	}
	created, err := s.db.CreateGoal(r.Context(), g)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, created)
}

func (s *Server) handleDeleteGoal(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := s.db.DeleteGoal(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSubmissionStats(w http.ResponseWriter, _ *http.Request) {
	byWeek, err := s.db.GetSubmissionStatsByWeek(12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tagStats, err := s.db.GetTagAccuracyStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if byWeek == nil {
		byWeek = []map[string]any{}
	}
	if tagStats == nil {
		tagStats = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"byWeek": byWeek, "byTag": tagStats})
}

func (s *Server) handleReviewStats(w http.ResponseWriter, _ *http.Request) {
	daily, err := s.db.GetDailyReviewCounts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if daily == nil {
		daily = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"daily": daily})
}

// handleListChats returns all chat messages for a problem.
func (s *Server) handleListChats(w http.ResponseWriter, r *http.Request) {
	problemID, err := strconv.ParseInt(r.PathValue("problemId"), 10, 64)
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}
	chats, err := s.db.ListProblemChats(problemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, chats)
}

// handleSendChat saves a user message and returns an AI assistant reply.
func (s *Server) handleSendChat(w http.ResponseWriter, r *http.Request) {
	problemID, err := strconv.ParseInt(r.PathValue("problemId"), 10, 64)
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}

	var body struct {
		Message string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	body.Message = strings.TrimSpace(body.Message)
	if body.Message == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}

	settings, err := s.db.LoadAISettings()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if settings.Provider == "" || settings.Model == "" || settings.APIKey == "" {
		writeError(w, http.StatusBadRequest, "请先配置 AI 服务")
		return
	}

	// Save user message
	userMsg, err := s.db.InsertProblemChat(models.ProblemChat{
		ProblemID: problemID,
		Role:      "user",
		Content:   body.Message,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = userMsg

	// Build context: review notes, latest analysis (statement fetching disabled)
	notes := ""
	if state, stateErr := s.db.GetProblemReviewState(problemID); stateErr == nil {
		notes = state.Notes
	}

	latestAnalysis := ""
	if task, taskErr := s.db.GetLatestProblemAnalysisTask(problemID); taskErr == nil && task.ResultText != "" {
		latestAnalysis = task.ResultText
	}

	systemPrompt := "你是一位算法竞赛教练，请用中文回答用户的问题。"
	var contextParts []string
	if notes != "" {
		contextParts = append(contextParts, "【用户笔记】"+notes)
	}
	if latestAnalysis != "" {
		contextParts = append(contextParts, "【最新分析】"+latestAnalysis)
	}

	userPrompt := body.Message
	if len(contextParts) > 0 {
		userPrompt = strings.Join(contextParts, "\n\n") + "\n\n" + body.Message
	}

	aiSettings := ai.Settings{
		Provider: settings.Provider,
		Model:    settings.Model,
		BaseURL:  settings.BaseURL,
		APIKey:   settings.APIKey,
	}

	reply, err := ai.Complete(systemPrompt, userPrompt, aiSettings)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "AI 回复失败: "+err.Error())
		return
	}

	assistantMsg, err := s.db.InsertProblemChat(models.ProblemChat{
		ProblemID: problemID,
		Role:      "assistant",
		Content:   reply,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, assistantMsg)
}

// handleDeleteChats clears all chat messages for a problem.
func (s *Server) handleDeleteChats(w http.ResponseWriter, r *http.Request) {
	problemID, err := strconv.ParseInt(r.PathValue("problemId"), 10, 64)
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}
	if err := s.db.DeleteProblemChats(problemID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleAnalysisProblemHistory returns all analysis tasks for a problem (via review_snapshots.problem_id).
func (s *Server) handleAnalysisProblemHistory(w http.ResponseWriter, r *http.Request) {
	problemID, err := strconv.ParseInt(r.PathValue("problemId"), 10, 64)
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}
	tasks, err := s.db.ListProblemAnalysisTasks(problemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, tasks)
}

// translateContent calls AI to translate content to Chinese.
// Returns empty string on failure (best-effort, non-blocking).
func (s *Server) translateContent(ctx context.Context, content string, settings models.AISettings) string {
	provider, err := ai.NewProvider(settings.Provider)
	if err != nil {
		return ""
	}
	prompt := "将以下竞赛题面翻译为中文，保留数学公式 $...$ 格式，输出 Markdown，不要加任何解释：\n\n" + content
	result, _, err := provider.Analyze(ctx, prompt, ai.Settings{
		Provider: settings.Provider,
		Model:    settings.Model,
		BaseURL:  settings.BaseURL,
		APIKey:   settings.APIKey,
	})
	if err != nil {
		return ""
	}
	return result
}
