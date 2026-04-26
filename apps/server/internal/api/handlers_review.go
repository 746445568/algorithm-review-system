package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"ojreviewdesktop/internal/models"
	"ojreviewdesktop/internal/srs"
)

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
