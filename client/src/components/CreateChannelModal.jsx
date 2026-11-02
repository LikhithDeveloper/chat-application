import { useState } from 'react'

export default function CreateChannelModal({ onCreate, onClose }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('public')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    try {
      await onCreate({ name, description, type })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Create a channel</h2>
        <p className="muted">A channel holds rooms. You become its admin and the only one who can create rooms in it.</p>

        <label>
          Channel name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. design-team" maxLength={30} autoFocus required />
        </label>
        <label>
          Description (optional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this channel about?" maxLength={120} />
        </label>

        <div className="type-choice">
          <button type="button" className={`type-card ${type === 'public' ? 'selected' : ''}`} onClick={() => setType('public')}>
            <span className="t-icon">🌐</span>
            <strong>Public</strong>
            <small>Anyone can join straight away</small>
          </button>
          <button type="button" className={`type-card ${type === 'private' ? 'selected' : ''}`} onClick={() => setType('private')}>
            <span className="t-icon">🔒</span>
            <strong>Private</strong>
            <small>People send a request, you accept</small>
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary">Create channel</button>
        </div>
      </form>
    </div>
  )
}
