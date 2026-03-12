/**
 * Transcript — Scrolling real-time conversation display with full text,
 * colored borders, timestamps, and typing indicator.
 */

import { useEffect, useRef } from 'react';

export default function Transcript({ messages, isTyping }) {
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="transcript-container" id="transcript">
      <div className="transcript-header">
        <span className="transcript-header__title">Conversation</span>
        {messages.length > 0 && (
          <span className="transcript-header__badge">
            {messages.length} message{messages.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="transcript-messages">
        {messages.length === 0 && !isTyping ? (
          <div className="transcript-empty">
            <span className="transcript-empty__icon">💬</span>
            <span>Start a session to see the conversation here</span>
          </div>
        ) : (
          <>
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`transcript-msg transcript-msg--${msg.role}`}
              >
                <div className="transcript-msg__header">
                  <span className="transcript-msg__role">
                    {msg.role === 'user' ? 'You' : 'Nova'}
                  </span>
                  {msg.timestamp && (
                    <span className="transcript-msg__time">
                      {formatTimestamp(msg.timestamp)}
                    </span>
                  )}
                </div>
                <p className="transcript-msg__text">{msg.text}</p>
              </div>
            ))}
            {/* Typing indicator */}
            {isTyping && (
              <div className="transcript-msg transcript-msg--nova transcript-typing">
                <div className="transcript-msg__header">
                  <span className="transcript-msg__role">Nova</span>
                </div>
                <div className="typing-indicator">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
