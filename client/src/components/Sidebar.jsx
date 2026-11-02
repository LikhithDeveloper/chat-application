import { useState } from 'react'
import Avatar from './Avatar'

const typeIcon = (type) => (type === 'private' ? '🔒' : '🌐')

export default function Sidebar({ user, data, view, onView, onCreateChannel, onLogout }) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({}) // channelId -> true when its room list is hidden

  const matches = (c) => c.name.toLowerCase().includes(search.toLowerCase())
  const mine = data.channels.filter((c) => c.isMember && matches(c))
  const others = data.channels.filter((c) => !c.isMember && matches(c))

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <h2>💬 Chats</h2>
        <button className="btn primary small" onClick={onCreateChannel}>+ Channel</button>
      </div>

      {/* The Global chat is always pinned on top. */}
      {data.global && (
        <button
          className={`room-item global ${view.type === 'global' ? 'active' : ''}`}
          onClick={() => onView({ type: 'global' })}
        >
          <div className="avatar square globe">🌍</div>
          <div className="room-text">
            <strong>Global chat</strong>
            <span>Everyone can talk here</span>
          </div>
        </button>
      )}

      <input
        className="search"
        placeholder="Search channels…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="room-list">
        <h3>Your channels</h3>
        {mine.length === 0 && <p className="empty">You are not in any channel yet. Join one below or create your own.</p>}

        {mine.map((c) => (
          <div key={c.id} className="channel-block">
            <div className={`channel-head ${view.type === 'channel' && view.id === c.id ? 'active' : ''}`}>
              <button
                className="chev"
                title={collapsed[c.id] ? 'Show rooms' : 'Hide rooms'}
                onClick={() => setCollapsed({ ...collapsed, [c.id]: !collapsed[c.id] })}
              >
                {collapsed[c.id] ? '▸' : '▾'}
              </button>
              <button className="channel-name" onClick={() => onView({ type: 'channel', id: c.id })}>
                <span>{typeIcon(c.type)}</span> {c.name}
              </button>
              {c.isOwner && c.pendingCount > 0 && (
                <span className="badge-count" title="Requests waiting for you">{c.pendingCount}</span>
              )}
            </div>

            {!collapsed[c.id] && (
              <div className="room-sub-list">
                {c.rooms.length === 0 && <p className="empty small">No rooms yet.</p>}
                {c.rooms.map((r) => (
                  <button
                    key={r.id}
                    className={`room-sub ${view.type === 'room' && view.id === r.id ? 'active' : ''} ${r.isMember ? '' : 'dim'}`}
                    onClick={() => onView({ type: 'room', id: r.id })}
                  >
                    <span className="hash">{r.isPrivate ? '🔒' : '#'}</span>
                    <span className="rname">{r.name}</span>
                    {!r.isMember && r.requestStatus === 'pending' && <em>pending</em>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <h3>Discover channels</h3>
        {others.length === 0 && <p className="empty">No other channels.</p>}
        {others.map((c) => (
          <button
            key={c.id}
            className={`room-item ${view.type === 'channel' && view.id === c.id ? 'active' : ''}`}
            onClick={() => onView({ type: 'channel', id: c.id })}
          >
            <div className="avatar square chan">{typeIcon(c.type)}</div>
            <div className="room-text">
              <strong>{c.name}</strong>
              <span>
                {c.type === 'private' ? 'Private' : 'Public'} · {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                {c.requestStatus === 'pending' ? ' · request sent' : ''}
              </span>
            </div>
          </button>
        ))}
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
