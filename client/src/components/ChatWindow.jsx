import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import Avatar from './Avatar'

const formatTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// One room's chat. If the user is not a member yet it shows the join / request screen instead.
export default function ChatWindow({ room, channelName, user, socket, actions, onBack }) {
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
    return <main className="chat empty-state"><div className="spinner" /></main>
  }

  const title = room.isGlobal ? '🌍 Global chat' : `${room.isPrivate ? '🔒' : '#'} ${room.name}`
  const subtitle = [channelName, room.description].filter(Boolean).join(' · ') || `${room.memberCount} members`

  return (
    <main className="chat">
      <header className="chat-head">
        {onBack && <button className="btn ghost small" onClick={onBack} title="Back to the channel">←</button>}
        <Avatar name={room.name} square />
        <div className="room-text">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        {isMember && !room.isOwner && !room.isGlobal && (
          <button className="btn ghost small" onClick={() => actions.leaveRoom(room.id)}>Leave</button>
        )}
        {room.isOwner && (
          <button
            className="btn danger small"
            onClick={() => window.confirm('Delete this room and all its messages?') && actions.deleteRoom(room.id)}
          >
            Delete
          </button>
        )}
      </header>

      {!isMember ? (
        // ---------- join (public room) or request (private room) ----------
        <div className="empty-state">
          <div className="big-emoji">{room.isPrivate ? '🔒' : '🚪'}</div>
          <h2>{room.isPrivate ? 'Private room' : 'Join'} # {room.name}</h2>
          <p className="muted">{room.memberCount} member{room.memberCount === 1 ? '' : 's'} chat here.</p>

          {!room.isPrivate && (
            <button className="btn primary" onClick={() => actions.joinRoom(room.id)}>Join room</button>
          )}

          {room.isPrivate && room.requestStatus === 'pending' && (
            <>
              <p className="muted">⏳ Your request was sent. The channel admin has to accept it.</p>
              <button className="btn ghost" onClick={() => actions.cancelRoomRequest(room.id)}>Cancel request</button>
            </>
          )}

          {room.isPrivate && room.requestStatus !== 'pending' && (
            <>
              <p className="muted">
                {room.requestStatus === 'rejected'
                  ? '❌ Your last request was declined. You can ask again.'
                  : 'The channel admin must accept you before you can read or write here.'}
              </p>
              <button className="btn primary" onClick={() => actions.requestRoom(room.id)}>Request to join</button>
            </>
          )}
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
              placeholder={room.isGlobal ? 'Message everyone…' : `Message ${title}`}
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
