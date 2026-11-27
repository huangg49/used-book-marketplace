import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowUpRight, MessageCircle, ShoppingBag } from "lucide-react";
import { InfoTip } from "../../components/InfoTip";
import { ROUTES } from "../../lib/routes";
import type { PublicListing } from "../../services/public-listings";
import { ExchangePreferencesCard } from "./ExchangePreferencesCard";
import type { ListingPurchaseState } from "./listing-purchase-state";
import styles from "../BookDetailPage.module.css";

type Props = {
  book: PublicListing;
  purchase: ListingPurchaseState;
  signedIn: boolean;
  /** The chat request must wait while the listing or session is settling. */
  chatBlocked: boolean;
  onRequestPurchase: () => void;
};

export function PurchasePanel({ book, purchase, signedIn, chatBlocked, onRequestPurchase }: Props) {
  const {
    held, heldLabel, isOwner, orderConversation, buyerOrder,
    conversationToOpen, offersExchange, canProposeExchange,
  } = purchase;
  const forSale = book.salePrice !== null;
  if (!forSale && !offersExchange) return null;

  return (
    <section className={styles.purchaseSection} aria-labelledby="purchase-heading">
      <div className={styles.headingRow}>
        <h2 id="purchase-heading" className={styles.purchaseSectionTitle}>
          {purchase.title}
        </h2>
        <InfoTip label={purchase.title}>{purchase.subtitle}</InfoTip>
      </div>

      {forSale && (
        <div className={styles.actionRow}>
          {!isOwner && !held && (
            <Link className={styles.primary} to={ROUTES.buyNow(book.id)}>
              <ShoppingBag size={18} aria-hidden="true" />
              {book.bundle ? "Mua cả bộ" : "Mua ngay"}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          )}
          {conversationToOpen ? (
            <Link
              className={styles.secondary}
              to={`${ROUTES.chat(conversationToOpen.id)}${buyerOrder ? "" : "?openChat=1"}`}
            >
              <MessageCircle size={18} aria-hidden="true" />
              {purchase.chatLabel}
              <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          ) : (
            !isOwner && (
              <button
                type="button"
                className={styles.secondary}
                disabled={held || chatBlocked}
                onClick={onRequestPurchase}
              >
                <MessageCircle size={18} aria-hidden="true" />
                {held ? heldLabel : "Chat với người bán"}
                {!held && <ArrowUpRight size={18} aria-hidden="true" />}
              </button>
            )
          )}
        </div>
      )}

      {held && !orderConversation && signedIn && (
        <Link className={styles.secondary} to="/orders">
          <ShoppingBag size={18} aria-hidden="true" />
          Xem đơn hàng của tôi
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      )}

      {forSale && canProposeExchange && (
        <div className={styles.actionDivider} aria-hidden="true">
          <span className={styles.dividerDot} />
        </div>
      )}

      {canProposeExchange && (
        <Link
          className={forSale ? styles.secondary : styles.primary}
          to={ROUTES.exchangeCompose(book.id)}
        >
          <ArrowLeftRight size={18} aria-hidden="true" />
          Đề nghị đổi sách
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      )}

      {offersExchange && (
        <ExchangePreferencesCard preferences={book.exchangePreferences} isOwner={isOwner} />
      )}

      {offersExchange && isOwner && (
        <Link className={styles.primary} to={ROUTES.exchangeMine}>
          <ArrowLeftRight size={18} aria-hidden="true" />
          Trao đổi của tôi
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
