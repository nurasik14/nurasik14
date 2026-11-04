import React from 'react';

/**
 * The passphrase form. The field keeps its value after a failed attempt and
 * focus returns to it. There is no autofocus: it would raise the phone's
 * keyboard over the explanation and turn the statusline to INSERT.
 */
export default function Unlock({ busy = false, error = null, note = '', onSubmit }) {
  const [value, setValue] = React.useState('');
  const [remember, setRemember] = React.useState(true);
  const fieldRef = React.useRef(null);

  React.useEffect(() => {
    if (error) fieldRef.current?.focus();
  }, [error]);

  function submit(e) {
    e.preventDefault();
    if (value && !busy) onSubmit(value, remember);
  }

  return (
    <form onSubmit={submit} aria-labelledby="unlock-label" className="max-w-[28rem] rounded border border-line bg-surface p-4 sm:p-5">
      <h2 id="unlock-label" className="label">
        locked
      </h2>
      {note && (
        <p role="status" className="mt-3 font-mono text-[13px] text-fg-dim">
          {note}
        </p>
      )}
      <label htmlFor="news-passphrase" className="mt-4 block font-mono text-[13px] text-fg-dim">
        passphrase
      </label>
      <input
        ref={fieldRef}
        id="news-passphrase"
        name="passphrase"
        type="password"
        autoComplete="current-password"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'unlock-error' : 'unlock-hint'}
        className="field mt-1"
      />
      {error && (
        <p id="unlock-error" role="alert" className="mt-2 font-mono text-[13px] text-warn">
          <span aria-hidden="true">✗ </span>
          {error.text}
        </p>
      )}
      <label className="mt-3 flex cursor-pointer items-center gap-2.5 font-mono text-[13px] text-fg-dim">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 shrink-0 accent-info" />
        remember on this device
      </label>
      <button type="submit" disabled={busy || !value} aria-busy={busy} className="btn btn-primary mt-4">
        {busy ? 'deriving key…' : 'unlock'}
      </button>
      <p id="unlock-hint" className="mt-4 text-[14px] leading-normal text-fg-faint">
        The passphrase never leaves this browser: the files are decrypted here. If you tick the box it stays in this browser's storage in plain text, so
        leave it off on a shared device.
      </p>
    </form>
  );
}
