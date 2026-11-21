
const STATUS_TEXT = {
  idle: 'Not connected',
  searching: 'Looking for a stranger...',
  connected: 'Stranger connected!',
  disconnected: 'Stranger disconnected',
  stopped: 'Chat stopped',
};

export default function ChatHeader({ status, onlineCount = 0 }) {
  return (
    <header className={`chat-header status-${status}`}>
      <div className="brand-row">
        <div className="brand-info">
          <img
            className="brand-logo"
            src="assets/images/logo.svg"
            alt=""
          />

          <div>
            <h1 className="brand-name">NEUSTGLE</h1>
            <p className="brand-tagline">
              Meet Someone New. Stay Anonymous.
            </p>
          </div>
        </div>

        <div
          className="online-counter"
          aria-live="polite"
          aria-label={`${onlineCount} visitors online`}
        >
          <span className="online-counter-dot" />
          <span>Online:</span>
          <strong>{onlineCount.toLocaleString()}</strong>
        </div>
      </div>

      <div className="stranger-row">
        <div className="avatar" aria-hidden="true">
          S
        </div>

        <div className="stranger-info">
          <strong>Stranger</strong>

          <span className="stranger-status">
            <span className="dot" />
            {STATUS_TEXT[status] || 'Not connected'}
          </span>
        </div>

        {status === 'connected' && (
          <span className="online-badge">Online</span>
        )}
      </div>
    </header>
  );
}
