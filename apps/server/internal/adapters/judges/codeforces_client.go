package judges

import (
	"context"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func (a *CodeforcesAdapter) getJSON(ctx context.Context, path string, query url.Values, target any) error {
	a.waitRateLimit()

	endpoint := a.baseURL + "/" + strings.TrimPrefix(path, "/")
	if query != nil && len(query) > 0 {
		endpoint += "?" + query.Encode()
	}

	var lastErr error
	for attempt := 0; attempt <= codeforcesMaxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(codeforcesRetryDelay * time.Duration(attempt))
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
		if err != nil {
			return fmt.Errorf("build request: %w", err)
		}

		resp, err := a.client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("request failed: %w", err)
			// 网络/TLS 错误可重试
			if isRetryableError(err) {
				continue
			}
			return lastErr
		}

		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("read response: %w", readErr)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			// 429 / 5xx 可重试
			if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
				lastErr = fmt.Errorf("http %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
				continue
			}
			return fmt.Errorf("http %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		}

		var envelope codeforcesAPIEnvelope
		if err := json.Unmarshal(body, &envelope); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}

		if envelope.Status != "OK" {
			if envelope.Comment != "" {
				return errors.New(envelope.Comment)
			}
			return fmt.Errorf("codeforces api status: %s", envelope.Status)
		}

		if err := json.Unmarshal(envelope.Result, target); err != nil {
			return fmt.Errorf("decode result: %w", err)
		}

		return nil
	}

	return fmt.Errorf("after %d retries: %w", codeforcesMaxRetries, lastErr)
}

func (a *CodeforcesAdapter) getAuthenticatedJSON(ctx context.Context, path string, query url.Values, target any) error {
	signed := cloneValues(query)
	signed.Set("apiKey", strings.TrimSpace(a.apiKey))
	now := a.now
	if now == nil {
		now = time.Now
	}
	signed.Set("time", strconv.FormatInt(now().Unix(), 10))
	signed.Set("apiSig", buildCodeforcesAPISig(path, signed, strings.TrimSpace(a.apiSecret)))
	return a.getJSON(ctx, path, signed, target)
}

func (a *CodeforcesAdapter) fetchSubmissionSourceFromBrowserSession(ctx context.Context, submissionID string) (string, error) {
	endpoint := strings.TrimRight(strings.TrimSuffix(a.baseURL, "/api"), "/") + "/data/submitSource"
	form := url.Values{
		"submissionId": []string{strings.TrimSpace(submissionID)},
		"csrf_token":   []string{strings.TrimSpace(a.csrfToken)},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("create submitSource request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Cookie", strings.TrimSpace(a.sessionCookie))

	resp, err := a.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch submitSource: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read submitSource response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("submitSource returned status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload struct {
		Source string `json:"source"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return "", fmt.Errorf("decode submitSource response: %w", err)
	}
	if strings.TrimSpace(payload.Source) == "" {
		return "", errors.New("submitSource response missing source")
	}
	return payload.Source, nil
}

func cloneValues(values url.Values) url.Values {
	out := make(url.Values, len(values))
	for key, list := range values {
		out[key] = append([]string(nil), list...)
	}
	return out
}

func buildCodeforcesAPISig(path string, query url.Values, secret string) string {
	const prefix = "123456"
	base := prefix + "/" + strings.TrimPrefix(path, "/") + "?" + query.Encode() + "#" + secret
	sum := sha512.Sum512([]byte(base))
	return prefix + hex.EncodeToString(sum[:])
}

func isRetryableError(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "TLS handshake") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "EOF") ||
		strings.Contains(msg, "no such host")
}

// fetchProblemStatement 获取题目题面 HTML
func fetchProblemStatement(ctx context.Context, client *http.Client, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("create problem statement request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch problem statement: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	return string(body), nil
}

func fetchCodeforcesSubmissionSource(ctx context.Context, client *http.Client, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("create submission source request: %w", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetch submission source: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	source, err := extractCodeforcesSubmissionSource(string(body))
	if err != nil {
		return "", err
	}
	return source, nil
}

var codeforcesSourcePattern = regexp.MustCompile(`(?is)<pre[^>]*id=["']program-source-text["'][^>]*>(.*?)</pre>`)

func extractCodeforcesSubmissionSource(pageHTML string) (string, error) {
	matches := codeforcesSourcePattern.FindStringSubmatch(pageHTML)
	if len(matches) < 2 {
		return "", errors.New("program-source-text block not found")
	}
	return strings.TrimSpace(html.UnescapeString(matches[1])), nil
}

// containsProblemStatement 检查 HTML 是否包含题面内容
func containsProblemStatement(html string) bool {
	return strings.Contains(html, "problem-statement") ||
		strings.Contains(html, "title") ||
		strings.Contains(html, "<p>")
}

func (a *CodeforcesAdapter) waitRateLimit() {
	a.mu.Lock()
	defer a.mu.Unlock()

	if !a.lastRequestAt.IsZero() {
		wait := codeforcesMinSpacing - time.Since(a.lastRequestAt)
		if wait > 0 {
			time.Sleep(wait)
		}
	}
	a.lastRequestAt = time.Now()
}
