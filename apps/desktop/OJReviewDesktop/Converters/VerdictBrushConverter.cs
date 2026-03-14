using Microsoft.UI;
using Microsoft.UI.Xaml.Data;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace OJReviewDesktop.Converters;

public sealed class VerdictBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
    {
        var verdict = value?.ToString()?.ToUpperInvariant() ?? string.Empty;
        var brushRole = parameter?.ToString()?.ToLowerInvariant() ?? "foreground";
        var color = verdict switch
        {
            "AC" => Color.FromArgb(255, 34, 197, 94),
            "WA" => Color.FromArgb(255, 59, 130, 246),
            "TLE" => Color.FromArgb(255, 245, 158, 11),
            "MLE" => Color.FromArgb(255, 236, 72, 153),
            "RE" => Color.FromArgb(255, 239, 68, 68),
            "CE" => Color.FromArgb(255, 168, 85, 247),
            _ => Color.FromArgb(255, 113, 113, 122),
        };

        return new SolidColorBrush(brushRole == "background"
            ? Color.FromArgb(26, color.R, color.G, color.B)
            : color);
    }

    public object ConvertBack(object value, Type targetType, object parameter, string language) =>
        throw new NotSupportedException();
}
