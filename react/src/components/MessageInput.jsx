import { useRef, useState } from 'react';

const EMOJIS = [
  '😀', '😂', '😊', '😍', '😎', '🥳', '😅', '🤔', '😢', '😭',
  '😡', '👍', '👎', '👋', '🙏', '💙', '🔥', '🎉', '✨', '🙌',
  '😴', '🤝', '😆', '🥲', '😉', '🤗', '😮', '😇', '🙂', '😜',
];

export default function MessageInput({ disabled, maxLength, onSend, onTyping }) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return; // prevent empty messages
    setSending(true);
    const ok = await onSend(trimmed);
    setSending(false);
    if (ok) setText('');
    setEmojiOpen(false);
    inputRef.current && inputRef.current.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleChange(e) {
    setText(e.target.value);
    if (e.target.value && onTyping) onTyping();
  }

  function addEmoji(emoji) {
    setText((t) => Array.from(t + emoji).slice(0, maxLength).join(''));
    inputRef.current && inputRef.current.focus();
  }

  return (
    <div className="composer-wrap">
      {emojiOpen && !disabled && (
        <div className="emoji-panel" role="listbox" aria-label="Emoji">
          {EMOJIS.map((e) => (
            <button type="button" key={e} className="emoji-btn" onClick={() => addEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <button
          type="button"
          className="icon-btn"
          disabled={disabled}
          onClick={() => setEmojiOpen((o) => !o)}
          aria-label="Choose emoji"
        >
          😊
        </button>

        <input
          ref={inputRef}
          className="composer-input"
          type="text"
          value={text}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={disabled ? 'Connect to a stranger to start chatting' : 'Type a message...'}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        <span className={`char-count ${text.length >= maxLength - 20 ? 'near-limit' : ''}`}>
          {text.length}/{maxLength}
        </span>

        <button
          type="button"
          className="send-btn"
          disabled={disabled || sending || text.trim() === ''}
          onClick={submit}
        >
          Send
        </button>
      </div>
    </div>
  );
}
