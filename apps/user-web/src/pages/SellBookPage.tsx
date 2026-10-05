// TODO: Form đăng bán sách (yêu cầu đăng nhập).
// Dựa trên luồng draft → catalog request → listing trong api-contract/openapi.yaml.
// Chỉ cho phép user có MEMBER role và status ACTIVE.
export function SellBookPage() {
  return (
    <section style={{ padding: '2rem clamp(1rem, 4vw, 3rem)' }}>
      <h1>Đăng bán sách</h1>
      {/* TODO: ListingDraftForm — tên, ảnh, tình trạng, giá, hình thức bán/đổi */}
    </section>
  );
}
