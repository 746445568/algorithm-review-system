using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Data;

namespace OJReviewDesktop.Converters;

public sealed class StringVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language) =>
        string.IsNullOrWhiteSpace(value?.ToString()) ? Visibility.Collapsed : Visibility.Visible;

    public object ConvertBack(object value, Type targetType, object parameter, string language) =>
        throw new NotSupportedException();
}
