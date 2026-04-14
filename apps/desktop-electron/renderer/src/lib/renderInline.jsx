/**
 * 渲染行内 Markdown 元素
 *
 * 支持以下语法：
 * - **粗体**：渲染为 <strong>
 * - `行内代码`：渲染为 <code className="md-code">
 *
 * @param {string} text - 要渲染的行内文本
 * @returns {JSX.Element[]} 渲染后的 React 元素数组
 *
 * @example
 * ```jsx
 * renderInline("这是 **粗体** 和 `代码`")
 * // 返回：["这是 ", <strong>粗体</strong>, " 和 ", <code className="md-code">代码</code>]
 * ```
 */
export function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="md-code">{part.slice(1, -1)}</code>
    }
    return part
  })
}
