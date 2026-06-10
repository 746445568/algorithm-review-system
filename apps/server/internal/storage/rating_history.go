package storage

import (
	"fmt"

	"ojreviewdesktop/internal/models"
)

func (db *DB) SaveRatingHistory(accountID int64, entries []models.RatingEntry) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()

	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM rating_history WHERE account_id = ?`, accountID); err != nil {
		return fmt.Errorf("delete existing rating history: %w", err)
	}

	for _, e := range entries {
		_, err := tx.Exec(`
INSERT INTO rating_history(account_id, contest_name, rating, timestamp)
VALUES (?, ?, ?, ?)`,
			accountID, e.ContestName, e.Rating, e.Timestamp,
		)
		if err != nil {
			return fmt.Errorf("insert rating entry: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit save rating history: %w", err)
	}
	return nil
}

func (db *DB) GetRatingHistory(accountID int64) ([]models.RatingEntry, error) {
	rows, err := db.conn.Query(`
SELECT id, account_id, contest_name, rating, timestamp
FROM rating_history
WHERE account_id = ?
ORDER BY id ASC`, accountID)
	if err != nil {
		return nil, fmt.Errorf("query rating history: %w", err)
	}
	defer rows.Close()

	entries := make([]models.RatingEntry, 0)
	for rows.Next() {
		var e models.RatingEntry
		if err := rows.Scan(&e.ID, &e.AccountID, &e.ContestName, &e.Rating, &e.Timestamp); err != nil {
			return nil, fmt.Errorf("scan rating entry: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
