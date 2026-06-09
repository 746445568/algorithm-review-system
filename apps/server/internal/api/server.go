package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"ojreviewdesktop/internal/adapters/ai"
	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/app"
	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/models"
	"ojreviewdesktop/internal/storage"
)

const sqliteBusyUserMessage = "当前有并发分析或同步任务占用数据库，请稍后重试"

type Server struct {
	cfg      app.Config
	db       *storage.DB
	queue    jobEnqueuer
	adapters map[models.Platform]judges.Adapter
	mux      *http.ServeMux
	autoSync *AutoSyncManager
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
		origins := s.cfg.AllowedOrigins
		if len(origins) == 0 {
			origins = []string{"*"}
		}

		// Check if wildcard is allowed
		wildcard := false
		for _, o := range origins {
			if o == "*" {
				wildcard = true
				break
			}
		}

		reqOrigin := r.Header.Get("Origin")
		if wildcard {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if reqOrigin != "" {
			matched := false
			for _, o := range origins {
				if o == reqOrigin {
					matched = true
					break
				}
			}
			if !matched {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", reqOrigin)
		}

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
	s.mux.HandleFunc("GET /api/sync/status", s.handleSyncStatus)
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
	s.mux.HandleFunc("GET /api/statistics/verdicts", s.handleVerdictStats)
	s.mux.HandleFunc("GET /api/problems/{problemId}/chats", s.handleListChats)
	s.mux.HandleFunc("POST /api/problems/{problemId}/chats", s.handleSendChat)
	s.mux.HandleFunc("DELETE /api/problems/{problemId}/chats", s.handleDeleteChats)
	s.mux.HandleFunc("GET /api/analysis/problem/{problemId}/history", s.handleAnalysisProblemHistory)
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

	if err := s.db.Backup(backupPath); err != nil {
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

	if err := s.db.Restore(body.BackupPath); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{"restored": true})
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
	if input.TargetRating <= 0 {
		writeError(w, http.StatusBadRequest, "targetRating is required")
		return
	}
	title := input.Title
	if title == "" {
		title = input.Platform + " 目标 " + strconv.Itoa(input.TargetRating)
	}
	g := models.Goal{
		Platform:     input.Platform,
		Title:        title,
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

func (s *Server) handleVerdictStats(w http.ResponseWriter, _ *http.Request) {
	verdicts, err := s.db.GetVerdictStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if verdicts == nil {
		verdicts = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"verdicts": verdicts})
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
