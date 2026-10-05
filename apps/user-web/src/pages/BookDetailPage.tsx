import { useParams } from 'react-router-dom';

// TODO: Hiển thị chi tiết listing: bìa, tình trạng, phiếu mô tả, giá và trạng thái giao dịch.
// Dữ liệu lấy từ API: GET /listings/public/:id (xem api-contract/openapi.yaml)
export function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <section style={{ padding: '2rem clamp(1rem, 4vw, 3rem)' }}>
      <h1>Chi tiết sách</h1>
      <p style={{ color: '#6b6254' }}>ID: {id}</p>
      {/* TODO: BookCover + ConditionStamp + LibraryCard + TradeBar (DESIGN.md) */}
    </section>
  );
}
