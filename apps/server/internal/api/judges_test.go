package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/models"
)

type artifactRecordingAdapter struct {
	caps        judges.JudgeCapabilities
	statement   string
	source      string
	statementN  int
	sourceN     int
	metadataErr error
}

func (a *artifactRecordingAdapter) Capabilities() judges.JudgeCapabilities {
	return a.caps
}

func (a *artifactRecordingAdapter) ValidateAccount(ctx context.Context, handle string) error {
	return nil
}

func (a *artifactRecordingAdapter) FetchSubmissions(ctx context.Context, handle string, cursor string) ([]models.Submission, string, error) {
	return []models.Submission{}, "", nil
}

func (a *artifactRecordingAdapter) FetchProblemMetadata(ctx context.Context, problemID string) (models.Problem, []string, error) {
	if a.metadataErr != nil {
		return models.Problem{}, nil, a.metadataErr
	}
	return models.Problem{Platform: a.caps.Platform, ExternalProblemID: problemID}, []string{}, nil
}

func (a *artifactRecordingAdapter) NormalizeSubmission(raw any) (models.Submission, error) {
	return models.Submission{}, nil
}

func (a *artifactRecordingAdapter) NextCursor(previous string, fetched []models.Submission) string {
	return ""
}

func (a *artifactRecordingAdapter) FetchProfile(ctx context.Context, handle string) (judges.UserProfile, error) {
	return judges.UserProfile{}, nil
}

func (a *artifactRecordingAdapter) FetchStatement(ctx context.Context, problemID string) (string, error) {
	a.statementN++
	if a.statement == "" {
		return "", errors.New("statement unavailable")
	}
	return a.statement, nil
}

func (a *artifactRecordingAdapter) FetchSubmissionSource(ctx context.Context, submission models.Submission) (string, error) {
	a.sourceN++
	if a.source == "" {
		return "", errors.New("source unavailable")
	}
	return a.source, nil
}

func TestJudgesEndpointReturnsRegisteredAdapterCapabilities(t *testing.T) {
	server := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/system/judges", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload []judges.JudgeCapabilities
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload) != 2 {
		t.Fatalf("judge count = %d, want 2", len(payload))
	}

	byPlatform := make(map[models.Platform]judges.JudgeCapabilities)
	for _, caps := range payload {
		byPlatform[caps.Platform] = caps
	}
	if byPlatform[models.PlatformCodeforces].SubmissionSource != judges.JudgeCapabilitySupported {
		t.Fatalf("Codeforces submissionSource = %q, want supported", byPlatform[models.PlatformCodeforces].SubmissionSource)
	}
	if byPlatform[models.PlatformAtCoder].SubmissionSource != judges.JudgeCapabilityUnsupported {
		t.Fatalf("AtCoder submissionSource = %q, want unsupported", byPlatform[models.PlatformAtCoder].SubmissionSource)
	}
}

func TestEnsureProblemAnalysisArtifactsSkipsUnsupportedFetchers(t *testing.T) {
	server := newTestServer(t)
	adapter := &artifactRecordingAdapter{
		caps: judges.JudgeCapabilities{
			Platform:           models.PlatformCodeforces,
			Label:              "Codeforces",
			ProblemStatement:   judges.JudgeCapabilityUnsupported,
			SubmissionSource:   judges.JudgeCapabilityUnsupported,
			PreferredFetchPath: judges.JudgeFetchPaths{},
		},
		statement: "statement should not be fetched",
		source:    "source should not be fetched",
	}
	server.adapters[models.PlatformCodeforces] = adapter

	problem, err := server.db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "4/A",
		Title:             "Watermelon",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	if _, err := server.db.UpsertSubmission(models.Submission{
		Platform:             models.PlatformCodeforces,
		ExternalSubmissionID: "123",
		ProblemID:            problem.ID,
		Verdict:              models.VerdictWA,
		SubmittedAt:          time.Now().UTC(),
		RawJSON:              `{}`,
	}); err != nil {
		t.Fatalf("upsert submission: %v", err)
	}

	server.ensureProblemAnalysisArtifacts(context.Background(), problem.ID)

	if adapter.statementN != 0 {
		t.Fatalf("FetchStatement calls = %d, want 0", adapter.statementN)
	}
	if adapter.sourceN != 0 {
		t.Fatalf("FetchSubmissionSource calls = %d, want 0", adapter.sourceN)
	}
}
