package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"ojreviewdesktop/internal/app"
)

func TestCORSMiddleware_WildcardAllowsAnyOrigin(t *testing.T) {
	s := &Server{
		cfg: app.Config{AllowedOrigins: []string{"*"}},
		mux: http.NewServeMux(),
	}
	s.mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://evil.example.com")
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with wildcard, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected ACAO '*', got %q", got)
	}
}

func TestCORSMiddleware_MatchedOriginIsReflected(t *testing.T) {
	s := &Server{
		cfg: app.Config{AllowedOrigins: []string{"http://localhost:5180", "http://127.0.0.1:5180"}},
		mux: http.NewServeMux(),
	}
	s.mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://localhost:5180")
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for matched origin, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:5180" {
		t.Fatalf("expected ACAO 'http://localhost:5180', got %q", got)
	}
}

func TestCORSMiddleware_UnmatchedOriginReturns403(t *testing.T) {
	s := &Server{
		cfg: app.Config{AllowedOrigins: []string{"http://localhost:5180", "http://127.0.0.1:5180"}},
		mux: http.NewServeMux(),
	}
	s.mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://evil.example.com")
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for unmatched origin, got %d", rec.Code)
	}
}

func TestCORSMiddleware_OptionsPreflight(t *testing.T) {
	s := &Server{
		cfg: app.Config{AllowedOrigins: []string{"http://localhost:5180"}},
		mux: http.NewServeMux(),
	}
	s.mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Header.Set("Origin", "http://localhost:5180")
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 for OPTIONS, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Methods"); got == "" {
		t.Fatal("expected Access-Control-Allow-Methods header")
	}
}

func TestCORSMiddleware_EmptyOriginsDefaultsToWildcard(t *testing.T) {
	s := &Server{
		cfg: app.Config{AllowedOrigins: nil},
		mux: http.NewServeMux(),
	}
	s.mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://evil.example.com")
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with nil origins, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("expected ACAO '*' when origins empty, got %q", got)
	}
}

func TestCORSMiddleware_NoOriginHeaderStillPasses(t *testing.T) {
	s := &Server{
		cfg: app.Config{AllowedOrigins: []string{"http://localhost:5180"}},
		mux: http.NewServeMux(),
	}
	s.mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// No Origin header (e.g. same-origin request or curl)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	s.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 with no Origin header, got %d", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("expected no ACAO header with no Origin, got %q", got)
	}
}
