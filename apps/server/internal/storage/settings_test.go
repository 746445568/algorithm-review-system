package storage

import "testing"

func TestLoadThemeModeDefaultsToBlue(t *testing.T) {
	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	mode, err := db.LoadThemeMode()
	if err != nil {
		t.Fatalf("load theme mode: %v", err)
	}
	if mode != "blue" {
		t.Fatalf("expected default theme mode blue, got %q", mode)
	}
}

func TestThemeModeNormalizesLegacyValues(t *testing.T) {
	db := openTestDBNoMigrate(t)
	if err := db.MigrateWithBackup(); err != nil {
		t.Fatalf("migrate db: %v", err)
	}

	cases := map[string]string{
		"":              "blue",
		"follow-system": "blue",
		"light":         "blue",
		"dark":          "dark",
		"warm":          "warm",
		"BLUE":          "blue",
	}

	for input, want := range cases {
		if err := db.SaveThemeMode(input); err != nil {
			t.Fatalf("save theme mode %q: %v", input, err)
		}
		got, err := db.LoadThemeMode()
		if err != nil {
			t.Fatalf("load theme mode after %q: %v", input, err)
		}
		if got != want {
			t.Fatalf("theme %q normalized to %q, want %q", input, got, want)
		}
	}
}
