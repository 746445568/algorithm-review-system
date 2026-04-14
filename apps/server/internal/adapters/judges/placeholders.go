package judges

import (
	"context"
	"errors"

	"ojreviewdesktop/internal/models"
)

type PlaceholderAdapter struct {
	platform models.Platform
}

func NewPlaceholderAdapter(platform models.Platform) Adapter {
	return &PlaceholderAdapter{platform: platform}
}

func (a *PlaceholderAdapter) ValidateAccount(ctx context.Context, handle string) error {
	if handle == "" {
		return errors.New("handle is required")
	}
	return nil
}

func (a *PlaceholderAdapter) FetchSubmissions(ctx context.Context, handle string, cursor string) ([]models.Submission, string, error) {
	return []models.Submission{}, cursor, nil
}

func (a *PlaceholderAdapter) FetchProblemMetadata(ctx context.Context, problemID string) (models.Problem, []string, error) {
	return models.Problem{Platform: a.platform, ExternalProblemID: problemID}, []string{}, nil
}

func (a *PlaceholderAdapter) NormalizeSubmission(raw any) (models.Submission, error) {
	return models.Submission{Platform: a.platform, Verdict: models.VerdictUnknown}, nil
}

func (a *PlaceholderAdapter) NextCursor(previous string, fetched []models.Submission) string {
	return previous
}

func (a *PlaceholderAdapter) FetchProfile(ctx context.Context, handle string) (UserProfile, error) {
	return UserProfile{}, nil
}

func (a *PlaceholderAdapter) FetchStatement(ctx context.Context, problemID string) (string, error) {
	return "", nil
}

func (a *PlaceholderAdapter) FetchEditorial(problemID string) (string, error) {
	return "", nil
}

func (a *PlaceholderAdapter) FetchContests(ctx context.Context) ([]models.Contest, error) {
	return []models.Contest{}, nil
}
