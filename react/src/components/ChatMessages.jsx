
import { useEffect, useRef } from 'react';

function formatTime(iso) {
  const d = new Date(iso);

  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      });
}

const EMPTY_TEXT = {
  idle: 'Press FIND A STRANGER to meet someone new.',
  stopped: 'You stopped the chat. Press FIND A STRANGER to meet someone new.',
  searching: '',
  connected: '',
  disconnected: '',
};

const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

export default function ChatMessages({
  messages,
  strangerTyping,
  status,
  onReact,
}) {
  const boxRef = useRef(null);

  useEffect(() => {
    const box = boxRef.current;

    if (box) {
      box.scrollTop = box.scrollHeight;
    }
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
          <div
            className={`msg ${m.mine ? 'mine' : 'theirs'}`}
            key={m.id}
          >
            <div className="bubble">
              <div className="bubble-text">{m.text}</div>

              <div className="bubble-time">
                {formatTime(m.createdAt)}
              </div>
            </div>

            {/* Existing reactions */}
            {m.reactions?.length > 0 && (
              <div className="message-reaction-summary">
                {m.reactions.map((r) => (
                  <button
                    key={r.reaction}
                    type="button"
                    className={`reaction-chip ${r.mine ? 'my-reaction' : ''}`}
                    onClick={() =>
                      onReact?.(
                        m.id,
                        r.mine ? null : r.reaction
                      )
                    }
                    title={
                      r.mine
                        ? 'Remove your reaction'
                        : 'React with ' + r.reaction
                    }
                  >
                    <span>{r.reaction}</span>
                    <span>{r.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Reaction picker */}
            <div className="message-reaction-picker">
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="reaction-option"
                  onClick={() => onReact?.(m.id, emoji)}
                  aria-label={`React with ${emoji}`}
                  title={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {strangerTyping && (
        <div className="msg theirs">
          <div className="bubble typing" aria-label="Stranger is typing">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
  );
}
