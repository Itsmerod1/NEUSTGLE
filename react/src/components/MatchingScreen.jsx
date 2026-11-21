export default function MatchingScreen() {
  return (
    <div className="matching" role="status" aria-live="polite">
      <div className="radar">
        <span /><span /><span />
      </div>
      <p className="matching-title">Looking for a stranger...</p>
      <p className="matching-sub">Hang tight, we are finding someone for you.</p>
    </div>
  );
}
