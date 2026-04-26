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

func parseCodeforcesCursor(cursor string) (int, int, error) {
	if strings.TrimSpace(cursor) == "" {
		return 1, codeforcesPageSize, nil
	}

	parts := strings.Split(cursor, ",")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid cursor format %q, expected from,count", cursor)
	}

	from, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || from < 1 {
		return 0, 0, fmt.Errorf("invalid cursor from value %q", parts[0])
	}

	count, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil || count < 1 {
		return 0, 0, fmt.Errorf("invalid cursor count value %q", parts[1])
	}
	if count > codeforcesPageSize {
		count = codeforcesPageSize
	}

	return from, count, nil
}

func parseCodeforcesProblemID(problemID string) (int, string, error) {
	parts := strings.Split(strings.TrimSpace(problemID), "/")
	if len(parts) != 2 {
		return 0, "", fmt.Errorf("invalid codeforces problem id %q, expected contestId/index", problemID)
	}

	contestID, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil || contestID <= 0 {
		return 0, "", fmt.Errorf("invalid contest id in problem id %q", problemID)
	}

	index := strings.TrimSpace(parts[1])
	if index == "" {
		return 0, "", fmt.Errorf("invalid index in problem id %q", problemID)
	}

	return contestID, strings.ToUpper(index), nil
}

func formatCodeforcesCursor(from int, count int) string {
	return strconv.Itoa(from) + "," + strconv.Itoa(count)
}

func formatCodeforcesProblemID(contestID int, index string) string {
	return strconv.Itoa(contestID) + "/" + strings.ToUpper(strings.TrimSpace(index))
}

func toCodeforcesSubmissionRaw(raw any) (codeforcesSubmissionRaw, error) {
	submission, ok := raw.(codeforcesSubmissionRaw)
	if ok {
		return submission, nil
	}

	bytes, err := json.Marshal(raw)
	if err != nil {
		return codeforcesSubmissionRaw{}, fmt.Errorf("marshal submission input: %w", err)
	}

	var decoded codeforcesSubmissionRaw
	if err := json.Unmarshal(bytes, &decoded); err != nil {
		return codeforcesSubmissionRaw{}, fmt.Errorf("decode submission input: %w", err)
	}

	if decoded.ID == 0 {
		return codeforcesSubmissionRaw{}, errors.New("submission id is required")
	}

	return decoded, nil
}

func optionalInt(value int) *int {
	if value <= 0 {
		return nil
	}
	v := value
	return &v
}

func mapCodeforcesVerdict(codeforcesVerdict string) models.Verdict {
	switch strings.ToUpper(strings.TrimSpace(codeforcesVerdict)) {
	case "OK":
		return models.VerdictAC
	case "WRONG_ANSWER", "PRESENTATION_ERROR":
		return models.VerdictWA
	case "TIME_LIMIT_EXCEEDED":
		return models.VerdictTLE
	case "MEMORY_LIMIT_EXCEEDED":
		return models.VerdictMLE
	case "RUNTIME_ERROR":
		return models.VerdictRE
	case "COMPILATION_ERROR":
		return models.VerdictCE
	case "IDLENESS_LIMIT_EXCEEDED":
		return models.VerdictOLE
	case "FAILED":
		return models.VerdictIE
	default:
		return models.VerdictUnknown
	}
}

func normalizeContestStatus(raw string, startTimeSecond int64) string {
	status := strings.ToUpper(strings.TrimSpace(raw))
	switch status {
	case "BEFORE":
		return "UPCOMING"
	case "CODING", "PENDING_SYSTEM_TEST", "SYSTEM_TEST":
		return "RUNNING"
	case "FINISHED":
		return "FINISHED"
	}
	if startTimeSecond > 0 && time.Unix(startTimeSecond, 0).After(time.Now().UTC()) {
		return "UPCOMING"
	}
	return "UNKNOWN"
}
