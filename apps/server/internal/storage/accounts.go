package storage

import (
	"fmt"
	"time"

	"ojreviewdesktop/internal/models"
)

// ListAccounts returns all platform accounts ordered by platform and handle
func (db *DB) ListAccounts() ([]models.PlatformAccount, error) {
	rows, err := db.conn.Query(`SELECT id, platform, external_handle, status, last_synced_at, COALESCE(last_cursor,''), rating, max_rating, created_at, updated_at FROM platform_accounts ORDER BY platform, external_handle`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	accounts := make([]models.PlatformAccount, 0)
	for rows.Next() {
		item, err := scanPlatformAccount(rows)
		if err != nil {
			return nil, err
		}
		accounts = append(accounts, item)
	}
	return accounts, rows.Err()
}

// GetAccount returns a single account by ID
func (db *DB) GetAccount(id int64) (models.PlatformAccount, error) {
	row := db.conn.QueryRow(`
SELECT id, platform, external_handle, status, last_synced_at, COALESCE(last_cursor,''), rating, max_rating, created_at, updated_at
FROM platform_accounts WHERE id = ?`, id)
	return scanPlatformAccount(row)
}

// DeleteAccount deletes an account and its related data
func (db *DB) DeleteAccount(id int64) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 删除关联的提交记录
	if _, err := tx.Exec(`DELETE FROM submissions WHERE platform_account_id = ?`, id); err != nil {
		return err
	}
	// 删除关联的同步任务
	if _, err := tx.Exec(`DELETE FROM sync_tasks WHERE platform_account_id = ?`, id); err != nil {
		return err
	}
	// 删除孤立的题目（没有任何提交记录引用的题目）
	if _, err := tx.Exec(`DELETE FROM problems WHERE id NOT IN (SELECT DISTINCT problem_id FROM submissions WHERE problem_id IS NOT NULL)`); err != nil {
		return err
	}
	// 删除账号本身
	if _, err := tx.Exec(`DELETE FROM platform_accounts WHERE id = ?`, id); err != nil {
		return err
	}

	return tx.Commit()
}

// UpsertAccount inserts or updates a platform account
func (db *DB) UpsertAccount(platform models.Platform, handle string) (models.PlatformAccount, error) {
	_, err := db.conn.Exec(`
INSERT INTO platform_accounts(platform, external_handle, status)
VALUES (?, ?, 'ACTIVE')
ON CONFLICT(platform, external_handle) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`, platform, handle)
	if err != nil {
		return models.PlatformAccount{}, err
	}
	row := db.conn.QueryRow(`
SELECT id, platform, external_handle, status, last_synced_at, COALESCE(last_cursor,''), rating, max_rating, created_at, updated_at
FROM platform_accounts WHERE platform = ? AND external_handle = ?`, platform, handle)
	return scanPlatformAccount(row)
}

// UpdateAccountCursor updates the cursor and sync timestamp for an account
func (db *DB) UpdateAccountCursor(accountID int64, cursor string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	result, err := db.conn.Exec(`
UPDATE platform_accounts
SET last_cursor = ?, last_synced_at = ?, updated_at = ?
WHERE id = ?`, cursor, now, now, accountID)
	if err != nil {
		return fmt.Errorf("update account cursor: update account %d: %w", accountID, err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("update account cursor: read rows affected: %w", err)
	}
	if affected == 0 {
		return fmt.Errorf("update account cursor: account %d not found", accountID)
	}

	return nil
}

// UpdateAccountRating updates the rating and max_rating for an account
func (db *DB) UpdateAccountRating(id int64, rating, maxRating *int) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()
	_, err := db.conn.Exec(
		`UPDATE platform_accounts SET rating=?, max_rating=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		rating, maxRating, id,
	)
	return err
}

// GetOwner returns the owner profile
func (db *DB) Owner() (models.OwnerProfile, error) {
	row := db.conn.QueryRow(`SELECT id, name, created_at FROM owner_profile WHERE id = 1`)
	return scanOwnerProfile(row)
}
