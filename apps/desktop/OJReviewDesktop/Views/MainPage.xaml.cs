using Microsoft.UI.Xaml.Controls.Primitives;

namespace OJReviewDesktop.Views
{
    public sealed partial class MainPage : Page
    {
        private readonly Dictionary<string, Type> pages = new()
        {
            ["dashboard"] = typeof(DashboardPage),
            ["accounts"] = typeof(AccountsPage),
            ["submissions"] = typeof(SubmissionsPage),
            ["problems"] = typeof(ProblemsPage),
            ["review"] = typeof(ReviewPage),
            ["analysis"] = typeof(AnalysisPage),
            ["settings"] = typeof(SettingsPage),
        };

        public MainPage()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, RoutedEventArgs e)
        {
            RootNav.SelectedItem = RootNav.MenuItems[0];
            _ = ContentFrame.Navigate(typeof(DashboardPage));
            await LoadThemeAsync();
            await RefreshServiceStatusAsync();
        }

        private void OnSelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
        {
            if (args.SelectedItemContainer?.Tag is not string tag)
            {
                return;
            }

            if (pages.TryGetValue(tag, out var page))
            {
                _ = ContentFrame.Navigate(page);
            }
        }

        private async Task LoadThemeAsync()
        {
            try
            {
                var theme = await App.ApiClient.GetThemeSettingsAsync();
                SelectTheme(theme?.Mode ?? "follow-system");
            }
            catch
            {
                SelectTheme("follow-system");
            }
        }

        private async void ThemeModeBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (!IsLoaded)
            {
                return;
            }

            var mode = (ThemeModeBox.SelectedItem as ComboBoxItem)?.Tag?.ToString() ?? "follow-system";
            App.ApplyTheme(mode);

            try
            {
                await App.ApiClient.SaveThemeSettingsAsync(mode);
            }
            catch
            {
            }
        }

        private async Task RefreshServiceStatusAsync()
        {
            try
            {
                var healthy = await App.ServiceManager.EnsureStartedAsync(App.ApiClient);
                if (healthy)
                {
                    var owner = await App.ApiClient.GetOwnerAsync();
                    ServiceStatusText.Text = owner is null
                        ? "本地服务可用，数据目录已初始化。"
                        : $"数据目录：{owner.App.DataDir}";
                    ServiceStatusTone.Text = "HEALTHY";
                    return;
                }
            }
            catch
            {
            }

            ServiceStatusText.Text = "本地服务未就绪，当前只能查看桌面壳层。";
            ServiceStatusTone.Text = "FAILED";
        }

        private void SelectTheme(string mode)
        {
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
    }
}
