package storage

import (
	"database/sql"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"ojreviewdesktop/internal/models"
)

const (
	recommendationReasonWeakestKnowledge = "weakest_knowledge"
	recommendationReasonRetryFailed      = "retry_failed"
	recommendationReasonStretchZone      = "stretch_zone"
)

type recommendationCandidate struct {
	models.RecommendationProblem
	accountRating *int
}

func (db *DB) GetRecommendation(exclude string) (models.RecommendationResponse, error) {
	candidates := make([]recommendationCandidate, 0)

	weak, err := db.getWeakKnowledgePoolCandidates()
	if err != nil {
		return models.RecommendationResponse{}, err
	}
	candidates = append(candidates, weak...)

	retry, err := db.getRetryFailedCandidates()
	if err != nil {
		return models.RecommendationResponse{}, err
	}
	candidates = append(candidates, retry...)

	stretch, err := db.getStretchZonePoolCandidates()
	if err != nil {
		return models.RecommendationResponse{}, err
	}
	candidates = append(candidates, stretch...)

	scored := make([]recommendationCandidate, 0, len(candidates))
	seen := make(map[string]struct{})
	for _, candidate := range candidates {
		if candidate.Key == "" {
			continue
		}
		if _, ok := seen[candidate.Key]; ok {
			continue
		}
		seen[candidate.Key] = struct{}{}
		if recommendationExcluded(candidate.RecommendationProblem, exclude) {
			continue
		}
		candidate.Score = scoreRecommendation(candidate)
		scored = append(scored, candidate)
	}
	if len(scored) == 0 {
		return models.RecommendationResponse{EmptyReason: "no_candidates"}, nil
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].Score == scored[j].Score {
			return scored[i].Key < scored[j].Key
		}
		return scored[i].Score < scored[j].Score
	})

	problem := scored[0].RecommendationProblem
	return models.RecommendationResponse{Problem: &problem}, nil
}

func (db *DB) getWeakKnowledgePoolCandidates() ([]recommendationCandidate, error) {
	rows, err := db.conn.Query(`
WITH account_ratings AS (
  SELECT platform, MAX(rating) AS rating
  FROM platform_accounts
  WHERE rating IS NOT NULL
  GROUP BY platform
)
SELECT
  pp.id,
  pp.platform,
  pp.external_problem_id,
  pp.title,
  COALESCE(pp.url, ''),
  pp.difficulty_value,
  COALESCE(pp.difficulty_scale, ''),
  COALESCE(GROUP_CONCAT(DISTINCT ppt.tag_name), ''),
  kn.name,
  AVG(pk.mastery_level) AS mastery_level,
  ar.rating
FROM problem_pool pp
JOIN problem_pool_tags ppt ON ppt.problem_pool_id = pp.id
JOIN knowledge_nodes kn ON lower(kn.name) = lower(ppt.tag_name)
JOIN problem_knowledge pk ON pk.knowledge_id = kn.id
LEFT JOIN problems done ON done.platform = pp.platform AND done.external_problem_id = pp.external_problem_id
LEFT JOIN account_ratings ar ON ar.platform = pp.platform
WHERE done.id IS NULL
GROUP BY pp.id, kn.id
ORDER BY mastery_level ASC, pp.id ASC
LIMIT 100`)
	if err != nil {
		return nil, fmt.Errorf("get weak knowledge recommendations: %w", err)
	}
	defer rows.Close()

	items := make([]recommendationCandidate, 0)
	for rows.Next() {
		var candidate recommendationCandidate
		var tagsCSV string
		var difficulty sql.NullInt64
		var rating sql.NullInt64
		var mastery float64
		if err := rows.Scan(
			&candidate.ID,
			&candidate.Platform,
			&candidate.ExternalProblemID,
			&candidate.Title,
			&candidate.URL,
			&difficulty,
			&candidate.DifficultyScale,
			&tagsCSV,
			&candidate.KnowledgeName,
			&mastery,
			&rating,
		); err != nil {
			return nil, fmt.Errorf("scan weak knowledge recommendation: %w", err)
		}
		candidate.Key = recommendationKey("pool", candidate.ID)
		candidate.CandidateType = "problem_pool"
		candidate.Reason = recommendationReasonWeakestKnowledge
		candidate.ReasonText = "优先补当前掌握度较低的知识点"
		candidate.MasteryLevel = &mastery
		candidate.IsNew = true
		candidate.Tags = splitTagsCSV(tagsCSV)
		if difficulty.Valid {
			value := int(difficulty.Int64)
			candidate.DifficultyValue = &value
			candidate.Difficulty = strconv.Itoa(value)
		}
		if rating.Valid {
			value := int(rating.Int64)
			candidate.accountRating = &value
		}
		items = append(items, candidate)
	}
	return items, rows.Err()
}

func (db *DB) getRetryFailedCandidates() ([]recommendationCandidate, error) {
	rows, err := db.conn.Query(`
SELECT
  p.id,
  p.platform,
  p.external_problem_id,
  p.title,
  COALESCE(p.url, ''),
  COALESCE(p.difficulty, ''),
  COALESCE(GROUP_CONCAT(DISTINCT pt.tag_name), ''),
  COALESCE(MIN(pk.mastery_level), 1),
  COALESCE((SELECT kn.name
            FROM problem_knowledge pk2
            JOIN knowledge_nodes kn ON kn.id = pk2.knowledge_id
            WHERE pk2.problem_id = p.id
            ORDER BY pk2.mastery_level ASC, kn.name ASC
            LIMIT 1), '')
FROM problems p
JOIN submissions s ON s.problem_id = p.id
LEFT JOIN problem_tags pt ON pt.problem_id = p.id
LEFT JOIN problem_knowledge pk ON pk.problem_id = p.id
GROUP BY p.id
HAVING SUM(CASE WHEN s.verdict = ? THEN 1 ELSE 0 END) = 0
   AND SUM(CASE WHEN s.verdict IN (?, ?, ?, ?) THEN 1 ELSE 0 END) > 0
ORDER BY MAX(s.submitted_at) DESC, p.id DESC
LIMIT 50`, models.VerdictAC, models.VerdictWA, models.VerdictRE, models.VerdictTLE, models.VerdictMLE)
	if err != nil {
		return nil, fmt.Errorf("get retry failed recommendations: %w", err)
	}
	defer rows.Close()

	items := make([]recommendationCandidate, 0)
	for rows.Next() {
		var candidate recommendationCandidate
		var tagsCSV string
		var difficulty string
		var mastery float64
		if err := rows.Scan(
			&candidate.ID,
			&candidate.Platform,
			&candidate.ExternalProblemID,
			&candidate.Title,
			&candidate.URL,
			&difficulty,
			&tagsCSV,
			&mastery,
			&candidate.KnowledgeName,
		); err != nil {
			return nil, fmt.Errorf("scan retry failed recommendation: %w", err)
		}
		candidate.Key = recommendationKey("problem", candidate.ID)
		candidate.CandidateType = "problem"
		candidate.Difficulty = difficulty
		if parsed, err := strconv.Atoi(strings.TrimSpace(difficulty)); err == nil {
			candidate.DifficultyValue = &parsed
		}
		candidate.Reason = recommendationReasonRetryFailed
		candidate.ReasonText = "这道题有失败提交且尚未 AC，适合回炉复盘"
		candidate.MasteryLevel = &mastery
		candidate.IsNew = false
		candidate.Tags = splitTagsCSV(tagsCSV)
		items = append(items, candidate)
	}
	return items, rows.Err()
}

func (db *DB) getStretchZonePoolCandidates() ([]recommendationCandidate, error) {
	rows, err := db.conn.Query(`
WITH account_ratings AS (
  SELECT platform, MAX(rating) AS rating
  FROM platform_accounts
  WHERE rating IS NOT NULL
  GROUP BY platform
)
SELECT
  pp.id,
  pp.platform,
  pp.external_problem_id,
  pp.title,
  COALESCE(pp.url, ''),
  pp.difficulty_value,
  COALESCE(pp.difficulty_scale, ''),
  COALESCE(GROUP_CONCAT(DISTINCT ppt.tag_name), ''),
  ar.rating
FROM problem_pool pp
JOIN account_ratings ar ON ar.platform = pp.platform
LEFT JOIN problem_pool_tags ppt ON ppt.problem_pool_id = pp.id
LEFT JOIN problems done ON done.platform = pp.platform AND done.external_problem_id = pp.external_problem_id
WHERE done.id IS NULL
  AND pp.difficulty_value IS NOT NULL
  AND pp.difficulty_value BETWEEN ar.rating - 200 AND ar.rating + 200
GROUP BY pp.id
ORDER BY ABS(pp.difficulty_value - ar.rating) ASC, pp.id ASC
LIMIT 50`)
	if err != nil {
		return nil, fmt.Errorf("get stretch zone recommendations: %w", err)
	}
	defer rows.Close()

	items := make([]recommendationCandidate, 0)
	for rows.Next() {
		var candidate recommendationCandidate
		var tagsCSV string
		var difficulty sql.NullInt64
		var rating sql.NullInt64
		if err := rows.Scan(
			&candidate.ID,
			&candidate.Platform,
			&candidate.ExternalProblemID,
			&candidate.Title,
			&candidate.URL,
			&difficulty,
			&candidate.DifficultyScale,
			&tagsCSV,
			&rating,
		); err != nil {
			return nil, fmt.Errorf("scan stretch zone recommendation: %w", err)
		}
		candidate.Key = recommendationKey("pool", candidate.ID)
		candidate.CandidateType = "problem_pool"
		candidate.Reason = recommendationReasonStretchZone
		candidate.ReasonText = "难度接近当前 rating，适合作为拉伸练习"
		candidate.IsNew = true
		candidate.Tags = splitTagsCSV(tagsCSV)
		if difficulty.Valid {
			value := int(difficulty.Int64)
			candidate.DifficultyValue = &value
			candidate.Difficulty = strconv.Itoa(value)
		}
		if rating.Valid {
			value := int(rating.Int64)
			candidate.accountRating = &value
		}
		items = append(items, candidate)
	}
	return items, rows.Err()
}

func scoreRecommendation(candidate recommendationCandidate) float64 {
	score := 100.0
	if candidate.MasteryLevel != nil {
		score = *candidate.MasteryLevel * 100
	}
	if candidate.Reason == recommendationReasonRetryFailed {
		score += 80
		score -= 20
	}
	if candidate.DifficultyValue != nil && candidate.accountRating != nil {
		delta := math.Abs(float64(*candidate.DifficultyValue - *candidate.accountRating))
		if delta <= 200 {
			score -= 10
		}
		if candidate.Reason == recommendationReasonStretchZone {
			score += delta / 10
		}
	}
	return score
}

func recommendationExcluded(problem models.RecommendationProblem, exclude string) bool {
	exclude = strings.TrimSpace(exclude)
	if exclude == "" {
		return false
	}
	return exclude == problem.Key ||
		exclude == strconv.FormatInt(problem.ID, 10) ||
		strings.EqualFold(exclude, problem.ExternalProblemID)
}

func recommendationKey(candidateType string, id int64) string {
	return candidateType + ":" + strconv.FormatInt(id, 10)
}
