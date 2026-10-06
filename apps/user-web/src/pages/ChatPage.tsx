import { useParams } from 'react-router-dom';

// TODO: Nhắn tin giữa buyer và seller về một listing.
// API endpoint chưa được định nghĩa trong openapi.yaml hiện tại — để TODO.
export function ChatPage() {
  const { roomId } = useParams<{ roomId?: string }>();
  return (
    <section style={{ padding: '2rem clamp(1rem, 4vw, 3rem)' }}>
      <h1>Nhắn tin</h1>
      {roomId && <p style={{ color: '#6b6254' }}>Phòng chat: {roomId}</p>}
      {/* TODO: ChatRoomList + ChatWindow — xem socket.io-client đã có trong deps */}
    </section>
  );
}
