const STATUS_TEXT = {
  idle: 'Not connected',
  searching: 'Looking for a stranger...',
  connected: 'Stranger connected!',
  disconnected: 'Stranger disconnected',
  stopped: 'Chat stopped',
};

export default function ChatHeader({ status }) {
  return (
    <header className={`chat-header status-${status}`}>
      <div className="brand-row">
        <img className="brand-logo" src="assets/images/logo.svg" alt="" />
        <div>
          <h1 className="brand-name">NEUSTGLE</h1>
          <p className="brand-tagline">Meet Someone New. Stay Anonymous.</p>
        </div>
      </div>

      <div className="stranger-row">
        <div className="avatar" aria-hidden="true">S</div>
        <div className="stranger-info">
          <strong>Stranger</strong>
          <span className="stranger-status">
            <span className="dot" />
            {STATUS_TEXT[status] || 'Not connected'}
          </span>
        </div>
        {status === 'connected' && <span className="online-badge">Online</span>}
      </div>
    </header>
  );
}
