using Microsoft.UI.Xaml.Navigation;
using Microsoft.UI.Xaml.Media;

namespace OJReviewDesktop
{
    public partial class App : Application
    {
        private Window? window;

        public static LocalApiClient ApiClient { get; } = new();

        public static LocalServiceManager ServiceManager { get; } = new();

        public App()
        {
            InitializeComponent();
        }

        protected override async void OnLaunched(LaunchActivatedEventArgs args)
        {
            window ??= new Window();
            window.SystemBackdrop = new MicaBackdrop();

            if (window.Content is not Frame rootFrame)
            {
                rootFrame = new Frame();
                rootFrame.NavigationFailed += OnNavigationFailed;
                window.Content = rootFrame;
            }

            _ = rootFrame.Navigate(typeof(MainPage), args.Arguments);
            window.Activate();

            _ = await ServiceManager.EnsureStartedAsync(ApiClient);
            await ApplySavedThemeAsync();
        }

        private static void OnNavigationFailed(object sender, NavigationFailedEventArgs e)
        {
            throw new Exception("Failed to load Page " + e.SourcePageType.FullName);
        }

        public static async Task ApplySavedThemeAsync()
        {
            try
            {
                var theme = await ApiClient.GetThemeSettingsAsync();
                ApplyTheme(theme?.Mode ?? "follow-system");
            }
            catch
            {
                ApplyTheme("follow-system");
            }
        }

        public static void ApplyTheme(string mode)
        {
            if (Current is not App app || app.window?.Content is not FrameworkElement root)
            {
                return;
            }

            root.RequestedTheme = mode?.ToLowerInvariant() switch
            {
                "light" => ElementTheme.Light,
                "dark" => ElementTheme.Dark,
                _ => ElementTheme.Default,
            };
        }
    }
}
