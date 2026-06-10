package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"ojreviewdesktop/internal/models"
)

func (s *Server) handleRatingHistory(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid account id")
		return
	}
	entries, err := s.db.GetRatingHistory(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load rating history")
		return
	}
	if entries == nil {
		entries = []models.RatingEntry{}
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *Server) handleRefreshRatingHistory(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid account id")
		return
	}
	account, err := s.db.GetAccount(id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "account not found")
		} else {
			writeError(w, http.StatusInternalServerError, "failed to load account")
		}
		return
	}
	adapter, ok := s.adapters[account.Platform]
	if !ok {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("platform %s does not support rating history", account.Platform))
		return
	}
	entries, err := adapter.FetchRatingHistory(r.Context(), account.ExternalHandle)
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to fetch rating history")
		return
	}
	if len(entries) == 0 {
		writeJSON(w, http.StatusOK, []models.RatingEntry{})
		return
	}
	modelEntries := make([]models.RatingEntry, len(entries))
	for i, e := range entries {
		modelEntries[i] = models.RatingEntry{
			AccountID:   id,
			ContestName: e.ContestName,
			Rating:      e.Rating,
			Timestamp:   e.Timestamp,
		}
	}
	if err := s.db.SaveRatingHistory(id, modelEntries); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save rating history")
		return
	}
	writeJSON(w, http.StatusOK, modelEntries)
}
