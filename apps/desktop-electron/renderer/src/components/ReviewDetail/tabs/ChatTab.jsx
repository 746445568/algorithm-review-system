import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api.js';
import { SimpleMarkdown } from '../../SimpleMarkdown.jsx';

const MODES = [
  { id: 'direct', labelKey: 'review.detail.chat.modeDirect' },
  { id: 'tutor', labelKey: 'review.detail.chat.modeTutor' },
];

export function ChatTab({ problemId, serviceUnavailable }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState('direct');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Load chat history
  useEffect(() => {
    if (!problemId) return;
    let cancelled = false;
    setLoading(true);
    api.getProblemChats(problemId)
      .then(data => {
        if (!cancelled) setMessages(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [problemId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || serviceUnavailable) return;
    setInput('');
    setSending(true);

    // Optimistic user message
    const userMsg = { role: 'user', content: text, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const reply = await api.sendProblemChat(problemId, text, { mode });
      setMessages(prev => [...prev, { role: 'assistant', content: reply.content || reply.message || '', createdAt: reply.createdAt || new Date().toISOString() }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'system', content: t('errors.ERR_AI_REPLY_FAILED') + ': ' + err.message, createdAt: new Date().toISOString() }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, serviceUnavailable, problemId, mode, t]);

  const handleClear = useCallback(async () => {
    try {
      await api.clearProblemChats(problemId);
      setMessages([]);
    } catch (err) {
      console.error('Failed to clear chats:', err);
    }
  }, [problemId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="chat-tab">
      {/* Mode switcher */}
      <div className="chat-mode-bar">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`chat-mode-btn ${mode === m.id ? 'chat-mode-active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            <span className="chat-mode-icon">{m.id === 'direct' ? '💡' : '🧭'}</span>
            {t(m.labelKey)}
          </button>
        ))}
        <button
          type="button"
          className="ghost-button chat-clear-btn"
          onClick={handleClear}
          disabled={messages.length === 0}
        >
          {t('analysis.chat.clear')}
        </button>
      </div>

      {/* Messages area */}
      <div className="chat-messages">
        {loading && (
          <div className="chat-loading">
            <span className="rd-spinner" />
            <span>{t('common.loading')}</span>
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="chat-empty">
            <p>{mode === 'tutor'
              ? t('review.detail.chat.tutorHint')
              : t('review.detail.chat.directHint')
            }</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
            <div className="chat-msg-avatar">
              {msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '⚠️'}
            </div>
            <div className="chat-msg-content">
              {msg.role === 'user' ? (
                <p>{msg.content}</p>
              ) : (
                <SimpleMarkdown text={msg.content} />
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="chat-msg chat-msg-assistant">
            <div className="chat-msg-avatar">🤖</div>
            <div className="chat-msg-content chat-thinking">
              <span className="rd-spinner" />
              <span>{t('review.detail.chat.thinking')}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={2}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('analysis.chat.placeholder')}
          disabled={serviceUnavailable || sending}
        />
        <button
          type="button"
          className="primary-button chat-send-btn"
          onClick={handleSend}
          disabled={!input.trim() || sending || serviceUnavailable}
        >
          {t('analysis.chat.send')}
        </button>
      </div>
    </div>
  );
}
