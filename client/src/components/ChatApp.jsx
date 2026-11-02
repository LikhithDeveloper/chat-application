import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { connectSocket } from '../socket'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'
import ChannelPage from './ChannelPage'
import CreateChannelModal from './CreateChannelModal'
import CreateRoomModal from './CreateRoomModal'

// The logged-in screen. It owns the data (Global room + channels with their rooms),
// the socket connection, and every action a button can trigger.
//
// view = what the main panel shows:
//   { type: 'global' }               the Global chat
//   { type: 'channel', id }          a channel page (rooms, join/request, admin inbox)
//   { type: 'room', id }             a room chat (or the join/request screen for it)
export default function ChatApp({ user, onLogout }) {
  const [data, setData] = useState({ global: null, channels: [] })
  const [view, setView] = useState({ type: 'global' })
  const [socket, setSocket] = useState(null)
  const [modal, setModal] = useState(null) // { type: 'channel' } | { type: 'room', channelId }
  const [notice, setNotice] = useState('')
  const [tick, setTick] = useState(0) // bumps whenever the server says "something changed"

  const load = useCallback(async () => {
    setData(await api('/channels'))
    setTick((t) => t + 1)
  }, [])

  // Connect once. The server tells us when channels, rooms or requests change, so we reload.
  useEffect(() => {
    load()
    const s = connectSocket()
    s.on('channels:changed', load)
    s.on('rooms:changed', load)
    s.on('requests:changed', load)
    setSocket(s)
    return () => s.disconnect()
  }, [load])

  // Error messages disappear after a few seconds.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 4500)
    return () => clearTimeout(t)
  }, [notice])

  // Runs an action, shows its error (if any), and refreshes the data afterwards.
  async function act(fn) {
    try {
      await fn()
    } catch (err) {
      setNotice(err.message)
    }
    await load().catch(() => {})
  }
  const call = (path, method = 'POST', body) => () => api(path, { method, body })

  const actions = {
    // channels
    joinChannel: (id) => act(call(`/channels/${id}/join`)),
    requestChannel: (id) => act(call(`/channels/${id}/request`)),
    cancelChannelRequest: (id) => act(call(`/channels/${id}/request`, 'DELETE')),
    leaveChannel: (id) => act(async () => { await api(`/channels/${id}/leave`, { method: 'POST' }); setView({ type: 'global' }) }),
    deleteChannel: (id) => act(async () => { await api(`/channels/${id}`, { method: 'DELETE' }); setView({ type: 'global' }) }),
    // rooms
    joinRoom: (id) => act(call(`/rooms/${id}/join`)),
    requestRoom: (id) => act(call(`/rooms/${id}/request`)),
    cancelRoomRequest: (id) => act(call(`/rooms/${id}/request`, 'DELETE')),
    leaveRoom: (id) => act(async () => { await api(`/rooms/${id}/leave`, { method: 'POST' }); setView({ type: 'global' }) }),
    deleteRoom: (id) => act(async () => { await api(`/rooms/${id}`, { method: 'DELETE' }); setView({ type: 'global' }) }),
    // the admin answers a request
    decide: (channelId, reqId, approve) =>
      act(call(`/channels/${channelId}/requests/${reqId}/${approve ? 'approve' : 'reject'}`)),
  }

  // Modals call these. They throw on error so the modal can show the message.
  async function createChannel(body) {
    const res = await api('/channels', { method: 'POST', body })
    await load()
    setView({ type: 'channel', id: res.channel.id })
    setModal(null)
  }
  async function createRoom(channelId, body) {
    const res = await api(`/channels/${channelId}/rooms`, { method: 'POST', body })
    await load()
    setView({ type: 'room', id: res.room.id })
    setModal(null)
  }

  // Work out what to show. If the thing we were looking at is gone (deleted, left), fall back to Global.
  const allRooms = data.channels.flatMap((c) => c.rooms)
  const room = view.type === 'room' ? allRooms.find((r) => r.id === view.id) : null
  const channel =
    view.type === 'channel'
      ? data.channels.find((c) => c.id === view.id)
      : room && data.channels.find((c) => c.id === room.channel)

  let main
  if (view.type === 'channel' && channel) {
    main = (
      <ChannelPage
        key={channel.id}
        channel={channel}
        tick={tick}
        actions={actions}
        onOpenRoom={(id) => setView({ type: 'room', id })}
        onCreateRoom={() => setModal({ type: 'room', channelId: channel.id })}
      />
    )
  } else if (view.type === 'room' && room) {
    main = (
      <ChatWindow
        key={room.id}
        room={room}
        channelName={channel?.name}
        user={user}
        socket={socket}
        actions={actions}
        onBack={() => setView({ type: 'channel', id: room.channel })}
      />
    )
  } else {
    main = (
      <ChatWindow key="global" room={data.global} user={user} socket={socket} actions={actions} />
    )
  }

  return (
    <div className="app">
      <Sidebar
        user={user}
        data={data}
        view={room ? { type: 'room', id: room.id } : channel ? view : { type: 'global' }}
        onView={setView}
        onCreateChannel={() => setModal({ type: 'channel' })}
        onLogout={onLogout}
      />
      {main}

      {notice && <div className="toast" onClick={() => setNotice('')}>{notice}</div>}
      {modal?.type === 'channel' && <CreateChannelModal onCreate={createChannel} onClose={() => setModal(null)} />}
      {modal?.type === 'room' && (
        <CreateRoomModal onCreate={(body) => createRoom(modal.channelId, body)} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
