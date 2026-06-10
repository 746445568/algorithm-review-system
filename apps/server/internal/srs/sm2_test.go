package srs

import (
	"math"
	"testing"
	"time"
)

func TestCalculate_QualityReset(t *testing.T) {
	now := time.Now()
	input := ReviewInput{Quality: QualityForgot, EaseFactor: DefaultEaseFactor, IntervalDays: 10, RepetitionCount: 3}
	result := Calculate(input, now)
	if result.IntervalDays != InitialInterval {
		t.Fatalf("interval = %d, want %d after forgot", result.IntervalDays, InitialInterval)
	}
	if result.RepetitionCount != 0 {
		t.Fatalf("repetition = %d, want 0 after forgot", result.RepetitionCount)
	}
}

func TestCalculate_QualityEasyProgresses(t *testing.T) {
	now := time.Now()
	input := ReviewInput{Quality: QualityEasy, EaseFactor: DefaultEaseFactor, IntervalDays: 0, RepetitionCount: 0}
	result := Calculate(input, now)
	if result.IntervalDays != InitialInterval {
		t.Fatalf("first interval = %d, want %d", result.IntervalDays, InitialInterval)
	}
	if result.EaseFactor <= DefaultEaseFactor {
		t.Fatalf("EF should increase on quality 5, got %v", result.EaseFactor)
	}
}

func TestCalculate_EaseFactorClamped(t *testing.T) {
	now := time.Now()
	input := ReviewInput{Quality: QualityForgot, EaseFactor: 1.31, IntervalDays: 1, RepetitionCount: 1}
	for i := 0; i < 10; i++ {
		input = ReviewInput{Quality: QualityForgot, EaseFactor: input.EaseFactor, IntervalDays: 1, RepetitionCount: 1}
		result := Calculate(input, now)
		input.EaseFactor = result.EaseFactor
		if result.EaseFactor < MinEaseFactor {
			t.Fatalf("EF = %v, below min %v", result.EaseFactor, MinEaseFactor)
		}
	}
}

func TestAdaptiveCalculate_AdjustsDecayFromHistory(t *testing.T) {
	now := time.Now()
	history := []int{QualityForgot, QualityHard, QualityForgot, QualityMedium, QualityForgot}
	input := ReviewInput{Quality: QualityMedium, EaseFactor: DefaultEaseFactor, IntervalDays: 5, RepetitionCount: 3}
	adaptive := AdaptiveCalculate(input, history, now)
	standard := Calculate(input, now)
	if adaptive.EaseFactor >= standard.EaseFactor {
		t.Fatalf("adaptive EF = %v should be < standard EF = %v given poor history", adaptive.EaseFactor, standard.EaseFactor)
	}
}

func TestAdaptiveCalculate_ShortHistoryFallsBackToStandard(t *testing.T) {
	now := time.Now()
	history := []int{QualityEasy}
	input := ReviewInput{Quality: QualityEasy, EaseFactor: DefaultEaseFactor, IntervalDays: 1, RepetitionCount: 0}
	adaptive := AdaptiveCalculate(input, history, now)
	standard := Calculate(input, now)
	if math.Abs(adaptive.EaseFactor-standard.EaseFactor) > 1e-9 {
		t.Fatalf("with <3 history entries, should match standard: adaptive=%v standard=%v", adaptive.EaseFactor, standard.EaseFactor)
	}
}

func TestAdaptiveCalculate_AllForgotHistory(t *testing.T) {
	now := time.Now()
	history := []int{QualityForgot, QualityForgot, QualityForgot, QualityForgot}
	input := ReviewInput{Quality: QualityMedium, EaseFactor: DefaultEaseFactor, IntervalDays: 5, RepetitionCount: 3}
	result := AdaptiveCalculate(input, history, now)
	if result.EaseFactor > DefaultEaseFactor {
		t.Fatalf("all-forgot history: EF = %v should be <= default %v", result.EaseFactor, DefaultEaseFactor)
	}
}

func TestAdaptiveCalculate_AllEasyHistory(t *testing.T) {
	now := time.Now()
	history := []int{QualityEasy, QualityEasy, QualityEasy}
	input := ReviewInput{Quality: QualityEasy, EaseFactor: DefaultEaseFactor, IntervalDays: 1, RepetitionCount: 0}
	adaptive := AdaptiveCalculate(input, history, now)
	standard := Calculate(input, now)
	if adaptive.EaseFactor != standard.EaseFactor {
		t.Fatalf("all-easy history: adaptive EF = %v should equal standard EF = %v", adaptive.EaseFactor, standard.EaseFactor)
	}
}

func TestAdaptiveCalculate_EmptyHistory(t *testing.T) {
	now := time.Now()
	input := ReviewInput{Quality: QualityEasy, EaseFactor: DefaultEaseFactor, IntervalDays: 1, RepetitionCount: 0}
	adaptive := AdaptiveCalculate(input, []int{}, now)
	standard := Calculate(input, now)
	if adaptive.EaseFactor != standard.EaseFactor {
		t.Fatalf("empty history: adaptive EF = %v should equal standard EF = %v", adaptive.EaseFactor, standard.EaseFactor)
	}
}
