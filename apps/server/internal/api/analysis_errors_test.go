package api

import (
	"errors"
	"testing"
)

func TestNormalizeAnalysisCreationErrorMapsSQLiteBusy(t *testing.T) {
	err := normalizeAnalysisCreationError(errors.New("database is locked (5) (SQLITE_BUSY)"))
	if err == nil {
		t.Fatal("expected mapped error")
	}
	got := err.Error()
	want := "当前有并发分析或同步任务占用数据库，请稍后重试"
	if got != want {
		t.Fatalf("expected %q, got %q", want, got)
	}
}

func TestNormalizeAnalysisCreationErrorPassesThroughOtherErrors(t *testing.T) {
	original := errors.New("boom")
	err := normalizeAnalysisCreationError(original)
	if !errors.Is(err, original) {
		t.Fatalf("expected wrapped error to match original")
	}
	if err.Error() != "boom" {
		t.Fatalf("expected original message, got %q", err.Error())
	}
}
