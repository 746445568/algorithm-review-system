package judges

type atCoderSubmission struct {
	ID            int64   `json:"id"`
	EpochSecond   int64   `json:"epoch_second"`
	ProblemID     string  `json:"problem_id"`
	ContestID     string  `json:"contest_id"`
	UserID        string  `json:"user_id"`
	Language      string  `json:"language"`
	Point         float64 `json:"point"`
	Length        int64   `json:"length"`
	Result        string  `json:"result"`
	ExecutionTime int     `json:"execution_time"`
}

type atCoderProblem struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	ContestID    string `json:"contest_id"`
	ProblemIndex string `json:"problem_index"`
}

type atCoderMergedProblem struct {
	ID           string `json:"id"`
	ContestID    string `json:"contest_id"`
	ProblemIndex string `json:"problem_index"`
	Name         string `json:"name"`
	Title        string `json:"title"`
	SolverCount  *int   `json:"solver_count"`
}

type atCoderContestProblem struct {
	ContestID    string `json:"contest_id"`
	ProblemID    string `json:"problem_id"`
	ProblemIndex string `json:"problem_index"`
}

type atCoderProblemModel struct {
	Difficulty     *int     `json:"difficulty"`
	Discrimination *float64 `json:"discrimination"`
	IsExperimental bool     `json:"is_experimental"`
}

type atCoderContest struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	StartEpochSecond int64  `json:"start_epoch_second"`
	DurationSecond   int64  `json:"duration_second"`
}
