package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ojreviewdesktop/internal/models"
)

func TestImportProblemStatementSavesStatementForAnalysis(t *testing.T) {
	server := newTestServer(t)
	payload := map[string]any{
		"platform":          "CODEFORCES",
		"externalProblemId": "4/A",
		"title":             "Watermelon",
		"url":               "https://codeforces.com/problemset/problem/4/A",
		"statementText":     "A visible problem statement",
	}

	rec := postJSON(t, server, "/api/import/problem-statement", payload)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Problem models.Problem `json:"problem"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	statement, err := server.db.GetProblemStatement(body.Problem.ID)
	if err != nil {
		t.Fatalf("get statement: %v", err)
	}
	if statement != "A visible problem statement" {
		t.Fatalf("statement = %q, want imported text", statement)
	}
}

func TestImportSubmissionSourceUpdatesExistingSubmission(t *testing.T) {
	server := newTestServer(t)
	problem, err := server.db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "4/A",
		Title:             "Watermelon",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	submission, err := server.db.UpsertSubmission(models.Submission{
		Platform:             models.PlatformCodeforces,
		ExternalSubmissionID: "123456",
		ProblemID:            problem.ID,
		Verdict:              models.VerdictWA,
		SubmittedAt:          time.Now().UTC(),
		RawJSON:              `{}`,
	})
	if err != nil {
		t.Fatalf("upsert submission: %v", err)
	}
	payload := map[string]any{
		"platform":             "CODEFORCES",
		"externalSubmissionId": "123456",
		"sourceCode":           "int main() { return 0; }",
	}

	rec := postJSON(t, server, "/api/import/submission-source", payload)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	data, err := server.db.GetProblemAnalysisData(problem.ID)
	if err != nil {
		t.Fatalf("get analysis data: %v", err)
	}
	if len(data.Submissions) != 1 {
		t.Fatalf("submission count = %d, want 1", len(data.Submissions))
	}
	if data.Submissions[0]["sourceCode"] != "int main() { return 0; }" {
		t.Fatalf("sourceCode = %#v, want imported source", data.Submissions[0]["sourceCode"])
	}
	if submission.ID == 0 {
		t.Fatalf("expected existing submission id to be populated")
	}
}

func TestImportSubmissionSourceCreatesMinimalSubmissionWhenProblemIsProvided(t *testing.T) {
	server := newTestServer(t)
	payload := map[string]any{
		"platform":             "CODEFORCES",
		"externalSubmissionId": "999",
		"externalProblemId":    "4/A",
		"title":                "Watermelon",
		"sourceContestId":      "4",
		"language":             "GNU C++17",
		"sourceCode":           "#include <iostream>\nint main(){}",
	}

	rec := postJSON(t, server, "/api/import/submission-source", payload)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Problem    models.Problem    `json:"problem"`
		Submission models.Submission `json:"submission"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Problem.ExternalProblemID != "4/A" {
		t.Fatalf("problem id = %q, want 4/A", body.Problem.ExternalProblemID)
	}
	data, err := server.db.GetProblemAnalysisData(body.Problem.ID)
	if err != nil {
		t.Fatalf("get analysis data: %v", err)
	}
	if got := data.Submissions[0]["sourceCode"]; got != "#include <iostream>\nint main(){}" {
		t.Fatalf("sourceCode = %#v, want imported source", got)
	}
}

func TestImportProblemStatementRejectsEmptyStatement(t *testing.T) {
	server := newTestServer(t)
	payload := map[string]any{
		"platform":          "CODEFORCES",
		"externalProblemId": "4/A",
		"statementText":     "   ",
	}

	rec := postJSON(t, server, "/api/import/problem-statement", payload)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func postJSON(t *testing.T, server *Server, path string, payload any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	return rec
}
