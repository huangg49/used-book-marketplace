import { useRef, useState } from "react";
import { PurchaseDialog } from "./PurchaseDialog";
import { type DirectOrder } from "../services/orders";
import { session } from "../lib/session";
import { ApiError } from "@used-books/session-client";
import { z } from "zod";
import {
  Camera,
  MapPin,
  Truck,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import styles from "../pages/DirectOrders.module.css";
import { addressDetailLabel } from "../lib/address-detail-label";

const receiptSchema = z.object({ entityId: z.string().uuid() });

type ShipmentAttempt = {
  version: number;
  trackingCode: string;
  file: File;
  sha256: string;
  createKey: string;
  uploadKey: string;
  registerKey: string;
  evidenceId?: string;
  uploaded?: boolean;
};

function createDemoPhotoFile(): File {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f4eddf";
    ctx.fillRect(0, 0, 400, 300);
    ctx.fillStyle = "#5c0202";
    ctx.font = "bold 18px sans-serif";
    ctx.fillText("Gói sách đã bọc chống sốc", 60, 140);
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#716157";
    ctx.fillText("Ảnh kiểm tra đóng gói hợp lệ", 85, 175);
  }
  const dataUrl = canvas.toDataURL("image/jpeg");
  const byteString = atob(dataUrl.split(",")[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new File([ab], "anh-dong-goi-demo.jpg", { type: "image/jpeg" });
}

function generateDemoTrackingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let randomStr = "";
  for (let i = 0; i < 8; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `LL-${randomStr}`;
}

export function DirectShipmentDialog({
  open,
  onClose,
  order,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  order: DirectOrder;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(() => createDemoPhotoFile());
  const [tracking, setTracking] = useState<string>(() => generateDemoTrackingCode());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<ShipmentAttempt | undefined>(undefined);
  const [retryPending, setRetryPending] = useState(false);

  const address = order.shippingAddress ?? order.ownAddress;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!file) {
      setError("Vui lòng chọn hoặc chụp ảnh đóng gói sách trước khi gửi.");
      return;
    }
    const cleanTracking = tracking.trim().toUpperCase();
    if (!/^LL-[A-Z0-9]{8,32}$/.test(cleanTracking)) {
      setError("Mã vận đơn phải bắt đầu bằng LL- và theo sau là 8-32 ký tự chữ in hoa hoặc số.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (!attempt.current) {
        const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        attempt.current = {
          version: order.version,
          trackingCode: cleanTracking,
          file,
          sha256: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join(""),
          createKey: crypto.randomUUID(),
          uploadKey: crypto.randomUUID(),
          registerKey: crypto.randomUUID(),
        };
      }
      const intent = attempt.current;
      const base = "/orders/" + order.id;
      if (!intent.evidenceId) {
        const created = await session.request(base + "/packaging-evidence", receiptSchema, {
          method: "POST",
          headers: { "Idempotency-Key": intent.createKey },
          body: JSON.stringify({
            expectedVersion: intent.version,
            mimeType: intent.file.type,
            byteSize: intent.file.size,
            sha256: intent.sha256,
          }),
        });
        intent.evidenceId = created.entityId;
      }
      if (!intent.uploaded) {
        await session.request(base + "/packaging-evidence/" + intent.evidenceId + "/content", receiptSchema, {
          method: "PUT",
          headers: { "Idempotency-Key": intent.uploadKey, "Content-Type": intent.file.type },
          body: intent.file,
        });
        intent.uploaded = true;
      }
      await session.request(base + "/shipment", receiptSchema, {
        method: "POST",
        headers: { "Idempotency-Key": intent.registerKey },
        body: JSON.stringify({
          expectedOrderVersion: intent.version,
          carrier: "LatLaiSimulator",
          trackingCode: intent.trackingCode,
          packagingEvidenceIds: [intent.evidenceId],
        }),
      });

      attempt.current = undefined;
      setRetryPending(false);
      onSuccess();
      onClose();
    } catch (cause) {
      const known = cause instanceof ApiError &&
        [400, 401, 403, 404, 409, 413, 415, 422].includes(cause.status);
      if (known) {
        attempt.current = undefined;
        setRetryPending(false);
        setError(cause.message || "Chưa thể đăng ký gửi sách. Vui lòng thử lại.");
      } else if (attempt.current) {
        setRetryPending(true);
        setError("Chưa xác nhận vận đơn đã lưu. Thử lại cùng mã và thông tin ban đầu.");
      } else {
        setError("Chưa đọc được ảnh đóng gói. Vui lòng chọn lại ảnh.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <PurchaseDialog
      open={open}
      onClose={() => !busy && onClose()}
      title="Xác nhận gửi sách"
      description="Chụp ảnh đóng gói và đăng ký mã vận đơn để bàn giao sách cho người mua."
      busy={busy}
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        {/* Địa chỉ giao hàng người nhận */}
        <div
          style={{
            padding: "12px 14px",
            background: "var(--shop-shelf, #f4eddf)",
            borderRadius: 10,
            border: "1px solid var(--shop-line)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--shop-wine)",
              fontWeight: 700,
              fontSize: "0.875rem",
              marginBottom: 4,
            }}
          >
            <MapPin size={16} />
            <span>Nơi giao sách cho người mua</span>
          </div>
          <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: "0.875rem" }}>
            {address?.recipientName} · {address?.phone}
          </p>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--shop-muted)" }}>
            {addressDetailLabel(address?.detail || "")}
          </p>
        </div>

        {/* 1. Ảnh đóng gói */}
        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <label
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "var(--shop-ink)",
              }}
            >
              1. Ảnh gói sách trước khi gửi
            </label>
            <button
              type="button"
              disabled={busy || retryPending}
              onClick={() => {
                setFile(createDemoPhotoFile());
                setError(null);
              }}
              style={{
                background: "none",
                border: 0,
                color: "var(--shop-wine)",
                fontSize: "0.75rem",
                fontWeight: 600,
                textDecoration: "underline",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Sparkles size={12} />
              <span>Dùng ảnh mẫu demo</span>
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "#fff",
              border: "1px dashed var(--shop-line)",
              borderRadius: 8,
            }}
          >
            <Camera size={22} color="var(--shop-wine)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="file"
                id="packaging-photo"
                className="sr-only"
                disabled={busy || retryPending}
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setFile(e.target.files[0]);
                    setError(null);
                  }
                }}
              />
              <label
                htmlFor="packaging-photo"
                style={{
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  color: "var(--shop-wine)",
                  textDecoration: "underline",
                }}
              >
                {file ? "Đổi ảnh khác…" : "Bấm để chọn ảnh từ thiết bị"}
              </label>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "0.75rem",
                  color: file ? "var(--shop-wine)" : "var(--shop-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file ? `✓ Đã chọn: ${file.name}` : "Hỗ trợ định dạng JPG, PNG, WebP (tối đa 10MB)"}
              </p>
            </div>
          </div>
        </div>

        {/* 2. Đăng ký mã vận đơn */}
        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <label
              htmlFor="tracking-code-input"
              style={{
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "var(--shop-ink)",
              }}
            >
              2. Mã vận đơn mô phỏng
            </label>
            <button
              type="button"
              disabled={busy || retryPending}
              onClick={() => {
                setTracking(generateDemoTrackingCode());
                setError(null);
              }}
              style={{
                background: "none",
                border: 0,
                color: "var(--shop-wine)",
                fontSize: "0.75rem",
                fontWeight: 600,
                textDecoration: "underline",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Sparkles size={12} />
              <span>Tạo mã mới</span>
            </button>
          </div>

          <input
            id="tracking-code-input"
            type="text"
            required
            pattern="LL-[A-Z0-9]{8,32}"
            maxLength={35}
            value={tracking}
            disabled={busy || retryPending}
            onChange={(e) => setTracking(e.target.value.toUpperCase())}
            placeholder="Ví dụ: LL-12345678"
            style={{
              padding: "10px 14px",
              border: "1px solid var(--shop-line)",
              borderRadius: 8,
              fontSize: "0.9375rem",
              fontFamily: "monospace",
              fontWeight: 700,
              letterSpacing: "0.05em",
              background: "#fff",
            }}
          />
          <span style={{ fontSize: "0.75rem", color: "var(--shop-muted)" }}>
            Hãng vận chuyển: <strong>Lật Lại Express (Mô phỏng)</strong> · Giao trực tiếp
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className={styles.procedureNoticeWarning}
            style={{ margin: 0, padding: "8px 12px" }}
          >
            <AlertCircle size={16} />
            <p style={{ margin: 0, fontSize: "0.8125rem" }}>{error}</p>
          </div>
        )}

        {/* Nút hành động */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 10,
          }}
        >
          <button
            type="button"
            className={styles.secondaryActionBtn}
            onClick={onClose}
            disabled={busy}
          >
            Hủy
          </button>
          <button
            type="submit"
            data-focus-inverse
            className={styles.primaryActionBtn}
            disabled={busy || !file || !tracking.trim()}
          >
            <Truck size={16} />
            <span>{busy ? "Đang xử lý…" : retryPending ? "Thử lại đăng ký vận đơn" : "Xác nhận gửi sách"}</span>
          </button>
        </div>
      </form>
    </PurchaseDialog>
  );
}

