using OJReviewDesktop.Models;

namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class DashboardPage : Page
    {
        public DashboardPage()
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

        private async void SyncContestsButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var updated = await App.ApiClient.SyncContestsAsync();
                await RefreshAsync();
                ShowStatus($"比赛数据已同步，更新 {updated} 条记录。", InfoBarSeverity.Success);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private async Task RefreshAsync()
        {
            try
            {
                SetLoading(true);

                var owner = await App.ApiClient.GetOwnerAsync();
                var summary = await App.ApiClient.GetReviewSummaryAsync();
                var contests = await App.ApiClient.GetContestsAsync("UPCOMING");
                var submissions = await App.ApiClient.GetSubmissionsAsync();

                OwnerText.Text = owner is null
                    ? "当前工作区为本地单用户实例。"
                    : $"当前工作区：{owner.Owner.Name}，所有数据保存在本机。";

                if (summary is null)
                {
                    SetLoading(false);
                    return;
                }

                TotalSubmissionsText.Text = summary.TotalSubmissions.ToString();
                AcRateText.Text = $"{summary.AcRate:0.0}%";
                RepeatedFailuresText.Text = summary.RepeatedFailures.Count.ToString();
                WeakTagsList.ItemsSource = summary.WeakTags;
                UpcomingContestsList.ItemsSource = contests;

                SubmissionTrendItems.ItemsSource = BuildSubmissionTrend(submissions);
                WeakTagChartItems.ItemsSource = BuildWeakTagChart(summary.WeakTags);

                StatusBar.IsOpen = false;
                SetLoading(false);
            }
            catch (Exception ex)
            {
                SetLoading(false);
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private void SetLoading(bool isLoading)
        {
            LoadingStatePanel.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            ContentPanel.Visibility = isLoading ? Visibility.Collapsed : Visibility.Visible;
        }

        private static List<TrendPoint> BuildSubmissionTrend(List<SubmissionItem> submissions)
        {
            var endDate = DateTime.Today;
            var points = Enumerable.Range(0, 14)
                .Select(offset => endDate.AddDays(-13 + offset))
                .Select(day => new
                {
                    Label = day.ToString("MM/dd"),
                    Count = submissions.Count(item => item.SubmittedAt.LocalDateTime.Date == day)
                })
                .ToList();
            var max = Math.Max(points.Max(item => item.Count), 1);
            return points
                .Select(item => new TrendPoint
                {
                    Label = item.Label,
                    Count = item.Count,
                    Height = 24 + (item.Count / (double)max * 176)
                })
                .ToList();
        }

        private static List<WeakTagChartPoint> BuildWeakTagChart(List<WeakTagItem> weakTags)
        {
            var topTags = weakTags.Take(6).ToList();
            return topTags
                .Select(item => new WeakTagChartPoint
                {
                    Label = item.Tag,
                    Width = 24 + (item.AcRate / 100d * 220),
                    ValueText = $"{item.AcRate:0}%",
                })
                .ToList();
        }

        private void ShowStatus(string message, InfoBarSeverity severity)
        {
            StatusBar.Message = message;
            StatusBar.Severity = severity;
            StatusBar.IsOpen = true;
        }
    }
}
