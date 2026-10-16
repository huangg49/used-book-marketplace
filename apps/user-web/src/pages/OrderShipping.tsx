import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@used-books/session-client";
import { useRef, useState } from "react";
import { z } from "zod";
import { session } from "../lib/session";
import type { DirectOrder } from "../services/orders";
import styles from "./DirectOrders.module.css";

const receipt = z.object({ entityId: z.string().uuid() });
const evidenceSchema = z.object({
  items: z.array(
    z.object({ id: z.string().uuid(), status: z.enum(["Pending", "Ready"]) }),
  ),
});
const shipmentSchema = z.object({
  trackingCode: z.string(),
  pickupConfirmed: z.boolean(),
  state: z.string(),
});
type Upload = {
  file: File;
  body: object;
  createKey: string;
  uploadKey: string;
  id?: string;
};

export function OrderShipping({
  order,
  onChange,
}: {
  order: DirectOrder;
  onChange: () => void;
}) {
  const shipment = useQuery({
    queryKey: ["order-shipment", order.id],
    queryFn: async () => {
      try {
        return await session.request(
          `/me/orders/${order.id}/shipment`,
          shipmentSchema,
        );
      } catch (cause) {
        // No shipment yet is a stable empty result. Treating it as an error
        // unmounts the forms on every poll, interrupting the native file picker.
        if (cause instanceof ApiError && cause.status === 404) return null;
        throw cause;
      }
    },
    retry: false,
    refetchInterval: 5000,
  });
  const evidence = useQuery({
    queryKey: ["order-packaging", order.id],
    queryFn: () =>
      session.request(
        `/me/orders/${order.id}/packaging-evidence`,
        evidenceSchema,
      ),
    enabled: order.role === "Seller",
    retry: false,
  });
  const [file, setFile] = useState<File>();
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [uploadPending, setUploadPending] = useState(false);
  const [registerPending, setRegisterPending] = useState(false);
  const upload = useRef<Upload | undefined>(undefined);
  const register = useRef<{ key: string; body: object } | undefined>(undefined);
  async function uploadPhoto(event: React.FormEvent) {
    event.preventDefault();
    if (busy || (!file && !upload.current)) return;
    setBusy(true);
    setError(undefined);
    try {
      if (!upload.current && file) {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10000000 ||
          file.size === 0
        ) {
          setError("Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB.");
          return;
        }
        const hash = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        );
        const sha256 = Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        upload.current = {
          file,
          createKey: crypto.randomUUID(),
          uploadKey: crypto.randomUUID(),
          body: {
            expectedVersion: order.version,
            mimeType: file.type,
            byteSize: file.size,
            sha256,
          },
        };
      }
      const intent = upload.current!;
      setUploadPending(true);
      if (!intent.id) {
        const created = await session.request(
          `/orders/${order.id}/packaging-evidence`,
          receipt,
          {
            method: "POST",
            headers: { "Idempotency-Key": intent.createKey },
            body: JSON.stringify(intent.body),
          },
        );
        intent.id = created.entityId;
      }
      await session.request(
        `/orders/${order.id}/packaging-evidence/${intent.id}/content`,
        receipt,
        {
          method: "PUT",
          headers: {
            "Idempotency-Key": intent.uploadKey,
            "Content-Type": intent.file.type,
          },
          body: intent.file,
        },
      );
      upload.current = undefined;
      setUploadPending(false);
      setFile(undefined);
      await evidence.refetch();
      onChange();
    } catch (cause) {
      const known =
        cause instanceof ApiError &&
        [400, 403, 404, 409, 413, 415, 422, 429].includes(cause.status);
      if (known) {
        upload.current = undefined;
        setUploadPending(false);
      }
      setError(
        known
          ? "Chưa lưu được ảnh. Kiểm tra ảnh, quyền và trạng thái đơn rồi thử lại."
          : "Chưa xác nhận ảnh đã lưu. Thử lại để gửi đúng ảnh và yêu cầu ban đầu.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function registerShipment(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    register.current ??= {
      key: crypto.randomUUID(),
      body: {
        expectedOrderVersion: order.version,
        carrier: "LatLaiSimulator",
        trackingCode: tracking.trim(),
        packagingEvidenceIds:
          evidence.data?.items
            .filter((e) => e.status === "Ready")
            .slice(0, 8)
            .map((e) => e.id) ?? [],
      },
    };
    setBusy(true);
    setError(undefined);
    setRegisterPending(true);
    try {
      await session.request(`/orders/${order.id}/shipment`, receipt, {
        method: "POST",
        headers: { "Idempotency-Key": register.current.key },
        body: JSON.stringify(register.current.body),
      });
      register.current = undefined;
      setRegisterPending(false);
      await shipment.refetch();
      onChange();
    } catch (cause) {
      const known =
        cause instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(cause.status);
      if (known) {
        register.current = undefined;
        setRegisterPending(false);
      }
      setError(
        known
          ? "Chưa đăng ký được vận đơn. Kiểm tra mã, ảnh đóng gói và hạn bàn giao."
          : "Chưa xác nhận vận đơn đã lưu. Thử lại cùng mã và thông tin ban đầu.",
      );
    } finally {
      setBusy(false);
    }
  }
  const missing = shipment.data === null;
  return (
    <div>
      {shipment.data ? (
        <p>
          Mã vận đơn: <strong>{shipment.data.trackingCode}</strong>
          <br />
          {shipment.data.pickupConfirmed
            ? "Đã xác nhận bàn giao vận chuyển."
            : "Đã đăng ký vận đơn, đang chờ xác nhận bàn giao."}
        </p>
      ) : shipment.isPending ? (
        <p role="status">Đang kiểm tra vận đơn…</p>
      ) : null}
      {shipment.isError && (
        <p role="alert">
          Chưa tải được vận đơn.{" "}
          <button onClick={() => void shipment.refetch()}>Thử lại</button>
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {order.role === "Seller" && order.state === "Preparing" && missing && (
        <>
          <p>
            Chụp ảnh gói sách trước khi gửi, sau đó đăng ký mã vận đơn mô phỏng.
            Nhập mã chưa xác nhận đã gửi sách.
          </p>
          {evidence.isError && (
            <p role="alert">
              Chưa tải được ảnh đóng gói.{" "}
              <button onClick={() => void evidence.refetch()}>Thử lại</button>
            </p>
          )}
          <p role="status">
            Ảnh đóng gói đã lưu:{" "}
            {evidence.data?.items.filter((e) => e.status === "Ready").length ??
              0}
          </p>
          <form className={styles.form} onSubmit={(e) => void uploadPhoto(e)}>
            <label>
              Ảnh đóng gói
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || uploadPending || registerPending}
                onChange={(e) => setFile(e.target.files?.[0])}
              />
            </label>
            <button
              className={styles.secondary}
              disabled={busy || (!file && !uploadPending) || registerPending}
            >
              {uploadPending ? "Thử lại lưu ảnh" : "Lưu ảnh đóng gói"}
            </button>
          </form>
          <form
            className={styles.form}
            onSubmit={(e) => void registerShipment(e)}
          >
            <label>
              Mã vận đơn mô phỏng
              <input
                required
                pattern="LL-[A-Z0-9]{8,32}"
                maxLength={35}
                placeholder="LL-12345678"
                disabled={busy || registerPending}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </label>
            <button
              className={styles.primary}
              disabled={
                busy ||
                uploadPending ||
                !order.shipmentRegistrationEnabled ||
                !evidence.data?.items.some((e) => e.status === "Ready")
              }
            >
              {registerPending ? "Thử lại đăng ký vận đơn" : "Đăng ký vận đơn"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
