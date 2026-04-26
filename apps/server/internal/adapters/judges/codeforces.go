package judges

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"ojreviewdesktop/internal/models"
)

const (
	codeforcesBaseURL    = "https://codeforces.com/api"
	codeforcesPageSize   = 50
	codeforcesMinSpacing = 250 * time.Millisecond
	codeforcesMaxRetries = 3
	codeforcesRetryDelay = 2 * time.Second
)

type CodeforcesAdapter struct {
	client        *http.Client
	baseURL       string
	mu            sync.Mutex
	lastRequestAt time.Time
}

func NewCodeforcesAdapter() Adapter {
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   30 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   60 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		ExpectContinueTimeout: 5 * time.Second,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
	}
	return &CodeforcesAdapter{
		client:  &http.Client{Timeout: 120 * time.Second, Transport: transport},
		baseURL: codeforcesBaseURL,
	}
}

func (a *CodeforcesAdapter) FetchContests(ctx context.Context) ([]models.Contest, error) {
	var contests []codeforcesContest
	if err := a.getJSON(ctx, "contest.list", url.Values{"gym": []string{"false"}}, &contests); err != nil {
		return nil, fmt.Errorf("fetch codeforces contests: %w", err)
	}

	items := make([]models.Contest, 0, len(contests))
	for _, contest := range contests {
		if contest.ID <= 0 || contest.Name == "" || contest.StartTimeSecond <= 0 {
			continue
		}
		items = append(items, models.Contest{
			Platform:          models.PlatformCodeforces,
			ExternalContestID: strconv.Itoa(contest.ID),
			Name:              contest.Name,
			StartTime:         time.Unix(contest.StartTimeSecond, 0).UTC(),
			DurationMinutes:   contest.DurationSeconds / 60,
			URL:               fmt.Sprintf("https://codeforces.com/contest/%d", contest.ID),
			Status:            normalizeContestStatus(contest.Phase, contest.StartTimeSecond),
		})
	}
	return items, nil
}

func (a *CodeforcesAdapter) ValidateAccount(ctx context.Context, handle string) error {
	handle = strings.TrimSpace(handle)
	if handle == "" {
		return errors.New("handle is required")
	}

	var users []codeforcesUser
	if err := a.getJSON(ctx, "user.info", url.Values{"handles": []string{handle}}, &users); err != nil {
		return fmt.Errorf("validate codeforces handle %q: %w", handle, err)
	}
	if len(users) == 0 {
		return fmt.Errorf("codeforces handle not found: %s", handle)
	}

	return nil
}

func (a *CodeforcesAdapter) FetchProfile(ctx context.Context, handle string) (UserProfile, error) {
	var users []struct {
		Rating    int    `json:"rating"`
		MaxRating int    `json:"maxRating"`
		Rank      string `json:"rank"`
	}
	if err := a.getJSON(ctx, "user.info", url.Values{"handles": []string{handle}}, &users); err != nil {
		return UserProfile{}, fmt.Errorf("fetch cf profile %q: %w", handle, err)
	}
	if len(users) == 0 {
		return UserProfile{}, fmt.Errorf("cf user not found: %s", handle)
	}
	u := users[0]
	return UserProfile{Rating: &u.Rating, MaxRating: &u.MaxRating, Rank: u.Rank}, nil
}

func (a *CodeforcesAdapter) FetchSubmissions(ctx context.Context, handle string, cursor string) ([]models.Submission, string, error) {
	handle = strings.TrimSpace(handle)
	if handle == "" {
		return nil, "", errors.New("handle is required")
	}

	from, count, err := parseCodeforcesCursor(cursor)
	if err != nil {
		return nil, "", err
	}

	var rawSubmissions []codeforcesSubmissionRaw
	query := url.Values{
		"handle": []string{handle},
		"from":   []string{strconv.Itoa(from)},
		"count":  []string{strconv.Itoa(count)},
	}
	if err := a.getJSON(ctx, "user.status", query, &rawSubmissions); err != nil {
		return nil, "", fmt.Errorf("fetch codeforces submissions: %w", err)
	}

	submissions := make([]models.Submission, 0, len(rawSubmissions))
	for _, raw := range rawSubmissions {
		normalized, normErr := a.NormalizeSubmission(raw)
		if normErr != nil {
			return nil, "", fmt.Errorf("normalize codeforces submission %d: %w", raw.ID, normErr)
		}
		submissions = append(submissions, normalized)
	}

	previous := formatCodeforcesCursor(from, count)
	return submissions, a.NextCursor(previous, submissions), nil
}

func (a *CodeforcesAdapter) FetchProblemMetadata(ctx context.Context, problemID string) (models.Problem, []string, error) {
	contestID, index, err := parseCodeforcesProblemID(problemID)
	if err != nil {
		return models.Problem{}, nil, err
	}

	var result codeforcesProblemSetResult
	if err := a.getJSON(ctx, "problemset.problems", nil, &result); err != nil {
		return models.Problem{}, nil, fmt.Errorf("fetch codeforces problemset: %w", err)
	}

	for _, problem := range result.Problems {
		if problem.ContestID != contestID {
			continue
		}
		if !strings.EqualFold(problem.Index, index) {
			continue
		}

		rawTags, marshalErr := json.Marshal(problem.Tags)
		if marshalErr != nil {
			return models.Problem{}, nil, fmt.Errorf("marshal codeforces tags: %w", marshalErr)
		}

		normalizedID := formatCodeforcesProblemID(problem.ContestID, problem.Index)
		difficulty := ""
		if problem.Rating > 0 {
			difficulty = strconv.Itoa(problem.Rating)
		}

		return models.Problem{
			Platform:          models.PlatformCodeforces,
			ExternalProblemID: normalizedID,
			ExternalContestID: strconv.Itoa(problem.ContestID),
			Title:             problem.Name,
			URL:               fmt.Sprintf("https://codeforces.com/problemset/problem/%d/%s", problem.ContestID, problem.Index),
			Difficulty:        difficulty,
			RawTagsJSON:       string(rawTags),
		}, problem.Tags, nil
	}

	return models.Problem{}, nil, fmt.Errorf("codeforces problem not found: %s", formatCodeforcesProblemID(contestID, index))
}

func (a *CodeforcesAdapter) NormalizeSubmission(raw any) (models.Submission, error) {
	rawSubmission, err := toCodeforcesSubmissionRaw(raw)
	if err != nil {
		return models.Submission{}, err
	}

	rawJSON, err := json.Marshal(rawSubmission)
	if err != nil {
		return models.Submission{}, fmt.Errorf("marshal raw submission: %w", err)
	}

	submittedAt := time.Unix(rawSubmission.CreationTimeSeconds, 0).UTC()
	executionTimeMS := optionalInt(rawSubmission.TimeConsumedMillis)
	memoryKB := optionalInt(rawSubmission.MemoryConsumedBytes / 1024)

	result := models.Submission{
		Platform:             models.PlatformCodeforces,
		ExternalSubmissionID: strconv.Itoa(rawSubmission.ID),
		Verdict:              mapCodeforcesVerdict(rawSubmission.Verdict),
		Language:             rawSubmission.ProgrammingLanguage,
		SubmittedAt:          submittedAt,
		ExecutionTimeMS:      executionTimeMS,
		MemoryKB:             memoryKB,
		RawJSON:              string(rawJSON),
	}

	if rawSubmission.ContestID > 0 {
		result.SourceContestID = strconv.Itoa(rawSubmission.ContestID)
	} else if rawSubmission.Problem.ContestID > 0 {
		result.SourceContestID = strconv.Itoa(rawSubmission.Problem.ContestID)
	}

	return result, nil
}

func (a *CodeforcesAdapter) NextCursor(previous string, fetched []models.Submission) string {
	if len(fetched) == 0 {
		return ""
	}

	from, count, err := parseCodeforcesCursor(previous)
	if err != nil {
		return ""
	}

	if len(fetched) < count {
		return ""
	}

	return formatCodeforcesCursor(from+count, count)
}

func (a *CodeforcesAdapter) FetchStatement(ctx context.Context, problemID string) (string, error) {
	contestID, index, err := parseCodeforcesProblemID(problemID)
	if err != nil {
		return "", err
	}

	// 尝试主站点
	url := fmt.Sprintf("https://codeforces.com/problemset/problem/%d/%s", contestID, index)
	statement, err := fetchProblemStatement(ctx, a.client, url)
	if err == nil && containsProblemStatement(statement) {
		return statement, nil
	}

	// 回退到镜像站点
	mirrorURL := fmt.Sprintf("http://mirror.codeforces.com/problemset/problem/%d/%s", contestID, index)
	return fetchProblemStatement(ctx, a.client, mirrorURL)
}

