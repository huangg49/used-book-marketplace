import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  Check,
  Search,
  Scale,
  MapPin,
  X,
  AlertCircle,
  BookPlus,
} from "lucide-react";
import { BrandIcon } from "../BrandIcon";
import { ApiError } from "@used-books/session-client";
import { session } from "../../lib/session";
import {
  getMyListings,
  getMyBookIdentity,
  getMyPhoto,
} from "../../services/my-listings";
import { exchangeSchema } from "../../services/exchange";
import type { PurchaseConversation } from "../../services/purchase-conversations";
import type { PublicListing } from "../../services/public-listings";
import { FilterSelect } from "../FilterSelect";
import { BookCover } from "../BookCover";
import { formatVnd, ROUTES } from "../../lib/routes";
import styles from "./ExchangeOffer.module.css";

const addressSchema = z.object({
  version: z.number().int().optional().default(0),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      recipientName: z.string(),
      phone: z.string().optional(),
      localityCode: z.string().optional(),
      serviceAreaCode: z.string().optional(),
      detail: z.string(),
      isDefault: z.boolean(),
    }),
  ),
});

const serviceAreasSchema = z.object({
  code: z.string(),
  name: z.string().optional(),
  demoOnly: z.boolean().optional(),
  localities: z.array(z.object({ code: z.string(), label: z.string() })),
});

const addressReceiptSchema = z.object({
  addressId: z.string().uuid(),
  version: z.number().int(),
});

const CONDITION_LABELS: Record<string, string> = {
  LikeNew: "Như mới",
  Good: "Rất tốt",
  Fair: "Chấp nhận được",
  Worn: "Cũ",
};

interface InventoryItem {
  id: string;
  value: number;
  condition: string | null;
  book: {
    title: string;
    authors: string[];
    category?: string;
  };
  coverUrl?: string;
}

function checkMatch(
  myBook: { title: string; authors: string[]; category?: string },
  pref?: {
    targetCategory?: string | null;
    targetAuthor?: string | null;
    targetDescription?: string | null;
  } | null,
) {
  if (!pref) return null;
  const reasons: string[] = [];
  const authorStr = myBook.authors.join(", ");
  if (
    pref.targetAuthor &&
    pref.targetAuthor.trim() &&
    authorStr.toLowerCase().includes(pref.targetAuthor.toLowerCase().trim())
  ) {
    reasons.push(`Khớp tác giả "${pref.targetAuthor}"`);
  }
  if (
    pref.targetCategory &&
    pref.targetCategory.trim() &&
    myBook.category &&
    (myBook.category.toLowerCase().includes(pref.targetCategory.toLowerCase().trim()) ||
      pref.targetCategory.toLowerCase().includes(myBook.category.toLowerCase().trim()))
  ) {
    reasons.push(`Khớp thể loại "${pref.targetCategory}"`);
  }
  if (pref.targetDescription && pref.targetDescription.trim()) {
    const descWords = pref.targetDescription
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    if (descWords.some((w) => myBook.title.toLowerCase().includes(w))) {
      reasons.push("Khớp tiêu chí mong muốn");
    }
  }
  return reasons.length > 0 ? reasons.join(" · ") : null;
}

async function inventory(): Promise<InventoryItem[]> {
  const rows = [];
  let cursor: string | undefined;
  do {
    const page = await getMyListings("Approved", cursor, 50);
    rows.push(
      ...page.items.filter(
        (row) =>
          row.state.trade === "Available" &&
          row.state.visibility === "Visible" &&
          ["Both", "Exchange"].includes(row.currentRevision.content.mode ?? ""),
      ),
    );
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return Promise.all(
    rows.map(async (row) => {
      const bookId =
        row.currentRevision.bookId ?? row.currentRevision.content.bookId;
      if (!bookId) throw new Error("Bài đăng thiếu thông tin sách.");
      const book = await getMyBookIdentity(bookId, row.catalogStatus);
      let coverUrl: string | undefined;
      const photo = row.currentRevision.content.mediaIds?.[0];
      if (photo) {
        try {
          coverUrl = (await getMyPhoto(row.id, photo)).url;
        } catch {
          /* optional cover */
        }
      }
      return {
        id: row.id,
        value: row.currentRevision.content.exchangeValue ?? 0,
        condition: row.currentRevision.content.condition ?? null,
        book: {
          title: book.title,
          authors: book.authors,
          category: book.category,
        },
        coverUrl,
      };
    }),
  );
}

export function ExchangeOffer({
  room,
  userId,
  book,
  refresh,
}: {
  room: PurchaseConversation;
  userId: string;
  book: PublicListing;
  refresh: () => void;
}) {
  const buyer = room.buyer.id === userId;
  const mine = useQuery({
    queryKey: ["conversation-exchange-inventory", userId],
    queryFn: inventory,
    enabled: buyer,
    retry: false,
  });
  const addresses = useQuery({
    queryKey: ["conversation-addresses", userId],
    queryFn: () => session.request("/me/addresses", addressSchema),
    enabled: buyer,
    retry: false,
  });
  const serviceAreas = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => session.request("/service-areas", serviceAreasSchema),
    enabled: buyer,
    staleTime: 60_000,
  });

  const [chosen, setChosen] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<{ body: object; key: string } | null>(null);

  // Form thêm địa chỉ mới trực tiếp tại chỗ
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newLocality, setNewLocality] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressError, setAddressError] = useState("");

  const handleSaveNewAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameTrim = newName.trim();
    const phoneTrim = newPhone.trim();
    const detailTrim = newDetail.trim();

    if (nameTrim.length < 2) {
      setAddressError("Vui lòng nhập họ và tên người nhận (ít nhất 2 ký tự).");
      return;
    }
    if (!/^0\d{9}$/.test(phoneTrim)) {
      setAddressError("Số điện thoại nhận hàng phải gồm đúng 10 chữ số (bắt đầu bằng 0).");
      return;
    }
    if (!newLocality) {
      setAddressError("Vui lòng chọn Khu vực / Quận huyện.");
      return;
    }
    if (detailTrim.length < 5) {
      setAddressError("Địa chỉ chi tiết phải có ít nhất 5 ký tự (số nhà, tên đường...).");
      return;
    }

    setAddressSaving(true);
    setAddressError("");
    try {
      const saved = await session.request("/me/addresses", addressReceiptSchema, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          expectedBookVersion: addresses.data?.version ?? 0,
          address: {
            recipientName: nameTrim,
            phone: phoneTrim,
            localityCode: newLocality,
            detail: detailTrim,
            serviceAreaCode: serviceAreas.data?.code ?? "HCM-DEMO-v1",
          },
          makeDefault: false,
        }),
      });
      await addresses.refetch();
      setAddress(saved.addressId);
      setShowAddAddress(false);
      setNewName("");
      setNewPhone("");
      setNewLocality("");
      setNewDetail("");
    } catch (err) {
      setAddressError(
        err instanceof ApiError && err.message
          ? err.message
          : "Không thể lưu địa chỉ mới. Vui lòng thử lại.",
      );
    } finally {
      setAddressSaving(false);
    }
  };

  const pref = book.exchangePreferences;

  const processedBooks = useMemo(() => {
    if (!mine.data) return [];
    return mine.data
      .map((item) => ({
        ...item,
        matchReason: checkMatch(item.book, pref),
      }))
      .sort((a, b) => {
        if (a.matchReason && !b.matchReason) return -1;
        if (!a.matchReason && b.matchReason) return 1;
        return 0;
      });
  }, [mine.data, pref]);

  const filteredBooks = useMemo(() => {
    if (!search.trim()) return processedBooks;
    const q = search.trim().toLowerCase();
    return processedBooks.filter(
      (item) =>
        item.book.title.toLowerCase().includes(q) ||
        item.book.authors.some((author) => author.toLowerCase().includes(q)),
    );
  }, [processedBooks, search]);

  if (!buyer)
    return (
      <div className={styles.waitingPrompt}>
        <h3>Chờ người mua chọn sách đem đổi</h3>
        <p>
          Đề nghị và tiền bù sẽ hiện trên phiếu này. Bạn kiểm tra rồi quyết định
          chấp nhận hoặc đề xuất lại.
        </p>
      </div>
    );

  if (mine.isPending || addresses.isPending)
    return (
      <div className={styles.exchangeOffer}>
        <p role="status">Đang tải kệ sách và nơi nhận của bạn…</p>
      </div>
    );

  if (mine.isError || addresses.isError)
    return (
      <div className={styles.exchangeOffer} role="alert">
        <p>Chưa tải được dữ liệu để đổi sách.</p>
        <button
          type="button"
          onClick={() => {
            void mine.refetch();
            void addresses.refetch();
          }}
        >
          Thử tải lại
        </button>
      </div>
    );

  const selected = mine.data?.filter((x) => chosen.includes(x.id)) ?? [];
  const total = selected.reduce((n, b) => n + b.value, 0);
  const difference = (book.exchangeValue ?? 0) - total;
  const addressId =
    address ||
    addresses.data?.items.find((a) => a.isDefault)?.id ||
    addresses.data?.items[0]?.id ||
    "";

  const toggleBook = (id: string) => {
    setChosen((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  async function submit() {
    if (busy) return;
    if (!attempt.current && (!chosen.length || !addressId)) {
      setError("Vui lòng chọn ít nhất 1 cuốn sách đem đổi và địa chỉ nhận.");
      return;
    }
    attempt.current ??= {
      key: crypto.randomUUID(),
      body: {
        conversationId: room.id,
        expectedConversationVersion: room.version,
        initiatorListingIds: chosen,
        recipientListingId: room.listingId,
        deliveryAddressId: addressId,
      },
    };
    setBusy(true);
    setError("");
    try {
      await session.request("/exchanges", exchangeSchema, {
        method: "POST",
        headers: { "Idempotency-Key": attempt.current.key },
        body: JSON.stringify(attempt.current.body),
      });
      attempt.current = null;
      setUncertain(false);
      refresh();
    } catch (e) {
      const terminal =
        e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status);
      if (terminal) {
        attempt.current = null;
        setUncertain(false);
        refresh();
        void mine.refetch();
      } else setUncertain(true);
      setError(
        terminal
          ? "Sách hoặc điều kiện vừa thay đổi. Kiểm tra lại phiếu; lựa chọn của bạn vẫn được giữ."
          : "Chưa xác nhận được đề nghị đã gửi. Thử lại sẽ dùng đúng yêu cầu này.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.exchangeOffer} aria-label="Chọn sách đem đổi">
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h3>Sách bạn đem đổi</h3>
          <p className={styles.subtitle}>
            Chọn 1 hoặc nhiều cuốn từ kệ của bạn để ghép đổi
          </p>
        </div>
        <span
          className={styles.selectionChip}
          data-active={chosen.length > 0 ? "true" : undefined}
        >
          {chosen.length > 0 ? `Đã chọn ${chosen.length} cuốn` : "Chưa chọn sách"}
        </span>
      </div>

      {!mine.data?.length ? (
        <div className={styles.emptyState}>
          <p>Kệ sách của bạn chưa có cuốn nào ở trạng thái sẵn sàng đổi.</p>
          <Link to={ROUTES.sell} className={styles.emptyAction}>
            <BookPlus size={16} /> Đăng sách mới
          </Link>
        </div>
      ) : (
        <>
        <fieldset className={styles.fieldset} disabled={busy || uncertain}>
          {mine.data.length > 2 && (
            <div className={styles.searchBox}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Tìm theo tên sách hoặc tác giả..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className={styles.clearSearch}
                  aria-label="Xóa tìm kiếm"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          <div className={styles.inventory}>
            {filteredBooks.length === 0 ? (
              <div className={styles.emptySearch}>
                <p>Không tìm thấy cuốn sách nào khớp với từ khóa.</p>
                <button type="button" onClick={() => setSearch("")}>
                  Hiển thị tất cả
                </button>
              </div>
            ) : (
              filteredBooks.map((item, idx) => {
                const isSelected = chosen.includes(item.id);
                const conditionText = item.condition
                  ? CONDITION_LABELS[item.condition] ?? item.condition
                  : null;

                return (
                  <label
                    key={item.id}
                    className={styles.bookCard}
                    data-selected={isSelected ? "true" : undefined}
                    data-matched={item.matchReason ? "true" : undefined}
                  >
                    <input
                      type="checkbox"
                      className={styles.hiddenCheckbox}
                      checked={isSelected}
                      onChange={() => toggleBook(item.id)}
                    />
                    <div className={styles.checkboxIndicator}>
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>

                    <div className={styles.coverWrap}>
                      <BookCover
                        title={item.book.title}
                        coverUrl={item.coverUrl}
                        index={idx}
                        className={styles.cardCover}
                      />
                    </div>

                    <div className={styles.bookInfo}>
                      <h4 className={styles.bookTitle}>{item.book.title}</h4>
                      <p className={styles.bookAuthor}>
                        {item.book.authors.join(", ")}
                      </p>
                      {item.matchReason && (
                        <div className={styles.matchedBadge}>
                          <BrandIcon size={13} />
                          <span>{item.matchReason}</span>
                        </div>
                      )}
                      <div className={styles.metaRow}>
                        {conditionText && (
                          <span className={styles.conditionBadge}>
                            {conditionText}
                          </span>
                        )}
                        <span className={styles.valueTag}>
                          {formatVnd(item.value)}
                        </span>
                      </div>
                    </div>
                  </label>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className={styles.balanceCard}>
              <div className={styles.balanceHeader}>
                <div className={styles.balanceHeaderLeft}>
                  <Scale size={16} />
                  <span>Cân đối giá trị trao đổi</span>
                </div>
              </div>

              <div className={styles.balanceRow}>
                <span>Sách bạn muốn nhận</span>
                <strong>{formatVnd(book.exchangeValue ?? 0)}</strong>
              </div>
              <div className={styles.balanceRow}>
                <span>Sách bạn gửi ({selected.length} cuốn)</span>
                <strong>{formatVnd(total)}</strong>
              </div>

              <div className={styles.balanceDivider} />

              <div className={styles.balanceResult}>
                <span className={styles.balanceResultLabel}>
                  {difference > 0
                    ? "Bạn cần bù thêm"
                    : difference < 0
                      ? "Đối tác bù cho bạn"
                      : "Trạng thái"}
                </span>
                <span
                  className={`${styles.balanceBadge} ${
                    difference > 0
                      ? styles.badgePay
                      : difference < 0
                        ? styles.badgeReceive
                        : styles.badgeEqual
                  }`}
                >
                  {difference > 0
                    ? formatVnd(difference)
                    : difference < 0
                      ? formatVnd(-difference)
                      : "Đổi ngang giá (0 ₫)"}
                </span>
              </div>
            </div>
          )}

          <div className={styles.addressSection}>
            <div className={styles.addressHeader}>
              <span className={styles.addressLabel}>
                <MapPin size={15} /> Địa chỉ nhận sách của bạn
              </span>
              <button
                type="button"
                className={styles.addAddressToggle}
                onClick={() => {
                  setShowAddAddress(!showAddAddress);
                  setAddressError("");
                }}
              >
                {showAddAddress ? "Đóng form" : "+ Thêm địa chỉ mới"}
              </button>
            </div>

            {showAddAddress ? (
              <form
                className={styles.addAddressCard}
                onSubmit={handleSaveNewAddress}
              >
                <h4>Thêm địa chỉ giao nhận mới</h4>
                <div className={styles.formGrid}>
                  <div className={styles.formField}>
                    <label htmlFor="new-addr-name">Họ và tên người nhận</label>
                    <input
                      id="new-addr-name"
                      type="text"
                      placeholder="Ví dụ: Nguyễn Văn A"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      disabled={addressSaving}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label htmlFor="new-addr-phone">Số điện thoại</label>
                    <input
                      id="new-addr-phone"
                      type="tel"
                      placeholder="0912345678"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      disabled={addressSaving}
                    />
                  </div>
                </div>

                <div className={styles.formField}>
                  <label htmlFor="new-addr-locality">Quận / Huyện (TP.HCM)</label>
                  <select
                    id="new-addr-locality"
                    value={newLocality}
                    onChange={(e) => setNewLocality(e.target.value)}
                    disabled={addressSaving}
                  >
                    <option value="">-- Chọn Quận / Huyện --</option>
                    {serviceAreas.data?.localities.map((loc) => (
                      <option key={loc.code} value={loc.code}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formField}>
                  <label htmlFor="new-addr-detail">Địa chỉ chi tiết</label>
                  <input
                    id="new-addr-detail"
                    type="text"
                    placeholder="Số nhà, tên đường, phường..."
                    value={newDetail}
                    onChange={(e) => setNewDetail(e.target.value)}
                    disabled={addressSaving}
                  />
                </div>

                {addressError && (
                  <p role="alert" className={styles.addressError}>
                    {addressError}
                  </p>
                )}

                <div className={styles.addAddressActions}>
                  <button
                    type="submit"
                    className={styles.saveAddressBtn}
                    disabled={addressSaving}
                  >
                    {addressSaving ? "Đang lưu..." : "Lưu & chọn địa chỉ này"}
                  </button>
                  <button
                    type="button"
                    className={styles.cancelAddressBtn}
                    disabled={addressSaving}
                    onClick={() => {
                      setShowAddAddress(false);
                      setAddressError("");
                    }}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            ) : addresses.data?.items.length ? (
              <FilterSelect
                id={`exchange-address-${room.id}`}
                label=""
                value={addressId}
                options={addresses.data.items.map((a) => ({
                  value: a.id,
                  label: `${a.recipientName} · ${a.detail}`,
                }))}
                onChange={setAddress}
              />
            ) : (
              <p>
                Chưa có địa chỉ nào. Bấm <strong>+ Thêm địa chỉ mới</strong> ở trên để tạo địa chỉ nhận sách.
              </p>
            )}
          </div>

        </fieldset>
          <p className={styles.helpText}>
            Gửi đề nghị chưa giữ sách. Hệ thống sẽ giữ tiền cọc bảo chứng và tiền
            bù sau khi hai bên chốt trao đổi.
          </p>

          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy || (!uncertain && (!chosen.length || !addressId))}
            onClick={() => void submit()}
          >
            {busy
              ? "Đang gửi đề nghị…"
              : uncertain
                ? "Thử lại đề nghị trước"
                : chosen.length > 0
                  ? `Gửi đề nghị đổi sách (${chosen.length} cuốn)`
                  : "Chọn sách đem đổi để tiếp tục"}
          </button>
        </>
      )}

      {error && (
        <div role="alert" className={styles.error}>
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}
