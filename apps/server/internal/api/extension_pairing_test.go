package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const testExtensionOrigin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"

func TestExtensionPairingIssuesImportOnlyToken(t *testing.T) {
	server := newTestServer(t)
	server.cfg.ServiceToken = "test-service-token"

	start := requestExtensionPairing(t, server)
	token := claimExtensionPairing(t, server, start.Code, testExtensionOrigin)

	importBody := []byte(`{
		"platform":"CODEFORCES",
		"externalProblemId":"1900/A",
		"title":"A",
		"statementText":"statement"
	}`)
	request := httptest.NewRequest(http.MethodPost, "/api/import/problem-statement", bytes.NewReader(importBody))
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", testExtensionOrigin)
	recorder := httptest.NewRecorder()
	server.Router().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("extension import status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	request = httptest.NewRequest(http.MethodGet, "/api/me", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Origin", testExtensionOrigin)
	recorder = httptest.NewRecorder()
	server.Router().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("extension token /api/me status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestExtensionPairingRejectsExpiredCode(t *testing.T) {
	server := newTestServer(t)
	server.cfg.ServiceToken = "test-service-token"
	now := time.Date(2026, time.July, 14, 9, 0, 0, 0, time.UTC)
	server.pairingNow = func() time.Time { return now }

	start := requestExtensionPairing(t, server)
	now = now.Add(6 * time.Minute)

	body, err := json.Marshal(map[string]string{"code": start.Code})
	if err != nil {
		t.Fatalf("marshal claim body: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/extension/pairing/claim", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", testExtensionOrigin)
	recorder := httptest.NewRecorder()
	server.Router().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expired claim status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestExtensionPairingCORSAllowsClaimButRejectsOtherExtensionOrigins(t *testing.T) {
	server := newTestServer(t)
	server.cfg.ServiceToken = "test-service-token"

	request := httptest.NewRequest(http.MethodOptions, "/api/extension/pairing/claim", nil)
	request.Header.Set("Origin", testExtensionOrigin)
	recorder := httptest.NewRecorder()
	server.Router().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent {
		t.Fatalf("claim preflight status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != testExtensionOrigin {
		t.Fatalf("claim preflight origin = %q, want %q", got, testExtensionOrigin)
	}

	request = httptest.NewRequest(http.MethodGet, "/api/me", nil)
	request.Header.Set("Origin", testExtensionOrigin)
	recorder = httptest.NewRecorder()
	server.Router().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("unpaired extension origin status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

type pairingStartResponse struct {
	Code      string `json:"code"`
	ExpiresAt string `json:"expiresAt"`
}

func requestExtensionPairing(t *testing.T, server *Server) pairingStartResponse {
	t.Helper()

	request := httptest.NewRequest(http.MethodPost, "/api/extension/pairing/start", bytes.NewReader([]byte(`{}`)))
	request.Header.Set("Authorization", "Bearer test-service-token")
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	server.Router().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("start pairing status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var response pairingStartResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode start pairing response: %v", err)
	}
	if len(response.Code) != 6 || response.ExpiresAt == "" {
		t.Fatalf("unexpected start pairing response: %#v", response)
	}
	return response
}

func claimExtensionPairing(t *testing.T, server *Server, code string, origin string) string {
	t.Helper()

	body, err := json.Marshal(map[string]string{"code": code})
	if err != nil {
		t.Fatalf("marshal claim body: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/extension/pairing/claim", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", origin)
	recorder := httptest.NewRecorder()
	server.Router().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("claim pairing status = %d, want %d: %s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var response struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode claim response: %v", err)
	}
	if response.Token == "" {
		t.Fatal("claim response token is empty")
	}
	return response.Token
}
