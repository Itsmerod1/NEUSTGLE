import { useEffect, useRef } from 'react';

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const EMPTY_TEXT = {
  idle: 'Press FIND A STRANGER to meet someone new.',
  stopped: 'You stopped the chat. Press FIND A STRANGER to meet someone new.',
  searching: '',
  connected: '',
  disconnected: '',
};

export default function ChatMessages({ messages, strangerTyping, status }) {
  const boxRef = useRef(null);

  // Always scroll to the newest message
  useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, strangerTyping]);

  return (
    <div className="messages" ref={boxRef} aria-live="polite">
      {messages.length === 0 && EMPTY_TEXT[status] && (
        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <p>{EMPTY_TEXT[status]}</p>
        </div>
      )}

      {messages.map((m) =>
        m.type === 'system' ? (
          <div className="system-note" key={m.id}>
            <span>{m.text}</span>
          </div>
        ) : (
          <div className={`msg ${m.mine ? 'mine' : 'theirs'}`} key={m.id}>
            <div className="bubble">
              <div className="bubble-text">{m.text}</div>
              <div className="bubble-time">{formatTime(m.createdAt)}</div>
            </div>
          </div>
        )
      )}

      {strangerTyping && (
        <div className="msg theirs">
          <div className="bubble typing" aria-label="Stranger is typing">
            <span /><span /><span />
          </div>
        </div>
      )}
    </div>
  );
}
