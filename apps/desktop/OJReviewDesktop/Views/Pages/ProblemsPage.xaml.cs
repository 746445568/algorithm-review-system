namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class ProblemsPage : Page
    {
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
