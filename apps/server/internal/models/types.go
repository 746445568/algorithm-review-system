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
	TaskTypeSync     TaskType = "sync_task"
	TaskTypeAnalysis TaskType = "analysis_task"
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
	ID           int64      `json:"id"`
	Platform     Platform   `json:"platform"`
	Title        string     `json:"title"`
	TargetRating int        `json:"targetRating"`
	Deadline     *time.Time `json:"deadline,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
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
