using Microsoft.UI.Dispatching;

namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class AccountsPage : Page
    {
        private List<PlatformAccount> accounts = [];
        private readonly DispatcherQueueTimer refreshTimer;

        public AccountsPage()
        {
            InitializeComponent();
            Loaded += OnLoaded;
            Unloaded += OnUnloaded;
            refreshTimer = DispatcherQueue.GetForCurrentThread().CreateTimer();
            refreshTimer.Interval = TimeSpan.FromSeconds(5);
            refreshTimer.Tick += RefreshTimer_Tick;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            refreshTimer.Start();
            await RefreshAsync();
        }

        private void OnUnloaded(object sender, RoutedEventArgs e)
        {
            refreshTimer.Stop();
        }

        private async void RefreshTimer_Tick(DispatcherQueueTimer sender, object args)
        {
            await RefreshAsync(silent: true);
        }

        private async Task RefreshAsync(bool silent = false)
        {
            try
            {
                SetLoading(true);

                if (!await App.ApiClient.IsHealthyAsync())
                {
                    SetLoading(false);
                    if (!silent)
                    {
                        ShowStatus("本地服务未启动。", InfoBarSeverity.Warning);
                    }
                    return;
                }

                accounts = await App.ApiClient.GetAccountsAsync();
                var codeforces = accounts.FirstOrDefault(item => item.Platform == "CODEFORCES");
                var atCoder = accounts.FirstOrDefault(item => item.Platform == "ATCODER");

                if (CodeforcesHandleBox.FocusState == FocusState.Unfocused)
                {
                    CodeforcesHandleBox.Text = codeforces?.ExternalHandle ?? string.Empty;
                }

                if (AtCoderHandleBox.FocusState == FocusState.Unfocused)
                {
                    AtCoderHandleBox.Text = atCoder?.ExternalHandle ?? string.Empty;
                }

                CodeforcesStatusText.Text = codeforces?.StatusText ?? "未绑定";
                AtCoderStatusText.Text = atCoder?.StatusText ?? "未绑定";
                SyncTasksList.ItemsSource = await App.ApiClient.GetSyncTasksAsync();

                StatusBar.IsOpen = false;
                SetLoading(false);
            }
            catch (Exception ex)
            {
                SetLoading(false);
                if (!silent)
                {
                    ShowStatus(ex.Message, InfoBarSeverity.Error);
                }
            }
        }

        private async void SaveCodeforcesButton_Click(object sender, RoutedEventArgs e) =>
            await SaveAccountAsync("CODEFORCES", CodeforcesHandleBox.Text);

        private async void SaveAtCoderButton_Click(object sender, RoutedEventArgs e) =>
            await SaveAccountAsync("ATCODER", AtCoderHandleBox.Text);

        private async void SyncCodeforcesButton_Click(object sender, RoutedEventArgs e) =>
            await SyncAccountAsync("CODEFORCES");

        private async void SyncAtCoderButton_Click(object sender, RoutedEventArgs e) =>
            await SyncAccountAsync("ATCODER");

        private async void RefreshButton_Click(object sender, RoutedEventArgs e) =>
            await RefreshAsync();

        private async Task SaveAccountAsync(string platform, string handle)
        {
            if (string.IsNullOrWhiteSpace(handle))
            {
                ShowStatus("请先输入 handle。", InfoBarSeverity.Warning);
                return;
            }

            try
            {
                await App.ApiClient.UpsertAccountAsync(platform, handle.Trim());
                await RefreshAsync();
                ShowStatus($"{platform} 账号已保存。", InfoBarSeverity.Success);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private async Task SyncAccountAsync(string platform)
        {
            var account = accounts.FirstOrDefault(item => item.Platform == platform);
            if (account is null)
            {
                ShowStatus($"请先保存 {platform} 的 handle。", InfoBarSeverity.Warning);
                return;
            }

            try
            {
                await App.ApiClient.SyncAccountAsync(platform, account.Id);
                await RefreshAsync();
                ShowStatus($"{account.PlatformText} 同步任务已入队。", InfoBarSeverity.Success);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private void SetLoading(bool isLoading)
        {
            LoadingStatePanel.Visibility = isLoading ? Visibility.Visible : Visibility.Collapsed;
            ContentPanel.Visibility = isLoading ? Visibility.Collapsed : Visibility.Visible;
        }

        private void ShowStatus(string message, InfoBarSeverity severity)
        {
            StatusBar.Message = message;
            StatusBar.Severity = severity;
            StatusBar.IsOpen = true;
        }
    }
}
