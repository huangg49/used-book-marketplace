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
}

export function ChatPanel({ messages, partner, onSendMessage, isReadOnly, unavailable }: ChatPanelProps) {
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
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
        if (!text || isSending) return;

        setIsSending(true);
        try {
            await onSendMessage(text);
            setInputText('');
            scrollToBottom();
        } catch {
            alert('Gửi tin nhắn thất bại. Vui lòng thử lại.');
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className={styles.chatContainer} data-unavailable={unavailable || undefined}>
            <div className={styles.chatHeader}>
                <div className={styles.avatar}>
                    {partner.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p className={styles.partnerName}>@{partner.username}</p>
                    {/* TODO: Add online status back when socket is integrated */}
                </div>
            </div>

            <div 
                className={styles.messagesArea}
                ref={scrollRef}
                onScroll={checkScroll}
                role="log"
                aria-live="polite"
            >
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
                        {unavailable ? 'Nhắn tin trong trao đổi chưa khả dụng.' : 'Giao dịch đã đóng. Bạn không thể gửi tin nhắn.'}
                    </div>
                ) : (
                    <form className={styles.inputForm} onSubmit={handleSend}>
                        {/* TODO: Add attachment button back when supported */}
                        <label htmlFor="chatInput" className="sr-only">Nhập tin nhắn</label>
                        <textarea 
                            id="chatInput"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Nhập tin nhắn của bạn..."
                            className={styles.textarea}
                            rows={1}
                            maxLength={1000}
                            disabled={isSending}
                        />
                        <button type="submit" disabled={!inputText.trim() || isSending} className={styles.sendBtn} aria-label="Gửi tin nhắn">
                            <Send size={16} />
                        </button>
                    </form>
                )}
                {!isReadOnly && (
                    <div className={styles.charCount}>{inputText.length}/1000</div>
                )}
            </div>
        </div>
    );
}
