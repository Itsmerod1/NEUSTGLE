
import { useEffect, useRef, useState } from 'react';

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

const LONG_PRESS_DURATION = 500;

export default function ChatMessages({
  messages = [],
  strangerTyping,
  status,
  onReact,
}) {
  const boxRef = useRef(null);
  const pressTimerRef = useRef(null);
  const activeMessageRef = useRef(null);
  const startPositionRef = useRef(null);
  const suppressClickRef = useRef(false);

  const [activeMessage, setActiveMessage] = useState(null);

  // Scroll to newest message.
  useEffect(() => {
    const box = boxRef.current;

    if (box) {
      box.scrollTop = box.scrollHeight;
    }
  }, [messages, strangerTyping]);

  // Close picker when clicking outside.
  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        !event.target.closest('.message-reaction-container') &&
        !event.target.closest('.message-reaction-picker')
      ) {
        setActiveMessage(null);
      }
    }

    document.addEventListener('click', handleOutsideClick);

    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  // Cleanup pending long press.
  useEffect(() => {
    return () => {
      clearTimeout(pressTimerRef.current);
    };
  }, []);

  function openReactionPicker(messageId) {
    activeMessageRef.current = messageId;
    setActiveMessage(messageId);
  }

  function closeReactionPicker() {
    clearTimeout(pressTimerRef.current);
    activeMessageRef.current = null;
    setActiveMessage(null);
  }

  function handlePointerDown(event, messageId) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    clearTimeout(pressTimerRef.current);

    activeMessageRef.current = messageId;
    startPositionRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    pressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = true;
      openReactionPicker(messageId);
    }, LONG_PRESS_DURATION);
  }

  function handlePointerMove(event) {
    if (!startPositionRef.current) return;

    const dx = Math.abs(
      event.clientX - startPositionRef.current.x
    );

    const dy = Math.abs(
      event.clientY - startPositionRef.current.y
    );

    // Cancel long press if the user is scrolling.
    if (dx > 10 || dy > 10) {
      clearTimeout(pressTimerRef.current);
      startPositionRef.current = null;
    }
  }

  function handlePointerUp() {
    clearTimeout(pressTimerRef.current);
    startPositionRef.current = null;
  }

  function handleContextMenu(event, messageId) {
    event.preventDefault();
    clearTimeout(pressTimerRef.current);
    suppressClickRef.current = true;
    openReactionPicker(messageId);
  }

  function handleReaction(messageId, emoji) {
    onReact?.(messageId, emoji);
    closeReactionPicker();
  }

  function handleExistingReaction(messageId, reaction) {
    onReact?.(messageId, reaction);
  }

  function renderReactionPicker(messageId) {
    if (activeMessage !== messageId) {
      return null;
    }

    return (
      <div
        className="message-reaction-picker"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="reaction-option"
            onClick={() => handleReaction(messageId, emoji)}
            aria-label={`React with ${emoji}`}
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    );
  }

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
            <div
              className="message-reaction-container"
              onPointerDown={(event) =>
                handlePointerDown(event, m.id)
              }
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={(event) =>
                handleContextMenu(event, m.id)
              }
              onClick={() => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                }
              }}
            >
              <div className="bubble">
                <div className="bubble-text">{m.text}</div>

                <div className="bubble-time">
                  {formatTime(m.createdAt)}
                </div>
              </div>

              {m.reactions?.length > 0 && (
                <div className="message-reaction-summary">
                  {m.reactions.map((r) => (
                    <button
                      key={r.reaction}
                      type="button"
                      className={`reaction-chip ${
                        r.mine ? 'my-reaction' : ''
                      }`}
                      onClick={() =>
                        handleExistingReaction(
                          m.id,
                          r.mine ? null : r.reaction
                        )
                      }
                      title={
                        r.mine
                          ? 'Remove your reaction'
                          : `React with ${r.reaction}`
                      }
                    >
                      <span>{r.reaction}</span>
                      <span>{r.count}</span>
                    </button>
                  ))}
                </div>
              )}

              {renderReactionPicker(m.id)}
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
