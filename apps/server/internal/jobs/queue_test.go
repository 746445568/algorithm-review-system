package jobs

import (
	"context"
	"testing"
	"time"
)

func TestEnqueue_CancelCleansInflight(t *testing.T) {
	q := NewQueue(nil)
	ctx, cancel := context.WithCancel(context.Background())
	q.mu.Lock()
	q.ctx = ctx
	q.mu.Unlock()

	job := Job{
		Key: "test-key",
		Run: func(context.Context) error { return nil },
	}

	if ok := q.Enqueue(job); !ok {
		t.Fatal("first enqueue should succeed")
	}

	q.mu.Lock()
	_, exists := q.inflight[job.Key]
	q.mu.Unlock()
	if !exists {
		t.Fatal("key should be inflight after enqueue")
	}

	cancel()
	time.Sleep(100 * time.Millisecond)

	q.mu.Lock()
	_, exists = q.inflight[job.Key]
	q.mu.Unlock()
	if exists {
		t.Error("inflight key should be cleared after ctx cancel")
	}
}
