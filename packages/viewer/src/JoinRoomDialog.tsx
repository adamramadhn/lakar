// Dialog "Join room" (spec-collab-cloud story 5): `{server, token}` → `POST /viewer/rooms/join` →
// dokumen remote muncul sebagai slug `room-*` dan langsung dibuka. Dibuka lewat hash `#/join`
// (query `?server=&token=` mengisi awal dari tautan undangan) atau tombol Join di Dashboard.
import { useState, type FormEvent } from 'react';
import { ApiError, api } from './api';
import { docHash } from './files';
import { Modal } from './NewFileDialog';

const SERVER_PATTERN = /^(https?|wss?):\/\/.+/;

export function JoinRoomDialog({ initialServer = '', initialToken = '', onClose }: { initialServer?: string; initialToken?: string; onClose: () => void }) {
  const [server, setServer] = useState(initialServer);
  const [token, setToken] = useState(initialToken);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = !submitting && SERVER_PATTERN.test(server.trim()) && token.trim().length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    void api
      .joinRoom(server.trim(), token.trim(), name.trim() || undefined)
      .then((r) => {
        onClose();
        location.hash = docHash(r.slug);
      })
      .catch((err) => {
        setSubmitting(false);
        setError(err instanceof ApiError ? `${err.message}${err.hint ? ` ${err.hint}` : ''}` : err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <Modal label="Join room" onClose={() => !submitting && onClose()}>
      <form onSubmit={submit}>
        <div className="modal-text">
          <h2>Join room</h2>
          <p>Open a shared document hosted on a Lakar sync server. It shows up as a remote file and stays in sync live.</p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="join-server">
            Server
          </label>
          <input
            id="join-server"
            className="input"
            type="url"
            placeholder="https://sync.example.com"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            autoFocus={!initialServer}
            disabled={submitting}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="join-token">
            Token
          </label>
          <input
            id="join-token"
            className="input"
            type="password"
            placeholder="Room token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus={!!initialServer}
            disabled={submitting}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="join-name">
            Your name <span className="field-optional">(optional)</span>
          </label>
          <input id="join-name" className="input" type="text" maxLength={64} placeholder="Shown to other people in the room" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
        </div>
        {error && (
          <p className="modal-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-buttons">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            {submitting ? 'Joining…' : 'Join'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
