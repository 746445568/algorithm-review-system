package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"ojreviewdesktop/internal/models"
)

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

func parseTaskID(raw string) (int64, error) {
	return strconv.ParseInt(raw, 10, 64)
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
