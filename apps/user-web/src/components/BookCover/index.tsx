import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import styles from './BookCover.module.css'

export interface BookCoverProps {
    title: string
    index?: number
    tag?: string
    coverUrl?: string
    className?: string
    fallbackLabel?: string
}

export function BookCover({ title, index = 0, tag, coverUrl, className = '', fallbackLabel }: BookCoverProps) {
    const [failedUrl, setFailedUrl] = useState<string>()
    const imgError = Boolean(coverUrl && failedUrl === coverUrl)
    const coverClass = styles[`cover${index % 4}`] ?? ''
    const displayFallback = fallbackLabel ?? title
    
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
                    <BookOpen size={fallbackLabel ? 22 : 36} aria-hidden="true" />
                    <span className={fallbackLabel ? styles.fallbackLabel : styles.coverTitle}>{displayFallback}</span>
                </>
            )}
            
            {tag ? <span className={styles.tag}>{tag}</span> : null}
        </div>
    )
}
