import { useEffect, useState } from 'react'
import { api } from '../api'

// Shows ONE channel. What you see depends on who you are:
//   not a member  -> a join screen (public: Join, private: Request to join)
//   member        -> the rooms of the channel, each with an Open / Join / Request button
//   admin (owner) -> also: "Create room" and the inbox of join requests to approve or reject
export default function ChannelPage({ channel, tick, actions, onOpenRoom, onCreateRoom }) {
  const [requests, setRequests] = useState([])
  const isPrivate = channel.type === 'private'

  // The admin's inbox. Reloads whenever the server reports a change (tick).
  useEffect(() => {
    if (!channel.isOwner) return
    let cancelled = false
    api(`/channels/${channel.id}/requests`)
      .then((d) => !cancelled && setRequests(d.requests))
      .catch(() => {})
    return () => { cancelled = true }
  }, [channel.id, channel.isOwner, tick])

  // The right button for a room card.
  function roomAction(room) {
    if (room.isMember) {
      return <button className="btn primary small" onClick={() => onOpenRoom(room.id)}>Open</button>
    }
    if (!room.isPrivate) {
      return <button className="btn primary small" onClick={() => actions.joinRoom(room.id)}>Join</button>
    }
    if (room.requestStatus === 'pending') {
      return (
        <button className="btn ghost small" onClick={() => actions.cancelRoomRequest(room.id)} title="Cancel your request">
          ⏳ Pending · cancel
        </button>
      )
    }
    return (
      <button className="btn ghost small" onClick={() => actions.requestRoom(room.id)}>
        {room.requestStatus === 'rejected' ? 'Declined · ask again' : 'Request to join'}
      </button>
    )
  }

  return (
    <main className="chat channel-page">
      <header className="chat-head">
        <div className="avatar square chan">{isPrivate ? '🔒' : '🌐'}</div>
        <div className="room-text">
          <strong>{channel.name}</strong>
          <span>
            {isPrivate ? 'Private channel' : 'Public channel'} · {channel.memberCount} member{channel.memberCount === 1 ? '' : 's'}
            {channel.description ? ` · ${channel.description}` : ''}
          </span>
        </div>
        {channel.isMember && !channel.isOwner && (
          <button className="btn ghost small" onClick={() => window.confirm('Leave this channel and all its rooms?') && actions.leaveChannel(channel.id)}>
            Leave
          </button>
        )}
        {channel.isOwner && (
          <button
            className="btn danger small"
            onClick={() => window.confirm('Delete this channel, all its rooms and messages?') && actions.deleteChannel(channel.id)}
          >
            Delete channel
          </button>
        )}
      </header>

      {/* ---------- not a member: the gate ---------- */}
      {!channel.isMember && (
        <div className="empty-state">
          <div className="big-emoji">{isPrivate ? '🔒' : '🌐'}</div>
          <h2>{channel.name}</h2>
          <p className="muted">{channel.description || 'No description'}</p>

          {!isPrivate && (
            <>
              <p className="muted">Anyone can join this channel.</p>
              <button className="btn primary" onClick={() => actions.joinChannel(channel.id)}>Join channel</button>
            </>
          )}

          {isPrivate && channel.requestStatus === 'pending' && (
            <>
              <p className="muted">⏳ Your request was sent. The channel admin has to accept it.</p>
              <button className="btn ghost" onClick={() => actions.cancelChannelRequest(channel.id)}>Cancel request</button>
            </>
          )}

          {isPrivate && channel.requestStatus !== 'pending' && (
            <>
              <p className="muted">
                {channel.requestStatus === 'rejected'
                  ? '❌ Your last request was declined. You can ask again.'
                  : 'This channel is private. The admin must accept you before you can join.'}
              </p>
              <button className="btn primary" onClick={() => actions.requestChannel(channel.id)}>Request to join</button>
            </>
          )}
        </div>
      )}

      {/* ---------- member: rooms ---------- */}
      {channel.isMember && (
        <div className="channel-body">
          {channel.isOwner && (
            <section className="panel">
              <div className="panel-head">
                <h3>📥 Join requests {requests.length > 0 && <span className="badge-count">{requests.length}</span>}</h3>
              </div>
              {requests.length === 0 ? (
                <p className="muted">No requests waiting. When someone asks to join, it shows up here.</p>
              ) : (
                requests.map((r) => (
                  <div key={r.id} className="request-row">
                    <div>
                      <strong>{r.user.username}</strong>{' '}
                      {r.kind === 'channel' ? (
                        <span className="muted">wants to join this <b>channel</b></span>
                      ) : (
                        <span className="muted">wants to join the room <b>🔒 {r.room?.name}</b></span>
                      )}
                    </div>
                    <div className="request-actions">
                      <button className="btn primary small" onClick={() => actions.decide(channel.id, r.id, true)}>Accept</button>
                      <button className="btn danger small" onClick={() => actions.decide(channel.id, r.id, false)}>Reject</button>
                    </div>
                  </div>
                ))
              )}
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <h3>Rooms</h3>
              {channel.isOwner && <button className="btn primary small" onClick={onCreateRoom}>+ New room</button>}
            </div>

            {channel.rooms.length === 0 && (
              <p className="muted">
                {channel.isOwner ? 'No rooms yet. Create the first one!' : 'The admin has not created any rooms yet.'}
              </p>
            )}

            <div className="room-grid">
              {channel.rooms.map((room) => (
                <div key={room.id} className="room-card">
                  <div className="room-card-top" onClick={() => onOpenRoom(room.id)}>
                    <strong>{room.isPrivate ? '🔒' : '#'} {room.name}</strong>
                    <span className={`pill ${room.isPrivate ? 'private' : 'public'}`}>{room.isPrivate ? 'Private' : 'Public'}</span>
                  </div>
                  <p className="muted">{room.description || 'No description'}</p>
                  <div className="room-card-bottom">
                    <span className="muted">{room.memberCount} member{room.memberCount === 1 ? '' : 's'}</span>
                    {roomAction(room)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
