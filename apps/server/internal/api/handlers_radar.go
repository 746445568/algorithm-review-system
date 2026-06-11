package api

import (
	"net/http"

	"ojreviewdesktop/internal/storage"
)

func (s *Server) handleRadarData(w http.ResponseWriter, r *http.Request) {
	data, err := s.db.GetRadarData(8)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load radar data")
		return
	}
	if data == nil {
		data = []storage.RadarItem{}
	}
	writeJSON(w, http.StatusOK, data)
}
