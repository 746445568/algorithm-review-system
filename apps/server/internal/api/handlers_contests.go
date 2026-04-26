package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/storage"
)

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
