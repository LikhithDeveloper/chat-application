import { useState } from 'react'

export default function CreateRoomModal({ onCreate, onClose }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    try {
      await onCreate(name, description)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Create a room</h2>
        <p className="muted">Everyone will be able to see it and join.</p>

        <label>
          Room name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. general" maxLength={30} autoFocus required />
        </label>
        <label>
          Description (optional)
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this room about?" maxLength={120} />
        </label>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary">Create room</button>
        </div>
      </form>
    </div>
  )
}
