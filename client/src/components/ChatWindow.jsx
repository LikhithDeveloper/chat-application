import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Avatar from './Avatar'

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function ChatWindow({ room, user, socket, onJoin, onLeave, onDelete }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const bottomRef = useRef(null)

  const isMember = room?.isMember
  const roomId = room?.id

  // When we become a member: load history, then listen for live messages.
  useEffect(() => {
    if (!roomId || !isMember || !socket) return

    let cancelled = false
    const onMessage = (msg) => {
      if (msg.room === roomId) setMessages((prev) => [...prev, msg])
    }

    async function open() {
      const data = await api(`/rooms/${roomId}/messages`)
      if (cancelled) return
      setMessages(data.messages)
      socket.on('message:new', onMessage)
      socket.emit('room:open', roomId)
    }
    open().catch((err) => setError(err.message))

    // The server forgets room subscriptions on reconnect, so re-open then.
    const reopen = () => socket.emit('room:open', roomId)
    socket.on('connect', reopen)

    return () => {
      cancelled = true
      socket.off('message:new', onMessage)
      socket.off('connect', reopen)
      socket.emit('room:close', roomId)
    }
  }, [roomId, isMember, socket])

  // Scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(e) {
    e.preventDefault()
    const message = text.trim()
    if (!message) return
    setText('')
    const res = await socket.emitWithAck('message:send', { roomId, text: message })
    setError(res.error || '')
  }

  if (!room) {
    return (
      <main className="chat empty-state">
        <div className="big-emoji">👋</div>
        <h2>Pick a room to start chatting</h2>
        <p className="muted">Choose one from the left, or create your own.</p>
      </main>
    )
  }

  return (
    <main className="chat">
      <header className="chat-head">
        <Avatar name={room.name} square />
        <div className="room-text">
          <strong># {room.name}</strong>
          <span>{room.description || `${room.memberCount} members`}</span>
        </div>
        {isMember && !room.isOwner && (
          <button className="btn ghost small" onClick={() => onLeave(room.id)}>Leave</button>
        )}
        {room.isOwner && (
          <button
            className="btn danger small"
            onClick={() => window.confirm('Delete this room and all its messages?') && onDelete(room.id)}
          >
            Delete
          </button>
        )}
      </header>

      {!isMember ? (
        <div className="empty-state">
          <div className="big-emoji">🚪</div>
          <h2>Join # {room.name}</h2>
          <p className="muted">{room.memberCount} member{room.memberCount === 1 ? '' : 's'} are chatting here.</p>
          <button className="btn primary" onClick={() => onJoin(room.id)}>Join room</button>
        </div>
      ) : (
        <>
          <div className="messages">
            {messages.length === 0 && <p className="muted center">No messages yet. Say hello! 👋</p>}
            {messages.map((m) => {
              const mine = m.sender.id === user.id
              return (
                <div key={m.id} className={`message ${mine ? 'mine' : ''}`}>
                  {!mine && <Avatar name={m.sender.username} />}
                  <div className="bubble">
                    {!mine && <span className="author">{m.sender.username}</span>}
                    {/* React escapes text automatically, so messages can't inject HTML. */}
                    <p>{m.text}</p>
                    <time>{formatTime(m.createdAt)}</time>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {error && <div className="error banner">{error}</div>}

          <form className="composer" onSubmit={send}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Message # ${room.name}`}
              maxLength={1000}
              autoFocus
            />
            <button className="btn primary" disabled={!text.trim()}>Send</button>
          </form>
        </>
      )}
    </main>
  )
}
