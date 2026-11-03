import { useRef, useState } from "react";
import { ActionPanel } from "./action-panel";
import { reclaimLabels, type Intake } from "./contracts";
import type { ActionContext } from "./queue-panel";

// N4-02: the assigned Staff member receives, inspects, opens or hands back one
// intake. Every rule is checked again by the API (assignment, deadline, state).

const SHELF = /^[A-Z0-9-]{1,20}$/;
// Per-desk convenience only: the last shelves used on this browser.
const RECENT_KEY = "latlai.recentShelves";
const recentShelves = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v) => typeof v === "string" && SHELF.test(v)).slice(0, 5) : [];
  } catch {
    return [];
  }
};
const rememberShelf = (code: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([code, ...recentShelves().filter((v) => v !== code)].slice(0, 5)));
  } catch {
    /* storage unavailable: chips simply stay empty */
  }
};

type Props = { item: Intake } & ActionContext;
const base = (item: Intake) => `/operations/auction-intakes/${item.id}`;

export function IntakeReceive({ item, ...context }: Props) {
  const [shelf, setShelf] = useState("");
  const [invalid, setInvalid] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const submit = useRef<(() => void) | null>(null);
  const [recent] = useState(recentShelves);
  const code = shelf.trim();
  return (
    <ActionPanel
      {...context}
      label="Nhận sách đấu giá"
      title="Nhận sách tại quầy."
      intro="Chỉ bấm nhận khi người bán đã giao tận tay cuốn sách. Ghi đúng mã kệ; sau khi nhận, bảng kiểm tra mở ngay bên dưới."
      dirty={shelf !== ""}
      confirm={false}
      submitRef={submit}
      fields={(locked) => (
        <>
          <div className="field">
            <label htmlFor={`shelf-${item.id}`}>Mã kệ</label>
            <input
              id={`shelf-${item.id}`}
              ref={input}
              autoFocus
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
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit.current?.();
                }
              }}
            />
          </div>
          {recent.length > 0 && (
            <div className="shelf-chips" role="group" aria-label="Kệ dùng gần đây">
              <span className="muted">Gần đây:</span>
              {recent.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip-button"
                  disabled={locked}
                  aria-pressed={code === value}
                  onClick={() => {
                    setShelf(value);
                    setInvalid(false);
                    input.current?.focus();
                  }}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
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
      submitLabel={SHELF.test(code) ? `Nhận vào kệ ${code}` : "Nhận sách"}
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
      interpret={() => {
        rememberShelf(code);
        return {
          tone: "success",
          text: `Đã nhận “${item.title}” vào kệ ${code}. Kiểm tra tình trạng ngay bên dưới.`,
          close: true,
          next: true,
        };
      }}
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
