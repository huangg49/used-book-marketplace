import { Card, Tag, Typography } from 'antd';
import { MapPin } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import styles from './BookCard.module.css';

const { Title, Text } = Typography;

export interface BookCardProps {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  price: number | 'trao-doi';
  condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'ACCEPTABLE';
  location: string;
}

const conditionMap = {
  NEW: { label: 'Mới', color: 'green' },
  LIKE_NEW: { label: 'Như mới', color: 'cyan' },
  GOOD: { label: 'Tốt', color: 'blue' },
  ACCEPTABLE: { label: 'Khá', color: 'orange' },
};

export function BookCard({ title, author, coverUrl, price, condition, location }: BookCardProps) {
  const cond = conditionMap[condition];

  return (
    <Card
      hoverable
      className={styles.card}
      styles={{ body: { padding: 16 } }}
      cover={
        <div className={styles.coverWrapper}>
          <img alt={`Bìa sách ${title}`} src={coverUrl} className={styles.coverImage} />
          <Tag color={cond.color} className={styles.conditionTag}>
            {cond.label}
          </Tag>
        </div>
      }
    >
      <Title level={5} ellipsis={{ rows: 2 }} className={styles.title} title={title}>
        {title}
      </Title>
      <Text type="secondary" ellipsis className={styles.author} title={author}>
        {author}
      </Text>

      <div className={styles.footer}>
        <Text strong className={styles.price}>
          {price === 'trao-doi' ? '🔄 Trao đổi' : formatCurrency(price)}
        </Text>
        <div className={styles.location}>
          <MapPin size={14} />
          <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
            {location}
          </Text>
        </div>
      </div>
    </Card>
  );
}
