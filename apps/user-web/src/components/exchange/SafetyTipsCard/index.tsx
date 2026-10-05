import { ShieldCheck, Camera, Box, Receipt } from 'lucide-react';
import styles from './SafetyTipsCard.module.css';

export function SafetyTipsCard() {
    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <div className={styles.iconCircle}>
                    <ShieldCheck size={20} />
                </div>
                <h3 className={styles.title}>Mẹo An Toàn Khi Trao Đổi</h3>
            </div>
            <div className={styles.content}>
                <div className={styles.tipRow}>
                    <Camera className={styles.iconGold} size={18} />
                    <p className={styles.tipText}>
                        <strong>Chụp ảnh trước khi gửi:</strong> Luôn chụp lại tình trạng sách, bìa và gáy sách trước khi đóng gói để làm bằng chứng nếu có tranh chấp.
                    </p>
                </div>
                <div className={styles.tipRow}>
                    <Box className={styles.iconGold} size={18} />
                    <p className={styles.tipText}>
                        <strong>Đóng gói cẩn thận:</strong> Bọc sách bằng màng chống sốc hoặc giấy bìa cứng để tránh hư hỏng gãy góc trong quá trình vận chuyển.
                    </p>
                </div>
                <div className={styles.tipRow}>
                    <Receipt className={styles.iconGold} size={18} />
                    <p className={styles.tipText}>
                        <strong>Lưu giữ mã vận đơn:</strong> Giữ biên lai bưu điện và chia sẻ mã vận đơn vào khung chat để đối tác có thể theo dõi tiến trình.
                    </p>
                </div>
                <div className={styles.tipRow}>
                    <ShieldCheck className={styles.iconGold} size={18} />
                    <p className={styles.tipText}>
                        <strong>Gặp trực tiếp:</strong> Hãy chọn nơi công cộng vào ban ngày. Báo cáo sự cố ngay nếu có vấn đề.
                    </p>
                </div>
            </div>
        </div>
    );
}
