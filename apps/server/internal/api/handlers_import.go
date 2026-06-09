package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"ojreviewdesktop/internal/models"
)

const importBodyLimitBytes = 2 * 1024 * 1024

type importProblemStatementPayload struct {
	Platform          string `json:"platform"`
	ExternalProblemID string `json:"externalProblemId"`
	ExternalContestID string `json:"externalContestId"`
	Title             string `json:"title"`
	URL               string `json:"url"`
	StatementText     string `json:"statementText"`
}

type importSubmissionSourcePayload struct {
	Platform             string `json:"platform"`
	ExternalSubmissionID string `json:"externalSubmissionId"`
	ExternalProblemID    string `json:"externalProblemId"`
	ExternalContestID    string `json:"externalContestId"`
	Title                string `json:"title"`
	URL                  string `json:"url"`
	SourceContestID      string `json:"sourceContestId"`
	Language             string `json:"language"`
	SubmittedAt          string `json:"submittedAt"`
	SourceCode           string `json:"sourceCode"`
}

func (s *Server) handleImportProblemStatement(w http.ResponseWriter, r *http.Request) {
	var payload importProblemStatementPayload
	if err := decodeImportJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	platform := parsePlatform(payload.Platform)
	externalProblemID := strings.TrimSpace(payload.ExternalProblemID)
	statement := strings.TrimSpace(payload.StatementText)
	if platform == "" || externalProblemID == "" || statement == "" {
		writeError(w, http.StatusBadRequest, "platform, externalProblemId, and statementText are required")
		return
	}

	problem, err := s.db.UpsertProblem(models.Problem{
		Platform:          platform,
		ExternalProblemID: externalProblemID,
		ExternalContestID: strings.TrimSpace(payload.ExternalContestID),
		Title:             fallbackProblemTitle(payload.Title, externalProblemID),
		URL:               strings.TrimSpace(payload.URL),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := s.db.SaveProblemStatement(problem.ID, statement); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"problem": problem,
		"status":  "imported",
	})
}

func (s *Server) handleImportSubmissionSource(w http.ResponseWriter, r *http.Request) {
	var payload importSubmissionSourcePayload
	if err := decodeImportJSON(w, r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	platform := parsePlatform(payload.Platform)
	externalSubmissionID := strings.TrimSpace(payload.ExternalSubmissionID)
	sourceCode := payload.SourceCode
	if platform == "" || externalSubmissionID == "" || strings.TrimSpace(sourceCode) == "" {
		writeError(w, http.StatusBadRequest, "platform, externalSubmissionId, and sourceCode are required")
		return
	}

	submission, err := s.db.GetSubmissionByExternalID(platform, externalSubmissionID)
	var problem models.Problem
	if err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		problem, submission, err = s.createImportedSubmission(platform, payload)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
	} else if submission.ProblemID > 0 {
		problem, _ = s.db.GetProblemByID(submission.ProblemID)
	}

	if err := s.db.SaveSubmissionSource(submission.ID, sourceCode); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"problem":    problem,
		"submission": submission,
		"status":     "imported",
	})
}

func (s *Server) createImportedSubmission(platform models.Platform, payload importSubmissionSourcePayload) (models.Problem, models.Submission, error) {
	externalProblemID := strings.TrimSpace(payload.ExternalProblemID)
	if externalProblemID == "" {
		return models.Problem{}, models.Submission{}, errors.New("externalProblemId is required when submission is not already synced")
	}

	problem, err := s.db.UpsertProblem(models.Problem{
		Platform:          platform,
		ExternalProblemID: externalProblemID,
		ExternalContestID: strings.TrimSpace(payload.ExternalContestID),
		Title:             fallbackProblemTitle(payload.Title, externalProblemID),
		URL:               strings.TrimSpace(payload.URL),
	})
	if err != nil {
		return models.Problem{}, models.Submission{}, err
	}

	submittedAt := time.Now().UTC()
	if parsed, parseErr := parseImportTime(payload.SubmittedAt); parseErr == nil {
		submittedAt = parsed
	}
	rawJSON, _ := json.Marshal(map[string]string{
		"importedBy":           "browser_extension",
		"externalProblemId":    externalProblemID,
		"externalSubmissionId": strings.TrimSpace(payload.ExternalSubmissionID),
		"sourceContestId":      strings.TrimSpace(payload.SourceContestID),
		"externalContestId":    strings.TrimSpace(payload.ExternalContestID),
	})

	submission, err := s.db.UpsertSubmission(models.Submission{
		Platform:             platform,
		ExternalSubmissionID: strings.TrimSpace(payload.ExternalSubmissionID),
		ProblemID:            problem.ID,
		Verdict:              models.VerdictUnknown,
		Language:             strings.TrimSpace(payload.Language),
		SubmittedAt:          submittedAt,
		SourceContestID:      strings.TrimSpace(payload.SourceContestID),
		RawJSON:              string(rawJSON),
	})
	if err != nil {
		return models.Problem{}, models.Submission{}, err
	}
	return problem, submission, nil
}

func decodeImportJSON(w http.ResponseWriter, r *http.Request, payload any) error {
	r.Body = http.MaxBytesReader(w, r.Body, importBodyLimitBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(payload)
}

func fallbackProblemTitle(title string, externalProblemID string) string {
	title = strings.TrimSpace(title)
	if title != "" {
		return title
	}
	return externalProblemID
}

func parseImportTime(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, errors.New("empty time")
	}
	parsed, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, err
	}
	return parsed.UTC(), nil
}
