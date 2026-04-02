package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"ojreviewdesktop/internal/app"
	cryptovault "ojreviewdesktop/internal/crypto"
	"ojreviewdesktop/internal/models"
	"ojreviewdesktop/internal/storage"
)

func newTestServer(t *testing.T) *Server {
	t.Helper()

	baseDir := t.TempDir()
	cfg := app.Config{
		AppDir:        baseDir,
		DataDir:       filepath.Join(baseDir, "data"),
		LogDir:        filepath.Join(baseDir, "logs"),
		CacheDir:      filepath.Join(baseDir, "cache"),
		ExportDir:     filepath.Join(baseDir, "exports"),
		SecureDir:     filepath.Join(baseDir, "secure"),
		DBPath:        filepath.Join(baseDir, "data", "ojreview.db"),
		ListenAddr:    "127.0.0.1:0",
		MasterKeyPath: filepath.Join(baseDir, "secure", "master.key"),
	}

	for _, dir := range []string{cfg.DataDir, cfg.LogDir, cfg.CacheDir, cfg.ExportDir, cfg.SecureDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}

	vault, err := cryptovault.LoadOrCreateVault(cfg)
	if err != nil {
		t.Fatalf("load vault: %v", err)
	}

	db, err := storage.Open(cfg, vault)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	return NewServer(cfg, db, nil)
}

func readHealthResponse(t *testing.T, server *Server) map[string]any {
	t.Helper()

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()

	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	return payload
}

func TestHealth_FirstRunTrue_WhenNoAIKey(t *testing.T) {
	server := newTestServer(t)

	payload := readHealthResponse(t, server)

	firstRun, ok := payload["firstRun"].(bool)
	if !ok {
		t.Fatalf("expected firstRun bool field, got %#v", payload["firstRun"])
	}
	if !firstRun {
		t.Fatalf("expected firstRun to be true")
	}
}

func TestHealth_FirstRunFalse_WhenAIKeySet(t *testing.T) {
	server := newTestServer(t)
	if err := server.db.SaveAISettings(models.AISettings{
		Provider: "openai",
		Model:    "gpt-4o-mini",
		APIKey:   "test-key",
	}); err != nil {
		t.Fatalf("save AI settings: %v", err)
	}

	payload := readHealthResponse(t, server)

	firstRun, ok := payload["firstRun"].(bool)
	if !ok {
		t.Fatalf("expected firstRun bool field, got %#v", payload["firstRun"])
	}
	if firstRun {
		t.Fatalf("expected firstRun to be false")
	}
}
