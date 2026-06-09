package api

import (
	"net/http"
	"sort"
	"time"

	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/buildinfo"
)

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

func (s *Server) handleJudges(w http.ResponseWriter, _ *http.Request) {
	items := make([]judges.JudgeCapabilities, 0, len(s.adapters))
	for _, adapter := range s.adapters {
		items = append(items, adapter.Capabilities())
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Platform < items[j].Platform
	})
	writeJSON(w, http.StatusOK, items)
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
