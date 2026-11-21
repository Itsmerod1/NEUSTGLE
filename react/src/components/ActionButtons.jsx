export default function ActionButtons({ ready, status, hasRoom, onNext, onFind, onStop, onReport }) {
  const inRoom = status === 'connected' || status === 'disconnected';

  const canNext = ready && inRoom;
  const canFind = ready && (status === 'idle' || status === 'stopped' || status === 'disconnected');
  const canStop = ready && (status === 'searching' || status === 'connected');
  const canReport = ready && hasRoom && inRoom;

  return (
    <div className="actions">
      <button type="button" className="action btn-next" disabled={!canNext} onClick={onNext}>
        <span aria-hidden="true">⏭</span> Next / Skip
      </button>
      <button type="button" className="action btn-find" disabled={!canFind} onClick={onFind}>
        <span aria-hidden="true">🔍</span> Find a Stranger
      </button>
      <button type="button" className="action btn-stop" disabled={!canStop} onClick={onStop}>
        <span aria-hidden="true">⏹</span> Stop
      </button>
      <button type="button" className="action btn-report" disabled={!canReport} onClick={onReport}>
        <span aria-hidden="true">⚠️</span> Report
      </button>
    </div>
  );
}
