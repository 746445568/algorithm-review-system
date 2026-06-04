package judges

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

func TestCodeforcesFetchSubmissionSourceUsesAuthenticatedUserStatusSource(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/user.status" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		query := r.URL.Query()
		if query.Get("handle") != "myhandle" {
			t.Fatalf("handle = %q, want myhandle", query.Get("handle"))
		}
		if query.Get("includeSources") != "true" {
			t.Fatalf("includeSources = %q, want true", query.Get("includeSources"))
		}
		if query.Get("apiKey") != "test-key" {
			t.Fatalf("apiKey = %q, want test-key", query.Get("apiKey"))
		}
		if query.Get("apiSig") == "" {
			t.Fatalf("expected apiSig query parameter")
		}
		if query.Get("time") != "1700000000" {
			t.Fatalf("time = %q, want fixed timestamp", query.Get("time"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"status":"OK",
			"result":[
				{"id":222,"contestId":4,"creationTimeSeconds":2,"programmingLanguage":"GNU C++17","verdict":"OK","source":"int main() { return 0; }","problem":{"contestId":4,"index":"A","name":"Watermelon"}},
				{"id":111,"contestId":4,"creationTimeSeconds":1,"programmingLanguage":"GNU C++17","verdict":"WRONG_ANSWER","problem":{"contestId":4,"index":"A","name":"Watermelon"}}
			]
		}`))
	}))
	defer server.Close()

	adapter := &CodeforcesAdapter{
		client:    server.Client(),
		baseURL:   server.URL,
		apiKey:    "test-key",
		apiSecret: "test-secret",
		now: func() time.Time {
			return time.Unix(1700000000, 0)
		},
	}

	source, err := adapter.FetchSubmissionSource(context.Background(), models.Submission{
		ExternalSubmissionID: "222",
		RawJSON:              `{"author":{"members":[{"handle":"myhandle"}]}}`,
	})
	if err != nil {
		t.Fatalf("FetchSubmissionSource returned error: %v", err)
	}
	if source != "int main() { return 0; }" {
		t.Fatalf("source = %q, want API source", source)
	}
}

func TestCodeforcesFetchSubmissionSourceUsesBrowserSessionSubmitSource(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/data/submitSource" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if got := r.Header.Get("Cookie"); !strings.Contains(got, "JSESSIONID=test-session") {
			t.Fatalf("Cookie = %q, want browser session", got)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("parse form: %v", err)
		}
		if r.Form.Get("submissionId") != "333" {
			t.Fatalf("submissionId = %q, want 333", r.Form.Get("submissionId"))
		}
		if r.Form.Get("csrf_token") != "csrf-token" {
			t.Fatalf("csrf_token = %q, want csrf-token", r.Form.Get("csrf_token"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"source":"#include <bits/stdc++.h>\nint main(){}"}`))
	}))
	defer server.Close()

	adapter := &CodeforcesAdapter{
		client:        server.Client(),
		baseURL:       server.URL,
		sessionCookie: "JSESSIONID=test-session",
		csrfToken:     "csrf-token",
	}

	source, err := adapter.FetchSubmissionSource(context.Background(), models.Submission{
		ExternalSubmissionID: "333",
		SourceContestID:      "4",
	})
	if err != nil {
		t.Fatalf("FetchSubmissionSource returned error: %v", err)
	}
	if source != "#include <bits/stdc++.h>\nint main(){}" {
		t.Fatalf("source = %q, want browser session source", source)
	}
}
