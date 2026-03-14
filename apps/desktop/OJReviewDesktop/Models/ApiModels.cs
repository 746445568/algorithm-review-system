using System.Text.Json;
using System.Text.Json.Serialization;

namespace OJReviewDesktop.Models;

public sealed class HealthResponse
{
    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}

public sealed class OwnerResponse
{
    [JsonPropertyName("owner")]
    public OwnerProfile Owner { get; set; } = new();

    [JsonPropertyName("app")]
    public AppInfo App { get; set; } = new();
}

public sealed class OwnerProfile
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;
}

public sealed class AppInfo
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("dataDir")]
    public string DataDir { get; set; } = string.Empty;

    [JsonPropertyName("logDir")]
    public string LogDir { get; set; } = string.Empty;

    [JsonPropertyName("secureDir")]
    public string SecureDir { get; set; } = string.Empty;
}

public sealed class PlatformAccount
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("externalHandle")]
    public string ExternalHandle { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("lastSyncedAt")]
    public DateTimeOffset? LastSyncedAt { get; set; }

    public string PlatformText => DisplayText.Platform(Platform);

    public string StatusText => DisplayText.SyncStatus(Status);

    public string LastSyncedText =>
        LastSyncedAt.HasValue ? $"最近同步：{LastSyncedAt.Value.LocalDateTime:yyyy-MM-dd HH:mm}" : "尚未同步";
}

public sealed class AiSettings
{
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("baseUrl")]
    public string BaseUrl { get; set; } = string.Empty;

    [JsonPropertyName("apiKey")]
    public string ApiKey { get; set; } = string.Empty;
}

public sealed class ThemeSettings
{
    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "follow-system";
}

public sealed class SyncTaskItem
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("platformAccountId")]
    public long PlatformAccountId { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("fetchedCount")]
    public int FetchedCount { get; set; }

    [JsonPropertyName("insertedCount")]
    public int InsertedCount { get; set; }

    [JsonPropertyName("errorMessage")]
    public string ErrorMessage { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public DateTimeOffset CreatedAt { get; set; }

    public string StatusText => DisplayText.SyncStatus(Status);

    public string CreatedAtText => CreatedAt.LocalDateTime.ToString("yyyy-MM-dd HH:mm");

    public string FetchedText => $"拉取 {FetchedCount}";

    public string SavedText => $"写入 {InsertedCount}";
}

public sealed class SubmissionItem
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("platformAccountId")]
    public long? PlatformAccountId { get; set; }

    [JsonPropertyName("externalSubmissionId")]
    public string ExternalSubmissionId { get; set; } = string.Empty;

    [JsonPropertyName("problemId")]
    public long ProblemId { get; set; }

    [JsonPropertyName("verdict")]
    public string Verdict { get; set; } = string.Empty;

    [JsonPropertyName("language")]
    public string Language { get; set; } = string.Empty;

    [JsonPropertyName("submittedAt")]
    public DateTimeOffset SubmittedAt { get; set; }

    [JsonPropertyName("sourceContestId")]
    public string SourceContestId { get; set; } = string.Empty;

    [JsonPropertyName("executionTimeMs")]
    public int? ExecutionTimeMs { get; set; }

    [JsonPropertyName("memoryKb")]
    public int? MemoryKb { get; set; }

    public string PlatformText => DisplayText.Platform(Platform);

    public string VerdictText => DisplayText.Verdict(Verdict);

    public string SubmittedAtText => SubmittedAt.LocalDateTime.ToString("yyyy-MM-dd HH:mm");

    public string ContestText => string.IsNullOrWhiteSpace(SourceContestId) ? "未归属比赛" : SourceContestId;

    public string RuntimeText => ExecutionTimeMs.HasValue ? $"{ExecutionTimeMs.Value} ms" : "--";

    public string MemoryText => MemoryKb.HasValue ? $"{MemoryKb.Value / 1024.0:0.#} MB" : "--";
}

public sealed class ProblemItem
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("externalProblemId")]
    public string ExternalProblemId { get; set; } = string.Empty;

    [JsonPropertyName("externalContestId")]
    public string ExternalContestId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("difficulty")]
    public string Difficulty { get; set; } = string.Empty;

    [JsonPropertyName("rawTagsJson")]
    public string RawTagsJson { get; set; } = "[]";

    public string PlatformText => DisplayText.Platform(Platform);

    public string DifficultyText => string.IsNullOrWhiteSpace(Difficulty) ? "难度未标注" : $"难度 {Difficulty}";

    public string TagsText
    {
        get
        {
            try
            {
                var tags = JsonSerializer.Deserialize<List<string>>(RawTagsJson);
                return tags is { Count: > 0 } ? string.Join(" · ", tags.Take(4)) : "暂无标签";
            }
            catch
            {
                return "暂无标签";
            }
        }
    }

    public string ContestText => string.IsNullOrWhiteSpace(ExternalContestId) ? "独立题目" : $"比赛 {ExternalContestId}";
}

public sealed class WeakTagItem
{
    [JsonPropertyName("tag")]
    public string Tag { get; set; } = string.Empty;

    [JsonPropertyName("attempts")]
    public int Attempts { get; set; }

    [JsonPropertyName("acCount")]
    public int AcCount { get; set; }

    [JsonPropertyName("acRate")]
    public double AcRate { get; set; }

    public string AttemptsText => $"{Attempts} 次尝试";

    public string AcRateText => $"通过率 {AcRate:0.0}%";
}

public sealed class RepeatedFailureItem
{
    [JsonPropertyName("problemId")]
    public long ProblemId { get; set; }

    [JsonPropertyName("externalProblemId")]
    public string ExternalProblemId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("failedCount")]
    public int FailedCount { get; set; }

    public string FailedCountText => $"{FailedCount} 次失败";
}

public sealed class RecentUnsolvedItem
{
    [JsonPropertyName("problemId")]
    public long ProblemId { get; set; }

    [JsonPropertyName("externalProblemId")]
    public string ExternalProblemId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("lastSubmittedAt")]
    public string LastSubmittedAt { get; set; } = string.Empty;

    public string LastSubmittedText => string.IsNullOrWhiteSpace(LastSubmittedAt) ? "暂无提交时间" : LastSubmittedAt;
}

public sealed class ProblemSummaryItem
{
    [JsonPropertyName("problemId")]
    public long ProblemId { get; set; }

    [JsonPropertyName("externalProblemId")]
    public string ExternalProblemId { get; set; } = string.Empty;

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("contestId")]
    public string ContestId { get; set; } = string.Empty;

    [JsonPropertyName("attemptCount")]
    public int AttemptCount { get; set; }

    [JsonPropertyName("acCount")]
    public int AcCount { get; set; }

    [JsonPropertyName("solvedLater")]
    public bool SolvedLater { get; set; }

    [JsonPropertyName("lastFailedAt")]
    public string? LastFailedAt { get; set; }

    [JsonPropertyName("lastSubmittedAt")]
    public string LastSubmittedAt { get; set; } = string.Empty;

    [JsonPropertyName("latestVerdict")]
    public string LatestVerdict { get; set; } = string.Empty;

    [JsonPropertyName("tags")]
    public List<string> Tags { get; set; } = [];

    public string PlatformText => DisplayText.Platform(Platform);

    public string VerdictText => DisplayText.Verdict(LatestVerdict);

    public string TagsText => Tags.Count > 0 ? string.Join(" · ", Tags.Take(4)) : "暂无标签";

    public string ContestText => string.IsNullOrWhiteSpace(ContestId) ? "未归属比赛" : $"比赛 {ContestId}";

    public string AttemptText => $"{AttemptCount} 次尝试";

    public string SolvedLaterText => SolvedLater ? "已补题通过" : "仍未解决";
}

public sealed class ContestGroupItem
{
    [JsonPropertyName("contestId")]
    public string ContestId { get; set; } = string.Empty;

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("contestName")]
    public string ContestName { get; set; } = string.Empty;

    [JsonPropertyName("problemCount")]
    public int ProblemCount { get; set; }

    [JsonPropertyName("attemptCount")]
    public int AttemptCount { get; set; }

    [JsonPropertyName("acCount")]
    public int AcCount { get; set; }

    [JsonPropertyName("solvedRate")]
    public double SolvedRate { get; set; }

    public string ContestText => string.IsNullOrWhiteSpace(ContestName) ? ContestId : ContestName;

    public string MetaText => $"{DisplayText.Platform(Platform)} · {ProblemCount} 题 · {AttemptCount} 次尝试 · 通过率 {SolvedRate:0.0}%";
}

public sealed class ReviewSummaryResponse
{
    [JsonPropertyName("totalSubmissions")]
    public int TotalSubmissions { get; set; }

    [JsonPropertyName("acRate")]
    public double AcRate { get; set; }

    [JsonPropertyName("weakTags")]
    public List<WeakTagItem> WeakTags { get; set; } = [];

    [JsonPropertyName("repeatedFailures")]
    public List<RepeatedFailureItem> RepeatedFailures { get; set; } = [];

    [JsonPropertyName("recentUnsolved")]
    public List<RecentUnsolvedItem> RecentUnsolved { get; set; } = [];

    [JsonPropertyName("problemSummaries")]
    public List<ProblemSummaryItem> ProblemSummaries { get; set; } = [];

    [JsonPropertyName("contestGroups")]
    public List<ContestGroupItem> ContestGroups { get; set; } = [];
}

public sealed class ContestItem
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = string.Empty;

    [JsonPropertyName("externalContestId")]
    public string ExternalContestId { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("startTime")]
    public DateTimeOffset StartTime { get; set; }

    [JsonPropertyName("durationMinutes")]
    public int DurationMinutes { get; set; }

    [JsonPropertyName("url")]
    public string Url { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    public string PlatformText => DisplayText.Platform(Platform);

    public string StartText => StartTime == default ? "时间待定" : StartTime.LocalDateTime.ToString("yyyy-MM-dd HH:mm");

    public string DurationText => DurationMinutes > 0 ? $"{DurationMinutes} 分钟" : "时长待定";

    public string StatusText => DisplayText.ContestStatus(Status);
}

public sealed class AnalysisTaskItem
{
    [JsonPropertyName("id")]
    public long Id { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("resultText")]
    public string ResultText { get; set; } = string.Empty;

    [JsonPropertyName("resultJson")]
    public string ResultJson { get; set; } = string.Empty;

    [JsonPropertyName("errorMessage")]
    public string ErrorMessage { get; set; } = string.Empty;

    public string StatusText => DisplayText.SyncStatus(Status);
}

public sealed class TrendPoint
{
    public string Label { get; set; } = string.Empty;

    public int Count { get; set; }

    public double Height { get; set; }
}

public sealed class WeakTagChartPoint
{
    public string Label { get; set; } = string.Empty;

    public double Width { get; set; }

    public string ValueText { get; set; } = string.Empty;
}

internal static class DisplayText
{
    public static string Platform(string platform) => platform?.ToUpperInvariant() switch
    {
        "CODEFORCES" => "Codeforces",
        "ATCODER" => "AtCoder",
        "MANUAL" => "手动录入",
        _ => string.IsNullOrWhiteSpace(platform) ? "未知平台" : platform
    };

    public static string Verdict(string verdict) => verdict?.ToUpperInvariant() switch
    {
        "AC" => "AC",
        "WA" => "WA",
        "TLE" => "TLE",
        "MLE" => "MLE",
        "RE" => "RE",
        "CE" => "CE",
        "OLE" => "OLE",
        "IE" => "IE",
        _ => string.IsNullOrWhiteSpace(verdict) ? "未知" : verdict
    };

    public static string SyncStatus(string status) => status?.ToUpperInvariant() switch
    {
        "PENDING" => "等待中",
        "RUNNING" => "执行中",
        "SUCCESS" => "成功",
        "FAILED" => "失败",
        "PARTIAL_SUCCESS" => "部分成功",
        "CANCELLED" => "已取消",
        "ACTIVE" => "已绑定",
        _ => string.IsNullOrWhiteSpace(status) ? "未知状态" : status
    };

    public static string ContestStatus(string status) => status?.ToUpperInvariant() switch
    {
        "UPCOMING" => "即将开始",
        "RUNNING" => "进行中",
        "FINISHED" => "已结束",
        _ => string.IsNullOrWhiteSpace(status) ? "未知状态" : status
    };
}
