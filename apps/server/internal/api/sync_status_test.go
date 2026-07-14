package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/models"
)

func TestAccountCreationImmediatelyQueuesSync(t *testing.T) {
	server := newTestServer(t)
	queue := &recordingQueue{}
	server.queue = queue
	server.adapters[models.PlatformCodeforces] = judges.NewPlaceholderAdapter(models.PlatformCodeforces)

	req := httptest.NewRequest(http.MethodPut, "/api/accounts/CODEFORCES", bytes.NewBufferString(`{"handle":"tourist"}`))
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if len(queue.jobs) != 1 || queue.jobs[0].TaskType != models.TaskTypeSync {
		t.Fatalf("queued jobs = %#v", queue.jobs)
	}
}

type recordingQueue struct {
	jobs   []jobs.Job
	reject bool
}

type rejectFirstQueue struct {
	jobs  []jobs.Job
	calls int
}

func (q *rejectFirstQueue) Enqueue(job jobs.Job) bool {
	q.calls++
	if q.calls == 1 {
		return false
	}
	q.jobs = append(q.jobs, job)
	return true
}

func TestAutoSyncDuplicateDoesNotBlockOtherAccounts(t *testing.T) {
	server := newTestServer(t)
	queue := &rejectFirstQueue{}
	server.queue = queue
	if _, err := server.db.UpsertAccount(models.PlatformCodeforces, "first"); err != nil {
		t.Fatal(err)
	}
	if _, err := server.db.UpsertAccount(models.PlatformAtCoder, "second"); err != nil {
		t.Fatal(err)
	}

	queued, err := server.queueAllAccountSyncs(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if queued != 1 || len(queue.jobs) != 1 {
		t.Fatalf("queued = %d, jobs = %d", queued, len(queue.jobs))
	}
}

func (q *recordingQueue) Enqueue(job jobs.Job) bool {
	if q.reject {
		return false
	}
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
