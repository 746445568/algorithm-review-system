package srs

import (
	"math"
	"time"
)

const (
	DefaultEaseFactor  = 2.5
	MinEaseFactor      = 1.3
	InitialInterval    = 1
	SecondInterval     = 3
	QualityForgot      = 1
	QualityHard        = 2
	QualityMedium      = 3
	QualityEasy        = 5
	QualityResetThresh = 2
)

type ReviewInput struct {
	Quality         int
	EaseFactor      float64
	IntervalDays    int
	RepetitionCount int
}

type ReviewResult struct {
	EaseFactor      float64   `json:"easeFactor"`
	IntervalDays    int       `json:"intervalDays"`
	RepetitionCount int       `json:"repetitionCount"`
	NextReviewAt    time.Time `json:"nextReviewAt"`
}

// Calculate computes the next review schedule using the SM-2 algorithm.
func Calculate(input ReviewInput) ReviewResult {
	quality := input.Quality
	if quality < 0 {
		quality = 0
	}
	if quality > 5 {
		quality = 5
	}

	ef := input.EaseFactor
	if ef < MinEaseFactor {
		ef = DefaultEaseFactor
	}

	interval := input.IntervalDays
	rep := input.RepetitionCount

	if quality < QualityResetThresh {
		rep = 0
		interval = InitialInterval
	} else {
		switch rep {
		case 0:
			interval = InitialInterval
		case 1:
			interval = SecondInterval
		default:
			interval = int(math.Round(float64(interval) * ef))
			if interval < 1 {
				interval = 1
			}
		}
		rep++
	}

	ef = ef + (0.1 - float64(5-quality)*(0.08+float64(5-quality)*0.02))
	if ef < MinEaseFactor {
		ef = MinEaseFactor
	}

	nextReview := time.Now().UTC().Truncate(time.Second).Add(time.Duration(interval) * 24 * time.Hour)

	return ReviewResult{
		EaseFactor:      math.Round(ef*100) / 100,
		IntervalDays:    interval,
		RepetitionCount: rep,
		NextReviewAt:    nextReview,
	}
}
