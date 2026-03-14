namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class SettingsPage : Page
    {
        public SettingsPage()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            await LoadStateAsync();
        }

        private async Task LoadStateAsync()
        {
            if (!await App.ApiClient.IsHealthyAsync())
            {
                ShowStatus("本地服务未启动。", InfoBarSeverity.Warning);
                return;
            }

            var accounts = await App.ApiClient.GetAccountsAsync();
            CodeforcesHandleBox.Text = accounts.FirstOrDefault(item => item.Platform == "CODEFORCES")?.ExternalHandle ?? string.Empty;
            AtCoderHandleBox.Text = accounts.FirstOrDefault(item => item.Platform == "ATCODER")?.ExternalHandle ?? string.Empty;

            var settings = await App.ApiClient.GetAiSettingsAsync() ?? new AiSettings();
            SelectProvider(settings.Provider);
            ModelBox.Text = settings.Model;
            BaseUrlBox.Text = settings.BaseUrl;
            ApiKeyBox.Password = settings.ApiKey;

            var theme = await App.ApiClient.GetThemeSettingsAsync();
            SelectTheme(theme?.Mode ?? "follow-system");
        }

        private async void SaveAccountsButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(CodeforcesHandleBox.Text))
                {
                    await App.ApiClient.UpsertAccountAsync("CODEFORCES", CodeforcesHandleBox.Text.Trim());
                }

                if (!string.IsNullOrWhiteSpace(AtCoderHandleBox.Text))
                {
                    await App.ApiClient.UpsertAccountAsync("ATCODER", AtCoderHandleBox.Text.Trim());
                }

                ShowStatus("OJ 账号已保存。", InfoBarSeverity.Success);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private async void SaveAiButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                await App.ApiClient.SaveAiSettingsAsync(BuildAiSettings());
                ShowStatus("AI 配置已保存。", InfoBarSeverity.Success);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private async void TestAiButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var result = await App.ApiClient.TestAiSettingsAsync(BuildAiSettings());
                ShowStatus(result.Message, result.Ok ? InfoBarSeverity.Success : InfoBarSeverity.Warning);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private async void ExportDiagnosticsButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var path = await App.ApiClient.ExportDiagnosticsAsync();
                ShowStatus($"诊断包已导出：{path}", InfoBarSeverity.Success);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private async void SaveThemeButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var mode = (ThemeModeBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "follow-system";
                await App.ApiClient.SaveThemeSettingsAsync(mode);
                App.ApplyTheme(mode);
                ShowStatus("主题已保存。", InfoBarSeverity.Success);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private AiSettings BuildAiSettings()
        {
            return new AiSettings
            {
                Provider = (ProviderBox.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "openai-compatible",
                Model = ModelBox.Text.Trim(),
                BaseUrl = BaseUrlBox.Text.Trim(),
                ApiKey = ApiKeyBox.Password.Trim(),
            };
        }

        private void SelectProvider(string provider)
        {
            provider = string.IsNullOrWhiteSpace(provider) ? "openai-compatible" : provider;
            foreach (var item in ProviderBox.Items.OfType<ComboBoxItem>())
            {
                if (string.Equals(item.Content?.ToString(), provider, StringComparison.OrdinalIgnoreCase))
                {
                    ProviderBox.SelectedItem = item;
                    return;
                }
            }

            ProviderBox.SelectedIndex = 0;
        }

        private void SelectTheme(string mode)
        {
            mode = string.IsNullOrWhiteSpace(mode) ? "follow-system" : mode;
            foreach (var item in ThemeModeBox.Items.OfType<ComboBoxItem>())
            {
                if (string.Equals(item.Tag?.ToString(), mode, StringComparison.OrdinalIgnoreCase))
                {
                    ThemeModeBox.SelectedItem = item;
                    return;
                }
            }

            ThemeModeBox.SelectedIndex = 0;
        }

        private void ShowStatus(string message, InfoBarSeverity severity)
        {
            StatusBar.Message = message;
            StatusBar.Severity = severity;
            StatusBar.IsOpen = true;
        }
    }
}
