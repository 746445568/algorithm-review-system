import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

test.describe('OJ Review Desktop - 白屏问题修复验证', () => {
  test('验证 asar 内部路径计算', async () => {
    const cwd = process.cwd()

    // 验证 app.asar 中存在必需的文件
    const asarPath = path.join(cwd, 'dist', 'win-unpacked', 'resources', 'app.asar')
    expect(fs.existsSync(asarPath)).toBe(true)

    // 验证 main/index.mjs 使用 __dirname 计算路径
    const mainPath = path.join(cwd, 'main', 'index.mjs')
    const mainContent = fs.readFileSync(mainPath, 'utf8')

    // 检查 preload 路径
    expect(mainContent).toContain('path.join(__dirname, "..", "preload", "index.mjs")')

    // 检查 renderer 路径
    expect(mainContent).toContain('path.join(__dirname, "..", "renderer", "dist", "index.html")')

    console.log('✅ asar 内部路径计算验证通过')
  })
})
