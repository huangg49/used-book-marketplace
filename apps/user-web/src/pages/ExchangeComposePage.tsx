import { useState, useMemo } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BookmarkPlus, Library, ArrowLeft, Send, Search, FileText, PlusCircle } from 'lucide-react'
import { useSession } from '../hooks/useSession'
import { ROUTES, formatVnd } from '../lib/routes'
import { MOCK_TARGET_BOOKS, MY_BOOKS, submitExchangeRequest } from '../lib/mock/exchangeCompose'
import { BookCover } from '../components/BookCover'
import styles from './ExchangeComposePage.module.css'

const MAX_BOOKS = 3

const formSchema = z.object({
    selectedBookIds: z.array(z.string()).min(1, 'Vui lòng chọn ít nhất 1 cuốn sách').max(MAX_BOOKS, `Chọn tối đa ${MAX_BOOKS} cuốn`),
    message: z.string().max(500, 'Lời nhắn tối đa 500 ký tự'),
    moneyCompensation: z.enum(['none', 'user_pays', 'other_pays']),
    moneyAmount: z.preprocess((val) => {
        if (val === '' || Number.isNaN(val)) return undefined;
        return Number(val);
    }, z.number().int().min(1000, 'Số tiền không hợp lệ').optional()),
    deliveryMethod: z.enum(['meetup', 'shipping'], { message: 'Vui lòng chọn phương thức giao nhận' })
}).superRefine((data, ctx) => {
    if (data.moneyCompensation !== 'none') {
        if (!data.moneyAmount || data.moneyAmount < 1000) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Vui lòng nhập số tiền hợp lệ (> 1000đ)',
                path: ['moneyAmount']
            })
        }
    }
})


export default function ExchangeComposePage() {
    const sessionState = useSession()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const bookId = searchParams.get('book')

    const [searchQuery, setSearchQuery] = useState('')
    const [showPreview, setShowPreview] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Form setup
    const { register, handleSubmit, watch, getValues, formState: { errors } } = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            selectedBookIds: [],
            message: '',
            moneyCompensation: 'none',
            deliveryMethod: 'shipping',
        },
        mode: 'onChange'
    })

    const selectedBookIds = watch('selectedBookIds')
    const moneyCompensation = watch('moneyCompensation')
    const message = watch('message')

    const targetBook = bookId ? MOCK_TARGET_BOOKS[bookId] : null

    // Filter books
    const filteredMyBooks = useMemo(() => {
        return MY_BOOKS.filter(b => {
            const query = searchQuery.toLowerCase()
            return b.title.toLowerCase().includes(query) || b.author.toLowerCase().includes(query)
        })
    }, [searchQuery])

    const isMaxSelected = selectedBookIds.length >= MAX_BOOKS

    // Auth check (Tạm tắt để test UI khi không chạy backend)
    // if (sessionState.status === 'anonymous') {
    //     return <Navigate to={`${ROUTES.login}?returnUrl=${encodeURIComponent(location.pathname + location.search)}`} replace />
    // }

    const onSubmit = async () => {
        if (!targetBook) return
        setShowPreview(true)
    }

    const handleConfirmSubmit = async () => {
        if (!targetBook) return
        setIsSubmitting(true)
        try {
            const data = getValues() as any
            await submitExchangeRequest(targetBook.id, data)
            navigate(ROUTES.exchangeMine, { replace: true })
        } catch (_error) {
            alert('Có lỗi xảy ra, vui lòng thử lại sau.')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!targetBook) {
        return (
            <div className={styles.container}>
                <div className={styles.emptyState}>
                    <h2>Không tìm thấy sách</h2>
                    <p className={styles.pageSubtitle}>Cuốn sách bạn muốn trao đổi không tồn tại hoặc đã bị xóa.</p>
                    <Link to={ROUTES.exchange} className={styles.emptyStateBtn}>Về trang Trao đổi</Link>
                </div>
            </div>
        )
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.pageTitle}>Soạn đề nghị trao đổi</h1>
                <p className={styles.pageSubtitle}>Kết nối những trang sách, viết tiếp những câu chuyện.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
                <div className={styles.grid}>
                    {/* CỘT TRÁI */}
                    <div className={styles.leftCol}>
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <BookmarkPlus className={styles.icon} />
                                <h2>Sách bạn muốn nhận</h2>
                            </div>
                            
                            <div className={styles.targetBookInfo}>
                                <div className={styles.targetBookCover}>
                                    <BookCover title={targetBook.title} index={0} coverUrl={targetBook.coverUrl} />
                                </div>
                                <h3 className={styles.targetBookTitle}>{targetBook.title}</h3>
                                <p className={styles.targetBookAuthor}>{targetBook.author}</p>
                            </div>

                            <div className={styles.targetBookDetails}>
                                <div className={styles.detailRow}>
                                    <span className={styles.detailLabel}>Tình trạng</span>
                                    <span className={styles.detailValue} style={{ color: 'var(--gold-strong)' }}>{targetBook.condition}</span>
                                </div>
                                <div className={styles.detailRow}>
                                    <span className={styles.detailLabel}>Phiên bản</span>
                                    <span className={styles.detailValue}>{targetBook.edition}</span>
                                </div>
                                <div className={styles.detailRow}>
                                    <span className={styles.detailLabel}>Sở hữu bởi</span>
                                    <span className={styles.detailValue}>{targetBook.ownerName}</span>
                                </div>
                            </div>
                        </div>
                        
                        <button type="button" onClick={() => navigate(-1)} className={styles.backBtn}>
                            <ArrowLeft size={16} /> QUAY LẠI CHỌN SÁCH KHÁC
                        </button>
                    </div>

                    {/* CỘT PHẢI */}
                    <div className={styles.rightCol}>
                        <div className={`${styles.card} ${styles.cardThemePaper}`}>
                            <div className={styles.cardHeader}>
                                <Library className={styles.icon} />
                                <h2>Chọn sách của bạn để đổi</h2>
                                <span className={styles.selectionBadge} aria-live="polite">
                                    Đã chọn {selectedBookIds.length}/{MAX_BOOKS} cuốn
                                </span>
                            </div>

                            {MY_BOOKS.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <p>Tủ sách của bạn chưa có cuốn nào</p>
                                    <Link to={ROUTES.sell} className={styles.emptyStateBtn}>Đăng sách của bạn</Link>
                                </div>
                            ) : (
                                <>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                                        <input 
                                            type="text" 
                                            placeholder="Tìm kiếm sách trong tủ sách của bạn..." 
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className={styles.searchInput}
                                        />
                                    </div>

                                    {errors.selectedBookIds && <p className={styles.errorText}>{errors.selectedBookIds.message}</p>}

                                    <div className={styles.bookGrid}>
                                        {filteredMyBooks.map(book => {
                                            const isSelected = selectedBookIds.includes(book.id)
                                            const isDisabled = !isSelected && isMaxSelected
                                            return (
                                                <label 
                                                    key={book.id} 
                                                    className={styles.selectableCard} 
                                                    data-selected={isSelected}
                                                    data-disabled={isDisabled}
                                                >
                                                    <div className={styles.checkboxWrapper}>
                                                        <input 
                                                            type="checkbox" 
                                                            value={book.id}
                                                            {...register('selectedBookIds')}
                                                            disabled={isDisabled}
                                                        />
                                                    </div>
                                                    <div className={styles.selectBookCover}>
                                                        <BookCover title={book.title} index={parseInt(book.id.replace(/\D/g, '') || '0')} coverUrl={book.coverUrl} />
                                                    </div>
                                                    <div className={styles.selectBookInfo}>
                                                        <p className={styles.selectBookTitle} title={book.title}>{book.title}</p>
                                                        <p className={styles.selectBookAuthor} title={book.author}>{book.author}</p>
                                                    </div>
                                                </label>
                                            )
                                        })}
                                        
                                        <Link to={ROUTES.sell} className={styles.addBookCard}>
                                            <PlusCircle size={32} className={styles.addIcon} />
                                            Đăng thêm sách vào tủ sách
                                        </Link>

                                        {isMaxSelected && (
                                            <p className={styles.maxSelectionNote}>Bạn có thể đổi tối đa 3 cuốn cho mỗi đề nghị</p>
                                        )}
                                        {errors.selectedBookIds && (
                                            <p className={styles.errorText} style={{ width: '100%' }}>{errors.selectedBookIds.message}</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* PHẦN DƯỚI: CHI TIẾT ĐỀ NGHỊ */}
                <div className={styles.bottomSection}>
                    <div className={styles.card}>
                        <div className={styles.formSectionHeader}>
                            <FileText className={styles.icon} />
                            <h2>Chi tiết đề nghị trao đổi</h2>
                        </div>

                        <div className={styles.messageGroup}>
                            <div className={styles.textareaHeader}>
                                <label htmlFor="message" className={styles.label}>Lời nhắn (tùy chọn)</label>
                                <span className={styles.charCount}>{message?.length || 0}/500</span>
                            </div>
                            <textarea 
                                id="message"
                                className={`${styles.textarea} ${styles.textareaPaper}`}
                                rows={4}
                                placeholder="VD: Chào bạn, tôi rất muốn trao đổi 2 cuốn sách này lấy cuốn The Great Gatsby của bạn..."
                                {...register('message')}
                                maxLength={500}
                            />
                            {errors.message && <p className={styles.errorText}>{errors.message.message}</p>}
                        </div>

                        <div className={styles.formGrid}>
                            <div className={styles.formGroupBox}>
                                <fieldset>
                                    <legend className={styles.legend}>Đề nghị bù tiền</legend>
                                    <div className={styles.radioGroup}>
                                        <label className={styles.radioLabel}>
                                            <input type="radio" value="none" className={styles.radioInput} {...register('moneyCompensation')} />
                                            <div className={styles.radioContent}>
                                                <span className={styles.radioTitle}>Không bù tiền (trao đổi ngang giá)</span>
                                            </div>
                                        </label>
                                        
                                        <label className={styles.radioLabel}>
                                            <input type="radio" value="user_pays" className={styles.radioInput} onClick={() => setTimeout(() => document.getElementById('user_pays_input')?.focus(), 0)} {...register('moneyCompensation')} />
                                            <div className={styles.radioContentFlex}>
                                                <span className={styles.radioTitle}>Tôi sẽ bù thêm:</span>
                                                <div className={styles.moneyInputWrapper}>
                                                    <input 
                                                        id="user_pays_input"
                                                        type="number" 
                                                        inputMode="numeric"
                                                        placeholder="0" 
                                                        className={styles.moneyInputInline}
                                                        disabled={moneyCompensation !== 'user_pays'}
                                                        aria-label="Số tiền tôi bù thêm, đơn vị đồng"
                                                        aria-describedby={errors.moneyAmount && moneyCompensation === 'user_pays' ? 'money-error-user' : undefined}
                                                        {...register('moneyAmount', { valueAsNumber: true })}
                                                    />
                                                    <span className={styles.currency}>VND</span>
                                                </div>
                                            </div>
                                        </label>
                                        {errors.moneyAmount && moneyCompensation === 'user_pays' && <p id="money-error-user" className={styles.errorText}>{errors.moneyAmount.message}</p>}
                                        
                                        <label className={styles.radioLabel}>
                                            <input type="radio" value="other_pays" className={styles.radioInput} onClick={() => setTimeout(() => document.getElementById('other_pays_input')?.focus(), 0)} {...register('moneyCompensation')} />
                                            <div className={styles.radioContentFlex}>
                                                <span className={styles.radioTitle}>Họ sẽ bù thêm:</span>
                                                <div className={styles.moneyInputWrapper}>
                                                    <input 
                                                        id="other_pays_input"
                                                        type="number" 
                                                        inputMode="numeric"
                                                        placeholder="0" 
                                                        className={styles.moneyInputInline}
                                                        disabled={moneyCompensation !== 'other_pays'}
                                                        aria-label="Số tiền họ bù thêm, đơn vị đồng"
                                                        aria-describedby={errors.moneyAmount && moneyCompensation === 'other_pays' ? 'money-error-other' : undefined}
                                                        {...register('moneyAmount', { valueAsNumber: true })}
                                                    />
                                                    <span className={styles.currency}>VND</span>
                                                </div>
                                            </div>
                                        </label>
                                        {errors.moneyAmount && moneyCompensation === 'other_pays' && <p id="money-error-other" className={styles.errorText}>{errors.moneyAmount.message}</p>}
                                    </div>
                                    <div className={styles.helpTextBottom}>Số tiền chỉ để hai bên ghi nhận và thỏa thuận, Lật lại không xử lý thanh toán.</div>
                                </fieldset>
                            </div>

                            <div className={styles.formGroupBox}>
                                <fieldset>
                                    <legend className={styles.legend}>Phương thức giao nhận</legend>
                                    <div className={styles.radioGroup}>
                                        <label className={styles.radioLabel}>
                                            <input type="radio" value="meetup" className={styles.radioInput} {...register('deliveryMethod')} />
                                            <div className={styles.radioContent}>
                                                <span className={styles.radioTitle}>Gặp trực tiếp</span>
                                                <span className={styles.helpTextDesc}>
                                                    {/* @ts-ignore - TODO: Add location to User type */}
                                                    {sessionState.user?.location ? (
                                                        // @ts-ignore
                                                        `Khu vực của bạn: ${sessionState.user.location} - Khuyến nghị gặp ở nơi công cộng`
                                                    ) : (
                                                        <>Chưa cập nhật khu vực (<Link to={'/profile'} style={{ color: 'var(--leather)', textDecoration: 'underline' }}>Cập nhật hồ sơ</Link>) - Khuyến nghị gặp ở nơi công cộng</>
                                                    )}
                                                </span>
                                            </div>
                                        </label>
                                        <label className={styles.radioLabel}>
                                            <input type="radio" value="shipping" className={styles.radioInput} {...register('deliveryMethod')} />
                                            <div className={styles.radioContent}>
                                                <span className={styles.radioTitle}>Gửi qua đường bưu điện</span>
                                                <span className={styles.helpTextDesc}>Cước phí do hai bên thỏa thuận tự trả.</span>
                                            </div>
                                        </label>
                                    </div>
                                    {errors.deliveryMethod && <p className={styles.errorText}>{errors.deliveryMethod.message}</p>}
                                </fieldset>
                            </div>
                        </div>

                        <div className={styles.formActions}>
                            <button type="submit" className={styles.btnSecondary}>
                                Xem lại đề nghị
                            </button>
                            <button type="submit" disabled={isSubmitting} className={styles.btnPrimary}>
                                {isSubmitting ? (
                                    <>Đang gửi...</>
                                ) : (
                                    <><Send size={18} /> Gửi đề nghị</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </form>

            {/* Modal xem lại */}
            {showPreview && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h2 className={styles.modalTitle}>Xem lại đề nghị</h2>
                        
                        <div className={styles.summarySection}>
                            <div className={styles.summaryLabel}>Sách bạn muốn nhận:</div>
                            <div>{targetBook.title} - {targetBook.author}</div>
                        </div>

                        <div className={styles.summarySection}>
                            <div className={styles.summaryLabel}>Sách bạn đưa ra:</div>
                            <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                                {selectedBookIds.map(id => {
                                    const b = MY_BOOKS.find(x => x.id === id)
                                    return b ? <li key={id}>{b.title}</li> : null
                                })}
                            </ul>
                        </div>

                        <div className={styles.summarySection}>
                            <div className={styles.summaryLabel}>Bù tiền:</div>
                            <div>
                                {moneyCompensation === 'none' && 'Không bù tiền'}
                                {moneyCompensation === 'user_pays' && `Tôi bù thêm ${formatVnd(Number(watch('moneyAmount')) || 0)}`}
                                {moneyCompensation === 'other_pays' && `Họ bù thêm ${formatVnd(Number(watch('moneyAmount')) || 0)}`}
                            </div>
                        </div>

                        <div className={styles.summarySection}>
                            <div className={styles.summaryLabel}>Giao nhận:</div>
                            <div>{watch('deliveryMethod') === 'meetup' ? 'Gặp trực tiếp' : 'Gửi qua bưu điện'}</div>
                        </div>

                        {message && (
                            <div className={styles.summarySection}>
                                <div className={styles.summaryLabel}>Lời nhắn:</div>
                                <div style={{ whiteSpace: 'pre-wrap', fontStyle: 'italic', fontSize: 14 }}>"{message}"</div>
                            </div>
                        )}

                        <div className={styles.formActions} style={{ borderTop: 'none', paddingTop: 0 }}>
                            <button type="button" onClick={() => setShowPreview(false)} className={styles.btnSecondary}>
                                Sửa
                            </button>
                            <button type="button" onClick={handleConfirmSubmit} disabled={isSubmitting} className={styles.btnPrimary}>
                                {isSubmitting ? 'Đang gửi...' : <><Send size={18} /> Gửi đề nghị</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
