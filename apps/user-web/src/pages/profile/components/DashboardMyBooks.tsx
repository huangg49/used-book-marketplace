import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getMyListings, getMyPhoto } from '../../../services/my-listings';

function MyListingPhoto({ listingId, mediaId }: { listingId: string; mediaId: string }) {
  const photo = useQuery({
    queryKey: ['my-photo', listingId, mediaId],
    queryFn: () => getMyPhoto(listingId, mediaId),
  });
  
  if (photo.isLoading) return <div className="w-full h-full bg-surface-container-high animate-pulse" />;
  if (photo.isError || !photo.data?.url) return <div className="w-full h-full bg-surface-container-high flex items-center justify-center text-on-surface-variant"><span className="material-symbols-outlined">image_not_supported</span></div>;
  
  return <img className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" src={photo.data.url} alt="" />;
}

export function DashboardMyBooks() {
  const [filter, setFilter] = useState<string>('Available');
  
  const { data, isLoading } = useQuery({
    queryKey: ['my-listings'],
    queryFn: () => getMyListings(),
  });

  const allItems = data?.items || [];
  
  const availableItems = allItems.filter(i => i.state.trade === 'Available' && i.state.moderation === 'Approved');
  const soldItems = allItems.filter(i => i.state.trade !== 'Available' || i.state.visibility === 'Hidden');
  const pendingItems = allItems.filter(i => i.state.moderation === 'PendingReview' || i.state.moderation === 'Draft');

  const displayItems = filter === 'Available' ? availableItems : filter === 'Sold' ? soldItems : pendingItems;

  return (
    <>
      {/*  5. MY BOOKS (KỆ SÁCH CỦA TÔI)  */}
      <section className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div>
            <h2 className="font-headline-md text-headline-md text-primary">Kệ sách của tôi</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              Quản lý hiện trạng niêm yết, tương tác đấu giá và giao lưu trao đổi tác phẩm.
            </p>
          </div>
          {/*  Filter Tabs  */}
          <div className="inline-flex p-1 rounded bg-surface-container-high gap-1" id="shelfTabs">
            <button 
              onClick={() => setFilter('Available')}
              className={`px-space-md py-1.5 rounded ${filter === 'Available' ? 'text-title-md font-title-md bg-surface-container-lowest text-primary shadow-sm' : 'text-body-md font-body-md text-on-surface-variant hover:text-on-surface'}`} type="button">
              Đang hiển thị ({availableItems.length})
            </button>
            <button 
              onClick={() => setFilter('Sold')}
              className={`px-space-md py-1.5 rounded ${filter === 'Sold' ? 'text-title-md font-title-md bg-surface-container-lowest text-primary shadow-sm' : 'text-body-md font-body-md text-on-surface-variant hover:text-on-surface'}`} type="button">
              Đã bán ({soldItems.length})
            </button>
            <button 
              onClick={() => setFilter('Pending')}
              className={`px-space-md py-1.5 rounded ${filter === 'Pending' ? 'text-title-md font-title-md bg-surface-container-lowest text-primary shadow-sm' : 'text-body-md font-body-md text-on-surface-variant hover:text-on-surface'}`} type="button">
              Chờ duyệt thẩm định ({pendingItems.length})
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-8">
            <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 opacity-50">menu_book</span>
            <p>Chưa có sách nào trong danh mục này.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            {displayItems.map(item => {
              const content = item.currentRevision.content;
              const book = (item.currentRevision as any).book;
              const firstMediaId = content?.mediaIds?.[0];
              const modeText = content?.mode === 'Sale' ? 'Bán trực tiếp' : content?.mode === 'Exchange' ? 'Giao lưu & Đổi' : 'Bán & Đổi';
              const modeColor = content?.mode === 'Sale' ? 'bg-primary text-on-primary' : 'bg-tertiary text-on-tertiary';
              
              return (
                <div key={item.id} className="bg-surface-container-low rounded-xl p-space-md flex flex-col justify-between group hover:shadow-md transition-all">
                  <div className="flex flex-col gap-space-md">
                    <div className="w-full aspect-[3/4] rounded bg-surface-container-high overflow-hidden relative shadow-sm">
                      {firstMediaId ? (
                        <MyListingPhoto listingId={item.id} mediaId={firstMediaId} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-on-surface-variant opacity-50">
                          <span className="material-symbols-outlined text-4xl">auto_stories</span>
                        </div>
                      )}
                      <span className={`absolute top-2 left-2 font-label-sm text-label-sm px-2 py-0.5 rounded ${modeColor}`}>
                        {modeText}
                      </span>
                      <span className="absolute top-2 right-2 bg-surface-container-lowest/90 backdrop-blur text-primary font-label-sm text-label-sm px-2 py-0.5 rounded font-medium shadow-sm">
                        {content?.condition || 'Chưa rõ'}
                      </span>
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
                        <span className="line-clamp-1 mr-2">{book?.authors?.join(', ') || content?.author || 'Đang cập nhật'}</span>
                        <span className="whitespace-nowrap">{book?.publicationYear ? `Năm ${book.publicationYear}` : 'Đang cập nhật'}</span>
                      </div>
                      
                      <h3 className="font-title-md text-title-md text-primary font-semibold line-clamp-2 h-[2.5em]" title={book?.title || content?.title || 'Bản thảo chưa hoàn tất'}>
                        {book?.title || content?.title || 'Bản thảo chưa hoàn tất'}
                      </h3>
                      
                      <div className="flex items-center justify-between mt-1">
                        <span className="font-currency-display text-currency-display text-primary font-bold">
                          {content?.salePrice ? `${content.salePrice.toLocaleString('vi-VN')} ₫` : 'Thỏa thuận'}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="pt-space-md mt-space-md flex items-center justify-between gap-space-xs border-t border-outline-variant/30">
                    <span className="inline-flex items-center gap-1 text-[11px] font-label-sm text-primary uppercase">
                      <span className={`w-1.5 h-1.5 rounded-full inline-block ${item.state.trade === 'Available' ? 'bg-primary' : 'bg-outline'}`}></span>
                      {item.state.moderation === 'Approved' ? item.state.trade : item.state.moderation}
                    </span>
                    
                    <div className="flex items-center gap-1">
                      <button className="px-2 py-1 rounded bg-surface-container-high text-primary font-label-md text-label-md hover:bg-surface-dim transition-colors" type="button">
                        Chỉnh sửa
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/*  Footer shelf CTA  */}
        <div className="flex justify-center pt-space-xs">
          <a className="inline-flex items-center gap-2 text-primary font-title-md text-title-md hover:text-secondary transition-colors" href="#">
            <span className="">Xem tất cả {allItems.length} ấn phẩm trên kệ sách</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </a>
        </div>
      </section>
    </>
  );
}