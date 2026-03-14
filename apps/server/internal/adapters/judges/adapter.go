package judges

import "ojreviewdesktop/internal/models"

type Adapter interface {
	ValidateAccount(handle string) error
	FetchSubmissions(handle string, cursor string) ([]models.Submission, string, error)
	FetchProblemMetadata(problemID string) (models.Problem, []string, error)
	NormalizeSubmission(raw any) (models.Submission, error)
	NextCursor(previous string, fetched []models.Submission) string
}

type ContestAdapter interface {
	FetchContests() ([]models.Contest, error)
}
