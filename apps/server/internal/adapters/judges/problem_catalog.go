package judges

import (
	"context"

	"ojreviewdesktop/internal/models"
)

const (
	DifficultyScaleCodeforces = "CODEFORCES_RATING"
	DifficultyScaleAtCoder    = "ATCODER_PROBLEMS_DIFFICULTY"

	SourceCodeforcesProblemset = "CODEFORCES_PROBLEMSET"
	SourceAtCoderProblems      = "ATCODER_PROBLEMS"

	TagSourceCodeforcesOfficial     = "CODEFORCES_OFFICIAL"
	TagSourceAtCoderContestCategory = "ATCODER_CONTEST_CATEGORY"
)

type ProblemCatalogProvider interface {
	FetchProblemCatalog(ctx context.Context) ([]models.ProblemPoolItem, error)
}
