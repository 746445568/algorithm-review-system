package storage

import (
	"ojreviewdesktop/internal/models"
)

// ListProblemChats returns all chats for a problem ordered by created_at ASC
func (db *DB) ListProblemChats(problemID int64) ([]models.ProblemChat, error) {
	rows, err := db.conn.Query(`
SELECT id, problem_id, role, content, created_at
FROM problem_chats WHERE problem_id = ? ORDER BY created_at ASC`, problemID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	chats := make([]models.ProblemChat, 0)
	for rows.Next() {
		c, err := scanProblemChat(rows)
		if err != nil {
			return nil, err
		}
		chats = append(chats, c)
	}
	return chats, rows.Err()
}

// InsertProblemChat inserts a new chat message and returns it with ID and CreatedAt populated
func (db *DB) InsertProblemChat(chat models.ProblemChat) (models.ProblemChat, error) {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()
	res, err := db.conn.Exec(`
INSERT INTO problem_chats(problem_id, role, content) VALUES (?, ?, ?)`,
		chat.ProblemID, chat.Role, chat.Content)
	if err != nil {
		return chat, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return chat, err
	}
	row := db.conn.QueryRow(`SELECT id, problem_id, role, content, created_at FROM problem_chats WHERE id = ?`, id)
	return scanProblemChat(row)
}

// DeleteProblemChats removes all chat messages for a problem
func (db *DB) DeleteProblemChats(problemID int64) error {
	db.writeMu.Lock()
	defer db.writeMu.Unlock()
	_, err := db.conn.Exec(`DELETE FROM problem_chats WHERE problem_id = ?`, problemID)
	return err
}
