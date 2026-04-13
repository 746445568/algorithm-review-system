package judges

import (
	"html"
	"regexp"
	"strings"
)

// htmlToMarkdown converts HTML to Markdown using regex-based rules.
// MathJax expressions ($...$  and $$...$$) are preserved as-is.
func htmlToMarkdown(htmlStr string) string {
	s := htmlStr

	// section-title class -> ## heading (before general tag stripping)
	reSectionTitle := regexp.MustCompile(`(?is)<[^>]+class="[^"]*section-title[^"]*"[^>]*>(.*?)</[a-zA-Z]+>`)
	s = reSectionTitle.ReplaceAllString(s, "## $1")

	// headings h1-h6
	reHeading := regexp.MustCompile(`(?is)<h[1-6][^>]*>(.*?)</h[1-6]>`)
	s = reHeading.ReplaceAllString(s, "## $1")

	// pre blocks (multiline) — process before other tags
	rePre := regexp.MustCompile(`(?is)<pre[^>]*>(.*?)</pre>`)
	s = rePre.ReplaceAllStringFunc(s, func(m string) string {
		sub := rePre.FindStringSubmatch(m)
		if len(sub) < 2 {
			return m
		}
		// strip inner tags inside <pre>
		reInner := regexp.MustCompile(`<[^>]+>`)
		code := reInner.ReplaceAllString(sub[1], "")
		code = html.UnescapeString(code)
		return "```\n" + code + "\n```"
	})

	// strong / b
	reStrong := regexp.MustCompile(`(?is)<strong[^>]*>(.*?)</strong>`)
	s = reStrong.ReplaceAllString(s, "**$1**")
	reB := regexp.MustCompile(`(?is)<b[^>]*>(.*?)</b>`)
	s = reB.ReplaceAllString(s, "**$1**")

	// em / i
	reEm := regexp.MustCompile(`(?is)<em[^>]*>(.*?)</em>`)
	s = reEm.ReplaceAllString(s, "*$1*")
	reI := regexp.MustCompile(`(?is)<i[^>]*>(.*?)</i>`)
	s = reI.ReplaceAllString(s, "*$1*")

	// br -> newline
	reBr := regexp.MustCompile(`(?i)<br\s*/?>`)
	s = reBr.ReplaceAllString(s, "\n")

	// li items
	reLi := regexp.MustCompile(`(?is)<li[^>]*>(.*?)</li>`)
	s = reLi.ReplaceAllString(s, "- $1\n")

	// a href links
	reA := regexp.MustCompile(`(?is)<a[^>]*href="([^"]*)"[^>]*>(.*?)</a>`)
	s = reA.ReplaceAllString(s, "[$2]($1)")

	// p paragraphs
	reP := regexp.MustCompile(`(?is)<p[^>]*>(.*?)</p>`)
	s = reP.ReplaceAllString(s, "$1\n\n")

	// strip remaining HTML tags
	reTag := regexp.MustCompile(`<[^>]+>`)
	s = reTag.ReplaceAllString(s, "")

	// unescape HTML entities
	s = html.UnescapeString(s)

	// collapse 3+ consecutive newlines to 2
	reBlankLines := regexp.MustCompile(`\n{3,}`)
	s = reBlankLines.ReplaceAllString(s, "\n\n")

	return strings.TrimSpace(s)
}
