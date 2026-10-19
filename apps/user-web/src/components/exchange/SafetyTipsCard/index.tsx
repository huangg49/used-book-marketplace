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
                        <strong>Lưu giữ mã vận đơn:</strong> Giữ biên lai và cập nhật mã vận đơn trong phần Giao nhận. Chat chỉ dùng để trao đổi thêm với đối tác.
                    </p>
                </div>
                <div className={styles.tipRow}>
                    <ShieldCheck className={styles.iconGold} size={18} />
                    <p className={styles.tipText}>
                        <strong>Xác nhận trong giao dịch:</strong> Chỉ xác nhận đã nhận khi sách thực sự đến tay bạn. Dùng nút báo sự cố trong giao dịch khi có vấn đề.
                    </p>
                </div>
            </div>
        </div>
    );
}
