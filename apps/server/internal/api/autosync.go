package api

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/models"
)

type jobEnqueuer interface {
	Enqueue(job jobs.Job) bool
}

type AutoSyncStatus struct {
	Enabled         bool   `json:"enabled"`
	IntervalMinutes int    `json:"intervalMinutes"`
	LastRunAt       string `json:"lastRunAt"`
	NextRunAt       string `json:"nextRunAt"`
	Running         bool   `json:"running"`
	LastError       string `json:"lastError"`
}

type AutoSyncManager struct {
	server   *Server
	interval time.Duration
	now      func() time.Time

	startOnce sync.Once
	mu        sync.RWMutex
	running   bool
	lastRunAt time.Time
	nextRunAt time.Time
	lastError string
}

func NewAutoSyncManager(server *Server, interval time.Duration) *AutoSyncManager {
	if interval <= 0 {
		interval = 30 * time.Minute
	}

	return &AutoSyncManager{
		server:   server,
		interval: interval,
		now:      time.Now,
	}
}

func (m *AutoSyncManager) Start(ctx context.Context) {
	m.startOnce.Do(func() {
		go func() {
			_ = m.RunNow(ctx)

			ticker := time.NewTicker(m.interval)
			defer ticker.Stop()

			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					_ = m.RunNow(ctx)
				}
			}
		}()
	})
}

func (m *AutoSyncManager) RunNow(ctx context.Context) error {
	startedAt := m.now().UTC()
	if !m.beginRun(startedAt) {
		return nil
	}

	_, err := m.server.queueAllAccountSyncs(ctx)
	m.finishRun(startedAt, err)
	return err
}

func (m *AutoSyncManager) Status() AutoSyncStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return AutoSyncStatus{
		Enabled:         true,
		IntervalMinutes: int(m.interval / time.Minute),
		LastRunAt:       formatAutoSyncTime(m.lastRunAt),
		NextRunAt:       formatAutoSyncTime(m.nextRunAt),
		Running:         m.running,
		LastError:       m.lastError,
	}
}

func (m *AutoSyncManager) beginRun(startedAt time.Time) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running {
		return false
	}

	m.running = true
	if m.nextRunAt.IsZero() {
		m.nextRunAt = startedAt.Add(m.interval)
	}
	return true
}

func (m *AutoSyncManager) finishRun(startedAt time.Time, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.running = false
	m.lastRunAt = startedAt
	m.nextRunAt = startedAt.Add(m.interval)
	if err != nil {
		m.lastError = err.Error()
		return
	}
	m.lastError = ""
}

func formatAutoSyncTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func (s *Server) SetAutoSyncManager(manager *AutoSyncManager) {
	s.autoSync = manager
}

func (s *Server) handleSyncStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.currentAutoSyncStatus())
}

func (s *Server) currentAutoSyncStatus() AutoSyncStatus {
	if s.autoSync == nil {
		return AutoSyncStatus{}
	}
	return s.autoSync.Status()
}

func (s *Server) enqueueSyncTask(account models.PlatformAccount) (models.SyncTask, error) {
	if s.queue == nil {
		return models.SyncTask{}, errors.New("sync queue unavailable")
	}

	task, err := s.db.CreateSyncTask(account.ID, account.LastCursor)
	if err != nil {
		return models.SyncTask{}, err
	}

	taskID := task.ID
	accountID := account.ID
	platform := account.Platform
	if !s.queue.Enqueue(jobs.Job{
		Key:      jobs.SyncJobKey(accountID),
		TaskType: models.TaskTypeSync,
		TaskID:   taskID,
		Run: func(ctx context.Context) error {
			return s.runSyncTask(ctx, accountID, taskID, platform)
		},
	}) {
		return models.SyncTask{}, errors.New("sync task already queued for this account")
	}

	return task, nil
}

func (s *Server) queueAllAccountSyncs(ctx context.Context) (int, error) {
	accounts, err := s.db.ListAccounts()
	if err != nil {
		return 0, err
	}

	queuedCount := 0
	for _, account := range accounts {
		select {
		case <-ctx.Done():
			return queuedCount, ctx.Err()
		default:
		}

		if _, err := s.enqueueSyncTask(account); err != nil {
			if isSyncAlreadyQueuedError(err) {
				continue
			}
			return queuedCount, err
		}
		queuedCount++
	}

	return queuedCount, nil
}

func isSyncAlreadyQueuedError(err error) bool {
	return err != nil && strings.Contains(strings.ToLower(err.Error()), "already queued")
}
