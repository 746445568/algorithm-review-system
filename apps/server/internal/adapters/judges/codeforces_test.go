package judges

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"ojreviewdesktop/internal/models"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestCodeforcesFetchStatementFallsBackToMirrorWhenMainSiteBlocked(t *testing.T) {
	adapter := &CodeforcesAdapter{
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				switch req.URL.String() {
				case "https://codeforces.com/problemset/problem/4/A":
					return &http.Response{
						StatusCode: http.StatusForbidden,
						Body:       io.NopCloser(strings.NewReader("forbidden")),
						Header:     make(http.Header),
						Request:    req,
					}, nil
				case "http://mirror.codeforces.com/problemset/problem/4/A":
					return &http.Response{
						StatusCode: http.StatusOK,
						Body: io.NopCloser(strings.NewReader(`
							<html><body><div class="problem-statement"><div class="header"><div class="title">A. Watermelon</div></div><p>Hello CF</p></div></body></html>
						`)),
						Header:  make(http.Header),
						Request: req,
					}, nil
				default:
					return nil, fmt.Errorf("unexpected url: %s", req.URL.String())
				}
			}),
		},
	}

	statement, err := adapter.FetchStatement(context.Background(), "4/A")
	if err != nil {
		t.Fatalf("FetchStatement returned error: %v", err)
	}
	if !strings.Contains(statement, "Hello CF") {
		t.Fatalf("expected mirror content in statement, got %q", statement)
	}
}

func TestCodeforcesFetchStatementFallsBackWhenMainSiteReturnsNonStatementPage(t *testing.T) {
	adapter := &CodeforcesAdapter{
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				switch req.URL.String() {
				case "https://codeforces.com/problemset/problem/4/A":
					return &http.Response{
						StatusCode: http.StatusOK,
						Body:       io.NopCloser(strings.NewReader(`<html><body>challenge page</body></html>`)),
						Header:     make(http.Header),
						Request:    req,
					}, nil
				case "http://mirror.codeforces.com/problemset/problem/4/A":
					return &http.Response{
						StatusCode: http.StatusOK,
						Body: io.NopCloser(strings.NewReader(`
							<html><body><div class="problem-statement"><p>Mirror statement</p></div></body></html>
						`)),
						Header:  make(http.Header),
						Request: req,
					}, nil
				default:
					return nil, fmt.Errorf("unexpected url: %s", req.URL.String())
				}
			}),
		},
	}

	statement, err := adapter.FetchStatement(context.Background(), "4/A")
	if err != nil {
		t.Fatalf("FetchStatement returned error: %v", err)
	}
	if !strings.Contains(statement, "Mirror statement") {
		t.Fatalf("expected mirror statement content, got %q", statement)
	}
}

func TestCodeforcesFetchSubmissionSourceExtractsProgramSourceText(t *testing.T) {
	adapter := &CodeforcesAdapter{
		client: &http.Client{
			Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
				if req.URL.String() != "https://codeforces.com/contest/4/submission/123456" {
					return nil, fmt.Errorf("unexpected url: %s", req.URL.String())
				}
				return &http.Response{
					StatusCode: http.StatusOK,
					Body: io.NopCloser(strings.NewReader(`
						<html><body>
							<pre id="program-source-text" class="program-source">
#include &lt;iostream&gt;
int main() { std::cout &lt;&lt; "ok"; }
							</pre>
						</body></html>
					`)),
					Header:  make(http.Header),
					Request: req,
				}, nil
			}),
		},
	}

	source, err := adapter.FetchSubmissionSource(context.Background(), models.Submission{
		ExternalSubmissionID: "123456",
		SourceContestID:      "4",
	})
	if err != nil {
		t.Fatalf("FetchSubmissionSource returned error: %v", err)
	}
	if !strings.Contains(source, `#include <iostream>`) {
		t.Fatalf("expected decoded source code, got %q", source)
	}
	if strings.Contains(source, "&lt;") {
		t.Fatalf("expected HTML entities to be decoded, got %q", source)
	}
}
