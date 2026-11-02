import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "../../ConfirmDialog";
import { getMyListings } from "../../../services/my-listings";
import { getPublicListing } from "../../../services/public-listings";
import { exchangeActor } from "../../../services/exchange";
import { formatVnd } from "../../../lib/routes";
import styles from "./CounterDialog.module.css";

export interface CounterOfferData {
  listingIds?: string[];
  negotiatedDiffAmount?: number;
  diffPayerId?: string | null;
  deliveryAddressId?: string;
  note?: string;
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CounterOfferData) => Promise<void>;
  isBusy: boolean;
  viewerRole: "proposer" | "recipient";
  partnerName: string;
  partnerBookValue: number;
  currentListingIds: string[];
  currentAddressId?: string;
}
export function CounterDialog(props: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const actor = exchangeActor().id;
  const candidates = useInfiniteQuery({
    queryKey: ["exchange-replacement-books", actor],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await getMyListings("Approved", pageParam, 20);
      const eligible = page.items.filter(
        (item) =>
          item.channel === "Marketplace" &&
          item.state.trade === "Available" &&
          item.state.visibility === "Visible" &&
          ["Exchange", "Both"].includes(
            item.currentRevision.content.mode ?? "",
          ) &&
          !item.currentRevision.content.bundle,
      );
      const items = await Promise.all(
        eligible.map(async (item) => ({
          id: item.id,
          listing: await getPublicListing(item.id),
        })),
      );
      return { items, nextCursor: page.nextCursor };
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: props.isOpen,
    retry: false,
  });
  const items =
    candidates.data?.pages
      .flatMap((page) => page.items)
      .filter((item) => !props.currentListingIds.includes(item.id)) ?? [];
  const ownValue = items
    .filter((item) => selected.includes(item.id))
    .reduce((sum, item) => sum + (item.listing.exchangeValue ?? 0), 0);
  const diff = Math.abs(ownValue - props.partnerBookValue);
  const submit = async () => {
    if (!selected.length) {
      setError("Chọn sách thay thế trước khi gửi.");
      return;
    }
    setError("");
    try {
      await props.onSubmit({
        listingIds: selected,
        note: note.trim() || undefined,
        deliveryAddressId: props.currentAddressId,
      });
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Chưa gửi được đề xuất. Hãy thử lại.",
      );
    }
  };
  return (
    <ConfirmDialog
      isOpen={props.isOpen}
      onClose={props.onClose}
      title="Đề xuất sách thay thế"
      description={
        "Chọn sách khác của bạn để gửi cho " +
        props.partnerName +
        ". Tiền bù tự tính theo giá trị đã duyệt; đối tác phải chấp nhận đề xuất mới."
      }
      confirmText="Gửi đề xuất sách mới"
      isBusy={props.isBusy || candidates.isFetching}
      onConfirm={() => void submit()}
    >
      <div className={styles.selectionBody}>
        <p>
          {props.viewerRole === "proposer"
            ? "Chọn từ 1 đến 5 sách."
            : "Chọn đúng 1 sách."}{" "}
          Bạn có thể chọn địa chỉ nhận khi chấp nhận đề xuất.
        </p>
        {candidates.isPending && <p role="status">Đang tải sách…</p>}
        {candidates.isError && (
          <div role="alert">
            <p>Chưa tải được sách, không thể xác nhận danh sách trống.</p>
            <button type="button" onClick={() => void candidates.refetch()}>
              Tải lại sách
            </button>
          </div>
        )}
        {!candidates.isPending && !candidates.isError && !items.length && (
          <p>Chưa có sách thay thế đủ điều kiện trong phần đã tải.</p>
        )}
        <div className={styles.choices}>
          {items.map(({ id, listing }) => (
            <label key={id} className={styles.bookChoice}>
              <input
                type="checkbox"
                value={id}
                checked={selected.includes(id)}
                disabled={
                  props.isBusy ||
                  (!selected.includes(id) &&
                    selected.length >=
                      (props.viewerRole === "proposer" ? 5 : 1))
                }
                onChange={() =>
                  setSelected((old) =>
                    old.includes(id)
                      ? old.filter((value) => value !== id)
                      : [...old, id],
                  )
                }
              />
              <span>
                {listing.book.title}
                <br />
                <strong>{formatVnd(listing.exchangeValue ?? 0)}</strong>
              </span>
            </label>
          ))}
        </div>
        {candidates.hasNextPage && (
          <button
            type="button"
            disabled={candidates.isFetching}
            onClick={() => void candidates.fetchNextPage()}
          >
            Tải thêm sách
          </button>
        )}
        {selected.length > 0 && (
          <div role="status">
            <p>
              Sách bạn giao: {formatVnd(ownValue)} · Sách bạn nhận:{" "}
              {formatVnd(props.partnerBookValue)}
            </p>
            <p>
              {diff === 0
                ? "Trao đổi ngang giá"
                : (ownValue < props.partnerBookValue
                    ? "Bạn bù "
                    : "Đối tác bù ") + formatVnd(diff)}
            </p>
          </div>
        )}
        <label>
          Lời nhắn (tùy chọn)
          <textarea
            maxLength={500}
            value={note}
            disabled={props.isBusy}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
      </div>
    </ConfirmDialog>
  );
}
