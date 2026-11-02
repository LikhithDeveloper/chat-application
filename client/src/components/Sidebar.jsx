import { useState } from 'react'
import Avatar from './Avatar'

export default function Sidebar({ user, rooms, activeId, onSelect, onCreate, onLogout }) {
  const [search, setSearch] = useState('')

  const visible = rooms.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
  const mine = visible.filter((r) => r.isMember)
  const others = visible.filter((r) => !r.isMember)

  const renderRoom = (room) => (
    <button
      key={room.id}
      className={`room-item ${room.id === activeId ? 'active' : ''}`}
      onClick={() => onSelect(room.id)}
    >
      <Avatar name={room.name} square />
      <div className="room-text">
        <strong># {room.name}</strong>
        <span>{room.memberCount} member{room.memberCount === 1 ? '' : 's'}</span>
      </div>
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2>💬 Rooms</h2>
        <button className="btn primary small" onClick={onCreate}>+ New</button>
      </div>

      <input
        className="search"
        placeholder="Search rooms…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="room-list">
        <h3>Your rooms</h3>
        {mine.length ? mine.map(renderRoom) : <p className="empty">You haven't joined any room yet.</p>}

        <h3>Discover</h3>
        {others.length ? others.map(renderRoom) : <p className="empty">No other rooms.</p>}
      </div>

      <div className="me">
        <Avatar name={user.username} />
        <div className="room-text">
          <strong>{user.username}</strong>
          <span>{user.email}</span>
        </div>
        <button className="btn ghost small" onClick={onLogout} title="Log out">Log out</button>
      </div>
    </aside>
  )
}
