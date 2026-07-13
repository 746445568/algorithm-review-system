package app

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigCreatesPersistentServiceToken(t *testing.T) {
	t.Setenv("OJREVIEW_APP_DIR", t.TempDir())
	t.Setenv("OJREVIEW_SERVICE_TOKEN", "")

	first, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	second, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}

	if first.ListenAddr != "127.0.0.1:38473" {
		t.Fatalf("ListenAddr = %q", first.ListenAddr)
	}
	if first.ServiceToken == "" || first.ServiceToken != second.ServiceToken {
		t.Fatalf("service token must be non-empty and persistent")
	}
	decoded, err := base64.RawURLEncoding.DecodeString(first.ServiceToken)
	if err != nil || len(decoded) != 32 {
		t.Fatalf("service token must contain 32 random bytes")
	}
	if _, err := os.Stat(filepath.Join(first.SecureDir, "service-auth.token")); err != nil {
		t.Fatalf("token file: %v", err)
	}
}
