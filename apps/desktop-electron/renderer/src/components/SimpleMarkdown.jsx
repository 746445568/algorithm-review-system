import { memo, useMemo } from "react";
import { renderInline } from '../lib/renderInline.jsx'

/**
 * 轻量级 Markdown 渲染组件（零依赖）
 *
 * 支持的语法：
 * - 标题：# H1、## H2、### H3
 * - 列表：无序列表（- 或 *）、有序列表（1. 2. 3.）
 * - 代码块：``` 包裹的多行代码
 * - 行内样式：**粗体**、`行内代码`
 * - 分隔线：--- 或 ***
 * - 空行：渲染为间距
 *
 * @param {{ text?: string }} props - 组件属性
 * @param {string} [props.text] - 要渲染的 Markdown 文本
 * @returns {JSX.Element} 渲染后的 React 元素
 *
 * @example
 * ```jsx
 * <SimpleMarkdown text="# Hello\n\n- Item 1\n- Item 2" />
 * ```
 */
export const SimpleMarkdown = memo(function SimpleMarkdown({ text }) {
  // Memoize the rendered elements
  const elements = useMemo(() => {
    if (!text) return null;

    const lines = text.split("\n");
    const result = [];
    let listItems = [];
    let listType = null;
    let codeLines = [];
    let inCode = false;

    function flushList() {
      if (listItems.length > 0) {
        const Tag = listType === "ol" ? "ol" : "ul";
        result.push(<Tag key={`list-${result.length}`} className={`md-${Tag}`}>{listItems}</Tag>);
        listItems = [];
        listType = null;
      }
    }

    function flushCode() {
      if (codeLines.length > 0) {
        result.push(
          <pre key={`pre-${result.length}`} className="md-pre">
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        codeLines = [];
      }
    }

    lines.forEach((line, i) => {
      if (line.startsWith("```")) {
        if (inCode) {
          flushCode();
          inCode = false;
        } else {
          flushList();
          inCode = true;
        }
        return;
      }
      if (inCode) {
        codeLines.push(line);
        return;
      }
      if (line.startsWith("### ")) {
        flushList();
        result.push(<h5 key={i} className="md-h3">{renderInline(line.slice(4))}</h5>);
      } else if (line.startsWith("## ")) {
        flushList();
        result.push(<h4 key={i} className="md-h2">{renderInline(line.slice(3))}</h4>);
      } else if (line.startsWith("# ")) {
        flushList();
        result.push(<h3 key={i} className="md-h1">{renderInline(line.slice(2))}</h3>);
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        if (listType !== "ul") { flushList(); listType = "ul"; }
        listItems.push(<li key={i}>{renderInline(line.slice(2))}</li>);
      } else if (/^\d+\.\s/.test(line)) {
        if (listType !== "ol") { flushList(); listType = "ol"; }
        listItems.push(<li key={i}>{renderInline(line.replace(/^\d+\.\s/, ""))}</li>);
      } else if (line.trim() === "---" || line.trim() === "***") {
        flushList();
        result.push(<hr key={i} className="md-hr" />);
      } else if (line.trim() === "") {
        flushList();
        result.push(<div key={i} className="md-gap" />);
      } else {
        flushList();
        result.push(<p key={i} className="md-p">{renderInline(line)}</p>);
      }
    });
    flushList();
    if (inCode) flushCode();

    return result;
  }, [text]);

  if (!elements) return <p className="md-p-placeholder">暂无内容</p>;

  return <div className="md-body">{elements}</div>;
});
