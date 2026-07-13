package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIRequiresBearerTokenWhileHealthStaysPublic(t *testing.T) {
	server := newTestServer(t)
	server.cfg.ServiceToken = "test-service-token"

	for _, tc := range []struct {
		name   string
		path   string
		header string
		want   int
	}{
		{name: "health", path: "/health", want: http.StatusOK},
		{name: "missing", path: "/api/me", want: http.StatusUnauthorized},
		{name: "wrong", path: "/api/me", header: "Bearer wrong", want: http.StatusUnauthorized},
		{name: "correct", path: "/api/me", header: "Bearer test-service-token", want: http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			rec := httptest.NewRecorder()
			server.Router().ServeHTTP(rec, req)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d", rec.Code, tc.want)
			}
		})
	}
}
