package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestAISettingsNeverReturnAPIKeyAndPreserveItWhenOmitted(t *testing.T) {
	server := newTestServer(t)
	if err := server.db.SaveAISettings(models.AISettings{Provider: "openai", Model: "gpt-test", APIKey: "super-secret"}); err != nil {
		t.Fatal(err)
	}

	get := httptest.NewRequest(http.MethodGet, "/api/settings/ai", nil)
	getRec := httptest.NewRecorder()
	server.Router().ServeHTTP(getRec, get)
	if strings.Contains(getRec.Body.String(), "super-secret") || strings.Contains(getRec.Body.String(), "apiKey") {
		t.Fatalf("GET leaked API key: %s", getRec.Body.String())
	}
	var response map[string]any
	if err := json.Unmarshal(getRec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response["hasApiKey"] != true {
		t.Fatalf("hasApiKey = %#v", response["hasApiKey"])
	}

	put := httptest.NewRequest(http.MethodPut, "/api/settings/ai", bytes.NewBufferString(`{"provider":"openai","model":"gpt-new","baseUrl":"https://example.test/v1"}`))
	putRec := httptest.NewRecorder()
	server.Router().ServeHTTP(putRec, put)
	if putRec.Code != http.StatusOK {
		t.Fatalf("PUT status = %d: %s", putRec.Code, putRec.Body.String())
	}
	stored, err := server.db.LoadAISettings()
	if err != nil {
		t.Fatal(err)
	}
	if stored.APIKey != "super-secret" || stored.Model != "gpt-new" {
		t.Fatalf("stored settings = %#v", stored)
	}
}

func TestAISettingsCanClearKeyAndTestUsesStoredKey(t *testing.T) {
	server := newTestServer(t)
	if err := server.db.SaveAISettings(models.AISettings{Provider: "openai", Model: "gpt-test", APIKey: "stored-secret"}); err != nil {
		t.Fatal(err)
	}

	testReq := httptest.NewRequest(http.MethodPost, "/api/settings/ai/test", bytes.NewBufferString(`{"provider":"openai","model":"gpt-test"}`))
	testRec := httptest.NewRecorder()
	server.Router().ServeHTTP(testRec, testReq)
	if testRec.Code != http.StatusOK || !strings.Contains(testRec.Body.String(), `"ok":true`) {
		t.Fatalf("test response = %d %s", testRec.Code, testRec.Body.String())
	}

	clearReq := httptest.NewRequest(http.MethodPut, "/api/settings/ai", bytes.NewBufferString(`{"provider":"openai","model":"gpt-test","clearApiKey":true}`))
	clearRec := httptest.NewRecorder()
	server.Router().ServeHTTP(clearRec, clearReq)
	stored, err := server.db.LoadAISettings()
	if err != nil {
		t.Fatal(err)
	}
	if stored.APIKey != "" {
		t.Fatalf("API key was not cleared")
	}
}
