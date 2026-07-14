package api

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"ojreviewdesktop/internal/app"
)

const (
	extensionPairingLifetime = 5 * time.Minute
	extensionPairingAttempts = 5
)

var chromeExtensionIDPattern = regexp.MustCompile(`^[a-p]{32}$`)

func (s *Server) handleExtensionPairingStatus(w http.ResponseWriter, _ *http.Request) {
	s.extensionMu.RLock()
	paired := s.extensionTokenHash != "" && s.extensionOrigin != ""
	origin := s.extensionOrigin
	s.extensionMu.RUnlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"paired": paired,
		"origin": origin,
	})
}

func (s *Server) handleStartExtensionPairing(w http.ResponseWriter, _ *http.Request) {
	code, err := generateExtensionPairingCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	now := s.pairingNow().UTC()
	expiresAt := now.Add(extensionPairingLifetime)

	s.extensionMu.Lock()
	s.pairingCode = code
	s.pairingExpiresAt = expiresAt
	s.pairingAttempts = extensionPairingAttempts
	s.extensionMu.Unlock()

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"code":      code,
		"expiresAt": expiresAt.Format(time.RFC3339),
	})
}

func (s *Server) handleClaimExtensionPairing(w http.ResponseWriter, r *http.Request) {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if !validChromeExtensionOrigin(origin) {
		writeError(w, http.StatusForbidden, "browser extension origin is required")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var payload struct {
		Code string `json:"code"`
	}
	if err := decoder.Decode(&payload); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	token, err := generateExtensionImportToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	tokenHash := hashExtensionImportToken(token)

	s.extensionMu.Lock()
	defer s.extensionMu.Unlock()
	now := s.pairingNow().UTC()
	code := strings.TrimSpace(payload.Code)
	valid := s.pairingCode != "" &&
		s.pairingAttempts > 0 &&
		now.Before(s.pairingExpiresAt) &&
		len(code) == len(s.pairingCode) &&
		subtle.ConstantTimeCompare([]byte(code), []byte(s.pairingCode)) == 1
	if !valid {
		if s.pairingAttempts > 0 {
			s.pairingAttempts--
		}
		if s.pairingAttempts == 0 || !now.Before(s.pairingExpiresAt) {
			s.clearExtensionPairingCodeLocked()
		}
		writeError(w, http.StatusUnauthorized, "pairing code is invalid or expired")
		return
	}

	if err := app.SaveExtensionPairing(s.cfg.SecureDir, tokenHash, origin); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.extensionTokenHash = tokenHash
	s.extensionOrigin = origin
	s.clearExtensionPairingCodeLocked()

	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]string{"token": token})
}

func (s *Server) clearExtensionPairingCodeLocked() {
	s.pairingCode = ""
	s.pairingExpiresAt = time.Time{}
	s.pairingAttempts = 0
}

func (s *Server) allowsExtensionImport(r *http.Request, token string) bool {
	if r.Method != http.MethodPost || !isExtensionImportPath(r.URL.Path) || token == "" {
		return false
	}
	s.extensionMu.RLock()
	tokenHash := s.extensionTokenHash
	origin := s.extensionOrigin
	s.extensionMu.RUnlock()
	if tokenHash == "" || origin == "" || r.Header.Get("Origin") != origin {
		return false
	}
	providedHash := hashExtensionImportToken(token)
	return subtle.ConstantTimeCompare([]byte(providedHash), []byte(tokenHash)) == 1
}

func (s *Server) allowsExtensionOrigin(r *http.Request, origin string) bool {
	if r.URL.Path == "/api/extension/pairing/claim" {
		return validChromeExtensionOrigin(origin)
	}
	s.extensionMu.RLock()
	pairedOrigin := s.extensionOrigin
	s.extensionMu.RUnlock()
	return pairedOrigin != "" && origin == pairedOrigin
}

func isExtensionPairingClaim(r *http.Request) bool {
	return r.Method == http.MethodPost && r.URL.Path == "/api/extension/pairing/claim"
}

func isExtensionImportPath(path string) bool {
	return path == "/api/import/problem-statement" || path == "/api/import/submission-source"
}

func validChromeExtensionOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme != "chrome-extension" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return false
	}
	return chromeExtensionIDPattern.MatchString(parsed.Host)
}

func generateExtensionPairingCode() (string, error) {
	value, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", fmt.Errorf("generate browser extension pairing code: %w", err)
	}
	return fmt.Sprintf("%06d", value.Int64()), nil
}

func generateExtensionImportToken() (string, error) {
	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("generate browser extension import token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(random), nil
}

func hashExtensionImportToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
