package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"ojreviewdesktop/internal/app"
)

const (
	allowedOrigin  = "http://localhost:5173"
	rejectedOrigin = "https://example.invalid"
)

func newCORSTestServer() *Server {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ok", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.HandleFunc("OPTIONS /ok", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return &Server{
		cfg: app.Config{
			AllowedOrigins: []string{allowedOrigin},
		},
		mux: mux,
	}
}

func TestCORSMiddleware_AllowsConfiguredOrigin(t *testing.T) {
	server := newCORSTestServer()
	req := httptest.NewRequest(http.MethodGet, "/ok", nil)
	req.Header.Set("Origin", allowedOrigin)
	rr := httptest.NewRecorder()

	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
}

func TestCORSMiddleware_RejectsUnconfiguredOrigin(t *testing.T) {
	server := newCORSTestServer()
	req := httptest.NewRequest(http.MethodGet, "/ok", nil)
	req.Header.Set("Origin", rejectedOrigin)
	rr := httptest.NewRecorder()

	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestCORSMiddleware_HandlesPreflight(t *testing.T) {
	server := newCORSTestServer()
	req := httptest.NewRequest(http.MethodOptions, "/ok", nil)
	req.Header.Set("Origin", allowedOrigin)
	rr := httptest.NewRecorder()

	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", rr.Code, http.StatusNoContent)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != allowedOrigin {
		t.Fatalf("Access-Control-Allow-Origin = %q, want %q", got, allowedOrigin)
	}
	if got := rr.Header().Get("Access-Control-Allow-Headers"); got != "Content-Type, Authorization, Accept-Language" {
		t.Fatalf("Access-Control-Allow-Headers = %q, want %q", got, "Content-Type, Authorization, Accept-Language")
	}
}

func TestCORSMiddleware_AllowsRequestsWithoutOrigin(t *testing.T) {
	server := newCORSTestServer()
	req := httptest.NewRequest(http.MethodGet, "/ok", nil)
	rr := httptest.NewRecorder()

	server.Router().ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
}
