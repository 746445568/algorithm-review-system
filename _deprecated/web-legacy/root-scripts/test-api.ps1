# API 测试脚本
# 测试后端 API 是否正常工作

param(
    [string]$BaseUrl = "http://127.0.0.1:38473"
)

function Test-Endpoint($Name, $Url) {
    Write-Host "Testing $Name... " -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "✓ OK" -ForegroundColor Green
            return $true
        }
    } catch {
        Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   OJ Review Desktop API 测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Base URL: $BaseUrl"
Write-Host ""

$allPassed = $true

# 测试健康检查
$allPassed = $allPassed -and (Test-Endpoint "Health" "$BaseUrl/health")

# 测试 /api/me
$allPassed = $allPassed -and (Test-Endpoint "Me" "$BaseUrl/api/me")

# 测试 /api/accounts
$allPassed = $allPassed -and (Test-Endpoint "Accounts" "$BaseUrl/api/accounts")

# 测试 /api/sync-tasks
$allPassed = $allPassed -and (Test-Endpoint "Sync Tasks" "$BaseUrl/api/sync-tasks")

# 测试 /api/submissions
$allPassed = $allPassed -and (Test-Endpoint "Submissions" "$BaseUrl/api/submissions")

# 测试 /api/problems
$allPassed = $allPassed -and (Test-Endpoint "Problems" "$BaseUrl/api/problems")

# 测试 /api/review/summary
$allPassed = $allPassed -and (Test-Endpoint "Review Summary" "$BaseUrl/api/review/summary")

Write-Host ""
if ($allPassed) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "   所有 API 测试通过！" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
} else {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "   部分 API 测试失败" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
}
Write-Host ""
