import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Award, ChevronRight } from 'lucide-react'
import { BookCard } from '../components/BookCard'
import { FEATURED_BOOKS } from '../lib/mock/home'
import styles from './BookSearchPage.module.css'

export function BookSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  
  // Lấy params
  const q = searchParams.get('q') || ''
  const sort = searchParams.get('sort') || 'popular'
  const category = searchParams.get('category') || 'all'
  const price = searchParams.get('price') || ''
  const conditions = searchParams.getAll('condition')
  const sellerGuild = searchParams.get('seller') === 'guild'

  const updateParam = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams)
    if (value) {
      newParams.set(key, value)
    } else {
      newParams.delete(key)
    }
    setSearchParams(newParams, { replace: true })
  }

  const toggleCondition = (cond: string) => {
    const newParams = new URLSearchParams(searchParams)
    const current = newParams.getAll('condition')
    newParams.delete('condition')
    
    if (current.includes(cond)) {
      current.filter(c => c !== cond).forEach(c => newParams.append('condition', c))
    } else {
      current.push(cond)
      current.forEach(c => newParams.append('condition', c))
    }
    setSearchParams(newParams, { replace: true })
  }

  // TODO: Gọi API tìm kiếm thực tế. Dưới đây là logic giả lập (mock) để UI hoạt động
  const results = useMemo(() => {
    // Tạo 8 quyển sách từ FEATURED_BOOKS để có đủ dữ liệu test
    let filtered = [...FEATURED_BOOKS, ...FEATURED_BOOKS.map(b => ({ ...b, id: b.id + '-copy' }))]
    
    if (q) {
      filtered = filtered.filter(b => b.title.toLowerCase().includes(q.toLowerCase()))
    }

    if (category !== 'all') {
      // Giả lập filter theo danh mục
      if (category === 'novel') filtered = filtered.filter(b => b.title.includes('Dế') || b.title.includes('Số') || b.title.includes('Gatsby'))
      if (category === 'history') filtered = filtered.filter(b => b.title.includes('Sử'))
      if (category === 'lit') filtered = filtered.filter(b => b.title.includes('Tuổi') || b.title.includes('Moby'))
    }

    if (price === 'p1') filtered = filtered.filter(b => (b.priceVnd || 0) <= 500000)
    if (price === 'p2') filtered = filtered.filter(b => (b.priceVnd || 0) > 500000 && (b.priceVnd || 0) <= 1000000)
    if (price === 'p3') filtered = filtered.filter(b => (b.priceVnd || 0) > 1000000 && (b.priceVnd || 0) <= 5000000)
    if (price === 'p4') filtered = filtered.filter(b => (b.priceVnd || 0) > 5000000)

    if (conditions.length > 0) {
      // Giả lập lọc tình trạng
      filtered = filtered.filter(b => conditions.some(c => b.condition?.toLowerCase().includes(c)))
    }

    if (sort === 'price-asc') filtered.sort((a, b) => (a.priceVnd || 0) - (b.priceVnd || 0))
    if (sort === 'price-desc') filtered.sort((a, b) => (b.priceVnd || 0) - (a.priceVnd || 0))
    if (sort === 'newest') filtered.reverse()

    return filtered
  }, [q, sort, category, price, conditions])

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.titleWrapper}>
            <h1 className={styles.title}>Khám phá Thư viện</h1>
            <p className={styles.subtitle}>
              Tìm thấy {results.length} cuốn sách {q ? `cho "${q}" ` : ''}đang chờ đón chủ nhân mới.
            </p>
          </div>
          <div className={styles.sortContainer}>
            <span className={styles.sortLabel}>Sắp xếp:</span>
            <select 
              className={styles.sortSelect} 
              value={sort}
              onChange={(e) => updateParam('sort', e.target.value)}
            >
              <option value="popular">Phổ biến nhất</option>
              <option value="price-asc">Giá: Thấp đến Cao</option>
              <option value="price-desc">Giá: Cao đến Thấp</option>
              <option value="newest">Mới nhất</option>
            </select>
          </div>
        </div>
      </header>

      <div className={styles.mainLayout}>
        <aside className={styles.sidebar}>
          {/* Thể loại */}
          <div className={styles.filterGroup}>
            <h4 className={styles.filterTitle}>Thể loại</h4>
            <ul className={styles.filterList}>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cat-all" 
                  checked={category === 'all'} 
                  onChange={() => updateParam('category', 'all')}
                />
                <label htmlFor="cat-all" className={category === 'all' ? styles.active : ''}>Tất cả</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cat-novel" 
                  checked={category === 'novel'}
                  onChange={() => updateParam('category', 'novel')} 
                />
                <label htmlFor="cat-novel" className={category === 'novel' ? styles.active : ''}>Tiểu thuyết</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cat-history" 
                  checked={category === 'history'}
                  onChange={() => updateParam('category', 'history')} 
                />
                <label htmlFor="cat-history" className={category === 'history' ? styles.active : ''}>Lịch sử</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cat-science" 
                  checked={category === 'science'}
                  onChange={() => updateParam('category', 'science')} 
                />
                <label htmlFor="cat-science" className={category === 'science' ? styles.active : ''}>Khoa học</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cat-lit" 
                  checked={category === 'lit'}
                  onChange={() => updateParam('category', 'lit')} 
                />
                <label htmlFor="cat-lit" className={category === 'lit' ? styles.active : ''}>Văn học cổ điển</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cat-poetry" 
                  checked={category === 'poetry'}
                  onChange={() => updateParam('category', 'poetry')} 
                />
                <label htmlFor="cat-poetry" className={category === 'poetry' ? styles.active : ''}>Thơ ca</label>
              </li>
            </ul>
          </div>

          {/* Khoảng giá */}
          <div className={styles.filterGroup}>
            <h4 className={styles.filterTitle}>Khoảng giá</h4>
            <ul className={styles.filterList}>
              <li className={styles.filterItem}>
                <input 
                  type="radio" 
                  name="price" 
                  id="p-all" 
                  checked={price === ''}
                  onChange={() => updateParam('price', '')}
                />
                <label htmlFor="p-all">Mọi mức giá</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="radio" 
                  name="price" 
                  id="p1" 
                  checked={price === 'p1'}
                  onChange={() => updateParam('price', 'p1')}
                />
                <label htmlFor="p1">0đ - 500.000đ</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="radio" 
                  name="price" 
                  id="p2" 
                  checked={price === 'p2'}
                  onChange={() => updateParam('price', 'p2')}
                />
                <label htmlFor="p2">500.000đ - 1.000.000đ</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="radio" 
                  name="price" 
                  id="p3" 
                  checked={price === 'p3'}
                  onChange={() => updateParam('price', 'p3')}
                />
                <label htmlFor="p3">1.000.000đ - 5.000.000đ</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="radio" 
                  name="price" 
                  id="p4" 
                  checked={price === 'p4'}
                  onChange={() => updateParam('price', 'p4')}
                />
                <label htmlFor="p4">Trên 5.000.000đ</label>
              </li>
            </ul>
          </div>

          {/* Tình trạng */}
          <div className={styles.filterGroup}>
            <h4 className={styles.filterTitle}>Tình trạng</h4>
            <ul className={styles.filterList}>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cond-perfect" 
                  checked={conditions.includes('like new')}
                  onChange={() => toggleCondition('like new')}
                />
                <label htmlFor="cond-perfect">Hoàn hảo (Like New)</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cond-vgood" 
                  checked={conditions.includes('đẹp')}
                  onChange={() => toggleCondition('đẹp')}
                />
                <label htmlFor="cond-vgood">Rất tốt</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cond-good" 
                  checked={conditions.includes('tốt')}
                  onChange={() => toggleCondition('tốt')}
                />
                <label htmlFor="cond-good">Tốt</label>
              </li>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="cond-aged" 
                  checked={conditions.includes('cũ')}
                  onChange={() => toggleCondition('cũ')}
                />
                <label htmlFor="cond-aged">Cũ (Dấu ấn thời gian)</label>
              </li>
            </ul>
          </div>

          {/* Nhà bán hàng */}
          <div className={styles.filterGroup}>
            <h4 className={styles.filterTitle}>Nhà bán hàng</h4>
            <ul className={styles.filterList}>
              <li className={styles.filterItem}>
                <input 
                  type="checkbox" 
                  id="seller-guild" 
                  checked={sellerGuild}
                  onChange={() => updateParam('seller', sellerGuild ? '' : 'guild')}
                />
                <label htmlFor="seller-guild" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Thành viên Guild <Award size={16} color="var(--gold)" />
                </label>
              </li>
            </ul>
          </div>
        </aside>

        <div className={styles.resultsArea}>
          <div className={styles.grid}>
            {results.length > 0 ? (
              results.map((book, index) => (
                <BookCard key={`${book.id}-${index}`} book={book} index={index} />
              ))
            ) : (
              <p style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--ink-muted)' }}>
                Không tìm thấy cuốn sách nào phù hợp với bộ lọc.
              </p>
            )}
          </div>

          {results.length > 0 && (
            <div className={styles.pagination}>
              <button type="button" className={`${styles.pageButton} ${styles.active}`}>1</button>
              <button type="button" className={styles.pageButton}>2</button>
              <button type="button" className={styles.pageButton}>3</button>
              <span className={styles.pageDots}>...</span>
              <button type="button" className={styles.pageButton}>12</button>
              <button type="button" className={styles.pageButton} aria-label="Next page">
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
