package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ojreviewdesktop/internal/api"
	"ojreviewdesktop/internal/app"
	cryptovault "ojreviewdesktop/internal/crypto"
	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/storage"
)

func main() {
	cfg, err := app.LoadConfig()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	vault, err := cryptovault.LoadOrCreateVault(cfg)
	if err != nil {
		log.Fatalf("load vault: %v", err)
	}

	db, err := storage.Open(cfg, vault)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer db.Close()

	if err := db.MigrateWithBackup(); err != nil {
		log.Fatalf("migrate database: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Create queue and server, then wire adapters
	queue := jobs.NewQueue(db)
	apiServer := api.NewServer(cfg, db, queue)
	queue.SetAdapters(apiServer.Adapters())
	queue.SetTaskRunners(apiServer.ResumeSyncTask, apiServer.ResumeAnalysisTask)
	
	queue.Start(ctx)
	if err := queue.ResumePending(ctx); err != nil {
		log.Printf("resume pending tasks failed: %v", err)
	}

	server := &http.Server{
		Addr:              cfg.ListenAddr,
		Handler:           apiServer.Router(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	log.Printf("ojreviewd listening on http://%s", cfg.ListenAddr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
}
