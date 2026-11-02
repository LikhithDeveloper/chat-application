import { useState } from 'react'

// Only the channel admin sees this. `onCreate` receives { name, description, isPrivate }.
export default function CreateRoomModal({ onCreate, onClose }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    try {
      await onCreate({ name, description, isPrivate })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Create a room</h2>
        <p className="muted">Rooms live inside this channel. Only channel members can see them.</p>

        <label>
          Room name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. general" maxLength={30} autoFocus required />
        </label>
        <label>
          Description (optional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this room about?" maxLength={120} />
        </label>

        <div className="type-choice">
          <button type="button" className={`type-card ${!isPrivate ? 'selected' : ''}`} onClick={() => setIsPrivate(false)}>
            <span className="t-icon">#</span>
            <strong>Public room</strong>
            <small>Channel members join directly</small>
          </button>
          <button type="button" className={`type-card ${isPrivate ? 'selected' : ''}`} onClick={() => setIsPrivate(true)}>
            <span className="t-icon">🔒</span>
            <strong>Private room</strong>
            <small>Members request, you accept</small>
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary">Create room</button>
        </div>
      </form>
    </div>
  )
}
