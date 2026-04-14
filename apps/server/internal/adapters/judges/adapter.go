package judges

import "ojreviewdesktop/internal/models"

type UserProfile struct {
	Rating    *int
	MaxRating *int
	Rank      string
}

type Adapter interface {
	ValidateAccount(handle string) error
	FetchSubmissions(handle string, cursor string) ([]models.Submission, string, error)
	FetchProblemMetadata(problemID string) (models.Problem, []string, error)
	NormalizeSubmission(raw any) (models.Submission, error)
	NextCursor(previous string, fetched []models.Submission) string
	FetchProfile(handle string) (UserProfile, error)
	FetchStatement(problemID string) (string, error)
}

type ContestAdapter interface {
	FetchContests() ([]models.Contest, error)
}
