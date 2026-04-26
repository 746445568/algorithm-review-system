package judges

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"ojreviewdesktop/internal/models"
)

const (
	atCoderBaseURL     = "https://kenkoooo.com/atcoder"
	atCoderResultsPath = "/atcoder-api/v3/user/submissions"
	atCoderProblemsURL = "https://kenkoooo.com/atcoder/resources/problems.json"
	atCoderContestsURL = "https://kenkoooo.com/atcoder/resources/contests.json"
)

var _ Adapter = (*AtCoderAdapter)(nil)

type AtCoderAdapter struct {
	client *http.Client

	problemsMu     sync.RWMutex
	problemsByID   map[string]atCoderProblem
	problemsLoaded bool
}

func NewAtCoderAdapter() Adapter {
	return &AtCoderAdapter{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (a *AtCoderAdapter) FetchContests(ctx context.Context) ([]models.Contest, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, atCoderContestsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create atcoder contests request: %w", err)
	}
	setAtCoderHeaders(req)

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request atcoder contests: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("atcoder contests returned status %d", resp.StatusCode)
	}

	body, err := atCoderBody(resp)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	var rawContests []atCoderContest
	if err := json.NewDecoder(body).Decode(&rawContests); err != nil {
		return nil, fmt.Errorf("decode atcoder contests response: %w", err)
	}

	items := make([]models.Contest, 0, len(rawContests))
	for _, contest := range rawContests {
		if contest.ID == "" || contest.Title == "" || contest.StartEpochSecond <= 0 {
			continue
		}
		startTime := time.Unix(contest.StartEpochSecond, 0).UTC()
		items = append(items, models.Contest{
			Platform:          models.PlatformAtCoder,
			ExternalContestID: contest.ID,
			Name:              contest.Title,
			StartTime:         startTime,
			DurationMinutes:   int(contest.DurationSecond / 60),
			URL:               fmt.Sprintf("https://atcoder.jp/contests/%s", contest.ID),
			Status:            normalizeAtCoderContestStatus(startTime),
		})
	}
	return items, nil
}

func (a *AtCoderAdapter) ValidateAccount(ctx context.Context, handle string) error {
	handle = strings.TrimSpace(handle)
	if handle == "" {
		return errors.New("handle is required")
	}

	_, err := a.fetchSubmissionsRaw(ctx, handle, 0)
	if err != nil {
		return fmt.Errorf("validate atcoder account: %w", err)
	}

	return nil
}

func (a *AtCoderAdapter) FetchProfile(ctx context.Context, handle string) (UserProfile, error) {
	histURL := fmt.Sprintf("https://atcoder.jp/users/%s/history/json", handle)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, histURL, nil)
	req.Header.Set("Accept", "application/json")
	resp, err := a.client.Do(req)
	if err != nil {
		return UserProfile{}, fmt.Errorf("fetch atcoder profile: %w", err)
	}
	defer resp.Body.Close()
	var history []struct {
		NewRating int `json:"NewRating"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&history); err != nil {
		return UserProfile{}, fmt.Errorf("decode atcoder history: %w", err)
	}
	if len(history) == 0 {
		return UserProfile{}, nil
	}
	latest := history[len(history)-1].NewRating
	maxR := 0
	for _, h := range history {
		if h.NewRating > maxR {
			maxR = h.NewRating
		}
	}
	return UserProfile{Rating: &latest, MaxRating: &maxR}, nil
}

func (a *AtCoderAdapter) FetchSubmissions(ctx context.Context, handle string, cursor string) ([]models.Submission, string, error) {
	handle = strings.TrimSpace(handle)
	if handle == "" {
		return nil, "", errors.New("handle is required")
	}

	fromSecond, err := parseAtCoderCursor(cursor)
	if err != nil {
		return nil, "", err
	}

	rawSubmissions, err := a.fetchSubmissionsRaw(ctx, handle, fromSecond)
	if err != nil {
		return nil, "", fmt.Errorf("fetch atcoder submissions: %w", err)
	}

	if len(rawSubmissions) > 100 {
		rawSubmissions = rawSubmissions[:100]
	}

	submissions := make([]models.Submission, 0, len(rawSubmissions))
	for _, raw := range rawSubmissions {
		normalized, err := a.NormalizeSubmission(raw)
		if err != nil {
			return nil, "", fmt.Errorf("normalize atcoder submission %d: %w", raw.ID, err)
		}
		submissions = append(submissions, normalized)
	}

	return submissions, a.NextCursor(cursor, submissions), nil
}

func (a *AtCoderAdapter) FetchProblemMetadata(ctx context.Context, problemID string) (models.Problem, []string, error) {
	problemID = strings.TrimSpace(problemID)
	contestID, _, err := parseAtCoderProblemID(problemID)
	if err != nil {
		return models.Problem{}, nil, err
	}

	problemsByID, err := a.loadProblems(ctx)
	if err != nil {
		return models.Problem{}, nil, fmt.Errorf("load atcoder problems: %w", err)
	}

	problemData, ok := problemsByID[problemID]
	if !ok {
		return models.Problem{}, nil, fmt.Errorf("problem not found: %s", problemID)
	}
	if problemData.ContestID != "" {
		contestID = problemData.ContestID
	}

	problem := models.Problem{
		Platform:          models.PlatformAtCoder,
		ExternalProblemID: problemData.ID,
		ExternalContestID: contestID,
		Title:             problemData.Title,
		URL:               atCoderTaskURL(contestID, problemData.ID),
	}

	return problem, []string{}, nil
}

func (a *AtCoderAdapter) NormalizeSubmission(raw any) (models.Submission, error) {
	parsed, rawJSON, err := parseAtCoderSubmission(raw)
	if err != nil {
		return models.Submission{}, err
	}

	submission := models.Submission{
		Platform:             models.PlatformAtCoder,
		ExternalSubmissionID: strconv.FormatInt(parsed.ID, 10),
		Verdict:              mapAtCoderVerdict(parsed.Result),
		Language:             parsed.Language,
		SubmittedAt:          time.Unix(parsed.EpochSecond, 0).UTC(),
		SourceContestID:      parsed.ContestID,
		RawJSON:              string(rawJSON),
	}
	if parsed.ExecutionTime > 0 {
		execTime := parsed.ExecutionTime
		submission.ExecutionTimeMS = &execTime
	}

	return submission, nil
}

func (a *AtCoderAdapter) NextCursor(previous string, fetched []models.Submission) string {
	if len(fetched) == 0 {
		return ""
	}

	var maxEpoch int64
	for _, submission := range fetched {
		epoch := submission.SubmittedAt.Unix()
		if epoch > maxEpoch {
			maxEpoch = epoch
		}
	}

	return strconv.FormatInt(maxEpoch+1, 10)
}

func (a *AtCoderAdapter) FetchStatement(ctx context.Context, problemID string) (string, error) {
	// AtCoder 题目原文需要从 atcoder.jp 获取
	// 格式：https://atcoder.jp/contests/{contestID}/tasks/{problemID}
	contestID, _, err := parseAtCoderProblemID(problemID)
	if err != nil {
		return "", err
	}

	// 构造题目页面 URL
	url := fmt.Sprintf("https://atcoder.jp/contests/%s/tasks/%s", contestID, problemID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("create atcoder statement request: %w", err)
	}
	req.Header.Set("Accept", "text/html")

	resp, err := a.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch atcoder statement: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("atcoder statement returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read atcoder statement response: %w", err)
	}

	return string(body), nil
}

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
