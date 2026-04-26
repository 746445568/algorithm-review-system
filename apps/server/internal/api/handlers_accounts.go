package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"ojreviewdesktop/internal/models"
)

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
