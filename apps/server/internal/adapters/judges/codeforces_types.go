package judges

import (
	"encoding/json"
)

type codeforcesAPIEnvelope struct {
	Status  string          `json:"status"`
	Comment string          `json:"comment"`
	Result  json.RawMessage `json:"result"`
}

type codeforcesUser struct {
	Handle string `json:"handle"`
}

type codeforcesProblem struct {
	ContestID int      `json:"contestId"`
	Index     string   `json:"index"`
	Name      string   `json:"name"`
	Rating    int      `json:"rating"`
	Tags      []string `json:"tags"`
}

type codeforcesSubmissionRaw struct {
	ID                  int               `json:"id"`
	ContestID           int               `json:"contestId"`
	CreationTimeSeconds int64             `json:"creationTimeSeconds"`
	ProgrammingLanguage string            `json:"programmingLanguage"`
	Verdict             string            `json:"verdict"`
	TimeConsumedMillis  int               `json:"timeConsumedMillis"`
	MemoryConsumedBytes int               `json:"memoryConsumedBytes"`
	Problem             codeforcesProblem `json:"problem"`
}

type codeforcesProblemSetResult struct {
	Problems []codeforcesProblem `json:"problems"`
}

type codeforcesContest struct {
	ID              int    `json:"id"`
	Name            string `json:"name"`
	StartTimeSecond int64  `json:"startTimeSeconds"`
	DurationSeconds int    `json:"durationSeconds"`
	Phase           string `json:"phase"`
}
