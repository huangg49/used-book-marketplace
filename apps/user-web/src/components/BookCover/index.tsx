import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import styles from './BookCover.module.css'

export interface BookCoverProps {
    title: string
    index?: number
    tag?: string
    coverUrl?: string
    className?: string
}

export function BookCover({ title, index = 0, tag, coverUrl, className = '' }: BookCoverProps) {
    const [failedUrl, setFailedUrl] = useState<string>()
    const imgError = Boolean(coverUrl && failedUrl === coverUrl)
    const coverClass = styles[`cover${index % 4}`] ?? ''
    
    return (
        <div className={`${styles.cover} ${coverClass} ${className}`.trim()}>
            {coverUrl && !imgError && (
                <img 
                    key={coverUrl}
                    src={coverUrl} 
                    alt={title} 
                    className={styles.coverImage} 
                    loading="lazy" 
                    onError={() => setFailedUrl(coverUrl)}
                />
            )}
            
            {(!coverUrl || imgError) && (
                <>
                    <BookOpen size={36} aria-hidden="true" />
                    <span className={styles.coverTitle}>{title}</span>
                </>
            )}
            
            {tag ? <span className={styles.tag}>{tag}</span> : null}
        </div>
    )
}
