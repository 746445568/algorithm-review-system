using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace OJReviewDesktop.Converters;

public sealed class SyncStatusBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        var status = value?.ToString()?.ToUpperInvariant() ?? string.Empty;
        var brushRole = parameter?.ToString()?.ToLowerInvariant() ?? "foreground";
        var color = status switch
        {
            "SUCCESS" or "ACTIVE" or "HEALTHY" => Color.FromArgb(255, 34, 197, 94),
            "RUNNING" or "SYNCING" or "PENDING" => Color.FromArgb(255, 59, 130, 246),
            "FAILED" or "ERROR" => Color.FromArgb(255, 239, 68, 68),
            "PARTIAL_SUCCESS" => Color.FromArgb(255, 245, 158, 11),
            _ => Color.FromArgb(255, 113, 113, 122),
        };

        return new SolidColorBrush(brushRole == "background"
            ? Color.FromArgb(26, color.R, color.G, color.B)
            : color);
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language) =>
        throw new NotSupportedException();
}
