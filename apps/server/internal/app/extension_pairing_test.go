package app

import "testing"

func TestExtensionPairingPersistsHashAndOrigin(t *testing.T) {
	secureDir := t.TempDir()
	if err := SaveExtensionPairing(secureDir, "token-hash", "chrome-extension://abcdefghijklmnopabcdefghijklmnop"); err != nil {
		t.Fatalf("save extension pairing: %v", err)
	}

	tokenHash, origin, err := loadExtensionPairing(secureDir)
	if err != nil {
		t.Fatalf("load extension pairing: %v", err)
	}
	if tokenHash != "token-hash" {
		t.Fatalf("token hash = %q, want %q", tokenHash, "token-hash")
	}
	if origin != "chrome-extension://abcdefghijklmnopabcdefghijklmnop" {
		t.Fatalf("origin = %q", origin)
	}
}

func TestExtensionPairingMissingFileIsUnpaired(t *testing.T) {
	tokenHash, origin, err := loadExtensionPairing(t.TempDir())
	if err != nil {
		t.Fatalf("load missing extension pairing: %v", err)
	}
	if tokenHash != "" || origin != "" {
		t.Fatalf("missing pairing = (%q, %q), want empty", tokenHash, origin)
	}
}
