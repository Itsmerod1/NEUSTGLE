import { useEffect, useState } from 'react';

const REASONS = [
  'Harassment',
  'Inappropriate messages',
  'Spam',
  'Bullying',
  'Suspicious behavior',
  'Other',
];

export default function ReportModal({ onSubmit, onClose }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="report-title">Report this stranger</h2>
        <p className="modal-sub">The chat will end and you will not be matched with this stranger again.</p>

        <div className="reason-list">
          {REASONS.map((r) => (
            <label className={`reason ${reason === r ? 'selected' : ''}`} key={r}>
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {r}
            </label>
          ))}
        </div>

        <textarea
          className="details"
          rows="3"
          maxLength={500}
          placeholder="Additional details (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="modal-submit"
            disabled={!reason}
            onClick={() => onSubmit(reason, details.trim())}
          >
            Submit report
          </button>
        </div>
      </div>
    </div>
  );
}
