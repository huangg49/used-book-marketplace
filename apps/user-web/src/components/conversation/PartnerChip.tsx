import { Link } from "react-router-dom";
import card from "./TransactionCard.module.css";

/**
 * The other member on a transaction card: a small avatar, the name and
 * the role in one quiet line (no pill), linking to
 * their public reputation page. Members cannot read each other's profile
 * photos (the avatar read is owner/staff only), so the avatar is the initial
 * on a colour picked from the member id, like the seller card on book pages.
 */
export function PartnerChip({ id, name, role }: { id?: string; name: string; role: string }) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("vi-VN") || "?";
  // Stable colour per member, so the same partner looks the same on every card.
  const hue = id ? [...id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5 : 0;
  const body = (
    <>
      <span className={card.avatar} data-hue={hue} aria-hidden="true">{initial}</span>
      <span className={card.partnerName}>{name}</span>
      <span className={card.partnerRole}>{role}</span>
    </>
  );
  return id ? (
    <Link className={card.partner} to={`/members/${id}`} title={`Xem hồ sơ ${name}`}>
      {body}
    </Link>
  ) : (
    <span className={card.partner}>{body}</span>
  );
}
