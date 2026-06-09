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

func TestVerdictStats_EmptyDB(t *testing.T) {
	server := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/api/statistics/verdicts", nil)
	rec := httptest.NewRecorder()

	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Verdicts []map[string]any `json:"verdicts"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Verdicts == nil {
		t.Fatalf("expected non-nil verdicts")
	}
	if len(body.Verdicts) != 0 {
		t.Fatalf("len(verdicts) = %d, want 0", len(body.Verdicts))
	}
}

func TestVerdictStats_ReturnsGroupedCounts(t *testing.T) {
	server := newTestServer(t)
	problem, err := server.db.UpsertProblem(models.Problem{
		Platform:          models.PlatformCodeforces,
		ExternalProblemID: "1000/A",
		Title:             "Test Problem A",
	})
	if err != nil {
		t.Fatalf("upsert problem: %v", err)
	}
	verdicts := []models.Verdict{
		models.VerdictAC,
		models.VerdictWA,
		models.VerdictWA,
		models.VerdictTLE,
	}
	for i, verdict := range verdicts {
		_, err := server.db.UpsertSubmission(models.Submission{
			Platform:             models.PlatformCodeforces,
			ExternalSubmissionID: string(rune('a' + i)),
			ProblemID:            problem.ID,
			Verdict:              verdict,
			SubmittedAt:          time.Date(2026, 6, 9, i, 0, 0, 0, time.UTC),
			RawJSON:              "{}",
		})
		if err != nil {
			t.Fatalf("upsert submission %d: %v", i, err)
		}
	}
	req := httptest.NewRequest(http.MethodGet, "/api/statistics/verdicts", nil)
	rec := httptest.NewRecorder()

	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}
	var body struct {
		Verdicts []struct {
			Verdict string `json:"verdict"`
			Count   int    `json:"count"`
		} `json:"verdicts"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	counts := map[string]int{}
	for _, item := range body.Verdicts {
		counts[item.Verdict] = item.Count
	}
	if counts[string(models.VerdictAC)] != 1 {
		t.Fatalf("AC count = %d, want 1", counts[string(models.VerdictAC)])
	}
	if counts[string(models.VerdictWA)] != 2 {
		t.Fatalf("WA count = %d, want 2", counts[string(models.VerdictWA)])
	}
	if counts[string(models.VerdictTLE)] != 1 {
		t.Fatalf("TLE count = %d, want 1", counts[string(models.VerdictTLE)])
	}
}

func TestBackupRestoreViaAPI(t *testing.T) {
	server := newTestServer(t)
	original := models.AISettings{
		Provider: "openai",
		Model:    "gpt-4o",
		APIKey:   "sk-test-backup-key",
	}
	if err := server.db.SaveAISettings(original); err != nil {
		t.Fatalf("save original AI settings: %v", err)
	}

	backupReq := httptest.NewRequest(http.MethodPost, "/api/settings/data/backup", nil)
	backupRec := httptest.NewRecorder()
	server.Router().ServeHTTP(backupRec, backupReq)
	if backupRec.Code != http.StatusOK {
		t.Fatalf("backup status = %d, want %d; body=%s", backupRec.Code, http.StatusOK, backupRec.Body.String())
	}
	var backupBody struct {
		BackupPath string `json:"backupPath"`
	}
	if err := json.NewDecoder(backupRec.Body).Decode(&backupBody); err != nil {
		t.Fatalf("decode backup response: %v", err)
	}
	if backupBody.BackupPath == "" {
		t.Fatalf("expected backupPath in response")
	}

	modified := models.AISettings{
		Provider: "deepseek",
		Model:    "deepseek-chat",
		APIKey:   "sk-modified",
	}
	if err := server.db.SaveAISettings(modified); err != nil {
		t.Fatalf("save modified AI settings: %v", err)
	}

	restorePayload, err := json.Marshal(map[string]string{"backupPath": backupBody.BackupPath})
	if err != nil {
		t.Fatalf("marshal restore payload: %v", err)
	}
	restoreReq := httptest.NewRequest(http.MethodPost, "/api/settings/data/restore", bytes.NewReader(restorePayload))
	restoreReq.Header.Set("Content-Type", "application/json")
	restoreRec := httptest.NewRecorder()
	server.Router().ServeHTTP(restoreRec, restoreReq)
	if restoreRec.Code != http.StatusOK {
		t.Fatalf("restore status = %d, want %d; body=%s", restoreRec.Code, http.StatusOK, restoreRec.Body.String())
	}

	settings, err := server.db.LoadAISettings()
	if err != nil {
		t.Fatalf("load restored AI settings: %v", err)
	}
	if settings.Provider != original.Provider {
		t.Fatalf("Provider after restore = %q, want %q", settings.Provider, original.Provider)
	}
	if settings.Model != original.Model {
		t.Fatalf("Model after restore = %q, want %q", settings.Model, original.Model)
	}
	if settings.APIKey != original.APIKey {
		t.Fatalf("APIKey after restore = %q, want %q", settings.APIKey, original.APIKey)
	}
}
