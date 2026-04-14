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

type Adapter interface {
	ValidateAccount(ctx context.Context, handle string) error
	FetchSubmissions(ctx context.Context, handle string, cursor string) ([]models.Submission, string, error)
	FetchProblemMetadata(ctx context.Context, problemID string) (models.Problem, []string, error)
	NormalizeSubmission(raw any) (models.Submission, error)
	NextCursor(previous string, fetched []models.Submission) string
	FetchProfile(ctx context.Context, handle string) (UserProfile, error)
	FetchStatement(ctx context.Context, problemID string) (string, error)
}

type ContestAdapter interface {
	FetchContests(ctx context.Context) ([]models.Contest, error)
}
