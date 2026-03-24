package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ojreviewdesktop/internal/api"
	"ojreviewdesktop/internal/app"
	"ojreviewdesktop/internal/buildinfo"
	cryptovault "ojreviewdesktop/internal/crypto"
	"ojreviewdesktop/internal/jobs"
	"ojreviewdesktop/internal/storage"
)

func main() {
	versionFlag := flag.Bool("version", false, "print service version and exit")
	versionJSONFlag := flag.Bool("version-json", false, "print service version in JSON and exit")
	flag.Parse()

	if *versionFlag || *versionJSONFlag {
		if *versionJSONFlag {
			_ = json.NewEncoder(os.Stdout).Encode(buildinfo.Get())
			return
		}
		fmt.Printf("ojreviewd %s (%s)\\n", buildinfo.Version, buildinfo.Commit)
		return
	}

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

	log.Printf("ojreviewd %s (%s) listening on http://%s", buildinfo.Version, buildinfo.Commit, cfg.ListenAddr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
}
