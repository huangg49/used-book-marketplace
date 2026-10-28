import type {
  AuctionIntakeDoc,
  DirectOrderDoc,
  ExchangeDoc,
  PointOrderDoc,
} from '../../database/mongo/documents.js';
import type { Wire } from '../commands/domain-error.js';
import {
  hasExchangeDispute,
  inspectionDeadlines,
} from '../exchanges/exchange-inspection.js';

type Attention = Wire['WorkItem']['attention'];
export type Guidance = {
  attention: Attention;
  reason: string;
  dueAt: Date | null;
};
const guide = (
  attention: Attention,
  reason: string,
  dueAt: Date | null = null,
): Guidance => ({ attention, reason, dueAt });

// These are prompts to open a record, never command eligibility. The owning
// service remains authoritative for account, version, custody and money checks.
export function directGuidance(
  o: DirectOrderDoc,
  userId: string,
  active: boolean,
): Guidance {
  const buyer = o.buyerId === userId;
  switch (o.state) {
    case 'AwaitingPayment':
      return guide(
        buyer ? (active ? 'Action' : 'Blocked') : 'Waiting',
        buyer
          ? active
            ? 'Đơn đang chờ thanh toán. Mở chi tiết để kiểm tra điều kiện và khoản cần trả.'
            : 'Tài khoản hiện không được thanh toán mới. Mở đơn để kiểm tra nghĩa vụ còn lại.'
          : 'Đang chờ người mua thanh toán.',
        o.paymentDeadline,
      );
    case 'PendingSellerConfirmation':
      return guide(
        buyer ? 'Waiting' : 'Action',
        buyer
          ? 'Đã giữ tiền; đang chờ người bán xác nhận.'
          : 'Người mua đã thanh toán. Bạn cần xem và xác nhận hoặc từ chối đơn.',
        o.sellerConfirmationDeadline,
      );
    case 'Preparing':
      return guide(
        buyer ? 'Waiting' : 'Action',
        buyer
          ? 'Đang chờ người bán chuẩn bị sách.'
          : 'Bạn cần xem yêu cầu chuẩn bị sách trong đơn.',
      );
    case 'Inspection':
      return guide(
        buyer ? 'Action' : 'Waiting',
        buyer
          ? 'Mở đơn để xem trạng thái và thời gian kiểm tra sách.'
          : 'Đang chờ người mua kiểm tra sách.',
        o.inspectionDeadline,
      );
    case 'ResolutionPending':
      return guide(
        'Waiting',
        'Đang chờ bộ phận vận hành xác minh. Tiền vẫn theo trạng thái trong đơn.',
      );
    case 'SettlementPending':
      return guide(
        'Waiting',
        'Đang xử lý hoàn tiền; chưa phải giao dịch hoàn tất.',
      );
    default:
      return guide(
        'Waiting',
        'Theo dõi tiến trình trong đơn; chưa có bước mới được xác nhận cho bạn.',
      );
  }
}
export function exchangeGuidance(
  e: ExchangeDoc,
  userId: string,
  active: boolean,
): Guidance {
  if (hasExchangeDispute(e))
    return guide(
      'Waiting',
      'Trao đổi đang cần xác minh vấn đề. Không coi trạng thái giao nhận là quyền hoàn tất.',
    );
  const initiator = e.initiatorId === userId;
  switch (e.status) {
    case 'Proposed':
      return guide(
        (e.lastProposedById ?? e.initiatorId) === userId
          ? 'Waiting'
          : active
            ? 'Action'
            : 'Blocked',
        (e.lastProposedById ?? e.initiatorId) === userId
          ? 'Đang chờ đối tác trả lời đề nghị mới nhất của bạn.'
          : active
            ? 'Bạn có đề nghị mới cần xem và trả lời.'
            : 'Bạn có đề nghị nhưng tài khoản hiện không được chấp nhận trao đổi mới.',
        e.proposalExpiresAt,
      );
    case 'AcceptedAwaitingFunding':
      return (initiator ? e.initiatorFundedAt : e.recipientFundedAt)
        ? guide(
            'Waiting',
            'Bạn đã góp tiền; đang chờ đối tác.',
            e.fundingDeadline,
          )
        : guide(
            active ? 'Action' : 'Blocked',
            active
              ? 'Bạn cần xem khoản ký quỹ và chênh lệch trước khi góp tiền.'
              : 'Tài khoản hiện không được góp tiền mới.',
            e.fundingDeadline,
          );
    case 'Preparing':
      return guide(
        (initiator ? e.initiatorShippedAt : e.recipientShippedAt)
          ? 'Waiting'
          : 'Action',
        (initiator ? e.initiatorShippedAt : e.recipientShippedAt)
          ? 'Bạn đã ghi nhận gửi sách; theo dõi phía đối tác.'
          : 'Bạn cần mở trao đổi để xem bước chuẩn bị và gửi sách.',
        e.shippingDeadline ?? null,
      );
    case 'Delivered': {
      const due = inspectionDeadlines(e)[initiator ? 'initiator' : 'recipient'];
      const completed = initiator
        ? e.initiatorCompletedAt
        : e.recipientCompletedAt;
      return guide(
        completed || !due ? 'Waiting' : 'Action',
        completed
          ? 'Bạn đã xác nhận; thời gian kiểm tra của hai bên vẫn được giữ.'
          : due
            ? 'Kiểm tra sách đã nhận và báo vấn đề trong thời hạn nếu có.'
            : 'Chưa ghi nhận nhận sách cho phía bạn; mở giao dịch để kiểm tra.',
        due,
      );
    }
    default:
      return guide(
        'Waiting',
        'Theo dõi trạng thái và bên đang xử lý trong trao đổi.',
      );
  }
}
export function intakeGuidance(i: AuctionIntakeDoc, active: boolean): Guidance {
  switch (i.state) {
    case 'AwaitingDropoff':
      return guide(
        'Action',
        'Mang sách tới đúng điểm đã chọn; chỉ nhân viên điểm ghi nhận nhận sách.',
        i.dropoffDeadline,
      );
    case 'NeedsEvidence':
      return guide(
        i.evidenceSubmittedAt ? 'Waiting' : 'Action',
        i.evidenceSubmittedAt
          ? 'Đã bổ sung bằng chứng; đang chờ nhân viên độc lập xem xét.'
          : 'Bạn cần mở lần gửi để đọc yêu cầu và bổ sung bằng chứng.',
        i.evidenceDeadline,
      );
    case 'Passed':
      return guide(
        active ? 'Action' : 'Blocked',
        'Sách đã qua kiểm tra. Mở lần gửi để chọn thời gian công bố phiên.',
      );
    case 'ReclaimRequired':
      return guide(
        'Action',
        'Liên hệ điểm để nhận lại sách; nhân viên xác nhận bàn giao.',
      );
    default:
      return guide(
        'Waiting',
        'Điểm đang kiểm tra sách. Xem báo cáo trong lần gửi.',
      );
  }
}
export function pointGuidance(
  o: PointOrderDoc,
  userId: string,
  active: boolean,
): Guidance {
  if (o.buyerId !== userId)
    return guide('Waiting', 'Theo dõi người mua và điểm xử lý đơn đấu giá.');
  switch (o.state) {
    case 'AwaitingPayment':
      return guide(
        active ? 'Action' : 'Blocked',
        active
          ? 'Bạn đã chốt sách; mở đơn để kiểm tra điều kiện thanh toán và thời hạn.'
          : 'Tài khoản hiện không được thanh toán mới.',
        o.paymentDeadline,
      );
    case 'Fulfilling':
      return o.acceptedAt
        ? guide(
            'Waiting',
            'Bạn đã chấp nhận báo cáo; đang chờ điểm chuẩn bị sách.',
          )
        : guide(
            'Action',
            'Bạn cần xem báo cáo kiểm tra của điểm và quyết định nhận hoặc báo vấn đề.',
            o.acceptanceDeadline,
          );
    case 'ReadyForCollection':
      return guide(
        'Action',
        'Đọc hướng dẫn tại đơn để nhận sách ở điểm đã chọn.',
        o.collectionDeadline,
      );
    case 'Inspection':
      return guide(
        'Action',
        'Kiểm tra sách; mở đơn để báo vấn đề nếu có.',
        o.inspectionDeadline,
      );
    case 'ReturnPending':
      return guide(
        'Action',
        'Mở đơn để xem yêu cầu trả sách về điểm.',
        o.returnDeadline,
      );
    case 'ResolutionPending':
      return guide('Waiting', 'Đang chờ quản trị viên độc lập xử lý vấn đề.');
    default:
      return guide('Waiting', 'Theo dõi tiến trình trong đơn đấu giá.');
  }
}
export function atReadTime(
  g: Guidance,
  now: Date,
): Omit<
  Wire['WorkItem'],
  'id' | 'target' | 'targetId' | 'sourceState' | 'version' | 'title'
> {
  const expired = g.dueAt !== null && g.dueAt <= now;
  return {
    attention: expired ? 'Waiting' : g.attention,
    reason: expired
      ? 'Đã tới hạn xử lý. Mở giao dịch để xem kết quả cập nhật và hướng dẫn hiện tại.'
      : g.reason,
    dueAt: g.dueAt?.toISOString() ?? null,
  };
}
