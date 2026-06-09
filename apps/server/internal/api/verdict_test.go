package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"ojreviewdesktop/internal/models"
)

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
