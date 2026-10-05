import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import styles from './BookCover.module.css'

export interface BookCoverProps {
    title: string
    index: number
    tag?: string
    coverUrl?: string
    className?: string
}

export function BookCover({ title, index, tag, coverUrl, className = '' }: BookCoverProps) {
    const [imgError, setImgError] = useState(false)
    const coverClass = styles[`cover${index % 4}`] ?? ''
    
    return (
        <div className={`${styles.cover} ${coverClass} ${className}`.trim()}>
            {coverUrl && !imgError && (
                <img 
                    src={coverUrl} 
                    alt={title} 
                    className={styles.coverImage} 
                    loading="lazy" 
                    onError={() => setImgError(true)} 
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
