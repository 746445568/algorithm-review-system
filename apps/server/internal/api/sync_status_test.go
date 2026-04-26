package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/models"
)

type recordingQueue struct {
	jobs []jobs.Job
}

func (q *recordingQueue) Enqueue(job jobs.Job) bool {
	q.jobs = append(q.jobs, job)
	return true
}

func TestAutoSyncStatusEndpointReturnsManagerState(t *testing.T) {
	server := newTestServer(t)
	queue := &recordingQueue{}
	server.queue = queue

	account, err := server.db.UpsertAccount(models.PlatformCodeforces, "tourist")
	if err != nil {
		t.Fatalf("upsert account: %v", err)
	}
	if _, err := server.db.UpsertAccount(models.PlatformAtCoder, "rng_58"); err != nil {
		t.Fatalf("upsert second account: %v", err)
	}
	if _, err := server.db.CreateSyncTask(account.ID, "cursor-1"); err != nil {
		t.Fatalf("create existing sync task: %v", err)
	}

	manager := NewAutoSyncManager(server, 30*time.Minute)
	server.SetAutoSyncManager(manager)

	if err := manager.RunNow(context.Background()); err != nil {
		t.Fatalf("run auto sync manager: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/sync/status", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if payload["enabled"] != true {
		t.Fatalf("expected enabled=true, got %#v", payload["enabled"])
	}
	if payload["intervalMinutes"] != float64(30) {
		t.Fatalf("expected intervalMinutes=30, got %#v", payload["intervalMinutes"])
	}
	if payload["running"] != false {
		t.Fatalf("expected running=false after run, got %#v", payload["running"])
	}
	if payload["lastRunAt"] == "" || payload["nextRunAt"] == "" {
		t.Fatalf("expected lastRunAt and nextRunAt to be populated, got %#v", payload)
	}
	if payload["lastError"] != "" {
		t.Fatalf("expected empty lastError, got %#v", payload["lastError"])
	}
	if len(queue.jobs) != 1 {
		t.Fatalf("expected one account to be queued, got %d", len(queue.jobs))
	}
}

func TestAutoSyncStatusEndpointReturnsDisabledStateWithoutManager(t *testing.T) {
	server := newTestServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/sync/status", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status %d, got %d", http.StatusOK, rec.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if payload["enabled"] != false {
		t.Fatalf("expected enabled=false, got %#v", payload["enabled"])
	}
	if payload["intervalMinutes"] != float64(0) {
		t.Fatalf("expected intervalMinutes=0, got %#v", payload["intervalMinutes"])
	}
	if payload["running"] != false {
		t.Fatalf("expected running=false, got %#v", payload["running"])
	}
}
