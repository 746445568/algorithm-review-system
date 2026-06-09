package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestVerdictStats_EmptyDB(t *testing.T) {
	server := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/statistics/verdicts", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d; body: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	verdicts, ok := payload["verdicts"].([]any)
	if !ok {
		t.Fatalf("expected verdicts array, got %#v", payload["verdicts"])
	}
	if len(verdicts) != 0 {
		t.Fatalf("expected empty verdicts, got %d", len(verdicts))
	}
}

func TestBackupRestoreViaAPI(t *testing.T) {
	server := newTestServer(t)

	// Save identifiable data
	if err := server.db.SaveAISettings(models.AISettings{
		Provider: "openai",
		Model:    "gpt-4o",
		APIKey:   "sk-backup-test",
	}); err != nil {
		t.Fatalf("save AI settings: %v", err)
	}

	// 1. Backup
	req := httptest.NewRequest(http.MethodPost, "/api/settings/data/backup", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("backup: expected status %d, got %d; body: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	var backupResp map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&backupResp); err != nil {
		t.Fatalf("decode backup response: %v", err)
	}
	backupPath, _ := backupResp["backupPath"].(string)
	if backupPath == "" {
		t.Fatalf("expected backupPath, got %#v", backupResp)
	}

	// 2. Verify backup file exists
	if !fileExists(backupPath) {
		t.Fatalf("backup file does not exist: %s", backupPath)
	}

	// 3. Restore via API
	body := `{"backupPath":"` + escapeJSON(backupPath) + `"}`
	req = httptest.NewRequest(http.MethodPost, "/api/settings/data/restore", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("restore: expected status %d, got %d; body: %s", http.StatusOK, rec.Code, rec.Body.String())
	}

	// 4. Verify data survived
	settings, err := server.db.LoadAISettings()
	if err != nil {
		t.Fatalf("load AI settings after restore: %v", err)
	}
	if settings.Provider != "openai" || settings.APIKey != "sk-backup-test" {
		t.Fatalf("expected original data after restore, got provider=%s key=%s", settings.Provider, settings.APIKey)
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func escapeJSON(s string) string {
	return strings.ReplaceAll(s, `\`, `\\`)
}
