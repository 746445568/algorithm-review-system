package judges

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"ojreviewdesktop/internal/models"
)

const (
	atCoderBaseURL     = "https://kenkoooo.com/atcoder"
	atCoderResultsPath = "/atcoder-api/v3/user/submissions"
	atCoderContestsURL = "https://kenkoooo.com/atcoder/resources/contests.json"

	atCoderResourceBaseURL       = "https://kenkoooo.com/atcoder/resources"
	atCoderProblemsURLPath       = "/problems.json"
	atCoderMergedProblemsURLPath = "/merged-problems.json"
	atCoderProblemModelsURLPath  = "/problem-models.json"
	atCoderContestProblemURLPath = "/contest-problem.json"
	atCoderResourceMinSpacing    = time.Second
)

var _ Adapter = (*AtCoderAdapter)(nil)

type AtCoderAdapter struct {
	client          *http.Client
	resourceBaseURL string
	requestSpacing  time.Duration
	sleep           func(context.Context, time.Duration) error

	problemsMu     sync.RWMutex
	problemsByID   map[string]atCoderProblem
	problemsLoaded bool
}

func NewAtCoderAdapter() Adapter {
	return &AtCoderAdapter{
		client:          &http.Client{Timeout: 30 * time.Second},
		resourceBaseURL: atCoderResourceBaseURL,
		requestSpacing:  atCoderResourceMinSpacing,
		sleep:           sleepWithContext,
	}
}

func (a *AtCoderAdapter) Capabilities() JudgeCapabilities {
	return JudgeCapabilities{
		Platform:         models.PlatformAtCoder,
		Label:            "AtCoder",
		AccountSync:      JudgeCapabilitySupported,
		Profile:          JudgeCapabilitySupported,
		Contests:         JudgeCapabilitySupported,
		ProblemMetadata:  JudgeCapabilitySupported,
		ProblemStatement: JudgeCapabilitySupported,
		SubmissionSource: JudgeCapabilityUnsupported,
		PreferredFetchPath: JudgeFetchPaths{
			ProblemStatement: JudgeFetchPathPublicPage,
			SubmissionSource: JudgeFetchPathBrowserImport,
		},
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

func (a *AtCoderAdapter) FetchProblemCatalog(ctx context.Context) ([]models.ProblemPoolItem, error) {
	problemsByID, err := a.loadProblems(ctx)
	if err != nil {
		return nil, fmt.Errorf("load atcoder problems: %w", err)
	}
	if err := a.sleepBetweenAtCoderResources(ctx); err != nil {
		return nil, err
	}

	var mergedProblems []atCoderMergedProblem
	if err := a.fetchAtCoderResource(ctx, atCoderMergedProblemsURLPath, &mergedProblems); err != nil {
		return nil, err
	}
	if err := a.sleepBetweenAtCoderResources(ctx); err != nil {
		return nil, err
	}

	var problemModels map[string]atCoderProblemModel
	if err := a.fetchAtCoderResource(ctx, atCoderProblemModelsURLPath, &problemModels); err != nil {
		return nil, err
	}
	if err := a.sleepBetweenAtCoderResources(ctx); err != nil {
		return nil, err
	}

	var contestProblems []atCoderContestProblem
	if err := a.fetchAtCoderResource(ctx, atCoderContestProblemURLPath, &contestProblems); err != nil {
		return nil, err
	}

	mergedByID := make(map[string]atCoderMergedProblem, len(mergedProblems))
	for _, problem := range mergedProblems {
		if problem.ID != "" {
			mergedByID[problem.ID] = problem
		}
	}
	contestByID := make(map[string]atCoderContestProblem, len(contestProblems))
	for _, problem := range contestProblems {
		if problem.ProblemID != "" {
			contestByID[problem.ProblemID] = problem
		}
	}

	items := make([]models.ProblemPoolItem, 0, len(problemsByID))
	for _, problem := range problemsByID {
		merged := mergedByID[problem.ID]
		contestProblem := contestByID[problem.ID]
		model := problemModels[problem.ID]

		contestID := firstNonEmpty(problem.ContestID, merged.ContestID, contestProblem.ContestID)
		title := firstNonEmpty(merged.Title, merged.Name, problem.Title)
		if problem.ID == "" || title == "" || contestID == "" || isAtCoderHeuristicContest(contestID) {
			continue
		}

		item := models.ProblemPoolItem{
			Platform:          models.PlatformAtCoder,
			ExternalProblemID: problem.ID,
			ExternalContestID: contestID,
			ProblemIndex:      firstNonEmpty(problem.ProblemIndex, merged.ProblemIndex, contestProblem.ProblemIndex),
			Title:             title,
			URL:               atCoderTaskURL(contestID, problem.ID),
			DifficultyScale:   DifficultyScaleAtCoder,
			Source:            SourceAtCoderProblems,
			SolverCount:       merged.SolverCount,
			IsExperimental:    model.IsExperimental,
			Tags: []models.ProblemPoolTag{{
				Name:       atCoderContestCategory(contestID),
				Source:     TagSourceAtCoderContestCategory,
				Confidence: 0.4,
			}},
		}
		if model.Difficulty != nil {
			raw := *model.Difficulty
			clipped := clipAtCoderDifficulty(raw)
			item.DifficultyRaw = &raw
			item.DifficultyValue = &clipped
		}
		items = append(items, item)
	}
	return items, nil
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

func (a *AtCoderAdapter) FetchSubmissionSource(ctx context.Context, submission models.Submission) (string, error) {
	return "", errors.New("atcoder submission source fetching is not supported")
}

func (a *AtCoderAdapter) FetchRatingHistory(ctx context.Context, handle string) ([]RatingHistoryEntry, error) {
	u := fmt.Sprintf("https://atcoder.jp/users/%s/history/json", url.PathEscape(handle))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	setAtCoderHeaders(req)

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch AtCoder rating history: %w", err)
	}
	defer resp.Body.Close()

	body, err := atCoderBody(resp)
	if err != nil {
		return nil, fmt.Errorf("read AtCoder rating history body: %w", err)
	}
	defer body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("AtCoder rating history: HTTP %d", resp.StatusCode)
	}

	var history []struct {
		IsRated     bool   `json:"IsRated"`
		ContestName string `json:"ContestName"`
		NewRating   int    `json:"NewRating"`
		EndTime     string `json:"EndTime"`
	}
	if err := json.NewDecoder(body).Decode(&history); err != nil {
		return nil, fmt.Errorf("decode AtCoder rating history: %w", err)
	}

	entries := make([]RatingHistoryEntry, 0)
	for _, h := range history {
		if !h.IsRated {
			continue
		}
		entries = append(entries, RatingHistoryEntry{
			ContestName: h.ContestName,
			Rating:      h.NewRating,
			Timestamp:   h.EndTime,
		})
	}
	return entries, nil
}

func (a *AtCoderAdapter) fetchAtCoderResource(ctx context.Context, path string, target any) error {
	resourceBaseURL := strings.TrimRight(a.resourceBaseURL, "/")
	if resourceBaseURL == "" {
		resourceBaseURL = atCoderResourceBaseURL
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, resourceBaseURL+path, nil)
	if err != nil {
		return fmt.Errorf("create atcoder resource request: %w", err)
	}
	setAtCoderHeaders(req)

	resp, err := a.client.Do(req)
	if err != nil {
		return fmt.Errorf("request atcoder resource %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("atcoder resource %s returned status %d", path, resp.StatusCode)
	}

	body, err := atCoderBody(resp)
	if err != nil {
		return err
	}
	defer body.Close()

	if err := json.NewDecoder(body).Decode(target); err != nil {
		return fmt.Errorf("decode atcoder resource %s: %w", path, err)
	}
	return nil
}

func (a *AtCoderAdapter) sleepBetweenAtCoderResources(ctx context.Context) error {
	if a.requestSpacing <= 0 {
		return nil
	}
	sleep := a.sleep
	if sleep == nil {
		sleep = sleepWithContext
	}
	return sleep(ctx, a.requestSpacing)
}

func sleepWithContext(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func clipAtCoderDifficulty(difficulty int) int {
	if difficulty >= 400 {
		return difficulty
	}
	return int(math.Round(400 / math.Exp(1-float64(difficulty)/400)))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func atCoderContestCategory(contestID string) string {
	contestID = strings.ToLower(strings.TrimSpace(contestID))
	switch {
	case strings.HasPrefix(contestID, "abc"):
		return "ABC"
	case strings.HasPrefix(contestID, "arc"):
		return "ARC"
	case strings.HasPrefix(contestID, "agc"):
		return "AGC"
	case strings.HasPrefix(contestID, "past"):
		return "PAST"
	case strings.HasPrefix(contestID, "joi"):
		return "JOI"
	default:
		return "ATCODER_OTHER"
	}
}

func isAtCoderHeuristicContest(contestID string) bool {
	contestID = strings.ToLower(strings.TrimSpace(contestID))
	return strings.HasPrefix(contestID, "ahc") || strings.Contains(contestID, "marathon") || strings.Contains(contestID, "heuristic")
}
