using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using OJReviewDesktop.Models;

namespace OJReviewDesktop.Services;

public sealed class LocalApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly HttpClient httpClient = new() { BaseAddress = new Uri("http://127.0.0.1:38473") };

    public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await httpClient.GetFromJsonAsync<HealthResponse>("/health", JsonOptions, cancellationToken);
            return response?.Status == "ok";
        }
        catch
        {
            return false;
        }
    }

    public Task<OwnerResponse?> GetOwnerAsync(CancellationToken cancellationToken = default) =>
        httpClient.GetFromJsonAsync<OwnerResponse>("/api/me", JsonOptions, cancellationToken);

    public async Task<List<PlatformAccount>> GetAccountsAsync(CancellationToken cancellationToken = default)
    {
        var response = await httpClient.GetFromJsonAsync<List<PlatformAccount>>("/api/accounts", JsonOptions, cancellationToken);
        return response ?? [];
    }

    public async Task<AiSettings?> GetAiSettingsAsync(CancellationToken cancellationToken = default) =>
        await httpClient.GetFromJsonAsync<AiSettings>("/api/settings/ai", JsonOptions, cancellationToken);

    public async Task SaveAiSettingsAsync(AiSettings settings, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PutAsJsonAsync("/api/settings/ai", settings, JsonOptions, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task<ThemeSettings?> GetThemeSettingsAsync(CancellationToken cancellationToken = default) =>
        await httpClient.GetFromJsonAsync<ThemeSettings>("/api/settings/theme", JsonOptions, cancellationToken);

    public async Task SaveThemeSettingsAsync(string mode, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PutAsJsonAsync("/api/settings/theme", new ThemeSettings { Mode = mode }, JsonOptions, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task UpsertAccountAsync(string platform, string handle, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PutAsJsonAsync($"/api/accounts/{platform}", new { handle }, JsonOptions, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task SyncAccountAsync(string platform, long accountId, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PostAsJsonAsync($"/api/accounts/{platform}/sync", new { accountId }, JsonOptions, cancellationToken);
        response.EnsureSuccessStatusCode();
    }

    public async Task<List<SyncTaskItem>> GetSyncTasksAsync(CancellationToken cancellationToken = default)
    {
        var response = await httpClient.GetFromJsonAsync<List<SyncTaskItem>>("/api/sync-tasks", JsonOptions, cancellationToken);
        return response ?? [];
    }

    public async Task<List<SubmissionItem>> GetSubmissionsAsync(string? platform = null, string? verdict = null, CancellationToken cancellationToken = default)
    {
        var query = new List<string>();
        if (!string.IsNullOrWhiteSpace(platform))
        {
            query.Add($"platform={Uri.EscapeDataString(platform)}");
        }
        if (!string.IsNullOrWhiteSpace(verdict))
        {
            query.Add($"verdict={Uri.EscapeDataString(verdict)}");
        }

        var url = "/api/submissions" + (query.Count > 0 ? "?" + string.Join("&", query) : string.Empty);
        var response = await httpClient.GetFromJsonAsync<List<SubmissionItem>>(url, JsonOptions, cancellationToken);
        return response ?? [];
    }

    public async Task<List<ProblemItem>> GetProblemsAsync(string? platform = null, string? search = null, CancellationToken cancellationToken = default)
    {
        var query = new List<string>();
        if (!string.IsNullOrWhiteSpace(platform))
        {
            query.Add($"platform={Uri.EscapeDataString(platform)}");
        }
        if (!string.IsNullOrWhiteSpace(search))
        {
            query.Add($"search={Uri.EscapeDataString(search)}");
        }

        var url = "/api/problems" + (query.Count > 0 ? "?" + string.Join("&", query) : string.Empty);
        var response = await httpClient.GetFromJsonAsync<List<ProblemItem>>(url, JsonOptions, cancellationToken);
        return response ?? [];
    }

    public async Task<ReviewSummaryResponse?> GetReviewSummaryAsync(CancellationToken cancellationToken = default) =>
        await httpClient.GetFromJsonAsync<ReviewSummaryResponse>("/api/review/summary", JsonOptions, cancellationToken);

    public async Task<List<ContestItem>> GetContestsAsync(string? status = null, CancellationToken cancellationToken = default)
    {
        var query = new List<string>();
        if (!string.IsNullOrWhiteSpace(status))
        {
            query.Add($"status={Uri.EscapeDataString(status)}");
        }

        var url = "/api/contests" + (query.Count > 0 ? "?" + string.Join("&", query) : string.Empty);
        var response = await httpClient.GetFromJsonAsync<List<ContestItem>>(url, JsonOptions, cancellationToken);
        return response ?? [];
    }

    public async Task<int> SyncContestsAsync(CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PostAsync("/api/contests/sync", new StringContent("{}", Encoding.UTF8, "application/json"), cancellationToken);
        response.EnsureSuccessStatusCode();
        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return doc.RootElement.TryGetProperty("updated", out var updatedElement) ? updatedElement.GetInt32() : 0;
    }

    public async Task<AnalysisTaskItem?> GenerateAnalysisAsync(string? provider = null, string? model = null, long snapshotId = 0, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PostAsJsonAsync("/api/analysis/generate", new
        {
            provider,
            model,
            inputSnapshotId = snapshotId
        }, JsonOptions, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        if (!doc.RootElement.TryGetProperty("task", out var taskElement))
        {
            return null;
        }

        return taskElement.Deserialize<AnalysisTaskItem>(JsonOptions);
    }

    public async Task<AnalysisTaskItem?> GetAnalysisTaskAsync(long taskId, CancellationToken cancellationToken = default) =>
        await httpClient.GetFromJsonAsync<AnalysisTaskItem>($"/api/analysis/{taskId}", JsonOptions, cancellationToken);

    public async Task<string> ExportDiagnosticsAsync(CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PostAsync("/api/settings/data/export-diagnostics", new StringContent("{}", Encoding.UTF8, "application/json"), cancellationToken);
        response.EnsureSuccessStatusCode();
        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return doc.RootElement.GetProperty("path").GetString() ?? string.Empty;
    }

    public async Task<(bool Ok, string Message)> TestAiSettingsAsync(AiSettings settings, CancellationToken cancellationToken = default)
    {
        using var response = await httpClient.PostAsJsonAsync("/api/settings/ai/test", settings, JsonOptions, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        return (doc.RootElement.GetProperty("ok").GetBoolean(), doc.RootElement.GetProperty("message").GetString() ?? string.Empty);
    }
}
