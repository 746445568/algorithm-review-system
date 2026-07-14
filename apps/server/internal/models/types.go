package models

import "time"

type Platform string

const (
	PlatformCodeforces Platform = "CODEFORCES"
	PlatformAtCoder    Platform = "ATCODER"
	PlatformManual     Platform = "MANUAL"
)

type Verdict string

const (
	VerdictAC      Verdict = "AC"
	VerdictWA      Verdict = "WA"
	VerdictTLE     Verdict = "TLE"
	VerdictMLE     Verdict = "MLE"
	VerdictRE      Verdict = "RE"
	VerdictCE      Verdict = "CE"
	VerdictOLE     Verdict = "OLE"
	VerdictIE      Verdict = "IE"
	VerdictUnknown Verdict = "UNKNOWN"
)

type TaskStatus string

const (
	TaskPending        TaskStatus = "PENDING"
	TaskRunning        TaskStatus = "RUNNING"
	TaskSuccess        TaskStatus = "SUCCESS"
	TaskFailed         TaskStatus = "FAILED"
	TaskPartialSuccess TaskStatus = "PARTIAL_SUCCESS"
	TaskCancelled      TaskStatus = "CANCELLED"
)

type TaskType string

const (
	TaskTypeSync            TaskType = "sync_task"
	TaskTypeAnalysis        TaskType = "analysis_task"
	TaskTypeProblemPoolSync TaskType = "problem_pool_sync_task"
)

type ReviewStatus string

const (
	ReviewStatusTodo      ReviewStatus = "TODO"
	ReviewStatusReviewing ReviewStatus = "REVIEWING"
	ReviewStatusScheduled ReviewStatus = "SCHEDULED"
	ReviewStatusDone      ReviewStatus = "DONE"
)

type OwnerProfile struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

type PlatformAccount struct {
	ID             int64      `json:"id"`
	Platform       Platform   `json:"platform"`
	ExternalHandle string     `json:"externalHandle"`
	Status         string     `json:"status"`
	LastSyncedAt   *time.Time `json:"lastSyncedAt"`
	LastCursor     string     `json:"lastCursor,omitempty"`
	Rating         *int       `json:"rating,omitempty"`
	MaxRating      *int       `json:"maxRating,omitempty"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`
}

type Goal struct {
	ID           int64  `json:"id"`
	Platform     string `json:"platform"`
	Title        string `json:"title"`
	TargetRating int    `json:"targetRating"`
	Deadline     string `json:"deadline"`
	CreatedAt    string `json:"createdAt"`
}

type Problem struct {
	ID                int64     `json:"id"`
	Platform          Platform  `json:"platform"`
	ExternalProblemID string    `json:"externalProblemId"`
	ExternalContestID string    `json:"externalContestId,omitempty"`
	Title             string    `json:"title"`
	URL               string    `json:"url,omitempty"`
	Difficulty        string    `json:"difficulty,omitempty"`
	RawTagsJSON       string    `json:"rawTagsJson,omitempty"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type ProblemPoolTag struct {
	Name       string  `json:"name"`
	Source     string  `json:"source"`
	Confidence float64 `json:"confidence"`
}

type ProblemPoolItem struct {
	ID                int64            `json:"id"`
	Platform          Platform         `json:"platform"`
	ExternalProblemID string           `json:"externalProblemId"`
	ExternalContestID string           `json:"externalContestId,omitempty"`
	ProblemIndex      string           `json:"problemIndex,omitempty"`
	Title             string           `json:"title"`
	URL               string           `json:"url,omitempty"`
	DifficultyValue   *int             `json:"difficultyValue,omitempty"`
	DifficultyRaw     *int             `json:"difficultyRawValue,omitempty"`
	DifficultyScale   string           `json:"difficultyScale,omitempty"`
	Source            string           `json:"source"`
	SolverCount       *int             `json:"solverCount,omitempty"`
	IsExperimental    bool             `json:"isExperimental"`
	Tags              []ProblemPoolTag `json:"tags,omitempty"`
	FetchedAt         string           `json:"fetchedAt,omitempty"`
	LastSeenAt        string           `json:"lastSeenAt,omitempty"`
	UpdatedAt         string           `json:"updatedAt,omitempty"`
}

type ProblemChat struct {
	ID        int64     `json:"id"`
	ProblemID int64     `json:"problemId"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
}

type Submission struct {
	ID                   int64     `json:"id"`
	PlatformAccountID    *int64    `json:"platformAccountId,omitempty"`
	Platform             Platform  `json:"platform"`
	ExternalSubmissionID string    `json:"externalSubmissionId"`
	ProblemID            int64     `json:"problemId"`
	Verdict              Verdict   `json:"verdict"`
	Language             string    `json:"language,omitempty"`
	SubmittedAt          time.Time `json:"submittedAt"`
	ExecutionTimeMS      *int      `json:"executionTimeMs,omitempty"`
	MemoryKB             *int      `json:"memoryKb,omitempty"`
	SourceContestID      string    `json:"sourceContestId,omitempty"`
	RawJSON              string    `json:"rawJson"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type SyncTask struct {
	ID                int64      `json:"id"`
	PlatformAccountID int64      `json:"platformAccountId"`
	Status            TaskStatus `json:"status"`
	TaskType          TaskType   `json:"taskType"`
	CursorBefore      string     `json:"cursorBefore,omitempty"`
	CursorAfter       string     `json:"cursorAfter,omitempty"`
	FetchedCount      int        `json:"fetchedCount"`
	InsertedCount     int        `json:"insertedCount"`
	RetryCount        int        `json:"retryCount"`
	ErrorMessage      string     `json:"errorMessage,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	StartedAt         *time.Time `json:"startedAt,omitempty"`
	FinishedAt        *time.Time `json:"finishedAt,omitempty"`
}

type ReviewSnapshot struct {
	ID          int64     `json:"id"`
	GeneratedAt time.Time `json:"generatedAt"`
	SummaryJSON string    `json:"summaryJson"`
}

type ProblemReviewState struct {
	ProblemID       int64        `json:"problemId"`
	Status          ReviewStatus `json:"status"`
	Notes           string       `json:"notes"`
	NextReviewAt    *time.Time   `json:"nextReviewAt,omitempty"`
	LastUpdatedAt   time.Time    `json:"lastUpdatedAt"`
	EaseFactor      float64      `json:"easeFactor"`
	IntervalDays    int          `json:"intervalDays"`
	RepetitionCount int          `json:"repetitionCount"`
	LastQuality     *int         `json:"lastQuality,omitempty"`
	QualityHistory  string       `json:"qualityHistory,omitempty"`
}

type AnalysisTask struct {
	ID              int64      `json:"id"`
	Status          TaskStatus `json:"status"`
	Provider        string     `json:"provider"`
	Model           string     `json:"model"`
	InputSnapshotID int64      `json:"inputSnapshotId"`
	ResultText      string     `json:"resultText,omitempty"`
	ResultJSON      string     `json:"resultJson,omitempty"`
	ErrorMessage    string     `json:"errorMessage,omitempty"`
	RetryCount      int        `json:"retryCount"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type AISettings struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	BaseURL  string `json:"baseUrl,omitempty"`
	APIKey   string `json:"apiKey,omitempty"`
}

type Contest struct {
	ID                int64      `json:"id"`
	Platform          Platform   `json:"platform"`
	ExternalContestID string     `json:"externalContestId"`
	Name              string     `json:"name"`
	StartTime         time.Time  `json:"startTime"`
	DurationMinutes   int        `json:"durationMinutes"`
	URL               string     `json:"url,omitempty"`
	Status            string     `json:"status"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
	LastSyncedAt      *time.Time `json:"lastSyncedAt,omitempty"`
}

type ProblemPoolSyncTask struct {
	ID            int64      `json:"id"`
	Status        TaskStatus `json:"status"`
	PlatformsJSON string     `json:"platformsJson"`
	FetchedCount  int        `json:"fetchedCount"`
	InsertedCount int        `json:"insertedCount"`
	UpdatedCount  int        `json:"updatedCount"`
	ErrorMessage  string     `json:"errorMessage,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	StartedAt     *time.Time `json:"startedAt,omitempty"`
	FinishedAt    *time.Time `json:"finishedAt,omitempty"`
}

type RecommendationProblem struct {
	Key               string   `json:"key"`
	CandidateType     string   `json:"candidateType"`
	ID                int64    `json:"id"`
	Title             string   `json:"title"`
	Platform          Platform `json:"platform"`
	ExternalProblemID string   `json:"externalProblemId"`
	Difficulty        string   `json:"difficulty"`
	DifficultyValue   *int     `json:"difficultyValue,omitempty"`
	DifficultyScale   string   `json:"difficultyScale,omitempty"`
	URL               string   `json:"url,omitempty"`
	Tags              []string `json:"tags"`
	Reason            string   `json:"reason"`
	ReasonText        string   `json:"reasonText"`
	MasteryLevel      *float64 `json:"masteryLevel,omitempty"`
	KnowledgeName     string   `json:"knowledgeName,omitempty"`
	IsNew             bool     `json:"isNew"`
	Score             float64  `json:"score"`
}

type RecommendationResponse struct {
	Problem     *RecommendationProblem `json:"problem"`
	EmptyReason string                 `json:"emptyReason"`
}

type ErrorPattern struct {
	ID           int64   `json:"id"`
	ProblemID    int64   `json:"problem_id"`
	SubmissionID string  `json:"submission_id,omitempty"`
	PatternType  string  `json:"pattern_type"`
	Description  string  `json:"description"`
	Confidence   float64 `json:"ai_confidence"`
	CreatedAt    string  `json:"created_at"`
}

type ErrorPatternStats struct {
	PatternType   string  `json:"pattern_type"`
	Count         int     `json:"count"`
	AvgConfidence float64 `json:"avg_confidence"`
}

type KnowledgeNode struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	ParentID    *int64 `json:"parentId,omitempty"`
	Description string `json:"description"`
	CreatedAt   string `json:"createdAt"`
}

type ProblemKnowledge struct {
	ProblemID    int64   `json:"problemId"`
	KnowledgeID  int64   `json:"knowledgeId"`
	MasteryLevel float64 `json:"masteryLevel"`
}

type RatingEntry struct {
	ID          int64  `json:"id"`
	AccountID   int64  `json:"accountId"`
	ContestName string `json:"contestName"`
	Rating      int    `json:"rating"`
	Timestamp   string `json:"timestamp"`
}
