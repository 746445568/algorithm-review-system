package judges

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
