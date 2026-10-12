# Kế hoạch mở rộng danh mục và thể loại sách

Ngày 12/10/2026. **Chủ dự án đã duyệt; gói lõi1–5 đã triển khai local.**
[ADR0035](../adr/0035-catalog-vocabulary-v2.md) và
[evidence](../../.impeccable/review/catalog-v2/README.md) mô tả bản hiện thực và giới hạn.
Các mục đề xuất bên dưới giữ làm baseline của kế hoạch. Rà soát source tại
`f4d74a7`, nhánh tài liệu `codex/catalog-expansion-plan`. Chủ dự án chọn đầy đủ
nhóm sách phổ biến và bộ lọc riêng theo nhóm, ưu tiên Member web hiện tại.
Các thay đổi Chat/Notifications/MainLayout/Home CSS của teammate được giữ nguyên.

## 1. Kết luận và phạm vi đề xuất

Mở rộng trên nền phân loại đã có, giữ mã/ý nghĩa cũ và thêm vocabulary
`catalog-v2`. Làm đồng bộ đường đi Navbar/Home → Search → Chi tiết → Đăng sách
→ Admin duyệt catalog. Giữ API/session, eligibility, metadata bất biến sau
Confirm, idempotency và dữ liệu người dùng khi lỗi.

Đề xuất **17 danh mục gốc, 55 nhóm con, tổng 72 mã danh mục**: 11 gốc/18 con
hiện tại được giữ, thêm 6 gốc/37 con. Số lượng thể loại/thuộc tính không dùng
để tạo thêm danh mục trùng chức năng. Manga, Light Novel, Văn học, Giáo khoa và
Thiếu nhi có thể đủ chi tiết qua facet mà không cần nhóm con giả tạo.

Gói lõi gồm vocabulary/contract/Mongo/API, web và Admin, dữ liệu demo cùng
kiểm thử; RN cần kiểm tương thích và bảo toàn metadata khi gửi lại. UI phân
loại đầy đủ trên RN là gói tiếp theo có nghiệm thu native riêng. Flutter vẫn
scaffold, không tự xây client mới.

Admin CRUD vocabulary và phân loại lại sách đã Confirmed là hai gói riêng.
SRS FR-G02 có mục tiêu Admin quản lý thể loại; ADR0033/source hiện chỉ quản lý
vocabulary theo release. Gói mở rộng này không được báo là đã hoàn thành CRUD.

## 2. Hiện trạng đã đọc trong code

| Thành phần | Hiện trạng / hệ quả |
| --- | --- |
| Vocabulary | [catalog-taxonomy.js](../../packages/api-contract/src/catalog-taxonomy.js): 11 gốc, 29 nút, 16 facet, 113 lựa chọn. Có alias nhãn cũ, phụ thuộc ngoại ngữ/cấp học, OR trong facet và AND giữa facet. |
| Metadata | `category` là nhãn, `categoryId` optional, `attributes` là object mảng mã, `series` optional. Phân loại nằm trên `catalog_revisions`, không trên mỗi listing. |
| Contract | [openapi.yaml](../../packages/api-contract/openapi.yaml) lặp enum danh mục ở query `/catalog/books`, `/listings`, `CatalogMetadata` và `PublicBook`. `CatalogAttributes` giới hạn key/value. Sửa JS đơn lẻ không đủ. |
| Mongo | [0016](../../apps/api/src/database/mongo/migrations/0016-catalog-classification.ts) đóng băng mã v1 và validator. Revision append-only; migration mới phải mở rộng validator, không sửa checksum0016. Registry hiện đến0018. |
| API reads | Catalog và listing lookup/match classification trước phân trang; cursor gắn filter. `GET /catalog/taxonomy` public, vocabulary tĩnh, không có số lượng tồn kho. |
| API writes | ContractInput và commit-time `checkCatalog` đều kiểm classification; `category` phải đúng canonical label của ID. Đổi nhãn cũ tùy tiện có thể làm kiểm tra revision cũ thất bại. |
| Bối cảnh cha | `descendantIds` hiện chỉ đi một cấp. Query `languages + exam + n3` hiện bị từ chối422; HTTP test ghi rõ hành vi này. Mở rộng lọc cha phải là đổi semantics có chủ đích. |
| Bộ truyện | Điều kiện `manga/light-novel` lặp ở API, URL helper, Search, component classification. Thêm con trong tương lai sẽ bị chặn nếu không sửa capability. |
| Search/Sell | Dùng chung `CatalogClassificationFields`. Search có draft→Apply→URL, chip, clear từng nhóm và phụ thuộc; Sell nhận catalog có sẵn hoặc đề nghị mới, không sửa catalog Confirmed. |
| Sidebar | ResizeObserver chỉ cho sticky khi cả panel vừa viewport; dài thì cuộn cùng trang. Mobile dialog có thân cuộn và footer. Đây là nền cần giữ. |
| Navbar | `CategoryNavigation.columnIds` liệt kê mã bằng tay: danh mục mới sẽ không tự xuất hiện trong directory. |
| Home | Khám phá thể loại lọc cục bộ từ tối đa24 listing mới ở live. Đây không phải danh mục toàn hệ thống, dù copy hiện đã nói rõ phạm vi. |
| Chi tiết | BookDetail chỉ ghi category với nhãn “Thể loại”; chưa hiển thị genre/attributes/series. |
| Preview | 97 ấn bản, chỉ6 bản có categoryId trực tiếp; các bản còn lại dựa vào enrichment. Một số metadata suy theo nhóm rất rộng, ví dụ Văn học mặc định novel/drama. Đây là mẫu UI, không phải dữ liệu đã được duyệt. |
| RN | Shelf filters chưa có category/facets. Catalog picker và shelf Zod chưa giữ categoryId/attributes/series; payload resubmit được dựng lại chỉ từ metadata cũ nên có nguy cơ mất classification của đề nghị được tạo trên web. |
| Admin | Reader đã hiển thị nhãn category/facet; parser kiểm categoryId theo registry. Chưa có editor/CRUD vocabulary. Confirm/Reject không chỉnh metadata hộ người đăng. |

Nguồn quyết định: [ADR0033](../adr/0033-catalog-contextual-classification.md),
[bộ lọc hiện hành](CATALOG_CONTEXTUAL_FILTERS.md),
[SRS1.1](../SRS_V1_1.md), [model map](../refactor/MIG02_MODEL_MAP.md).
Số đếm trên được lấy từ module vocabulary và JSON preview; không đọc/ghi DB chính.

## 3. Phân biệt các trục dữ liệu

- **Danh mục/nhóm sách**: một đường đi chính cho mỗi đầu sách/ấn bản, ví dụ
  `business.marketing`. Chọn cha khi chưa biết nhóm con vẫn hợp lệ.
- **Thể loại nội dung**: nhiều giá trị, ví dụ Hành động + Giả tưởng. Không biến
  mọi genre thành category và không lưu một đầu sách dưới nhiều category.
- **Đối tượng**: Shounen/Seinen là nhóm độc giả manga, không trộn vào genre.
  Không suy rằng Shounen chỉ có trẻ em đọc hoặc coi nó là quyền truy cập.
- **Bối cảnh/chủ đề**: dị giới, học đường, lập trình, kế toán… theo category.
- **Ngôn ngữ ấn bản**: `language` hiện có. Sách học tiếng Nhật viết bằng tiếng
  Việt có category `languages.ja` và language `vi`, không mâu thuẫn.
- **Đặc tính từng cuốn**: tình trạng, thiếu trang, giá, hình thức bán/đổi, phụ
  kiện thuộc listing. Không đưa chúng vào taxonomy của đầu sách.
- **Series**: giữ tên bộ truyện optional và cách tìm exact NFC/case-insensitive.
  Tập số, đủ bộ, boxset, có quà tặng không suy ra từ series; muốn thêm cần thiết
  kế dữ liệu bản sách riêng.

Giữ root Manga/Light Novel riêng vì đường tìm quen thuộc và mã hiện hành.
Không chuyển LN vào Văn học hay Manga vào Thiếu nhi chỉ để giống retailer khác.
Với hồi ký nằm dưới Văn học cũ, giữ nguyên; sách mới chọn Tiểu sử/Hồi ký khi đó
là loại chính. Không tự chuyển lịch sử hoặc tạo bản sao đầu sách.

## 4. Ma trận danh mục v2

Nhãn và mã hiện có được giữ. Các mã mới bên dưới là đề xuất để duyệt; ID mới
dùng hậu tố sau dấu chấm trên root tương ứng. Tổng con ở cột này là55.

| Danh mục gốc | Nhóm con sau mở rộng | Bộ lọc riêng đề xuất |
| --- | --- | --- |
| `manga` Manga / Comic | Không cần con | Genre hiện tại + thể thao/tâm lý/bi kịch; nhóm độc giả; bối cảnh; phong cách manga/manhwa/manhua/comic; series. |
| `light-novel` Light Novel | Không cần con | Genre, bối cảnh hiện tại + game/thế giới hậu tận thế theo vocabulary; series. Không gắn Shounen/Seinen mặc định cho LN. |
| `literature` Văn học | Không cần con | Loại tác phẩm (thêm ký sự/du ký/phê bình), genre, tác phẩm Việt/ngoại quốc theo thông tin được khai và duyệt. Không dùng ngôn ngữ bản dịch để suy nguồn tác phẩm. |
| `languages` Học ngoại ngữ | 8: `en`, `ja`, `ko`, `zh`, `other` cũ; thêm `fr`, `de`, `vi` (tiếng Việt cho người nước ngoài) | Mục đích, trình độ/chứng chỉ theo ngoại ngữ, kỹ năng; thêm từ điển và ngữ âm khi có dữ liệu. |
| `education` Giáo khoa / tham khảo | Không cần con | Cấp học/lớp/môn/mục đích; thêm mầm non và môn phù hợp. Đại học không hiện lớp1–12. Không thêm mọi ngành đại học trong gói này. |
| `business` Kinh tế / kinh doanh | 9: `management`, `marketing`, `finance`, `startup`, `economics` cũ; thêm `accounting`, `hr`, `supply-chain`, `lessons` | Đối tượng, mức tiếp cận, chủ đề theo con: digital marketing/branding/bán hàng; chứng khoán/tài chính cá nhân; kế toán/thuế; tuyển dụng/nhân sự… |
| `psychology` Tâm lý / kỹ năng sống | 3: `psychology`, `skills` cũ; thêm `teen` | Chủ đề, đối tượng, mức tiếp cận. Giữ thói quen/giao tiếp/cảm xúc/quan hệ/nghề nghiệp, thêm quản lý thời gian và tư duy. |
| `children` Thiếu nhi | Không cần con | Tuổi, loại sách tranh/hoạt động/truyện, chủ đề thiên nhiên/động vật/cảm xúc/khám phá + kỹ năng/an toàn. Thêm khoảng16–18 khi có mục sách thiếu niên phù hợp. |
| `science` Khoa học / công nghệ | 4 con cũ: `natural`, `technology`, `space`, `environment` | Mức tiếp cận, lĩnh vực khoa học; con technology thêm lập trình/web/dữ liệu/AI/phần cứng/mạng. Không gom cấp độ nghề nghiệp vào genre. |
| `history` Lịch sử / địa lý | 2 con cũ: `history`, `geography` | Phạm vi, thời kỳ, chủ đề theo con và mức tiếp cận. Thời kỳ không cần xuất hiện cho mọi sách địa lý. |
| `biography` Tiểu sử / hồi ký — mới | 5: `politics`, `business`, `science`, `arts`, `life` | Dạng tiểu sử/hồi ký/tự truyện, phạm vi, chủ đề nhân vật. Chỉ ghi thông tin đã biết, không suy từ tên tác giả. |
| `parenting` Nuôi dạy con — mới | 4: `care`, `education`, `development`, `family` | Độ tuổi của trẻ, chủ đề chăm sóc/giáo dục/cảm xúc/gia đình, đối tượng. Tuổi này là metadata của nội dung, không phải tuổi người mua. |
| `health` Sức khỏe / y học — mới | 4: `medicine`, `nutrition`, `wellness`, `fitness` | Chủ đề chuyên môn, đối tượng đọc, mức tiếp cận. Phân loại không hàm ý chứng nhận y khoa hoặc hiệu quả chữa bệnh. |
| `arts` Nghệ thuật / thiết kế — mới | 6: `visual`, `design`, `photography`, `music`, `cinema`, `architecture` | Chủ đề/kỹ thuật, mức tiếp cận; chất liệu nghệ thuật khi phù hợp. |
| `society` Xã hội / triết học — mới | 5: `philosophy`, `law`, `politics`, `sociology`, `religion` | Chủ đề theo con, phạm vi, mức tiếp cận; con law có lĩnh vực luật. Không áp lĩnh vực luật cho triết học. |
| `lifestyle` Đời sống / sở thích — mới | 5: `cooking`, `crafts`, `gardening`, `travel`, `sports` | Chủ đề/kỹ thuật; cooking có loại ẩm thực; crafts có loại thủ công; travel có phạm vi địa lý. |
| `other` Sách khác | Không có con | Chỉ bộ lọc chung; không thêm thuộc tính tự do. |

Mỗi profile nên có **2–4 nhóm riêng thường dùng, tối đa5 nhóm**; các nhóm phụ
đóng mặc định. Từ điển v2 có thể có nhiều key nhưng mỗi cuốn không phải điền
mọi key. Chốt danh sách option cụ thể theo từng profile trong bước1, không
thêm option chỉ để đạt số lượng. Giữ giới hạn16 giá trị mỗi facet và kiểm ngay
khi đạt giới hạn. `maxProperties:16` hiện tại là giới hạn một object sách,
không phải số facet toàn registry; không tăng giới hạn này theo phản xạ.

## 5. Thiết kế bộ lọc và hành vi

### Điều kiện dùng chung

Giữ từ khóa, bán/đổi, tình trạng, giá bán, giá trị đổi, ngôn ngữ ấn bản và sort.
Chưa thêm NXB/tác giả/năm xuất bản thành dropdown: metadata này đang là text/
optional, chưa có directory chuẩn. Từ khóa vẫn dùng tác giả; năm/NXB được đọc
ở chi tiết. Không thêm thương hiệu/nhà cung cấp/màu sắc/kích thước hàng hóa.

### Đổi bối cảnh và query

- Trong một facet chọn nhiều là OR; khác facet và bộ lọc chung là AND.
- Danh mục cha bao gồm con. Đề xuất hỗ trợ query cha với facet hợp lệ ở ít
  nhất một con: `languages + exam + n3` sẽ tìm sách phù hợp trong nhánh Nhật.
  Đây là thay đổi có chủ đích so với422 hiện tại, cần sửa contract/docs/test.
- Tách hai context **tìm kiếm** và **khai metadata**. Search ở cha dùng union
  lựa chọn con; metadata của sách vẫn phải phù hợp category chính xác. Kiểm
  combination phải tìm được nhánh hỗ trợ toàn bộ context, không chỉ thấy từng
  giá trị ở đâu đó trong cây. Các nhánh hỗ trợ query được ràng vào Mongo match.
- Ví dụ `languages.en + n3` vẫn422; `languages + n3 + skill.grammar` hợp lệ;
  chọn nhiều N3/TOEIC trong một facet ở cha có thể OR trên các nhánh phù hợp.
- Chuyển category giữ giá/tình trạng/ngôn ngữ, giữ facet chung tương thích và
  bỏ facet không còn phù hợp. Ghi status ngắn nếu có lựa chọn phụ thuộc bị bỏ;
  không tự chọn giá trị mới. Bỏ cấp học phải bỏ lớp; Nhật→Anh phải bỏ JLPT.
- Dependency được khai trong registry và xử lý theo thứ tự, kiểm không có
  chu trình. Không tiếp tục chồng `if(categoryId===...)` ở từng màn.
- Apply mới thực thi filter; thay đổi filter/sort phải bỏ cursor. Giữ Back,
  link chia sẻ, chip từng giá trị, reset từng nhóm, dữ liệu nháp khi đóng drawer.
- Scope cursor và query cache đưa vocabulary version khi semantics đổi để
  không tiếp tục cursor v1 với phạm vi v2. Có thông báo tải lại trang đầu khi
  cursor cũ không còn hợp lệ, không trộn kết quả.
- Query sai/ID lạ trả lỗi có đường reset. Không âm thầm bỏ filter sai rồi
  hiển thị kết quả rộng hơn mong muốn.

### Bố cục

- Sidebar giữ264px, typography/field focus hiện có. Thứ tự: category → con →
  các nhóm riêng quan trọng → tình trạng/giá/ngôn ngữ. Giữ thao tác clear.
- Hiện5 option đầu và các option đã chọn, Xem thêm/Thu gọn. Nhóm dài có tìm
  không dấu nếu cần; không ép25 genre thành các chip lớn nhiều hàng.
- Sticky chỉ khi panel vừa; panel dài cuộn cùng trang. Không cắt lựa chọn,
  không tạo cuộn kép desktop, không thu font/touch target để ép vừa laptop.
- Mobile: một dialog, thân cuộn, footer Apply/Reset luôn dùng được; focus,
  Escape/Back, scroll lock và gutter không dịch layout. Keyboard không che action.
- Navbar: directory có tìm danh mục không dấu, chia nhóm điều hướng rõ;
  dữ liệu luôn lấy từ registry. Mobile accordion theo root. Desktop không
  bung72 link cùng lúc; cho lối “Xem tất cả” và mở nhóm con khi cần.
- Home: chuyển khu Khám phá thành lối vào category toàn hệ thống, nhóm quen
  thuộc trước và “Tất cả danh mục”. Click dẫn `/books?categoryId=...`, giữ
  preview/live. Kệ mới vẫn là kệ mới, không suy tổng tồn kho từ24 bài.
- Chi tiết: tách nhãn “Danh mục”, “Thể loại nội dung”, “Bộ truyện”, các facet
  được biết; hiển thị bằng nhãn và link mở search có sẵn filter. Không nhồi
  mọi thuộc tính lên card nhỏ.

## 6. Kiến trúc và dữ liệu

1. Giữ một vocabulary dùng chung trong api-contract. Chuyển quy tắc applicability,
   phụ thuộc và capability series sang cấu hình có kiểm tra. Các hàm query và
   metadata dùng context riêng; UI và API không tạo hai bộ mã khác nhau.
2. V2 mở rộng mã/option; không xóa hoặc đổi ý nghĩa mã v1. Nhãn canonical cũ
   được giữ vì write/checkCatalog đối chiếu nhãn. Tên hiển thị khác, nếu cần,
   phải tách display label khỏi historical/canonical label theo contract rõ.
3. Chưa bắt buộc taxonomyVersion trên từng revision cho thay đổi cộng thêm.
   Version vocabulary được trả bởi endpoint và gắn vào query/cache/cursor.
   Nếu cần thu hẹp/rút mã hoặc đổi ý nghĩa đã lưu, phải có ADR version từng
   revision trước; không suy sách cũ là v2 rồi từ chối kiểm tra nó.
4. Dùng schema enum tham chiếu dùng chung cho category để bớt bốn bản chép
   trong OpenAPI. Thêm các facet/option đã duyệt và generate types; thêm test
   đối chiếu registry với contract. Không sửa generated schema.ts bằng tay.
5. Migration mới **0019 nếu chưa có teammate chiếm số**: snapshot vocabulary
   v2 literal cố định, mở rộng validator category/attribute; đăng ký migration
   và `currentCollections` transform sau0016. Không import live registry để
   tính checksum migration đã đóng băng. Kiểm v1 checksum/upgrade/app role.
6. Không `$set` revision cũ, không backfill Confirmed và không reset/seed DB
   chính. Alias đọc chỉ cho tên cũ biết chắc; tên lạ vẫn đọc được, không đoán.
   Không có attribute thì sách không match filter attribute đó.
7. API `/catalog/books` và `/listings` dùng cùng search rules; lọc trước paging,
   giữ snapshot/eligibility/owner/media checks. Kiểm `explain` trên fixture lớn
   trước quyết định index; index category trên revision không chứng minh join
   mỗi combo đã nhanh. Không thêm một compound index cho mọi facet.
8. Web hiện import registry từ package, không tải rule động từ taxonomy API.
   V2 vẫn release-controlled, API/web/Admin cần triển khai tương thích cùng
   nhau. Không quảng cáo rằng thêm category trong DB sẽ tự hiện mọi client.
9. Triển khai theo thứ tự validator tương thích → backend/contract → client
   → dữ liệu v2. Khi đã có dữ liệu v2, rollback client/API về enum v1 có thể
   làm reader lỗi; giữ migration cộng thêm và chuẩn bị bản rollback còn hiểu v2.

Ví dụ dữ liệu mới (giữ tên canonical cũ):

```json
{
  "category": "Manga / Comic",
  "categoryId": "manga",
  "attributes": {
    "genre": ["action", "fantasy"],
    "audience": ["shounen"]
  },
  "series": "Tên bộ truyện",
  "language": "vi"
}
```

## 7. Bản đồ file phải sửa hoặc kiểm tra

**A = sửa trong gói lõi; B = kiểm tương thích, chỉ sửa nếu hành vi cần; C = gói sau.**
Tên file mới là đề xuất, chọn lại theo cấu trúc hiện có khi triển khai.

| Vùng | File / thư mục | Công việc |
| --- | --- | --- |
| A Vocabulary | `packages/api-contract/src/catalog-taxonomy.js`, `catalog-taxonomy.d.ts` | V2, registry root/con/options/profiles/dependencies/capabilities, aliases; tách query/write context; descendant traversal; helper nhãn/breadcrumb. |
| A Contract | `packages/api-contract/openapi.yaml`, generated `src/schema.ts` | Category schema dùng chung; attributes/option; mô tả search cha và series, response version. Chạy generate/check/routes. |
| A Drift guard mới | Test taxonomy-contract trong package hoặc API test hiện hành | ID unique/cây không cycle, mọi profile/option tồn tại, schema enum đồng bộ; snapshot migration phải tương thích. |
| A Persistence | migration mới trong `apps/api/src/database/mongo/migrations/`; `index.ts` | Validator v2 đóng băng, registry/current schema, index có evidence. **0016 chỉ đọc.** |
| B Model | `apps/api/src/database/mongo/documents.ts`, `collections.ts`, `roles.ts` | Metadata hiện mở rộng qua contract; không nhất thiết đổi collection/quyền cho enum cộng thêm. Chỉ sửa type nếu cần, không cấp update cho append-only. |
| A API classification | `apps/api/src/modules/catalog/catalog-classification.ts` | Tách input/search rules, capability series, union-context/branch match, alias chung, cursor-normalized filters. |
| A API taxonomy | `catalog.controller.ts` | Trả vocabulary v2, giữ public read-only. Không thêm CRUD hoặc inventory count ngầm. |
| A API reads | `catalog.service.ts`, `apps/api/src/modules/listings/public-listing.service.ts` | Scope cursor phiên bản, query cha/ngành, match trước limit; không nới public eligibility. |
| B API input | `apps/api/src/modules/commands/contract-input.service.ts` | Giữ schema validation/NFC và write context; thông báo field error rõ. Nếu đổi helper cần cập nhật điểm gọi. |
| A Shared web form | `apps/user-web/src/components/CatalogClassificationFields.tsx`, `.module.css` | Root/con/facet context, series capability, phụ thuộc, nhóm dài/tìm option, phân biệt Search với Edit. |
| B Dropdown | `FilterSelect.tsx`, `.module.css` | Tái dùng searchable select44px; kiểm nhiều root/con, nhãn dài, tiếng Việt, portal/viewport/focus. Không thay mới primitive nếu đã đủ. |
| A Search | `pages/BookSearchPage.tsx`, `.module.css`, `lib/catalog-filters.ts`, `services/catalog-search.ts` | Validation/query/chips/URL/draft, loại bỏ series hardcode, profile cha và sticky-fit. |
| A Navbar | `components/CategoryNavigation.tsx`, `.module.css` | Bỏ danh sách root đóng cứng; presentation groups tách rõ và test phủ mọi root; directory tìm/accordion/mobile. Header chỉ kiểm consumer, không đổi navbar đã thích. |
| A Home | `pages/HomePage.tsx`, `services/home-shelves.ts`; CSS scope category nếu cần | Khám phá taxonomy toàn hệ thống; link vào Search; kệ preview theo ID thay raw label. **HomePage.module.css đang WIP, chỉ patch vùng được phối hợp.** |
| A Chi tiết | `pages/BookDetailPage.tsx`, `.module.css`; helper/view classification chung nếu cần | Hiển thị category/genre/series/facet có thật; link search; ngôn ngữ lấy label chung. |
| B Cards | `components/BookCard.tsx`, `HomeBookCard.tsx`, `services/public-listings.ts` | Giữ card gọn/3D; category label đồng bộ, không hardcode bản tiếng Anh nếu preview có thêm ngôn ngữ. Parser optional/generic hiện đã hỗ trợ. |
| A Đăng sách | `pages/SellBookPage.tsx`, `services/listing-submission.ts` | Context v2/preview review, validation/payload cố định theo attempt; picked catalog giữ nguyên metadata/bookId; field tùy chọn không biết để trống. |
| B Catalog picker | `components/CatalogBookPicker.tsx` | Parser/presentation category mới, truyền metadata đã chọn; có thể thêm breadcrumb giúp phân biệt đầu sách. Không sửa catalog Confirmed. |
| A Admin reader | `apps/admin-web/src/features/review/readers.tsx`, `contracts.ts` | Nhãn/breadcrumb/profile đúng, metadata unknown/legacy đọc được; coi `category` là Danh mục. Không có edit trực tiếp khi Confirm/Reject. |
| A Preview | `data/preview-catalog.json`, `preview-classification.ts`, `scripts/refresh-preview-catalog.mjs` trong user-web | Curate category/facet đủ nhóm, loại bỏ suy mặc định thiếu cơ sở, nguồn/edition không trùng; refresh giữ classification đã biên tập. |
| A RN bảo toàn dữ liệu | `apps/mobile-react-native/src/features/drafts/catalog-picker.tsx`, `features/shelf/contracts.ts` | Parse optional classification, giữ khi chỉnh đề nghị bị Reject/resubmit; input legacy vẫn được chấp nhận. Không strip metadata từ web rồi gửi mất dữ liệu. |
| C RN trải nghiệm đầy đủ | `features/shelf/filters.ts`, `filters.test.ts`, `shelf-filter-sheet.tsx`, `shelf-screen.tsx`, `shelf-controls.tsx`, `book-presentation.tsx`, `book-screen.tsx`; catalog picker edit | Shared vocabulary + primitive RN, filter count/query/reset/cursor/nativeBack/keyboard/chữ lớn; nghiệm thu Android riêng. |
| B Projection phụ | API `wishlist/wishlist.service.ts`, `orders/orders.service.ts`; RN `wishlist/contracts.ts` | Hiện copy metadata cũ thiếu optional classification, wishlist còn cast/shape riêng. Không làm field mới mandatory khiến reader vỡ. Muốn hiển thị/filter ở wishlist phải sửa contract/parser đúng; không opportunistically viết lại toàn module. Order snapshot lịch sử giữ bất biến. |
| C Đấu giá | API `auctions/auction-book.service.ts`, contract `PublicAuctionBook`, web `services/auctions.ts`, `AuctionListPage`/`AuctionDetailPage` | Hiện projection không có classification. Nếu thêm lọc/chi tiết đấu giá cần đọc **catalogRevisionId đã intake**, không metadata catalog hiện hành. Gói lõi chưa thêm auction filter và không đổi price/settlement. |
| B Import/demo | `apps/api/src/database/mongo/import/postgres-import.ts`, `scripts/demo/books.mjs`, `scripts/android-pilot/fixtures.mjs` | Giữ import PG lịch sử/legacy metadata hợp lệ. Fixture mới có classification để kiểm demo khi cần; không sửa SQL migrations hoặc seed máy chính. |
| A Tests | API `test/catalog-classification.spec.ts`, `listing-review.e2e-spec.ts`, `catalog-drafts.e2e-spec.ts`, `mongo/schema.mongo-spec.ts`; web `CatalogClassificationFields.test.tsx`, `catalog-search.test.ts`, `listing-submission.test.ts` | Semantic v2/tương thích, schema/DB/full shelf/cursor, form/payload/retry; thêm test menu/profile/data coverage có ý nghĩa. |
| A Tài liệu | ADR nối0033, `CATALOG_CONTEXTUAL_FILTERS.md`, surface briefs/UI_COMPONENTS nếu có component mới, `SESSION_STATE.md` | Phân biệt proposed/implemented, dữ liệu/consumer/gate còn thiếu; không dùng số nút hoặc test cũ làm bằng chứng gói mới. |

Không cần sửa auth/session/mail/chat/notifications/wallet/carrier/settlement,
hero hay tên thương hiệu cho tính năng này. Price-assist hiện nhận category
label: kiểm tương thích, giữ nguyên quy tắc không suy giá chuẩn từ thể loại.

## 8. Dữ liệu demo và kiểm chứng

Hai nguồn được phân biệt:

- **Preview UI**: snapshot biên tập, có nguồn sách/bìa; giá/tình trạng là mẫu.
  Không nhập preview vào catalog thật, không thay API lỗi bằng sample.
- **QA end-to-end**: DB `*_test` replica set riêng, đầu sách gửi và Confirm,
  listing đủ điều kiện và duyệt thật qua API. Mỗi root có nhiều trường hợp;
  có nhiều hơn một trang, mục không có kết quả, metadata cũ và metadata thiếu.

Dataset phục vụ nghiệm thu cần mỗi root ít nhất3–5 mẫu có metadata phù hợp,
đủ các nhánh quan trọng và những tổ hợp đối nghịch để chứng minh OR/AND.
Không khẳng định phủ mọi72 node chỉ bằng mỗi root một sách. Những node không
có sách demo vẫn truy cập được và có empty state; không dựng count giả.

Manga có các audience/genre khác nhau; ngoại ngữ có Nhật/Anh/Trung/Hàn/Pháp/
Đức, sách dạy ngoại ngữ viết bằng tiếng Việt; giáo khoa đủ primary/secondary/
high/university; kinh tế có marketing và accounting; các root mới có dữ liệu
thực sự phân biệt. Giá/tình trạng tạo trong QA rõ là mô phỏng.

## 9. Thứ tự triển khai và tiêu chí hoàn tất

| Giai đoạn | Sản phẩm cần đạt | Điều kiện chuyển tiếp |
| --- | --- | --- |
| 1. Chốt vocabulary | Root/con/options/context/capability/alias v2 và ma trận dữ liệu mẫu; giữ v1 | Mỗi trường có ý nghĩa, không trùng category/facet, mọi dependency có ca hợp lệ/không hợp lệ; duyệt scope72 mã. |
| 2. Contract + migration | OpenAPI/generated types, parity tests, migration additive và schema hiện hành | Fresh DB + upgrade v1 PASS; checksum0016 giữ; đọc/kiểm revision cũ không lỗi; app role vẫn không update/delete revision. |
| 3. API lọc/write | Context search/write, descendants/capabilities, scope cursor | GETcatalog/listing parity, lọc trước limit, query cha mới, invalid422, replay/idempotency và review giữ đúng invariant. |
| 4. Web/Admin/RN bảo toàn | Menu/Home/Search/Detail/Sell/reader đồng bộ; RN resubmit không mất metadata | Keyboard/mobile/draft/Back/clear/phụ thuộc/focus; người duyệt thấy đúng bản được gửi; nhập lỗi giữ dữ liệu. |
| 5. Dataset và nghiệm thu | Preview đã curate + QA fixture đa dạng, build/checks/evidence, docs | Demo một hành trình complete: tìm→lọc→chi tiết→đề nghị→duyệt→listing searchable; không DB chính, không metadata giả khi unknown. |
| 6. Gói tiếp theo | RN UI đầy đủ; counts nếu cần; Admin CRUD; correction workflow | Từng gói có scope/contract/ADR/quyền và nghiệm thu riêng. Không kéo cả bốn vào core. |

Các bộ kiểm cần chạy khi triển khai:

1. Contract generate/check/routes; parity taxonomy/schema; UI/API/Admin/RN
   typecheck, lint, build đúng diff; unit shared rules và các consumer sửa.
2. Mongo validator fresh/upgrade v1; append-only quyền; giữ data/checksum.
3. HTTP catalog/listing: parent/con, OR/AND, ngành không phù hợp, payload lạ/
   duplicates/>16 values, ID/alias/Unicode, language of edition, no attribute,
   cursor khác filter bị từ chối và thứ tự set không đổi scope; eligibility cũ.
4. Mutation/review: classification persisted cùng revision, metadata nhập
   sai không ghi; self-review/stale version từ chối, Rejected resubmit, retry
   cùng key/body và unknown-response không đổi classification frozen.
5. Web browser1366×768,1280×720,390×844,320px và zoom200%: menu toàn bộ root,
   sidebar vừa/dài, option cuối truy cập được, tìm không dấu, chip/Back/URL,
   clear dependency, giữ draft, native mobile select/dialog, scroll lock/focus.
6. Dataset chứng minh tìm toàn bộ shelf nhiều trang, không chỉ lọc trang đã
   tải. Đo query trên fixture lớn và ghi `explain` trước bổ sung index.
7. Nếu sửa RN UI, Android runtime/TalkBack/chữ lớn/Back/keyboard cần evidence
   riêng; typecheck/Expo web không thay native PASS. Review UI theo bounded
   Impeccable finish workflow; không lấy detector thay behavioral QA.

Count cạnh option là gói sau. Nếu làm, API phải aggregate trên cùng public
eligibility/filter scope, nêu đếm listing hay đầu sách, OR/AND self-exclusion,
và không lộ listing riêng. Không lấy count từ trang20/24 item hoặc đếm toàn
catalog rồi gọi là sách đang bán.

## 10. Các điểm cần giữ khi duyệt

- Tớ đề xuất duyệt gói lõi1–5, giữ72 mã đề xuất và profile theo nhóm; vẫn được
  chỉnh danh sách tên trước implementation. Gói6 là backlog riêng.
- Hỗ trợ facet ở category cha sẽ đổi hành vi hiện đang422, nên phải duyệt rõ
  cùng kế hoạch; không thay test đơn thuần để làm implementation mới xanh.
- V2 chưa phân loại lại Confirmed cũ. `resubmitCatalogRequest` hiện chỉ nhận
  **Rejected**; không có API correction cho Confirmed. Muốn sửa sách cũ cần
  workflow/ADR riêng, giữ revision lịch sử, snapshot order/intake/receipt.
- Admin quản trị vocabulary runtime cần schema/config-version/audit/quyền,
  ngăn xóa mã đang dùng và cơ chế publish/cache client. Để sau phù hợp phạm vi
  hiện tại; nếu đưa vào đồ án ngay thì phải coi là một feature riêng.

## 11. Tham khảo và giới hạn rà soát

Đã đọc ba trang Fahasa do chủ dự án từng gửi:
[Tiếng Nhật](https://www.fahasa.com/sach-trong-nuoc/sach-hoc-ngoai-ngu/tieng-nhat.html),
[Light Novel](https://www.fahasa.com/sach-trong-nuoc/van-hoc-trong-nuoc/light-novel.html),
[Marketing/Bán hàng](https://www.fahasa.com/sach-trong-nuoc/kinh-te-chinh-tri-phap-ly/marketing-ban-hang.html).
Trang Nhật có các nhóm ngôn ngữ, trình độ/kỹ năng; LN có Genres và nhóm sách.
Parsed HTML trang Marketing cũng trả Shounen/Action; không dùng việc này để
kết luận genre manga hợp với kinh tế. Tham khảo cách chia nhóm và Xem thêm,
chỉ đưa facet có ý nghĩa với sản phẩm Lật lại. HTML có phần phụ thuộc JS nên
lượt này không là nghiệm thu tương tác/filter/count của Fahasa.

Rà soát này gồm source/contract/ADR/migrations/tests hiện có, dữ liệu preview,
và read-only vocabulary statistics. **Chưa sửa chức năng, chưa chạy migration,
không đụng DB chính, chưa chạy test sản phẩm hay QA browser mới.** Các bước
kiểm ở mục9 là kế hoạch tương lai, không phải PASS của tính năng v2.
