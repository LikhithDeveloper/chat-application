import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { connectSocket } from '../socket'
import Sidebar from './Sidebar'
import ChatWindow from './ChatWindow'
import CreateRoomModal from './CreateRoomModal'

// The logged-in screen. Owns the room list and the socket connection.
export default function ChatApp({ user, onLogout }) {
  const [rooms, setRooms] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [socket, setSocket] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const loadRooms = useCallback(async () => {
    const data = await api('/rooms')
    setRooms(data.rooms)
  }, [])

  // Connect once; refresh the list whenever anyone creates/joins/deletes a room.
  useEffect(() => {
    loadRooms()
    const s = connectSocket()
    s.on('room:created', loadRooms)
    s.on('room:updated', loadRooms)
    s.on('room:deleted', ({ id }) => {
      loadRooms()
      setActiveId((current) => (current === id ? null : current))
    })
    setSocket(s)
    return () => s.disconnect()
  }, [loadRooms])

  async function joinRoom(id) {
    await api(`/rooms/${id}/join`, { method: 'POST' })
    await loadRooms()
  }

  async function leaveRoom(id) {
    await api(`/rooms/${id}/leave`, { method: 'POST' })
    setActiveId(null)
    await loadRooms()
  }

  async function deleteRoom(id) {
    await api(`/rooms/${id}`, { method: 'DELETE' })
    setActiveId(null)
  }

  async function createRoom(name, description) {
    const data = await api('/rooms', { method: 'POST', body: { name, description } })
    await loadRooms()
    setActiveId(data.room.id)
    setShowCreate(false)
  }

  const activeRoom = rooms.find((r) => r.id === activeId)

  return (
    <div className="app">
      <Sidebar
        user={user}
        rooms={rooms}
        activeId={activeId}
        onSelect={setActiveId}
        onCreate={() => setShowCreate(true)}
        onLogout={onLogout}
      />
      <ChatWindow
        key={activeId}
        room={activeRoom}
        user={user}
        socket={socket}
        onJoin={joinRoom}
        onLeave={leaveRoom}
        onDelete={deleteRoom}
      />
      {showCreate && <CreateRoomModal onCreate={createRoom} onClose={() => setShowCreate(false)} />}
    </div>
  )
}
