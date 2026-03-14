using Microsoft.UI.Dispatching;
using Windows.System;

namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class ProblemsPage : Page
    {
        private DispatcherQueueTimer? _searchDebounce;

        public ProblemsPage()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            PlatformFilterBox.SelectedIndex = 0;
            await RefreshAsync();
        }

        private void SearchBox_TextChanged(object sender, Microsoft.UI.Xaml.Controls.TextChangedEventArgs e)
        {
            _searchDebounce?.Stop();
            _searchDebounce = DispatcherQueue.CreateTimer();
            _searchDebounce.Interval = TimeSpan.FromMilliseconds(400);
            _searchDebounce.Tick += async (s, _) =>
            {
                if (s is DispatcherQueueTimer t) t.Stop();
                await RefreshAsync();
            };
            _searchDebounce.Start();
        }

        private async void ProblemsList_ItemClick(object sender, ItemClickEventArgs e)
        {
            if (e.ClickedItem is ProblemItem problem && !string.IsNullOrWhiteSpace(problem.Url))
            {
                try
                {
                    await Launcher.LaunchUriAsync(new Uri(problem.Url));
                }
                catch
                {
                    StatusBar.Message = "无法打开链接";
                    StatusBar.Severity = InfoBarSeverity.Warning;
                    StatusBar.IsOpen = true;
                }
            }
        }

        private async void PlatformFilterBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (IsLoaded) await RefreshAsync();
        }

        private async void RefreshButton_Click(object sender, RoutedEventArgs e)
        {
            await RefreshAsync();
        }

        private async Task RefreshAsync()
        {
            try
            {
                SetLoading(true);
                var platform = (PlatformFilterBox.SelectedItem as ComboBoxItem)?.Tag?.ToString();
                ProblemsList.ItemsSource = await App.ApiClient.GetProblemsAsync(platform, SearchBox.Text?.Trim());
                StatusBar.IsOpen = false;
                SetLoading(false);
            }
            catch (Exception ex)
            {
                SetLoading(false);
                StatusBar.Message = ex.Message;
                StatusBar.Severity = InfoBarSeverity.Error;
                StatusBar.IsOpen = true;
            }
        }

        private void SetLoading(bool isLoading)
        {
            LoadingStatePanel.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            ContentCard.Visibility = isLoading ? Visibility.Collapsed : Visibility.Visible;
        }
    }
}
