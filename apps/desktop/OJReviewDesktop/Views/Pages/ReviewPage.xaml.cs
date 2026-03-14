using OJReviewDesktop.Models;

namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class ReviewPage : Page
    {
        private ReviewSummaryResponse? summary;

        public ReviewPage()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            await RefreshAsync();
        }

        private async void RefreshButton_Click(object sender, RoutedEventArgs e)
        {
            await RefreshAsync();
        }

        private void ProblemViewButton_Click(object sender, RoutedEventArgs e)
        {
            ProblemViewButton.IsChecked = true;
            ContestViewButton.IsChecked = false;
            ApplyViewMode();
        }

        private void ContestViewButton_Click(object sender, RoutedEventArgs e)
        {
            ContestViewButton.IsChecked = true;
            ProblemViewButton.IsChecked = false;
            ApplyViewMode();
        }

        private async Task RefreshAsync()
        {
            try
            {
                SetLoading(true);
                summary = await App.ApiClient.GetReviewSummaryAsync();
                if (summary is null)
                {
                    SetLoading(false);
                    return;
                }

                ProblemSummariesList.ItemsSource = summary.ProblemSummaries;
                ContestGroupsList.ItemsSource = summary.ContestGroups;
                RepeatedFailuresList.ItemsSource = summary.RepeatedFailures;
                RecentUnsolvedList.ItemsSource = summary.RecentUnsolved;
                ApplyViewMode();
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

        private void ApplyViewMode()
        {
            var showContest = ContestViewButton.IsChecked == true;
            ProblemViewCard.Visibility = showContest ? Visibility.Collapsed : Visibility.Visible;
            ContestViewCard.Visibility = showContest ? Visibility.Visible : Visibility.Collapsed;
        }

        private void SetLoading(bool isLoading)
        {
            LoadingStatePanel.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            ContentPanel.Visibility = isLoading ? Visibility.Collapsed : Visibility.Visible;
        }
    }
}
