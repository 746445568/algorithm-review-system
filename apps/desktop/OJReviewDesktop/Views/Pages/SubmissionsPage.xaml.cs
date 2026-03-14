namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class SubmissionsPage : Page
    {
        public SubmissionsPage()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            PlatformFilterBox.SelectedIndex = 0;
            VerdictFilterBox.SelectedIndex = 0;
            await RefreshAsync();
        }

        private async void Filter_SelectionChanged(object sender, SelectionChangedEventArgs e)
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
                var verdict = (VerdictFilterBox.SelectedItem as ComboBoxItem)?.Tag?.ToString();
                SubmissionsList.ItemsSource = await App.ApiClient.GetSubmissionsAsync(platform, verdict);
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
