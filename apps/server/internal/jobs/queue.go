package jobs

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"ojreviewdesktop/internal/adapters/judges"
	"ojreviewdesktop/internal/models"
	"ojreviewdesktop/internal/storage"
)

type Job struct {
	Key      string
	TaskType models.TaskType
	TaskID   int64
	Run      func(context.Context) error
}

type Queue struct {
	ctx              context.Context
	db               *storage.DB
	workerCh         chan Job
	wg               sync.WaitGroup
	once             sync.Once
	analysisParallel int
	mu               sync.Mutex
	inflight         map[string]struct{}
	adapters         map[models.Platform]judges.Adapter
	syncRunner       func(context.Context, int64) error
	analysisRunner   func(context.Context, int64) error
}

func NewQueue(db *storage.DB) *Queue {
	return &Queue{
		ctx:              context.Background(),
		db:               db,
		workerCh:         make(chan Job, 32),
		analysisParallel: 2,
		inflight:         make(map[string]struct{}),
		adapters:         make(map[models.Platform]judges.Adapter),
	}
}

func (q *Queue) SetAdapters(adapters map[models.Platform]judges.Adapter) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.adapters = adapters
}

func (q *Queue) SetTaskRunners(syncRunner func(context.Context, int64) error, analysisRunner func(context.Context, int64) error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.syncRunner = syncRunner
	q.analysisRunner = analysisRunner
}

func (q *Queue) Start(ctx context.Context) {
	q.mu.Lock()
	q.ctx = ctx
	q.mu.Unlock()

	q.once.Do(func() {
		workerCount := 1 + q.analysisParallel
		for range workerCount {
			q.wg.Add(1)
			go func() {
				defer q.wg.Done()
				for {
					select {
					case <-ctx.Done():
						return
					case job := <-q.workerCh:
						q.runJob(ctx, job)
					}
				}
			}()
		}
	})
}

func (q *Queue) Stop() {
	q.wg.Wait()
}

func (q *Queue) Enqueue(job Job) bool {
	q.mu.Lock()
	if _, exists := q.inflight[job.Key]; exists {
		q.mu.Unlock()
		return false
	}
	q.inflight[job.Key] = struct{}{}
	ctx := q.ctx
	q.mu.Unlock()

	go func() {
		timer := time.NewTimer(20 * time.Millisecond)
		defer timer.Stop()

		select {
		case <-timer.C:
		case <-ctx.Done():
			q.mu.Lock()
			delete(q.inflight, job.Key)
			q.mu.Unlock()
			return
		}

		select {
		case q.workerCh <- job:
		case <-ctx.Done():
			q.mu.Lock()
			delete(q.inflight, job.Key)
			q.mu.Unlock()
		}
	}()
	return true
}

func (q *Queue) ResumePending(ctx context.Context) error {
	tasks, err := q.db.ListRecoverableTasks()
	if err != nil {
		return err
	}
	for _, task := range tasks {
		taskCopy := task
		q.Enqueue(Job{
			Key:      syncJobKey(taskCopy.PlatformAccountID),
			TaskType: models.TaskTypeSync,
			TaskID:   taskCopy.ID,
			Run: func(ctx context.Context) error {
				q.mu.Lock()
				runner := q.syncRunner
				q.mu.Unlock()
				if runner == nil {
					return q.db.MarkSyncTaskFinished(taskCopy.ID, models.TaskFailed, taskCopy.FetchedCount, taskCopy.InsertedCount, "sync runner unavailable during recovery")
				}
				return runner(ctx, taskCopy.ID)
			},
		})
	}

	analysisTasks, err := q.db.ListRecoverableAnalysisTasks()
	if err != nil {
		return err
	}
	for _, task := range analysisTasks {
		taskCopy := task
		q.Enqueue(Job{
			Key:      analysisJobKey(taskCopy.ID),
			TaskType: models.TaskTypeAnalysis,
			TaskID:   taskCopy.ID,
			Run: func(ctx context.Context) error {
				q.mu.Lock()
				runner := q.analysisRunner
				q.mu.Unlock()
				if runner == nil {
					return q.db.MarkAnalysisTaskFinished(taskCopy.ID, models.TaskFailed, "", "", "analysis runner unavailable during recovery")
				}
				return runner(ctx, taskCopy.ID)
			},
		})
	}
	return nil
}

func (q *Queue) runJob(ctx context.Context, job Job) {
	defer func() {
		q.mu.Lock()
		delete(q.inflight, job.Key)
		q.mu.Unlock()
	}()

	switch job.TaskType {
	case models.TaskTypeSync:
		if err := q.db.MarkSyncTaskRunning(job.TaskID); err != nil {
			log.Printf("mark sync task running failed: %v", err)
			return
		}
	case models.TaskTypeAnalysis:
		if err := q.db.MarkAnalysisTaskRunning(job.TaskID); err != nil {
			log.Printf("mark analysis task running failed: %v", err)
			return
		}
	}

	if err := job.Run(ctx); err != nil {
		log.Printf("job %d failed: %v", job.TaskID, err)
		switch job.TaskType {
		case models.TaskTypeSync:
			_ = q.db.MarkSyncTaskFinished(job.TaskID, models.TaskFailed, 0, 0, err.Error())
		case models.TaskTypeAnalysis:
			_ = q.db.MarkAnalysisTaskFinished(job.TaskID, models.TaskFailed, "", "", err.Error())
		}
	}
}

func SyncJobKey(platformAccountID int64) string {
	return syncJobKey(platformAccountID)
}

func AnalysisJobKey(taskID int64) string {
	return analysisJobKey(taskID)
}

func syncJobKey(platformAccountID int64) string {
	return fmt.Sprintf("sync:%d", platformAccountID)
}

func analysisJobKey(taskID int64) string {
	return fmt.Sprintf("analysis:%d", taskID)
}
