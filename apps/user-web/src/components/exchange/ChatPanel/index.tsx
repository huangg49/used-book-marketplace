import { useState, useRef, useEffect } from 'react';
import { Send, ArrowDown } from 'lucide-react';
import type { ExchangeUser } from '../../../lib/mock/exchangeMine';
import type { ChatMessage } from '../../../lib/mock/exchangeDetail';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
    messages: ChatMessage[];
    partner: ExchangeUser;
    onSendMessage: (text: string) => Promise<void>;
    isReadOnly?: boolean;
    unavailable?: boolean;
    giveBooks: string[];
    receiveBooks: string[];
    statusText: string;
    guidance: string;
    isLoading?: boolean;
    loadError?: boolean;
    isRefreshing?: boolean;
    onRetry: () => void;
}

export function ChatPanel({ messages, partner, onSendMessage, isReadOnly, unavailable, giveBooks, receiveBooks, statusText, guidance, isLoading, loadError, isRefreshing, onRetry }: ChatPanelProps) {
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [sendError, setSendError] = useState<string>();
    const scrollRef = useRef<HTMLDivElement>(null);

    const checkScroll = () => {
        if (!scrollRef.current) return;
        const { scrollHeight, scrollTop, clientHeight } = scrollRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
        setShowScrollBtn(!isNearBottom);
    };

    const scrollToBottom = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            setShowScrollBtn(false);
        }
    };

    useEffect(() => {
        if (messages.length > 0) {
            if (!showScrollBtn) {
                scrollToBottom();
            }
        }
    }, [messages.length, showScrollBtn]);

    useEffect(() => {
        scrollToBottom();
    }, []);

    const handleSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const text = inputText.trim();
        if (!text || isSending || isReadOnly || unavailable) return;

        setIsSending(true);
        setSendError(undefined);
        try {
            await onSendMessage(text);
            setInputText('');
            scrollToBottom();
        } catch {
            setSendError('Chưa xác nhận được tin nhắn đã gửi. Nội dung vẫn ở đây; kiểm tra lịch sử trước khi gửi lại.');
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <section id="exchange-chat" className={styles.chatContainer} data-unavailable={unavailable || undefined} aria-label={`Tin nhắn Đổi sách với ${partner.username}`}>
            <div className={styles.chatHeader}>
                <div className={styles.avatar}>
                    {partner.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h2 className={styles.partnerName}>Trao đổi với {partner.username}</h2>
                    <p className={styles.chatType}>Đổi sách · {statusText}</p>
                </div>
            </div>
            <dl className={styles.bookContext}>
                <div><dt>Bạn gửi</dt><dd>{giveBooks.join(', ') || 'Đang tải thông tin sách'}</dd></div>
                <div><dt>Bạn nhận</dt><dd>{receiveBooks.join(', ') || 'Đang tải thông tin sách'}</dd></div>
            </dl>
            <div className={styles.guidance}>
                <p>{guidance}</p>
                {!isReadOnly && <a href="#exchange-actions">Xem bước tiếp theo trong giao dịch</a>}
            </div>
            {loadError && <div className={styles.loadError} role="alert"><p>Chưa tải được tin nhắn. Lịch sử đã tải vẫn được giữ lại.</p><button type="button" onClick={onRetry} disabled={isRefreshing}>Tải lại tin nhắn</button></div>}

            <div 
                className={styles.messagesArea}
                ref={scrollRef}
                onScroll={checkScroll}
                role="log"
                aria-live="polite"
            >
                {isLoading && <p role="status">Đang tải tin nhắn trao đổi…</p>}
                {!isLoading && !loadError && messages.length === 0 && <div className={styles.emptyState}><h3>Trao đổi về những cuốn sách này</h3><p>Hỏi về tình trạng sách hoặc thông tin giao nhận. Các thay đổi đề nghị cần được xác nhận trong phần Hành động của bạn.</p></div>}
                {messages.map((msg) => {
                    const isMine = msg.senderRole === 'viewer';
                    const isSystem = msg.senderRole === 'system';
                    const timeStr = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(msg.sentAt));
                    
                    if (isSystem) {
                        return (
                            <div key={msg.id} className={styles.systemMsgWrapper}>
                                <p className={styles.systemMsg}>{msg.text}</p>
                            </div>
                        );
                    }

                    return (
                        <div key={msg.id} className={`${styles.msgRow} ${isMine ? styles.msgMine : styles.msgTheirs}`}>
                            {!isMine && (
                                <div className={styles.msgAvatar}>
                                    {partner.username.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                                <p className={styles.msgContent}>{msg.text}</p>
                                <span className={styles.msgTime}>{timeStr}</span>
                            </div>
                        </div>
                    );
                })}
                {showScrollBtn && (
                    <button className={styles.scrollBtn} onClick={scrollToBottom} aria-label="Cuộn xuống tin nhắn mới">
                        <ArrowDown size={16} /> Có tin nhắn mới
                    </button>
                )}
            </div>

            <div className={styles.inputArea}>
                {isReadOnly ? (
                    <div className={styles.readOnlyMsg}>
                        {unavailable ? 'Nhắn tin trong trao đổi chưa khả dụng.' : 'Cuộc trao đổi đã kết thúc. Lịch sử tin nhắn vẫn được giữ lại.'}
                    </div>
                ) : (
                    <form onSubmit={handleSend}>
                        <label htmlFor="chatInput" className={styles.inputLabel}>Nhắn cho {partner.username}</label>
                        {sendError && <p className={styles.sendError} role="alert">{sendError}</p>}
                        <div className={styles.inputForm}>
                        <textarea 
                            id="chatInput"
                            value={inputText}
                            onChange={(e) => { setInputText(e.target.value); setSendError(undefined); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Trao đổi về sách hoặc việc giao nhận…"
                            className={styles.textarea}
                            rows={1}
                            maxLength={1000}
                            disabled={isSending}
                        />
                        <button type="submit" disabled={!inputText.trim() || isSending || unavailable} className={styles.sendBtn} aria-label={isSending ? "Đang gửi tin nhắn" : "Gửi tin nhắn"}>
                            <Send size={18} aria-hidden="true" />
                        </button>
                        </div>
                    </form>
                )}
                {!isReadOnly && (
                    <div className={styles.charCount}>{inputText.length}/1000</div>
                )}
            </div>
        </section>
    );
}
