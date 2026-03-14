namespace OJReviewDesktop.Views.Pages
{
    public sealed partial class AnalysisPage : Page
    {
        private long currentTaskId;

        public AnalysisPage()
        {
            InitializeComponent();
            TaskMetaText.Text = "尚未创建分析任务";
            AnalysisResultBox.Text = "配置 AI Provider 后，可以在这里查看结构化分析结果。";
        }

        private async void GenerateButton_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var task = await App.ApiClient.GenerateAnalysisAsync();
                if (task is null)
                {
                    ShowStatus("未能创建分析任务。", InfoBarSeverity.Warning);
                    return;
                }

                currentTaskId = task.Id;
                await LoadTaskAsync(task.Id);
                ShowStatus("分析任务已创建。", InfoBarSeverity.Success);
            }
            catch (Exception ex)
            {
                ShowStatus(ex.Message, InfoBarSeverity.Error);
            }
        }

        private async void RefreshTaskButton_Click(object sender, RoutedEventArgs e)
        {
            if (currentTaskId == 0)
            {
                ShowStatus("当前没有可刷新的分析任务。", InfoBarSeverity.Warning);
                return;
            }

            await LoadTaskAsync(currentTaskId);
        }

        private async Task LoadTaskAsync(long taskId)
        {
            var task = await App.ApiClient.GetAnalysisTaskAsync(taskId);
            if (task is null)
            {
                ShowStatus("找不到分析任务。", InfoBarSeverity.Warning);
                return;
            }

            currentTaskId = task.Id;
            TaskMetaText.Text = $"#{task.Id} · {task.StatusText} · {task.Provider} / {task.Model}";
            AnalysisResultBox.Text = string.IsNullOrWhiteSpace(task.ResultText)
                ? (string.IsNullOrWhiteSpace(task.ErrorMessage) ? task.ResultJson : task.ErrorMessage)
                : task.ResultText;
            StatusBar.IsOpen = false;
        }

        private void ShowStatus(string message, InfoBarSeverity severity)
        {
            StatusBar.Message = message;
            StatusBar.Severity = severity;
            StatusBar.IsOpen = true;
        }
    }
}
