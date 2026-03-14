using System.Diagnostics;

namespace OJReviewDesktop.Services;

public sealed class LocalServiceManager
{
    private Process? process;

    public async Task<bool> EnsureStartedAsync(LocalApiClient apiClient, CancellationToken cancellationToken = default)
    {
        if (await apiClient.IsHealthyAsync(cancellationToken))
        {
            return true;
        }

        var executable = FindExecutablePath();
        if (string.IsNullOrWhiteSpace(executable) || !File.Exists(executable))
        {
            return false;
        }

        process ??= Process.Start(new ProcessStartInfo
        {
            FileName = executable,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(executable) ?? AppContext.BaseDirectory,
        });

        for (var attempt = 0; attempt < 10; attempt++)
        {
            await Task.Delay(300, cancellationToken);
            if (await apiClient.IsHealthyAsync(cancellationToken))
            {
                return true;
            }
        }

        return false;
    }

    private static string? FindExecutablePath()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Service", "ojreviewd.exe"),
            Path.Combine(AppContext.BaseDirectory, "ojreviewd.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "OJReviewDesktop", "bin", "ojreviewd.exe"),
        };

        return candidates.FirstOrDefault(File.Exists);
    }
}
