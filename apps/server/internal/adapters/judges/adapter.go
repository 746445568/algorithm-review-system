package judges

import (
	"context"
	"ojreviewdesktop/internal/models"
)

type UserProfile struct {
	Rating    *int
	MaxRating *int
	Rank      string
}

type RatingHistoryEntry struct {
	ContestName string
	Rating      int
	Timestamp   string
}

type JudgeCapabilityStatus string

const (
	JudgeCapabilitySupported   JudgeCapabilityStatus = "supported"
	JudgeCapabilityUnsupported JudgeCapabilityStatus = "unsupported"
	JudgeCapabilityPartial     JudgeCapabilityStatus = "partial"
)

type JudgeFetchPath string

const (
	JudgeFetchPathOfficialAPI   JudgeFetchPath = "official_api"
	JudgeFetchPathPublicPage    JudgeFetchPath = "public_page"
	JudgeFetchPathBrowserImport JudgeFetchPath = "browser_import"
	JudgeFetchPathManual        JudgeFetchPath = "manual"
)

type JudgeFetchPaths struct {
	ProblemStatement JudgeFetchPath `json:"problemStatement"`
	SubmissionSource JudgeFetchPath `json:"submissionSource"`
}

type JudgeCapabilities struct {
	Platform           models.Platform       `json:"platform"`
	Label              string                `json:"label"`
	AccountSync        JudgeCapabilityStatus `json:"accountSync"`
	Profile            JudgeCapabilityStatus `json:"profile"`
	Contests           JudgeCapabilityStatus `json:"contests"`
	ProblemMetadata    JudgeCapabilityStatus `json:"problemMetadata"`
	ProblemStatement   JudgeCapabilityStatus `json:"problemStatement"`
	SubmissionSource   JudgeCapabilityStatus `json:"submissionSource"`
	PreferredFetchPath JudgeFetchPaths       `json:"preferredFetchPath"`
}

type Adapter interface {
	Capabilities() JudgeCapabilities
	ValidateAccount(ctx context.Context, handle string) error
	FetchSubmissions(ctx context.Context, handle string, cursor string) ([]models.Submission, string, error)
	FetchProblemMetadata(ctx context.Context, problemID string) (models.Problem, []string, error)
	NormalizeSubmission(raw any) (models.Submission, error)
	NextCursor(previous string, fetched []models.Submission) string
	FetchProfile(ctx context.Context, handle string) (UserProfile, error)
	FetchStatement(ctx context.Context, problemID string) (string, error)
	FetchSubmissionSource(ctx context.Context, submission models.Submission) (string, error)
	FetchRatingHistory(ctx context.Context, handle string) ([]RatingHistoryEntry, error)
}

type ContestAdapter interface {
	FetchContests(ctx context.Context) ([]models.Contest, error)
}
