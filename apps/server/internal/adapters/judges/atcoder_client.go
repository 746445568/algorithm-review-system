package judges

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
)

func (a *AtCoderAdapter) fetchSubmissionsRaw(ctx context.Context, handle string, fromSecond int64) ([]atCoderSubmission, error) {
	resultsURL, err := url.Parse(atCoderBaseURL + atCoderResultsPath)
	if err != nil {
		return nil, fmt.Errorf("build atcoder results url: %w", err)
	}

	query := resultsURL.Query()
	query.Set("user", handle)
	query.Set("from_second", strconv.FormatInt(fromSecond, 10))
	resultsURL.RawQuery = query.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, resultsURL.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create atcoder results request: %w", err)
	}
	setAtCoderHeaders(req)

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request atcoder results: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		// kenkoooo.com returns 404 for users with no submissions — treat as empty
		return []atCoderSubmission{}, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("atcoder results returned status %d", resp.StatusCode)
	}

	body, err := atCoderBody(resp)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	var submissions []atCoderSubmission
	if err := json.NewDecoder(body).Decode(&submissions); err != nil {
		return nil, fmt.Errorf("decode atcoder results response: %w", err)
	}

	return submissions, nil
}

func (a *AtCoderAdapter) loadProblems(ctx context.Context) (map[string]atCoderProblem, error) {
	a.problemsMu.RLock()
	if a.problemsLoaded {
		cached := a.problemsByID
		a.problemsMu.RUnlock()
		return cached, nil
	}
	a.problemsMu.RUnlock()

	a.problemsMu.Lock()
	defer a.problemsMu.Unlock()

	if a.problemsLoaded {
		return a.problemsByID, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, atCoderProblemsURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create atcoder problems request: %w", err)
	}
	setAtCoderHeaders(req)

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request atcoder problems: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("atcoder problems returned status %d", resp.StatusCode)
	}

	body, err := atCoderBody(resp)
	if err != nil {
		return nil, err
	}
	defer body.Close()

	var problems []atCoderProblem
	if err := json.NewDecoder(body).Decode(&problems); err != nil {
		return nil, fmt.Errorf("decode atcoder problems response: %w", err)
	}

	a.problemsByID = make(map[string]atCoderProblem, len(problems))
	for _, problem := range problems {
		a.problemsByID[problem.ID] = problem
	}
	a.problemsLoaded = true

	return a.problemsByID, nil
}

func setAtCoderHeaders(req *http.Request) {
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("Accept", "application/json")
}

func atCoderBody(resp *http.Response) (io.ReadCloser, error) {
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gr, err := gzip.NewReader(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("create gzip reader: %w", err)
		}
		return gr, nil
	}
	return resp.Body, nil
}
