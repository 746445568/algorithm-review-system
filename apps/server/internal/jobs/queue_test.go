package jobs

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"ojreviewdesktop/internal/models"
)

func TestQueueEnqueueConcurrentAccess(t *testing.T) {
	q := NewQueue(nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	q.mu.Lock()
	q.ctx = ctx
	q.mu.Unlock()

	var wg sync.WaitGroup

	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			job := Job{
				Key:      fmt.Sprintf("test:%d", id),
				TaskType: models.TaskTypeSync,
				TaskID:   int64(id),
				Run:      func(context.Context) error { return nil },
			}
			q.Enqueue(job)
		}(i)
	}

	wg.Wait()
}

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
