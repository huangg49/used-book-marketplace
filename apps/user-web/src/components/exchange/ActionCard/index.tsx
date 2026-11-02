import { useExchangeRecovery } from "../../../hooks/useExchangeRecovery";
import { ExchangeRecoveryPanel } from "../ExchangeRecoveryPanel";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Clock, AlertCircle, ShieldAlert } from "lucide-react";
import { BrandIcon } from "../../BrandIcon";
import type { ExchangeDetail } from "../../../lib/mock/exchangeDetail";
import { session } from "../../../lib/session";
import { ConfirmDialog } from "../../ConfirmDialog";
import { ShipmentDialog } from "../ShipmentDialog";
import { ReceiveDialog } from "../ReceiveDialog";
import { CounterDialog, type CounterOfferData } from "../CounterDialog";
import { AcceptExchangeDialog } from "../AcceptExchangeDialog";
import { ROUTES, formatVnd } from "../../../lib/routes";
import {
  exchangeError,
  pendingExchange,
  exchangeAcknowledged,
} from "../../../services/exchange";
import type { ShipmentData } from "../../../services/exchangeShipment";
import styles from "./ActionCard.module.css";

const addressBookSchema = z.object({
  version: z.number().int(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      recipientName: z.string(),
      phone: z.string(),
      serviceAreaCode: z.string(),
      localityCode: z.string(),
      detail: z.string(),
      isDefault: z.boolean(),
      version: z.number().int(),
    }),
  ),
});

type Action =
  | "cancel"
  | "accept"
  | "reject"
  | "counter"
  | "fund"
  | "sent"
  | "received"
  | "retry"
  | "complete"
  | "dispute";

interface Props {
  detail: ExchangeDetail;
  onCancel: () => Promise<void>;
  onAccept: (
    deliveryAddressId?: string,
    revisionOverride?: number,
  ) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onCounter?: (data: CounterOfferData) => Promise<void>;
  onFund: () => Promise<void>;
  onConfirmSent: (shipmentData?: ShipmentData) => Promise<void>;
  onConfirmReceived: () => Promise<void>;
  onRetry: () => Promise<void>;
  onComplete: () => Promise<void>;
  onDispute?: (reason: string) => Promise<void>;
}

const labels: Record<Action, string> = {
  cancel: "Hủy đề nghị",
  accept: "Chấp nhận đề nghị",
  reject: "Từ chối đề nghị",
  counter: "Đề xuất sách thay thế",
  fund: "Đặt cọc mô phỏng",
  sent: "Tạo đơn vận chuyển",
  received: "Xác nhận đã nhận sách",
  retry: "Thử lại thao tác trước",
  complete: "Xác nhận đã kiểm tra",
  dispute: "Báo sự cố / Khiếu nại",
};

export function ActionCard(props: Props) {
  const { detail } = props;
  const [action, setAction] = useState<Action>();
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [shipmentOpen, setShipmentOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [disputeCategory, setDisputeCategory] = useState(
    "Sách rách nát / hư hỏng nặng",
  );
  const [disputeDetail, setDisputeDetail] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageFileName, setImageFileName] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [videoFileName, setVideoFileName] = useState("");
  const [evidenceImageRef, setEvidenceImageRef] = useState("");
  const [evidenceVideoRef, setEvidenceVideoRef] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  useExchangeRecovery();
  const pending = pendingExchange(detail.id);
  const acknowledged = exchangeAcknowledged(detail.id);
  const blocked = Boolean(pending || acknowledged);
  const [now, setNow] = useState(() => Date.now());

  const addresses = useQuery({
    queryKey: ["address-book"],
    queryFn: () => session.request("/me/addresses", addressBookSchema),
    enabled: detail.status === "PENDING",
  });

  useEffect(() => {
    if (addresses.data?.items?.length && !selectedAddressId) {
      const def = addresses.data.items.find((a) => a.isDefault);
      setSelectedAddressId(def ? def.id : addresses.data.items[0].id);
    }
  }, [addresses.data, selectedAddressId]);

  useEffect(() => {
    if (!detail.fundingDeadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [detail.fundingDeadline]);

  const expired =
    detail.fundingDeadline && Date.parse(detail.fundingDeadline) <= now;

  let instructions = "Theo dõi trạng thái trao đổi tại đây.";
  const actions: Action[] = [];

  if (detail.status === "PENDING") {
    const canAccept =
      detail.canViewerAccept ?? detail.viewerRole !== "proposer";
    if (canAccept) {
      instructions =
        detail.viewerRole === "proposer"
          ? "Đối tác đã chọn sách thay thế. Hãy kiểm tra sách, cọc và tiền bù mới trước khi chấp nhận."
          : "Xem thông tin sách và các điều khoản trước khi chấp nhận trao đổi.";
      actions.push("accept", "counter", "reject");
      if (detail.viewerRole === "proposer") {
        actions.push("cancel");
      }
    } else {
      instructions =
        detail.viewerRole === "proposer"
          ? "Đề nghị đã gửi. Bạn có thể nhắn tin thương lượng trong khung chat hoặc hủy đề nghị nếu đổi ý."
          : "Bạn đã gửi sách thay thế. Đang chờ đối tác phản hồi; sách chưa được giữ.";
      actions.push("cancel");
    }
  } else if (detail.status === "FUNDING") {
    instructions = detail.viewerFundedAt
      ? "Bạn đã đặt cọc. Đang chờ đối tác hoàn tất khoản cọc của họ."
      : `Khoản cần giữ từ ví mô phỏng: ${formatVnd(detail.viewerFundingAmount ?? 0)} (cọc và tiền bù nếu có).`;
    if (!detail.viewerFundedAt && !expired) actions.push("fund");
    actions.push("cancel");
  } else if (detail.status === "WAITING_YOU_SEND") {
    const deadlineStr = detail.shippingDeadline
      ? new Date(detail.shippingDeadline).toLocaleString("vi-VN")
      : null;
    const myRole = detail.viewerRole === "proposer" ? "Initiator" : "Recipient";
    const partnerRole =
      detail.viewerRole === "proposer" ? "Recipient" : "Initiator";

    if (detail.viewerShipping.sentAt) {
      instructions = `Bạn đã tạo đơn vận chuyển thành công. Đang chờ đối tác tạo đơn để bưu tá cùng đến lấy sách ở cả hai đầu.${deadlineStr ? ` Hạn gửi: ${deadlineStr}.` : ""}`;
    } else {
      if (!detail.cancellationRequestedBy) {
        instructions = `Hai bên đã đặt cọc. Hãy đóng gói sách cẩn thận và bấm tạo đơn vận chuyển.${deadlineStr ? ` Hạn chót gửi sách: ${deadlineStr} (72 giờ).` : ""}`;
        actions.push("sent");
        if (!detail.partnerShipping.sentAt) {
          actions.push("cancel");
        }
      } else if (detail.cancellationRequestedBy === myRole) {
        instructions = `Bạn đã gửi yêu cầu hủy trao đổi trước khi gửi sách. Đang chờ đối tác phản hồi. Nếu đối tác đồng thuận, 100% tiền cọc và tiền bù sẽ được hoàn lại về ví của cả hai bên.${deadlineStr ? ` Hạn gửi: ${deadlineStr}.` : ""}`;
        actions.push("sent");
      } else if (detail.cancellationRequestedBy === partnerRole) {
        instructions = `Đối tác đã đề nghị hủy trao đổi trước khi gửi sách. Nếu bạn đồng ý hủy, toàn bộ tiền cọc và tiền bù của cả hai bên sẽ được hoàn trả 100% về ví. Nếu bạn muốn tiếp tục giao dịch, hãy từ chối yêu cầu hủy hoặc tạo đơn gửi sách.${deadlineStr ? ` Hạn gửi: ${deadlineStr}.` : ""}`;
        actions.push("sent", "cancel", "reject");
      }
    }
  } else if (detail.status === "WAITING_YOU_CONFIRM") {
    instructions = detail.viewerShipping.receivedAt
      ? "Bạn đã xác nhận nhận sách. Đang chờ đối tác xác nhận nhận sách để cùng bước vào giai đoạn kiểm tra sách (72 giờ)."
      : "Hai bên đã gửi sách. Chỉ xác nhận khi bạn đã nhận bưu phẩm và kiểm tra kỹ sách.";
    if (!detail.viewerShipping.receivedAt) actions.push("received");
    actions.push("dispute");
  } else if (detail.status === "DELIVERING") {
    instructions = detail.viewerShipping.receivedAt
      ? "Bạn đã nhận được sách từ bưu tá! Hãy kiểm tra kỹ sách. Nếu sách bị hỏng hóc hoặc không đúng mô tả, bạn có thể bấm 'Báo sự cố / Khiếu nại'. Đang chờ đối tác nhận được kiện sách còn lại để cùng bước vào giai đoạn nghiệm thu (72 giờ đồng kiểm)."
      : "Sách đang được vận chuyển. Theo dõi bưu gửi tại thẻ Tiến trình giao nhận.";
    if (!detail.viewerShipping.receivedAt && detail.partnerShipping.sentAt) {
      actions.push("received");
    }
    actions.push("dispute");
  } else if (detail.status === "INSPECTING") {
    const deadlineStr = detail.inspectionDeadline
      ? new Date(detail.inspectionDeadline).toLocaleString("vi-VN")
      : null;
    if (detail.viewerCompletedAt) {
      instructions = `Bạn đã xác nhận kiểm tra sách. Tiền cọc vẫn được giữ đến khi cả hai hạn kiểm tra 72 giờ kết thúc và không có tranh chấp.${deadlineStr ? ` Hạn kiểm tra: ${deadlineStr}.` : ""}`;
    } else if (detail.partnerCompletedAt) {
      instructions = `Đối tác đã xác nhận kiểm tra sách. Bạn vẫn có đủ 72 giờ từ lúc nhận để đối chiếu tình trạng. Xác nhận kiểm tra không rút ngắn hạn hoặc giải phóng cọc sớm.${deadlineStr ? ` Hạn kiểm tra: ${deadlineStr}.` : ""}`;
      actions.push("complete");
    } else {
      instructions = `Hai bên đã nhận sách. Mỗi bên có 72 giờ kiểm tra tính từ lúc nhận.${deadlineStr ? ` Hạn kiểm tra: ${deadlineStr}.` : ""} Bạn có thể kiểm tra sách kỹ lưỡng. Bạn có thể xác nhận đã kiểm tra; cọc chỉ được giải phóng khi cả hai hạn kết thúc và không có tranh chấp.`;
      actions.push("complete");
    }
    actions.push("dispute");
  } else if (detail.status === "COMPLETED") {
    instructions =
      detail.resolutionDecision === "CompleteExchange" &&
      detail.resolutionReason
        ? `Trao đổi đã hoàn tất theo phán quyết của Quản trị viên: "${detail.resolutionReason}". Khoản cọc bảo chứng và tiền bù đã được tất toán.`
        : "Trao đổi đã hoàn tất thành công. Khoản cọc bảo chứng và tiền bù đã được tất toán tự động.";
  } else if (detail.status === "RESOLUTION_PENDING") {
    instructions = detail.disputeReason
      ? `Giao dịch đang có tranh chấp / báo sự cố: "${detail.disputeReason}". Toàn bộ tiền cọc bảo chứng và tiền bù đang được tạm khóa an toàn trên Ledger để bảo vệ quyền lợi của hai bên.`
      : "Trao đổi đang chờ giải quyết tranh chấp. Khoản tiền cọc đang được tạm khóa an toàn.";
  } else {
    instructions =
      detail.cancelReason === "DisputeResolvedRefund" && detail.resolutionReason
        ? `Giao dịch đã hủy theo phán quyết của Quản trị viên: "${detail.resolutionReason}". Toàn bộ tiền cọc và tiền bù đã được hoàn lại 100% về ví của bạn.`
        : detail.cancelReason === "MutualAgreement"
          ? "Hai bên đã đồng thuận hủy giao dịch trước khi gửi sách. Toàn bộ 100% tiền cọc và tiền bù đã được hoàn lại về ví của hai bên và sách đã được mở lại trên kệ."
          : detail.status === "REJECTED"
            ? `Đề nghị đã bị từ chối.${detail.rejectionReason ? ` Lý do: ${detail.rejectionReason}` : ""}`
            : detail.status === "EXPIRED"
              ? "Đề nghị hoặc thời hạn đặt cọc đã hết."
              : detail.cancelReason === "ListingUnavailable"
                ? "Thỏa thuận không còn hợp lệ hoặc thiếu bản chụp sách gốc. Chưa giữ sách hay thu tiền từ đề xuất này. Hãy tạo đề xuất mới từ sách đủ điều kiện."
                : "Đề nghị đã bị hủy.";
  }

  const open = async (next: Action) => {
    setError("");
    if (next === "accept") {
      setAcceptOpen(true);
      return;
    }
    if (next === "sent") {
      setShipmentOpen(true);
      return;
    }
    if (next === "received") {
      setReceiveOpen(true);
      return;
    }
    if (next === "counter") {
      setCounterOpen(true);
      return;
    }
    setAction(next);
  };

  async function handleCounterSubmit(data: CounterOfferData) {
    if (!props.onCounter) return;
    setBusy(true);
    try {
      await props.onCounter(data);
      setCounterOpen(false);
    } catch (failure) {
      if (pendingExchange(detail.id)) {
        setCounterOpen(false);
        setShipmentOpen(false);
        setReceiveOpen(false);
        setAcceptOpen(false);
      }
      throw new Error(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function handleShipmentSubmit(shipmentData: ShipmentData) {
    setBusy(true);
    try {
      await props.onConfirmSent(shipmentData);
      setShipmentOpen(false);
    } catch (failure) {
      if (pendingExchange(detail.id)) {
        setCounterOpen(false);
        setShipmentOpen(false);
        setReceiveOpen(false);
        setAcceptOpen(false);
      }
      throw new Error(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function handleReceiveConfirm() {
    setBusy(true);
    try {
      await props.onConfirmReceived();
      setReceiveOpen(false);
    } catch (failure) {
      if (pendingExchange(detail.id)) {
        setCounterOpen(false);
        setShipmentOpen(false);
        setReceiveOpen(false);
        setAcceptOpen(false);
      }
      throw new Error(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  const SAMPLE_VIDEO_SRC = "/demo-evidence/sample-unboxing.mp4?v=3.5s";
  const SAMPLE_VIDEO_LABEL = "sample-unboxing.mp4 (176 KB · 3.5s)";
  const SAMPLE_IMAGE_SRC = "/demo-evidence/sample-book-damage.jpg";
  const SAMPLE_IMAGE_LABEL = "sample-book-damage.jpg (607 KB)";

  const handleUseSampleEvidence = () => {
    setDisputeCategory("Sách rách nát / hư hỏng nặng");
    if (!disputeDetail.trim()) {
      setDisputeDetail(
        "Kiểm tra bưu phẩm lúc mở hộp: bìa sau sách bị rách toạc 1 vệt dài và ẩm ướt nhiều trang, không đúng cam kết ban đầu.",
      );
    }
    // Only set sample image if user has not picked their own image!
    if (!imagePreview || imagePreview.startsWith("/demo-evidence/")) {
      setImagePreview(SAMPLE_IMAGE_SRC);
      setImageFileName(SAMPLE_IMAGE_LABEL);
      setEvidenceImageRef(SAMPLE_IMAGE_SRC);
    }
    // Always set sample 3.5s video
    setVideoPreview(SAMPLE_VIDEO_SRC);
    setVideoFileName(SAMPLE_VIDEO_LABEL);
    setEvidenceVideoRef("/demo-evidence/sample-unboxing.mp4");
    setError("");
  };

  const handleUseSampleVideoOnly = () => {
    setVideoPreview(SAMPLE_VIDEO_SRC);
    setVideoFileName(SAMPLE_VIDEO_LABEL);
    setEvidenceVideoRef("/demo-evidence/sample-unboxing.mp4");
    setError("");
  };

  const handleUseSampleImageOnly = () => {
    setImagePreview(SAMPLE_IMAGE_SRC);
    setImageFileName(SAMPLE_IMAGE_LABEL);
    setEvidenceImageRef(SAMPLE_IMAGE_SRC);
    setError("");
  };

  const saveEvidenceToDB = (key: string, data: string) => {
    try {
      if (!window.indexedDB) return;
      const req = indexedDB.open("LatLaiEvidenceDB", 1);
      req.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("media")) {
          db.createObjectStore("media", { keyPath: "key" });
        }
      };
      req.onsuccess = (e: any) => {
        const db = e.target.result;
        const tx = db.transaction("media", "readwrite");
        tx.objectStore("media").put({ key, data });
      };
    } catch {}
  };

  const handleImagePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      setImageFileName(`${file.name} (${Math.round(file.size / 1024)} KB)`);
      try {
        localStorage.setItem(`evidence_img_${detail.id}`, dataUrl);
      } catch {}
      saveEvidenceToDB(`img_${detail.id}`, dataUrl);
      setEvidenceImageRef(file.name);
    };
    reader.readAsDataURL(file);
    setError("");
  };

  const handleVideoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    setVideoFileName(
      `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`,
    );
    setEvidenceVideoRef(file.name);
    setError("");

    // Read and persist for cross-origin Admin Web inspection
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      try {
        localStorage.setItem(`evidence_video_${detail.id}`, dataUrl);
      } catch {}
      saveEvidenceToDB(`vid_${detail.id}`, dataUrl);
    };
    reader.readAsDataURL(file);
  };

  async function confirm() {
    if (!action || busy || action === "counter") return;
    if (action === "reject") {
      if (reason.trim().length < 5 || reason.trim().length > 300) {
        setError("Nhập lý do từ 5 đến 300 ký tự.");
        return;
      }
    } else if (action === "dispute") {
      const currentDetail = disputeDetail.trim() || reason.trim();
      if (currentDetail.length < 5) {
        setError(
          "Vui lòng nhập mô tả chi tiết sự cố từ 5 ký tự (hoặc bấm 'Dùng mẫu unboxing').",
        );
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      let finalDisputeReason = reason.trim();
      if (action === "dispute") {
        const detailText =
          disputeDetail.trim() ||
          reason.trim() ||
          "Sách có lỗi nghiêm trọng, không đúng cam kết ban đầu.";
        finalDisputeReason = `[Sự cố]: ${disputeCategory}\n[Chi tiết]: ${detailText}\n[Video unboxing]: ${evidenceVideoRef || "/demo-evidence/sample-unboxing.mp4"}\n[Ảnh bằng chứng]: ${evidenceImageRef || "/demo-evidence/sample-book-damage.jpg"}`;
        if (finalDisputeReason.length > 490) {
          finalDisputeReason = finalDisputeReason.slice(0, 490);
        }
      }
      const run: Record<Exclude<Action, "counter">, () => Promise<void>> = {
        accept: () => props.onAccept(selectedAddressId || undefined),
        cancel: props.onCancel,
        reject: () => props.onReject(reason.trim()),
        fund: props.onFund,
        sent: () => props.onConfirmSent(),
        received: props.onConfirmReceived,
        retry: props.onRetry,
        complete: props.onComplete,
        dispute: () =>
          props.onDispute
            ? props.onDispute(finalDisputeReason)
            : Promise.resolve(),
      };
      await run[action]();
      setAction(undefined);
    } catch (failure) {
      if (pendingExchange(detail.id)) setAction(undefined);
      setError(exchangeError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h2 className={styles.cardTitle}>
          <BrandIcon size={18} />
          <span>Hành động tiếp theo</span>
        </h2>
        <span className={styles.roleBadge}>
          {detail.status === "PENDING"
            ? (detail.canViewerAccept ?? detail.viewerRole !== "proposer")
              ? "Chờ bạn phản hồi"
              : "Chờ đối tác phản hồi"
            : detail.status === "FUNDING"
              ? "Đặt cọc bảo chứng"
              : detail.status === "WAITING_YOU_SEND"
                ? "Chuẩn bị gửi sách"
                : ["CANCELLED", "REJECTED", "EXPIRED"].includes(detail.status)
                  ? "Đã đóng"
                  : ["COMPLETED", "NEED_REVIEW"].includes(detail.status)
                    ? "Đã hoàn tất"
                    : "Đang tiến hành"}
        </span>
      </div>
      <div className={styles.calloutBox}>
        <p className={styles.instructions}>{instructions}</p>
      </div>
      {detail.status === "FUNDING" && detail.fundingDeadline && (
        <p className={styles.deadlineRow}>
          <Clock size={14} className={styles.iconGold} />
          <span>
            Hạn đặt cọc:{" "}
            <time dateTime={detail.fundingDeadline}>
              {new Date(detail.fundingDeadline).toLocaleString("vi-VN")}
            </time>
            {expired ? " · Đã hết hạn" : ""}
          </span>
        </p>
      )}
      {detail.status === "WAITING_YOU_SEND" && detail.shippingDeadline && (
        <p className={styles.deadlineRow}>
          <Clock size={14} className={styles.iconGold} />
          <span>
            Hạn gửi sách (72h):{" "}
            <time dateTime={detail.shippingDeadline}>
              {new Date(detail.shippingDeadline).toLocaleString("vi-VN")}
            </time>
            {Date.parse(detail.shippingDeadline) <= now
              ? " · Đã hết hạn (hệ thống sẽ tự động quét hoàn tiền hoặc chuyển giải quyết)"
              : ""}
          </span>
        </p>
      )}
      {detail.viewerInspectionDeadline && (
        <p className={styles.deadlineRow}>
          Hạn kiểm tra sách của bạn:{" "}
          <time dateTime={detail.viewerInspectionDeadline}>
            {new Date(detail.viewerInspectionDeadline).toLocaleString("vi-VN")}
          </time>
        </p>
      )}
      {detail.partnerInspectionDeadline && (
        <p className={styles.deadlineRow}>
          Hạn kiểm tra của đối tác:{" "}
          <time dateTime={detail.partnerInspectionDeadline}>
            {new Date(detail.partnerInspectionDeadline).toLocaleString("vi-VN")}
          </time>
        </p>
      )}
      {detail.status === "INSPECTING" && detail.inspectionDeadline && (
        <p className={styles.deadlineRow}>
          <Clock size={14} className={styles.iconGold} />
          <span>
            Hạn kiểm tra chung (72 giờ):{" "}
            <time dateTime={detail.inspectionDeadline}>
              {new Date(detail.inspectionDeadline).toLocaleString("vi-VN")}
            </time>
            {Date.parse(detail.inspectionDeadline) <= now
              ? " · Đã hết hạn (hệ thống sẽ tự động tất toán)"
              : ""}
          </span>
        </p>
      )}
      {pending && (
        <p role="status" className={styles.pendingRow}>
          <AlertCircle size={15} />
          <span>
            Có thao tác chưa rõ kết quả. Thử lại trước khi thực hiện việc khác.
          </span>
        </p>
      )}
      <div className={styles.btnGrid}>
        {blocked ? (
          <ExchangeRecoveryPanel id={detail.id} onRead={props.onRetry} />
        ) : (
          actions.map((next, index) => {
            const isPrimary =
              index === 0 && next !== "cancel" && next !== "reject";
            const isDanger = next === "cancel" || next === "reject";
            const partnerRole =
              detail.viewerRole === "proposer" ? "Recipient" : "Initiator";
            let label = labels[next];
            if (detail.status === "WAITING_YOU_SEND") {
              if (next === "cancel") {
                label =
                  detail.cancellationRequestedBy === partnerRole
                    ? "Đồng ý hủy giao dịch"
                    : "Đề nghị hủy giao dịch";
              } else if (next === "reject") {
                label = "Từ chối yêu cầu hủy";
              }
            }
            return (
              <button
                type="button"
                key={next}
                disabled={busy}
                className={
                  isPrimary
                    ? styles.btnPrimary
                    : isDanger
                      ? styles.btnDanger
                      : styles.btnSecondary
                }
                onClick={() => void open(next)}
              >
                {label}
              </button>
            );
          })
        )}
        <Link className={styles.btnSecondary} to={ROUTES.exchangeMine}>
          Trao đổi của tôi
        </Link>
      </div>

      {error && !action && (
        <p role="alert" className={styles.errorText} style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {/* Counter-Offer Negotiation Modal */}
      {counterOpen && (
        <CounterDialog
          key={`${detail.viewer.id}:${detail.revision}`}
          isOpen={counterOpen}
          onClose={() => setCounterOpen(false)}
          onSubmit={handleCounterSubmit}
          isBusy={busy}
          viewerRole={detail.viewerRole}
          partnerName={detail.partner.username}
          partnerBookValue={detail.receiveBooks.reduce(
            (sum, book) => sum + (book.price ?? 0),
            0,
          )}
          currentListingIds={detail.giveBooks.map((book) => book.id)}
          currentAddressId={selectedAddressId}
        />
      )}

      {/* Accept Exchange Contract Review Modal */}
      <AcceptExchangeDialog
        isOpen={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        onConfirm={async ({ deliveryAddressId }) => {
          setBusy(true);
          try {
            await props.onAccept(deliveryAddressId, detail.revision!);
            setAcceptOpen(false);
          } catch (failure) {
            if (pendingExchange(detail.id)) setAcceptOpen(false);
            throw new Error(exchangeError(failure));
          } finally {
            setBusy(false);
          }
        }}
        isBusy={busy}
        detail={detail}
      />

      {/* Shipment Modal */}
      <ShipmentDialog
        isOpen={shipmentOpen}
        onClose={() => setShipmentOpen(false)}
        onSubmit={handleShipmentSubmit}
        isBusy={busy}
        exchangeId={detail.id}
        senderAddress={detail.viewerAddress}
        receiverAddress={detail.partnerAddress}
        bookTitle={detail.giveBooks[0]?.title}
      />

      {/* Receive Modal */}
      <ReceiveDialog
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onConfirm={handleReceiveConfirm}
        isBusy={busy}
        bookTitle={detail.receiveBooks[0]?.title}
      />

      {/* Generic Confirmation Modal for Reject/Cancel/Fund/Complete/Dispute */}
      <ConfirmDialog
        isOpen={!!action}
        onClose={() => setAction(undefined)}
        maxWidth={action === "dispute" ? "640px" : undefined}
        title={
          action === "cancel" && detail.status === "WAITING_YOU_SEND"
            ? detail.cancellationRequestedBy
              ? "Xác nhận đồng ý hủy"
              : "Đề nghị hủy giao dịch"
            : action === "reject" && detail.status === "WAITING_YOU_SEND"
              ? "Từ chối yêu cầu hủy"
              : action
                ? labels[action]
                : ""
        }
        confirmText={
          action === "dispute"
            ? "Gửi biên bản khiếu nại"
            : action === "complete"
              ? "Xác nhận nghiệm thu"
              : action === "cancel" &&
                  detail.status === "WAITING_YOU_SEND" &&
                  detail.cancellationRequestedBy
                ? "Đồng ý hủy"
                : action === "reject" && detail.status === "WAITING_YOU_SEND"
                  ? "Từ chối hủy"
                  : action
                    ? labels[action]
                    : "Xác nhận"
        }
        isBusy={busy}
        isDanger={
          action === "cancel" || action === "reject" || action === "dispute"
        }
        onConfirm={() => void confirm()}
      >
        {action !== "dispute" && (
          <p className={styles.dialogText}>
            {action === "accept"
              ? "Bằng việc chấp nhận, bạn đồng ý với các điều khoản trao đổi."
              : action === "fund"
                ? `Giữ ${formatVnd(detail.viewerFundingAmount ?? 0)} từ ví mô phỏng. Kiểm tra khoản tiền trước khi xác nhận.`
                : action === "retry"
                  ? "Gửi lại đúng mã và nội dung của thao tác trước để xác nhận kết quả."
                  : action === "complete"
                    ? "Bạn xác nhận đã kiểm tra sách? Xác nhận này không rút ngắn hạn khiếu nại. Tiền cọc tiếp tục được giữ đến khi cả hai hạn kiểm tra 72 giờ kết thúc và không có tranh chấp."
                    : action === "cancel" &&
                        detail.status === "WAITING_YOU_SEND"
                      ? detail.cancellationRequestedBy
                        ? "Đối tác đã đề nghị hủy giao dịch này trước khi gửi sách. Bằng việc đồng ý, giao dịch sẽ hủy an toàn và toàn bộ 100% tiền cọc cùng tiền bù của cả hai bên sẽ được hoàn trả về ví mô phỏng. Sách sẽ được mở lại trên kệ."
                        : "Bạn có chắc muốn gửi yêu cầu hủy giao dịch trao đổi này trước khi gửi sách? Hệ thống sẽ gửi thông báo đến đối tác. Khi đối tác xác nhận đồng thuận, giao dịch sẽ hủy và hoàn trả 100% tiền cọc cho cả hai bên."
                      : action === "reject" &&
                          detail.status === "WAITING_YOU_SEND"
                        ? "Bạn có chắc muốn từ chối yêu cầu hủy của đối tác để tiếp tục giao dịch? Hãy nhập lý do để đối tác yên tâm chuẩn bị và gửi sách đúng hạn."
                        : "Kiểm tra thông tin trước khi xác nhận thao tác này."}
          </p>
        )}
        {action === "dispute" ? (
          <div className={styles.disputeContainer}>
            <div className={styles.disputeNoticeBanner}>
              <div className={styles.noticeIconWrap}>
                <ShieldAlert size={18} />
              </div>
              <div className={styles.noticeContent}>
                <strong>Bảo vệ quyền lợi &amp; Ký quỹ an toàn:</strong>
                <p>
                  Giao dịch sẽ tạm dừng tất toán ngay lập tức. Toàn bộ tiền cọc
                  bảo chứng và tiền bù được giữ an toàn trên Ledger để Hội đồng
                  Quản trị thẩm định qua video unboxing và ảnh đối chiếu.
                </p>
              </div>
            </div>

            <div className={styles.disputeForm}>
              <div className={styles.formGroup}>
                <label htmlFor="dispute-category" className={styles.inputLabel}>
                  <span>Phân loại sự cố</span>
                  <span className={styles.reqStar}>*</span>
                </label>
                <div className={styles.selectWrap}>
                  <select
                    id="dispute-category"
                    className={styles.select}
                    value={disputeCategory}
                    onChange={(e) => setDisputeCategory(e.target.value)}
                    disabled={busy || !!pending}
                  >
                    <option value="Sách rách nát / hư hỏng nặng">
                      Sách rách nát / hư hỏng nặng
                    </option>
                    <option value="Giao sai sách / Không đúng cam kết">
                      Giao sai sách / Không đúng cam kết
                    </option>
                    <option value="Thiếu sách / Bưu kiện rỗng">
                      Thiếu sách / Bưu kiện rỗng
                    </option>
                    <option value="Sách nghi vấn bản in lậu / photo">
                      Sách nghi vấn bản in lậu / photo
                    </option>
                    <option value="Sự cố giao nhận khác">
                      Sự cố giao nhận khác
                    </option>
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <div className={styles.labelWithCounter}>
                  <label htmlFor="dispute-detail" className={styles.inputLabel}>
                    <span>Mô tả chi tiết vấn đề</span>
                    <span className={styles.reqStar}>*</span>
                  </label>
                  <span className={styles.charCounter}>
                    {disputeDetail.length}/220 ký tự
                  </span>
                </div>
                <textarea
                  id="dispute-detail"
                  className={styles.textarea}
                  value={disputeDetail}
                  maxLength={220}
                  placeholder="Mô tả cụ thể vị trí hư hại, vết rách hoặc sự sai lệch của sách lúc mở gói..."
                  disabled={busy || !!pending}
                  onChange={(e) => setDisputeDetail(e.target.value)}
                />
              </div>

              {/* Bằng chứng thẩm định */}
              <div className={styles.evidenceSection}>
                <div className={styles.evidenceHeader}>
                  <div className={styles.evidenceHeaderLeft}>
                    <span className={styles.evidenceSectionIcon}>📋</span>
                    <span className={styles.evidenceTitle}>
                      Bằng chứng thẩm định (Ảnh &amp; Video)
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.sampleButton}
                    onClick={handleUseSampleEvidence}
                    title="Tự động nạp dữ liệu video và ảnh mẫu"
                  >
                    ⚡ Dùng dữ liệu mẫu (Demo)
                  </button>
                </div>

                <div className={styles.evidenceGrid}>
                  {/* Cột 1: Ảnh chụp sách */}
                  <div
                    className={`${styles.evidenceCard} ${imagePreview ? styles.cardActive : ""}`}
                  >
                    <div className={styles.evidenceCardHead}>
                      <span className={styles.evidenceCardTitle}>
                        📷 Ảnh chụp sách lỗi
                      </span>
                      <span
                        className={
                          imagePreview ? styles.badgeSuccess : styles.badgeMuted
                        }
                      >
                        {imagePreview ? "✓ Đã có ảnh" : "Chưa có ảnh"}
                      </span>
                    </div>

                    <div className={styles.evidenceActions}>
                      <input
                        type="file"
                        id="evidence-image-input"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleImagePicked}
                      />
                      <button
                        type="button"
                        className={styles.btnUpload}
                        onClick={() =>
                          document
                            .getElementById("evidence-image-input")
                            ?.click()
                        }
                        title={imageFileName || "Chọn ảnh từ máy"}
                      >
                        {imageFileName ? "Đổi ảnh..." : "Chọn ảnh từ máy..."}
                      </button>
                      <button
                        type="button"
                        className={styles.btnMiniSample}
                        onClick={handleUseSampleImageOnly}
                        title="Nạp ảnh mẫu sách rách"
                      >
                        ⚡ Ảnh mẫu
                      </button>
                    </div>

                    <div className={styles.evidencePreviewBox}>
                      {imagePreview ? (
                        <div className={styles.imageWrapper}>
                          <img
                            src={imagePreview}
                            alt="Xem trước bằng chứng"
                            className={styles.previewImage}
                          />
                          <div className={styles.previewOverlayBadge}>
                            <span>{imageFileName || "Ảnh bằng chứng"}</span>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={styles.emptyPlaceholder}
                          onClick={() =>
                            document
                              .getElementById("evidence-image-input")
                              ?.click()
                          }
                        >
                          <span className={styles.emptyIcon}>📷</span>
                          <span className={styles.emptyText}>
                            Chọn ảnh chụp vết rách / hư hại
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cột 2: Video unboxing */}
                  <div
                    className={`${styles.evidenceCard} ${videoPreview ? styles.cardActive : ""}`}
                  >
                    <div className={styles.evidenceCardHead}>
                      <span className={styles.evidenceCardTitle}>
                        📹 Video unboxing
                      </span>
                      <span
                        className={
                          videoPreview ? styles.badgeSuccess : styles.badgeMuted
                        }
                      >
                        {videoPreview ? "✓ Đã nạp clip 3.5s" : "Chưa có clip"}
                      </span>
                    </div>

                    <div className={styles.evidenceActions}>
                      <input
                        type="file"
                        id="evidence-video-input"
                        accept="video/*"
                        style={{ display: "none" }}
                        onChange={handleVideoPicked}
                      />
                      <button
                        type="button"
                        className={styles.btnUpload}
                        onClick={() =>
                          document
                            .getElementById("evidence-video-input")
                            ?.click()
                        }
                        title={videoFileName || "Chọn video từ máy (3-4s)"}
                      >
                        {videoFileName ? "Đổi clip..." : "Chọn video từ máy..."}
                      </button>
                      <button
                        type="button"
                        className={styles.btnMiniSample}
                        onClick={handleUseSampleVideoOnly}
                        title="Nạp video unboxing 3.5s mẫu"
                      >
                        ⚡ Video mẫu 3s
                      </button>
                    </div>

                    <div className={styles.evidencePreviewBox}>
                      {videoPreview ? (
                        <div className={styles.videoWrapper}>
                          <video
                            key={videoPreview}
                            src={videoPreview}
                            controls
                            playsInline
                            preload="metadata"
                            className={styles.previewVideo}
                          />
                          <div className={styles.videoOverlayBadge}>
                            <span>
                              {videoFileName || "sample-unboxing.mp4 · 3.5s"}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={styles.emptyPlaceholder}
                          onClick={() =>
                            document
                              .getElementById("evidence-video-input")
                              ?.click()
                          }
                        >
                          <span className={styles.emptyIcon}>📹</span>
                          <span className={styles.emptyText}>
                            Clip mở gói đồng kiểm GHN (3-4s)
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : action === "reject" ? (
          <>
            <label htmlFor="exchange-reason">
              {detail.status === "WAITING_YOU_SEND"
                ? "Lý do từ chối hủy (từ 5 đến 300 ký tự)"
                : "Lý do từ chối"}
            </label>
            <textarea
              id="exchange-reason"
              className={styles.textarea}
              value={reason}
              maxLength={300}
              placeholder={
                detail.status === "WAITING_YOU_SEND"
                  ? "Ví dụ: Tôi đã đóng gói sách cẩn thận và sẽ gửi đi ngay hôm nay..."
                  : ""
              }
              disabled={busy || !!pending}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        ) : null}
        {error && (
          <p role="alert" className={styles.errorText}>
            {error}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
