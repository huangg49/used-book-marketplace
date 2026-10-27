import { useRef, useState } from "react";
import { ActionPanel } from "./action-panel";
import { reclaimLabels, type Intake } from "./contracts";
import type { ActionContext } from "./queue-panel";

// N4-02: the assigned Staff member receives, inspects, opens or hands back one
// intake. Every rule is checked again by the API (assignment, deadline, state).

const SHELF = /^[A-Z0-9-]{1,20}$/;

type Props = { item: Intake } & ActionContext;
const base = (item: Intake) => `/operations/auction-intakes/${item.id}`;

export function IntakeReceive({ item, ...context }: Props) {
  const [shelf, setShelf] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const code = shelf.trim();
  return (
    <ActionPanel
      {...context}
      label="Nhận sách đấu giá"
      title="Nhận sách tại quầy."
      intro="Chỉ xác nhận khi người bán đã giao tận tay cuốn sách. Ghi đúng mã kệ nơi đặt sách để tìm lại khi kiểm tra."
      dirty={shelf !== ""}
      fields={(locked) => (
        <>
          <div className="field">
            <label htmlFor={`shelf-${item.id}`}>Mã kệ</label>
            <input
              id={`shelf-${item.id}`}
              ref={input}
              value={shelf}
              disabled={locked}
              autoComplete="off"
              maxLength={20}
              aria-invalid={invalid}
              aria-describedby={`shelf-hint-${item.id}`}
              onChange={(event) => {
                setShelf(event.target.value.toUpperCase());
                setInvalid(false);
              }}
            />
          </div>
          <p
            id={`shelf-hint-${item.id}`}
            className={invalid ? "field-error" : "muted"}
          >
            {invalid
              ? "Mã kệ gồm 1–20 ký tự: chữ in hoa, số hoặc dấu gạch ngang, ví dụ A-01."
              : "Ví dụ A-01. Chữ in hoa, số hoặc dấu gạch ngang."}
          </p>
        </>
      )}
      validate={() => {
        if (SHELF.test(code)) return true;
        setInvalid(true);
        input.current?.focus();
        return false;
      }}
      submitLabel="Xác nhận đã nhận sách"
      confirmTitle="Xác nhận đã nhận sách?"
      confirmBody={
        <p>
          Cuốn “{item.title}” sẽ được ghi nhận đang ở kệ <strong>{code}</strong>{" "}
          của điểm, theo giờ máy chủ. Bước tiếp theo là kiểm tra tình trạng.
        </p>
      }
      build={() => ({
        path: `${base(item)}/receive`,
        body: { expectedVersion: item.version, shelfCode: code },
      })}
      interpret={() => ({
        tone: "success",
        text: `Đã nhận “${item.title}” vào kệ ${code}. Hãy kiểm tra tình trạng sách.`,
        close: true,
      })}
    />
  );
}

export function IntakeReclaim({ item, ...context }: Props) {
  return (
    <ActionPanel
      {...context}
      label="Trả sách cho người bán"
      title="Trả sách cho người bán."
      intro={`Lý do: ${item.reclaimReason ? reclaimLabels[item.reclaimReason] : "cần trả sách"}. Chỉ xác nhận khi người bán đã nhận lại cuốn sách tại quầy.`}
      submitLabel="Xác nhận đã trả sách"
      confirmTitle="Xác nhận đã trả sách?"
      confirmBody={
        <p>
          Cuốn “{item.title}” sẽ được ghi nhận đã rời điểm và về lại người bán.
          Thao tác này không hoàn tác được.
        </p>
      }
      build={() => ({
        path: `${base(item)}/reclaim`,
        body: { expectedVersion: item.version },
      })}
      interpret={() => ({
        tone: "success",
        text: `Đã ghi nhận trả “${item.title}” cho người bán.`,
        close: true,
      })}
    />
  );
}
