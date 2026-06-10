package storage

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite"
	"ojreviewdesktop/internal/app"
	cryptovault "ojreviewdesktop/internal/crypto"
	"ojreviewdesktop/internal/models"
)

const schemaVersion = 6

// allowedTables is a whitelist of table names that can be modified by addColumnIfMissing.
// This prevents SQL injection attacks through malicious table names.
var allowedTables = map[string]bool{
	"platform_accounts":     true,
	"problems":              true,
	"submissions":           true,
	"problem_review_states": true,
	"review_snapshots":      true,
	"analysis_tasks":        true,
	"sync_tasks":            true,
	"owner_profile":         true,
	"schema_meta":           true,
	"problem_chats":         true,
	"contests":              true,
	"goals":                 true,
	"error_patterns":        true,
	"knowledge_nodes":       true,
	"problem_knowledge":     true,
	"rating_history":        true,
}

// DB is the SQLite database connection
type DB struct {
	conn    *sql.DB
	cfg     app.Config
	vault   *cryptovault.Vault
	writeMu sync.Mutex
}

// SubmissionQueryOptions defines options for querying submissions
type SubmissionQueryOptions struct {
	PlatformAccountID *int64
	Platform          *models.Platform
	ProblemID         *int64
	Verdict           *models.Verdict
	Limit             int
	Offset            int
}

// ProblemQueryOptions defines options for querying problems
type ProblemQueryOptions struct {
	Platform *models.Platform
	TagName  string
	Search   string
	Limit    int
	Offset   int
}

// ContestQueryOptions defines options for querying contests
type ContestQueryOptions struct {
	Platform *models.Platform
	Status   string
	Limit    int
	Offset   int
}

// Open opens a connection to the SQLite database
func Open(cfg app.Config, vault *cryptovault.Vault) (*DB, error) {
	conn, err := sql.Open("sqlite", cfg.DBPath)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1)
	conn.SetMaxIdleConns(1)
	if _, err := conn.Exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;`); err != nil {
		conn.Close()
		return nil, err
	}
	return &DB{conn: conn, cfg: cfg, vault: vault}, nil
}

// Close closes the database connection
func (db *DB) Close() error { return db.conn.Close() }

// backuper is the interface exposed by modernc.org/sqlite's driver connection
// for online backup and restore operations.
type backuper interface {
	NewBackup(string) (*sqlite3.Backup, error)
	NewRestore(string) (*sqlite3.Backup, error)
}

// Backup creates a consistent database snapshot at dstPath.
func (db *DB) Backup(dstPath string) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	conn, err := db.conn.Conn(context.Background())
	if err != nil {
		return fmt.Errorf("backup: acquire connection: %w", err)
	}
	defer conn.Close()

	return conn.Raw(func(driverConn any) error {
		bck, err := driverConn.(backuper).NewBackup(dstPath)
		if err != nil {
			return fmt.Errorf("backup: init: %w", err)
		}
		for more := true; more; {
			more, err = bck.Step(-1)
			if err != nil {
				bck.Finish()
				return fmt.Errorf("backup: step: %w", err)
			}
		}
		return bck.Finish()
	})
}

// Restore replaces the current database contents from srcPath.
func (db *DB) Restore(srcPath string) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	conn, err := db.conn.Conn(context.Background())
	if err != nil {
		return fmt.Errorf("restore: acquire connection: %w", err)
	}
	defer conn.Close()

	return conn.Raw(func(driverConn any) error {
		bck, err := driverConn.(backuper).NewRestore(srcPath)
		if err != nil {
			return fmt.Errorf("restore: init: %w", err)
		}
		for more := true; more; {
			more, err = bck.Step(-1)
			if err != nil {
				bck.Finish()
				return fmt.Errorf("restore: step: %w", err)
			}
		}
		return bck.Finish()
	})
}

// addColumnIfMissing adds a column to table if it does not yet exist.
// Safe to call on every startup (idempotent).
func (db *DB) addColumnIfMissing(table, column, definition string) error {
	// Validate table name against whitelist to prevent SQL injection
	if !allowedTables[table] {
		return fmt.Errorf("invalid table name: %s", table)
	}

	var count int
	if err := db.conn.QueryRow(
		fmt.Sprintf(`SELECT COUNT(*) FROM pragma_table_info('%s') WHERE name = ?`, table),
		column,
	).Scan(&count); err != nil {
		return fmt.Errorf("addColumnIfMissing(%s.%s): pragma: %w", table, column, err)
	}
	if count > 0 {
		return nil
	}
	_, err := db.conn.Exec(fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, table, column, definition))
	if err != nil {
		return fmt.Errorf("addColumnIfMissing(%s.%s): alter: %w", table, column, err)
	}
	return nil
}

// MigrateWithBackup runs database migrations with a pre-migration backup
func (db *DB) MigrateWithBackup() error {
	if _, err := os.Stat(db.cfg.DBPath); err == nil {
		backupPath := filepath.Join(db.cfg.DataDir, fmt.Sprintf("ojreview.pre-migration.%s.db", time.Now().UTC().Format("20060102-150405")))
		if err := copyFile(db.cfg.DBPath, backupPath); err != nil {
			return err
		}
	}
	if err := db.ensureSchema(); err != nil {
		return err
	}
	// Idempotent column additions for existing databases
	if err := db.addColumnIfMissing("review_snapshots", "snapshot_type", "TEXT NOT NULL DEFAULT 'global'"); err != nil {
		return err
	}
	if err := db.addColumnIfMissing("review_snapshots", "problem_id", "INTEGER"); err != nil {
		return err
	}
	if err := db.addColumnIfMissing("problems", "statement_text", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := db.addColumnIfMissing("problems", "statement_fetched_at", "TEXT"); err != nil {
		return err
	}
	if err := db.addColumnIfMissing("submissions", "source_code", "TEXT NOT NULL DEFAULT ''"); err != nil {
		return err
	}
	if err := db.addColumnIfMissing("submissions", "source_fetched_at", "TEXT"); err != nil {
		return err
	}
	// SM-2 spaced repetition columns
	if err := db.addColumnIfMissing("problem_review_states", "ease_factor", "REAL NOT NULL DEFAULT 2.5"); err != nil {
		return err
	}
	if err := db.addColumnIfMissing("problem_review_states", "interval_days", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := db.addColumnIfMissing("problem_review_states", "repetition_count", "INTEGER NOT NULL DEFAULT 0"); err != nil {
		return err
	}
	if err := db.addColumnIfMissing("problem_review_states", "last_quality", "INTEGER"); err != nil {
		return err
	}
	return nil
}

// ensureSchema creates the database schema if it doesn't exist
func (db *DB) ensureSchema() error {
	schema := `
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS owner_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT 'Owner',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  external_handle TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_synced_at TEXT,
  last_cursor TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rating INTEGER,
  max_rating INTEGER,
  UNIQUE(platform, external_handle)
);
CREATE TABLE IF NOT EXISTS problems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  external_problem_id TEXT NOT NULL,
  external_contest_id TEXT,
  title TEXT NOT NULL,
  url TEXT,
  difficulty TEXT,
  raw_tags_json TEXT NOT NULL DEFAULT '[]',
  statement_text TEXT NOT NULL DEFAULT '',
  statement_fetched_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_problem_id)
);
CREATE TABLE IF NOT EXISTS problem_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER NOT NULL,
  tag_name TEXT NOT NULL,
  tag_source TEXT NOT NULL DEFAULT 'platform_raw',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(problem_id, tag_name, tag_source),
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(parent_id) REFERENCES knowledge_nodes(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS problem_knowledge (
  problem_id INTEGER NOT NULL,
  knowledge_id INTEGER NOT NULL,
  mastery_level REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(problem_id, knowledge_id),
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE,
  FOREIGN KEY(knowledge_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS problem_chats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
  content     TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_problem_chats_problem_id ON problem_chats(problem_id);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_account_id INTEGER,
  platform TEXT NOT NULL,
  external_submission_id TEXT NOT NULL,
  problem_id INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  language TEXT,
  submitted_at TEXT NOT NULL,
  exec_time_ms INTEGER,
  memory_kb INTEGER,
  source_contest_id TEXT,
  source_code TEXT NOT NULL DEFAULT '',
  source_fetched_at TEXT,
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_submission_id),
  FOREIGN KEY(platform_account_id) REFERENCES platform_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sync_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_account_id INTEGER NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL,
  cursor_before TEXT,
  cursor_after TEXT,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY(platform_account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS review_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  summary_json TEXT NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'global',
  problem_id INTEGER
);
CREATE TABLE IF NOT EXISTS problem_review_states (
  problem_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'TODO',
  notes TEXT NOT NULL DEFAULT '',
  next_review_at TEXT,
  last_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS analysis_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_snapshot_id INTEGER NOT NULL,
  result_text TEXT,
  result_json TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS contests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  external_contest_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'UPCOMING',
  last_synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_contest_id)
);
CREATE TABLE IF NOT EXISTS goals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL,
  title         TEXT NOT NULL,
  target_rating INTEGER NOT NULL,
  deadline      TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS error_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  problem_id INTEGER REFERENCES problems(id),
  submission_id TEXT DEFAULT '',
  pattern_type TEXT NOT NULL,
  description TEXT DEFAULT '',
  ai_confidence REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_error_patterns_problem ON error_patterns(problem_id);
CREATE INDEX IF NOT EXISTS idx_error_patterns_type ON error_patterns(pattern_type);`
	if _, err := db.conn.Exec(schema); err != nil {
		return err
	}
	if _, err := db.conn.Exec(`INSERT OR IGNORE INTO owner_profile(id, name) VALUES (1, 'Owner')`); err != nil {
		return err
	}
	currentVersion := 0
	if err := db.conn.QueryRow(`SELECT COALESCE(MAX(CAST(value AS INTEGER)), 0) FROM schema_meta WHERE key = 'schema_version'`).Scan(&currentVersion); err != nil {
		return err
	}
	if currentVersion < 3 {
		if err := db.addColumnIfMissing("platform_accounts", "rating", "INTEGER"); err != nil {
			return fmt.Errorf("migrate v2->v3 add rating: %w", err)
		}
		if err := db.addColumnIfMissing("platform_accounts", "max_rating", "INTEGER"); err != nil {
			return fmt.Errorf("migrate v2->v3 add max_rating: %w", err)
		}
		if _, err := db.conn.Exec(`CREATE TABLE IF NOT EXISTS goals (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			platform TEXT NOT NULL,
			title TEXT NOT NULL,
			target_rating INTEGER NOT NULL,
			deadline TEXT,
			created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
		)`); err != nil {
			return fmt.Errorf("migrate v2->v3 create goals: %w", err)
		}
	}
	if currentVersion < 4 {
		if _, err := db.conn.Exec(`
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(parent_id) REFERENCES knowledge_nodes(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS problem_knowledge (
  problem_id INTEGER NOT NULL,
  knowledge_id INTEGER NOT NULL,
  mastery_level REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(problem_id, knowledge_id),
  FOREIGN KEY(problem_id) REFERENCES problems(id) ON DELETE CASCADE,
  FOREIGN KEY(knowledge_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
);`); err != nil {
			return fmt.Errorf("migrate v3->v4 create knowledge graph: %w", err)
		}
	}
	if currentVersion < 5 {
		if err := db.addColumnIfMissing("problem_review_states", "quality_history", "TEXT DEFAULT '[]'"); err != nil {
			return fmt.Errorf("migrate v4->v5 add quality_history: %w", err)
		}
	}
	if currentVersion < 6 {
		if _, err := db.conn.Exec(`
CREATE TABLE IF NOT EXISTS rating_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  contest_name TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES platform_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rating_history_account ON rating_history(account_id);`); err != nil {
			return fmt.Errorf("migrate v5->v6 create rating_history: %w", err)
		}
	}
	_, err := db.conn.Exec(`
INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, fmt.Sprintf("%d", schemaVersion))
	return err
}

// copyFile copies a file from src to dst
func copyFile(src, dst string) error {
	input, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, input, 0o644)
}

// HealthCheck returns a simple health check result
func (db *DB) HealthCheck(ctx context.Context) (map[string]any, error) {
	row := db.conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM owner_profile WHERE id = 1`)
	var count int
	if err := row.Scan(&count); err != nil {
		return nil, err
	}
	return map[string]any{
		"status":        "ok",
		"firstRun":      count == 0,
		"tables":        len(allowedTables),
		"dbPath":        db.cfg.DBPath,
		"schemaVersion": schemaVersion,
	}, nil
}
