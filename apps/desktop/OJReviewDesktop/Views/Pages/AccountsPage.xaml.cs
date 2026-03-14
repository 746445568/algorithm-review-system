namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class AccountsPage : Page
    {
        private List<PlatformAccount> accounts = [];
        private SyncTaskItem? latestFailedTask;
        private bool isBusy;

        public AccountsPage()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            await RefreshAsync();
        }

        private async Task RefreshAsync(bool preserveInput = true)
        {
            try
            {
                SetLoading(true);

                if (!await App.ApiClient.IsHealthyAsync())
                {
                    SetLoading(false);
                    ShowStatus("本地服务未启动。", InfoBarSeverity.Warning);
                    return;
                }

                accounts = await App.ApiClient.GetAccountsAsync();
                var tasks = await App.ApiClient.GetSyncTasksAsync();

                var codeforces = accounts.FirstOrDefault(item => item.Platform == "CODEFORCES");
                var atCoder = accounts.FirstOrDefault(item => item.Platform == "ATCODER");

                if (!preserveInput || CodeforcesHandleBox.FocusState == FocusState.Unfocused)
                {
                    CodeforcesHandleBox.Text = codeforces?.ExternalHandle ?? string.Empty;
                }

                if (!preserveInput || AtCoderHandleBox.FocusState == FocusState.Unfocused)
                {
                    AtCoderHandleBox.Text = atCoder?.ExternalHandle ?? string.Empty;
                }

                CodeforcesStatusText.Text = codeforces?.StatusText ?? "未绑定";
                AtCoderStatusText.Text = atCoder?.StatusText ?? "未绑定";

                SyncTasksList.ItemsSource = tasks;
                EmptyTasksHint.Visibility = tasks.Count == 0 ? Visibility.Visible : Visibility.Collapsed;

                latestFailedTask = tasks.FirstOrDefault(item => string.Equals(item.Status, "FAILED", StringComparison.OrdinalIgnoreCase));
                RetryFailedButton.IsEnabled = latestFailedTask is not null && !isBusy;

                ApplyRunningState("CODEFORCES", tasks.Any(item => item.PlatformAccountId == codeforces?.Id && string.Equals(item.Status, "RUNNING", StringComparison.OrdinalIgnoreCase)));
                ApplyRunningState("ATCODER", tasks.Any(item => item.PlatformAccountId == atCoder?.Id && string.Equals(item.Status, "RUNNING", StringComparison.OrdinalIgnoreCase)));

                StatusBar.IsOpen = false;
                SetLoading(false);
            }
            catch (Exception ex)
            {
                SetLoading(false);
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private async void SaveCodeforcesButton_Click(object sender, RoutedEventArgs e) =>
            await SaveAccountAsync("CODEFORCES", CodeforcesHandleBox.Text, SaveCodeforcesButton);

        private async void SaveAtCoderButton_Click(object sender, RoutedEventArgs e) =>
            await SaveAccountAsync("ATCODER", AtCoderHandleBox.Text, SaveAtCoderButton);

        private async void SyncCodeforcesButton_Click(object sender, RoutedEventArgs e) =>
            await SyncAccountAsync("CODEFORCES");

        private async void SyncAtCoderButton_Click(object sender, RoutedEventArgs e) =>
            await SyncAccountAsync("ATCODER");

        private async void RefreshButton_Click(object sender, RoutedEventArgs e) =>
            await RefreshAsync();

        private async void RetryFailedButton_Click(object sender, RoutedEventArgs e)
        {
            if (latestFailedTask is null)
            {
                return;
            }

            var account = accounts.FirstOrDefault(item => item.Id == latestFailedTask.PlatformAccountId);
            if (account is null)
            {
                ShowStatus("找不到失败任务对应的平台账号。", InfoBarSeverity.Warning);
                return;
            }

            await SyncAccountAsync(account.Platform);
        }

        private async Task SaveAccountAsync(string platform, string handle, Button button)
        {
            if (string.IsNullOrWhiteSpace(handle))
            {
                ShowStatus("请先输入 handle。", InfoBarSeverity.Warning);
                return;
            }

            await WithButtonBusyAsync(button, "保存中...", async () =>
            {
                await App.ApiClient.UpsertAccountAsync(platform, handle.Trim());
                await RefreshAsync(preserveInput: false);
                ShowStatus($"{platform} 账号已保存。", InfoBarSeverity.Success);
            });
        }

        private async Task SyncAccountAsync(string platform)
        {
            var account = accounts.FirstOrDefault(item => item.Platform == platform);
            if (account is null)
            {
                ShowStatus($"请先保存 {platform} 的 handle。", InfoBarSeverity.Warning);
                return;
            }

            var button = platform == "CODEFORCES" ? SyncCodeforcesButton : SyncAtCoderButton;
            await WithButtonBusyAsync(button, "同步中...", async () =>
            {
                ApplyRunningState(platform, true);
                await App.ApiClient.SyncAccountAsync(platform, account.Id);
                await RefreshAsync();
                ShowStatus($"{account.PlatformText} 同步任务已入队。", InfoBarSeverity.Success);
            });
        }

        private async Task WithButtonBusyAsync(Button button, string busyText, Func<Task> action)
        {
            if (isBusy)
            {
                return;
            }

            isBusy = true;
            var originalText = button.Content?.ToString() ?? string.Empty;
            button.IsEnabled = false;
            RetryFailedButton.IsEnabled = false;
            button.Content = busyText;

            try
            {
                await action();
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
            finally
            {
                button.Content = originalText;
                button.IsEnabled = true;
                RetryFailedButton.IsEnabled = latestFailedTask is not null;
                isBusy = false;
            }
        }

        private void ApplyRunningState(string platform, bool isRunning)
        {
            if (platform == "CODEFORCES")
            {
                CodeforcesBusyRing.Visibility = isRunning ? Visibility.Visible : Visibility.Collapsed;
                CodeforcesBusyRing.IsActive = isRunning;
                SyncCodeforcesButton.IsEnabled = !isRunning && !isBusy;
            }
            else if (platform == "ATCODER")
            {
                AtCoderBusyRing.Visibility = isRunning ? Visibility.Visible : Visibility.Collapsed;
                AtCoderBusyRing.IsActive = isRunning;
                SyncAtCoderButton.IsEnabled = !isRunning && !isBusy;
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
