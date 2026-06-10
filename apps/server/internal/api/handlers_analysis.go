package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ojreviewdesktop/internal/adapters/ai"
	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/models"
)

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
			writeAnalysisError(w, http.StatusInternalServerError, err)
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
			writeAnalysisError(w, http.StatusInternalServerError, err)
			return
		}
		if !reused {
			taskID := task.ID
			if ok := s.queue.Enqueue(jobs.Job{
				Key:      jobs.AnalysisJobKey(taskID),
				TaskType: models.TaskTypeAnalysis,
				TaskID:   taskID,
				Run: func(ctx context.Context) error {
					return s.runAnalysisTask(ctx, taskID)
				},
			}); !ok {
				log.Printf("enqueue analysis task %d: %v", taskID, "queue rejected job")
			}
		}
		writeJSON(w, http.StatusAccepted, map[string]any{
			"task":   task,
			"reused": reused,
		})
		return
	}
	task, reused, err := s.db.CreateAnalysisTask(payload.Provider, payload.Model, payload.InputSnapshotID)
	if err != nil {
		writeAnalysisError(w, http.StatusInternalServerError, err)
		return
	}
	if !reused {
		taskID := task.ID
		if ok := s.queue.Enqueue(jobs.Job{
			Key:      jobs.AnalysisJobKey(taskID),
			TaskType: models.TaskTypeAnalysis,
			TaskID:   taskID,
			Run: func(ctx context.Context) error {
				return s.runAnalysisTask(ctx, taskID)
			},
		}); !ok {
			log.Printf("enqueue analysis task %d: %v", taskID, "queue rejected job")
		}
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
		writeAnalysisError(w, http.StatusInternalServerError, err)
		return
	}
	if !reused {
		taskID := task.ID
		if ok := s.queue.Enqueue(jobs.Job{
			Key:      jobs.AnalysisJobKey(taskID),
			TaskType: models.TaskTypeAnalysis,
			TaskID:   taskID,
			Run: func(ctx context.Context) error {
				return s.runAnalysisTask(ctx, taskID)
			},
		}); !ok {
			log.Printf("enqueue analysis task %d: %v", taskID, "queue rejected job")
		}
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

	s.ensureProblemAnalysisArtifacts(r.Context(), problemID)

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
		writeErrorWithCode(w, http.StatusBadRequest, "ERR_NO_SUBMISSIONS", "该题暂无提交记录，无法进行 AI 分析")
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
		writeAnalysisError(w, http.StatusInternalServerError, err)
		return
	}
	if !reused {
		taskID := task.ID
		if ok := s.queue.Enqueue(jobs.Job{
			Key:      jobs.AnalysisJobKey(taskID),
			TaskType: models.TaskTypeAnalysis,
			TaskID:   taskID,
			Run: func(ctx context.Context) error {
				return s.runAnalysisTask(ctx, taskID)
			},
		}); !ok {
			log.Printf("enqueue analysis task %d: %v", taskID, "queue rejected job")
		}
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

func writeAnalysisError(w http.ResponseWriter, status int, err error) {
	msg := err.Error()
	if strings.Contains(strings.ToLower(msg), "database is locked") || strings.Contains(msg, sqliteBusyUserMessage) {
		writeErrorWithCode(w, status, "ERR_DB_BUSY", msg)
		return
	}
	writeError(w, status, msg)
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

const (
	analysisMetadataStart = "<!-- OJREVIEW_METADATA"
	analysisMetadataEnd   = "-->"
)

type analysisMetadataPayload struct {
	ErrorPatterns []analysisMetadataPattern `json:"error_patterns"`
}

type analysisMetadataPattern struct {
	Type         string  `json:"type"`
	PatternType  string  `json:"pattern_type"`
	Description  string  `json:"description"`
	Confidence   float64 `json:"confidence"`
	AIConfidence float64 `json:"ai_confidence"`
	SubmissionID string  `json:"submission_id"`
}

func extractAnalysisMetadata(content string, problemID int64) (string, []models.ErrorPattern) {
	start := strings.LastIndex(content, analysisMetadataStart)
	if start < 0 {
		return content, nil
	}

	afterStart := start + len(analysisMetadataStart)
	endRel := strings.Index(content[afterStart:], analysisMetadataEnd)
	if endRel < 0 {
		return content, nil
	}

	end := afterStart + endRel
	rawMetadata := strings.TrimSpace(content[afterStart:end])

	var payload analysisMetadataPayload
	if err := json.Unmarshal([]byte(rawMetadata), &payload); err != nil {
		return content, nil
	}

	patterns := make([]models.ErrorPattern, 0, len(payload.ErrorPatterns))
	for _, item := range payload.ErrorPatterns {
		patternType := strings.TrimSpace(item.PatternType)
		if patternType == "" {
			patternType = strings.TrimSpace(item.Type)
		}
		if patternType == "" {
			continue
		}
		confidence := item.Confidence
		if confidence == 0 && item.AIConfidence != 0 {
			confidence = item.AIConfidence
		}
		confidence = math.Max(0, math.Min(1, confidence))
		patterns = append(patterns, models.ErrorPattern{
			ProblemID:    problemID,
			PatternType:  patternType,
			Description:  strings.TrimSpace(item.Description),
			Confidence:   confidence,
			SubmissionID: strings.TrimSpace(item.SubmissionID),
		})
	}

	clean := content[:start] + content[end+len(analysisMetadataEnd):]
	return clean, patterns
}

// handleErrorPatternStats returns aggregated error pattern statistics.
func (s *Server) handleErrorPatternStats(w http.ResponseWriter, _ *http.Request) {
	stats, err := s.db.GetErrorPatternStats()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if stats == nil {
		stats = []models.ErrorPatternStats{}
	}
	writeJSON(w, http.StatusOK, stats)
}

// handleErrorPatternsByProblem returns all error patterns for a given problem.
func (s *Server) handleErrorPatternsByProblem(w http.ResponseWriter, r *http.Request) {
	problemID, err := strconv.ParseInt(r.PathValue("problemId"), 10, 64)
	if err != nil || problemID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid problem id")
		return
	}
	patterns, err := s.db.GetErrorPatternsByProblem(problemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if patterns == nil {
		patterns = []models.ErrorPattern{}
	}
	writeJSON(w, http.StatusOK, patterns)
}

func (s *Server) ResumeAnalysisTask(ctx context.Context, taskID int64) error {
	return s.runAnalysisTask(ctx, taskID)
}

func (s *Server) ensureProblemAnalysisArtifacts(ctx context.Context, problemID int64) {
	const maxSourceFetches = 5

	problem, err := s.db.GetProblemByID(problemID)
	if err != nil {
		log.Printf("analysis artifact fetch: load problem %d: %v", problemID, err)
		return
	}

	adapter := s.adapters[problem.Platform]
	if adapter == nil {
		return
	}
	caps := adapter.Capabilities()

	if judgeCapabilityAllowsFetch(caps.ProblemStatement) {
		statement, err := s.db.GetProblemStatement(problemID)
		if err != nil {
			log.Printf("analysis artifact fetch: load statement %d: %v", problemID, err)
		} else if strings.TrimSpace(statement) == "" {
			fetched, fetchErr := adapter.FetchStatement(ctx, problem.ExternalProblemID)
			if fetchErr != nil {
				log.Printf("analysis artifact fetch: fetch statement %s: %v", problem.ExternalProblemID, fetchErr)
			} else if strings.TrimSpace(fetched) != "" {
				if saveErr := s.db.SaveProblemStatement(problemID, fetched); saveErr != nil {
					log.Printf("analysis artifact fetch: save statement %d: %v", problemID, saveErr)
				}
			}
		}
	}

	if !judgeCapabilityAllowsFetch(caps.SubmissionSource) {
		return
	}

	submissions, err := s.db.GetProblemSubmissionsNeedingSource(problemID, maxSourceFetches)
	if err != nil {
		log.Printf("analysis artifact fetch: list submissions %d: %v", problemID, err)
		return
	}
	for _, submission := range submissions {
		source, fetchErr := adapter.FetchSubmissionSource(ctx, submission)
		if fetchErr != nil {
			log.Printf("analysis artifact fetch: fetch submission %s: %v", submission.ExternalSubmissionID, fetchErr)
			continue
		}
		if strings.TrimSpace(source) == "" {
			continue
		}
		if saveErr := s.db.SaveSubmissionSource(submission.ID, source); saveErr != nil {
			log.Printf("analysis artifact fetch: save submission %d: %v", submission.ID, saveErr)
		}
	}
}

func judgeCapabilityAllowsFetch(status judges.JudgeCapabilityStatus) bool {
	return status == judges.JudgeCapabilitySupported || status == judges.JudgeCapabilityPartial
}
