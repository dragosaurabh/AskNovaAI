/**
 * Transcript — Scrolling real-time conversation display.
 */

import { useEffect, useRef } from 'react';

export default function Transcript({ messages }) {
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        {messages.length === 0 ? (
          <div className="transcript-empty">
            <span className="transcript-empty__icon">💬</span>
            <span>Start a session to see the conversation here</span>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`transcript-msg transcript-msg--${msg.role}`}
            >
              <span className="transcript-msg__role">
                {msg.role === 'user' ? 'You' : 'Nova'}
              </span>
              <span className="transcript-msg__text">{msg.text}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
