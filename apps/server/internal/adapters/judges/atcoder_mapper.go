package judges

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

func parseAtCoderCursor(cursor string) (int64, error) {
	cursor = strings.TrimSpace(cursor)
	if cursor == "" {
		return 0, nil
	}

	parsed, err := strconv.ParseInt(cursor, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid cursor: %w", err)
	}
	if parsed < 0 {
		return 0, errors.New("invalid cursor: must be non-negative")
	}

	return parsed, nil
}

func parseAtCoderProblemID(problemID string) (string, string, error) {
	parts := strings.Split(problemID, "_")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid problem id format: %s", problemID)
	}

	contestID := strings.TrimSpace(parts[0])
	problemIndex := strings.TrimSpace(parts[len(parts)-1])
	if contestID == "" || problemIndex == "" {
		return "", "", fmt.Errorf("invalid problem id format: %s", problemID)
	}

	return contestID, problemIndex, nil
}

func parseAtCoderSubmission(raw any) (atCoderSubmission, []byte, error) {
	if raw == nil {
		return atCoderSubmission{}, nil, errors.New("raw submission is required")
	}

	if typed, ok := raw.(atCoderSubmission); ok {
		rawJSON, err := json.Marshal(typed)
		if err != nil {
			return atCoderSubmission{}, nil, fmt.Errorf("marshal raw atcoder submission: %w", err)
		}
		return typed, rawJSON, nil
	}

	if typed, ok := raw.(*atCoderSubmission); ok {
		if typed == nil {
			return atCoderSubmission{}, nil, errors.New("raw submission is required")
		}
		rawJSON, err := json.Marshal(typed)
		if err != nil {
			return atCoderSubmission{}, nil, fmt.Errorf("marshal raw atcoder submission: %w", err)
		}
		return *typed, rawJSON, nil
	}

	rawJSON, err := json.Marshal(raw)
	if err != nil {
		return atCoderSubmission{}, nil, fmt.Errorf("marshal raw submission: %w", err)
	}

	var parsed atCoderSubmission
	if err := json.Unmarshal(rawJSON, &parsed); err != nil {
		return atCoderSubmission{}, nil, fmt.Errorf("decode raw atcoder submission: %w", err)
	}

	return parsed, rawJSON, nil
}

func mapAtCoderVerdict(result string) models.Verdict {
	switch strings.ToUpper(strings.TrimSpace(result)) {
	case "AC":
		return models.VerdictAC
	case "WA":
		return models.VerdictWA
	case "TLE":
		return models.VerdictTLE
	case "MLE":
		return models.VerdictMLE
	case "RE":
		return models.VerdictRE
	case "CE":
		return models.VerdictCE
	case "OLE":
		return models.VerdictOLE
	case "IE":
		return models.VerdictIE
	default:
		return models.VerdictUnknown
	}
}

func atCoderTaskURL(contestID string, problemID string) string {
	if contestID == "" || problemID == "" {
		return ""
	}
	return fmt.Sprintf("https://atcoder.jp/contests/%s/tasks/%s", contestID, problemID)
}

func normalizeAtCoderContestStatus(startTime time.Time) string {
	if startTime.After(time.Now().UTC()) {
		return "UPCOMING"
	}
	return "FINISHED"
}
