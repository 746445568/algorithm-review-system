package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/models"
)

func TestProblemPoolSyncEndpointQueuesDefaultPlatforms(t *testing.T) {
	server := newTestServer(t)
	queue := &recordingQueue{}
	server.queue = queue

	req := httptest.NewRequest(http.MethodPost, "/api/problem-pool/sync", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusAccepted, rec.Body.String())
	}
	if len(queue.jobs) != 1 {
		t.Fatalf("queued jobs = %d, want 1", len(queue.jobs))
	}
	if queue.jobs[0].Key != jobs.ProblemPoolSyncJobKey() || queue.jobs[0].TaskType != models.TaskTypeProblemPoolSync {
		t.Fatalf("queued job = %+v", queue.jobs[0])
	}

	var payload struct {
		Task models.ProblemPoolSyncTask `json:"task"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Task.Status != models.TaskPending {
		t.Fatalf("task status = %s, want PENDING", payload.Task.Status)
	}
	if payload.Task.PlatformsJSON != `["CODEFORCES","ATCODER"]` {
		t.Fatalf("platforms_json = %s", payload.Task.PlatformsJSON)
	}
}

func TestProblemPoolSyncEndpointRejectsDuplicateActiveTask(t *testing.T) {
	server := newTestServer(t)
	server.queue = &recordingQueue{}
	if _, err := server.db.CreateProblemPoolSyncTask([]models.Platform{models.PlatformCodeforces}); err != nil {
		t.Fatalf("create existing task: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/problem-pool/sync", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}
}

func TestProblemPoolSyncEndpointMarksTaskFailedWhenQueueRejects(t *testing.T) {
	server := newTestServer(t)
	server.queue = &recordingQueue{reject: true}

	req := httptest.NewRequest(http.MethodPost, "/api/problem-pool/sync", nil)
	rec := httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)

	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d; body=%s", rec.Code, http.StatusConflict, rec.Body.String())
	}

	tasks, err := server.db.ListProblemPoolSyncTasks()
	if err != nil {
		t.Fatalf("list tasks: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("tasks = %d, want 1", len(tasks))
	}
	if tasks[0].Status != models.TaskFailed {
		t.Fatalf("task status = %s, want FAILED", tasks[0].Status)
	}

	server.queue = &recordingQueue{}
	req = httptest.NewRequest(http.MethodPost, "/api/problem-pool/sync", nil)
	rec = httptest.NewRecorder()
	server.Router().ServeHTTP(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("second status = %d, want %d; body=%s", rec.Code, http.StatusAccepted, rec.Body.String())
	}
}
