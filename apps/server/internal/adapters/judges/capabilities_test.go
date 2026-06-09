package judges

import (
	"testing"

	"ojreviewdesktop/internal/models"
)

func TestCodeforcesCapabilitiesDescribeSupportedArtifactFetchers(t *testing.T) {
	caps := NewCodeforcesAdapter().Capabilities()

	if caps.Platform != models.PlatformCodeforces {
		t.Fatalf("platform = %q, want %q", caps.Platform, models.PlatformCodeforces)
	}
	if caps.Label != "Codeforces" {
		t.Fatalf("label = %q, want Codeforces", caps.Label)
	}
	if caps.ProblemStatement != JudgeCapabilitySupported {
		t.Fatalf("problemStatement = %q, want %q", caps.ProblemStatement, JudgeCapabilitySupported)
	}
	if caps.SubmissionSource != JudgeCapabilitySupported {
		t.Fatalf("submissionSource = %q, want %q", caps.SubmissionSource, JudgeCapabilitySupported)
	}
	if caps.PreferredFetchPath.ProblemStatement != JudgeFetchPathPublicPage {
		t.Fatalf("problem statement path = %q, want %q", caps.PreferredFetchPath.ProblemStatement, JudgeFetchPathPublicPage)
	}
	if caps.PreferredFetchPath.SubmissionSource != JudgeFetchPathOfficialAPI {
		t.Fatalf("submission source path = %q, want %q", caps.PreferredFetchPath.SubmissionSource, JudgeFetchPathOfficialAPI)
	}
}

func TestAtCoderCapabilitiesDescribeUnsupportedSourceFetch(t *testing.T) {
	caps := NewAtCoderAdapter().Capabilities()

	if caps.Platform != models.PlatformAtCoder {
		t.Fatalf("platform = %q, want %q", caps.Platform, models.PlatformAtCoder)
	}
	if caps.ProblemStatement != JudgeCapabilitySupported {
		t.Fatalf("problemStatement = %q, want %q", caps.ProblemStatement, JudgeCapabilitySupported)
	}
	if caps.SubmissionSource != JudgeCapabilityUnsupported {
		t.Fatalf("submissionSource = %q, want %q", caps.SubmissionSource, JudgeCapabilityUnsupported)
	}
	if caps.PreferredFetchPath.SubmissionSource != JudgeFetchPathBrowserImport {
		t.Fatalf("submission source path = %q, want %q", caps.PreferredFetchPath.SubmissionSource, JudgeFetchPathBrowserImport)
	}
}

func TestPlaceholderCapabilitiesAreUnsupportedManualFallbacks(t *testing.T) {
	caps := NewPlaceholderAdapter(models.PlatformManual).Capabilities()

	if caps.Platform != models.PlatformManual {
		t.Fatalf("platform = %q, want %q", caps.Platform, models.PlatformManual)
	}
	if caps.AccountSync != JudgeCapabilityUnsupported {
		t.Fatalf("accountSync = %q, want %q", caps.AccountSync, JudgeCapabilityUnsupported)
	}
	if caps.Profile != JudgeCapabilityUnsupported {
		t.Fatalf("profile = %q, want %q", caps.Profile, JudgeCapabilityUnsupported)
	}
	if caps.Contests != JudgeCapabilityUnsupported {
		t.Fatalf("contests = %q, want %q", caps.Contests, JudgeCapabilityUnsupported)
	}
	if caps.ProblemMetadata != JudgeCapabilityUnsupported {
		t.Fatalf("problemMetadata = %q, want %q", caps.ProblemMetadata, JudgeCapabilityUnsupported)
	}
	if caps.ProblemStatement != JudgeCapabilityUnsupported {
		t.Fatalf("problemStatement = %q, want %q", caps.ProblemStatement, JudgeCapabilityUnsupported)
	}
	if caps.SubmissionSource != JudgeCapabilityUnsupported {
		t.Fatalf("submissionSource = %q, want %q", caps.SubmissionSource, JudgeCapabilityUnsupported)
	}
	if caps.PreferredFetchPath.ProblemStatement != JudgeFetchPathManual {
		t.Fatalf("problem statement path = %q, want %q", caps.PreferredFetchPath.ProblemStatement, JudgeFetchPathManual)
	}
	if caps.PreferredFetchPath.SubmissionSource != JudgeFetchPathManual {
		t.Fatalf("submission source path = %q, want %q", caps.PreferredFetchPath.SubmissionSource, JudgeFetchPathManual)
	}
}
