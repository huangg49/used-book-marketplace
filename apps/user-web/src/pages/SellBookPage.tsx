import React, { useState } from 'react';
import { submitListing } from '../services/listing-submission';
import { Sparkles, CheckCircle, Clock, BookOpen, Tag, Image as ImageIcon, Upload, Info, ChevronRight, ChevronLeft, ArrowRight, List } from 'lucide-react';

export function SellBookPage() {
  const [step, setStep] = useState(1);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  
  const [formData, setFormData] = useState({
    // Step 1
    title: '',
    author: '',
    // Step 2
    images: [] as string[],
    condition: 'Good',
    pages: '',
    coverNote: '',
    notes: '',
    accessories: '',
    description: '',
    readable: null as boolean | null,
    hasMissingPages: null as boolean | null,
    missingEssentialContent: null as boolean | null,
    // Step 3
    mode: 'Sale', // Sale, Exchange, Both
    salePrice: '',
    exchangeValue: '',
  });

  const handleAiSuggest = () => {
    if (!formData.title) {
      alert("Vui lòng nhập tên sách trước khi dùng AI gợi ý!");
      return;
    }
    setIsAiLoading(true);
    setTimeout(() => {
      const basePrice = 80000;
      let finalPrice = basePrice;
      if (formData.condition === 'LikeNew') finalPrice = 120000;
      if (formData.condition === 'Good') finalPrice = 80000;
      if (formData.condition === 'Fair') finalPrice = 50000;
      if (formData.condition === 'Worn') finalPrice = 30000;
      
      setFormData(prev => ({...prev, salePrice: finalPrice.toString()}));
      setIsAiLoading(false);
    }, 1500);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      // Keep the local preview while retaining the original file for the API upload.
      const fakeUrl = URL.createObjectURL(e.target.files[0]);
      setFormData(prev => ({ ...prev, images: [...prev.images, fakeUrl] }));
      setImageFiles((files) => [...files, e.target.files![0]]);
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const missing = [
      !formData.title.trim() && 'tên sách',
      !formData.author.trim() && 'tác giả',
      !formData.pages.trim() && 'mô tả ruột sách',
      !formData.coverNote.trim() && 'mô tả bìa và gáy',
      !formData.notes.trim() && 'ghi chú và đánh dấu',
      !formData.accessories.trim() && 'phụ kiện',
      formData.description.trim().length < 30 && 'mô tả chung (ít nhất 30 ký tự)',
      imageFiles.length === 0 && 'ít nhất một ảnh',
    ].filter(Boolean);
    const sale = Number(formData.salePrice);
    const exchange = Number(formData.exchangeValue);
    if (formData.mode !== 'Exchange' && (!Number.isInteger(sale) || sale < 10_000 || sale > 1_000_000)) missing.push('giá bán từ 10.000đ đến 1.000.000đ');
    if (formData.mode !== 'Sale' && (!Number.isInteger(exchange) || exchange < 10_000 || exchange > 1_000_000)) missing.push('giá trị đổi từ 10.000đ đến 1.000.000đ');
    if (missing.length) { setSubmitError(`Cần bổ sung: ${missing.join(', ')}.`); return; }
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await submitListing({ title: formData.title, author: formData.author, category: 'Khác', condition: formData.condition as 'LikeNew' | 'Good' | 'Fair' | 'Worn', pages: formData.pages, coverNote: formData.coverNote, notes: formData.notes, accessories: formData.accessories, description: formData.description, mode: formData.mode as 'Sale' | 'Exchange' | 'Both', salePrice: formData.mode === 'Exchange' ? null : sale, exchangeValue: formData.mode === 'Sale' ? null : exchange, files: imageFiles });
      setStep(5);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Chưa gửi được bài đăng.');
    } finally { setSubmitting(false); }
  };

  const renderStepIndicator = () => {
    const steps = ['Đầu sách', 'Tình trạng', 'Bán/Đổi', 'Kiểm tra'];
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', position: 'relative' }}>
        <div style={{ position: 'absolute', top: '12px', left: 0, right: 0, height: '2px', background: '#e5e7eb', zIndex: 0 }} />
        <div style={{ position: 'absolute', top: '12px', left: 0, width: `${((step - 1) / 3) * 100}%`, height: '2px', background: 'var(--brand-green, #10b981)', zIndex: 0, transition: 'width 0.3s ease' }} />
        
        {steps.map((label, idx) => {
          const stepNum = idx + 1;
          const isActive = step >= stepNum;
          return (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
              <div style={{ 
                width: '26px', height: '26px', borderRadius: '50%', 
                background: isActive ? 'var(--brand-green, #10b981)' : '#e5e7eb',
                color: isActive ? 'white' : '#6b7280',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '0.5rem',
                transition: 'all 0.3s ease'
              }}>
                {isActive ? <CheckCircle size={14} /> : stepNum}
              </div>
              <span style={{ fontSize: '0.8rem', color: isActive ? 'var(--text-dark, #1f2937)' : '#6b7280', fontWeight: isActive ? 'bold' : 'normal' }}>
                {label}
              </span>
            </div>
          )
        })}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: 'var(--text-dark, #1f2937)', fontWeight: '800' }}>
        Đăng bán sách
      </h1>
      <p style={{ color: 'var(--text-light, #6b7280)', marginBottom: '2rem', fontSize: '1.1rem' }}>
        Chia sẻ những cuốn sách bạn đã đọc cho người cần chúng.
      </p>

      {step <= 4 && renderStepIndicator()}

      <div style={{ background: 'var(--paper, white)', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6' }}>
        {step === 1 && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>
              <BookOpen size={24} color="var(--brand-green, #10b981)" /> Thông tin cơ bản
            </h2>
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>Tên sách</label>
                <input 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  placeholder="VD: Đắc Nhân Tâm"
                  style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', outline: 'none', transition: 'border 0.2s', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>Tác giả</label>
                <input 
                  value={formData.author}
                  onChange={e => setFormData({...formData, author: e.target.value})}
                  placeholder="VD: Dale Carnegie"
                  style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', outline: 'none', transition: 'border 0.2s', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>
              <ImageIcon size={24} color="var(--brand-green, #10b981)" /> Ảnh và tình trạng
            </h2>
            <div style={{ display: 'grid', gap: '2rem' }}>
              
              {/* Upload Ảnh */}
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>Ảnh bản sách ({formData.images.length}/8)</label>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-light, #6b7280)', marginBottom: '1rem' }}>Chụp bìa, gáy và những phần đã qua sử dụng.</p>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {formData.images.map((img, idx) => (
                    <div key={idx} style={{ width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #eee' }}>
                      <img src={img} alt="Book preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                  {formData.images.length < 8 && (
                    <label style={{ width: '100px', height: '100px', borderRadius: '8px', border: '2px dashed #cbd5e1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b', background: '#f8fafc', transition: 'all 0.2s' }}>
                      <Upload size={24} style={{ marginBottom: '0.25rem' }} />
                      <span style={{ fontSize: '0.8rem' }}>Tải ảnh</span>
                      <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>
              </div>

              <div style={{ height: '1px', background: '#e5e7eb' }} />

              {/* Tình trạng */}
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>Tình trạng tổng thể</label>
                  <select 
                    value={formData.condition}
                    onChange={e => setFormData({...formData, condition: e.target.value})}
                    style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', boxSizing: 'border-box' }}
                  >
                    <option value="LikeNew">Gần như mới</option>
                    <option value="Good">Còn tốt</option>
                    <option value="Fair">Đã dùng nhiều</option>
                    <option value="Worn">Cũ nhiều</option>
                  </select>
                </div>
                
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-dark, #1f2937)' }}>Ruột sách và trang thiếu</label>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>Đủ trang hay thiếu trang nào? Có ố, rách hoặc bong trang không?</p>
                  <textarea rows={2} value={formData.pages} onChange={e => setFormData({...formData, pages: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                
                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-dark, #1f2937)' }}>Bìa và gáy sách</label>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>Mô tả góc sờn, nếp gấp hoặc phần bong gáy.</p>
                  <textarea rows={2} value={formData.coverNote} onChange={e => setFormData({...formData, coverNote: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.25rem', color: 'var(--text-dark, #1f2937)' }}>Ghi chú và đánh dấu</label>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.5rem' }}>Có viết, tô hoặc gạch chân không? Nếu không, ghi 'Không có'.</p>
                  <textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>

                {/* Các câu hỏi trắc nghiệm */}
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gap: '1.2rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <span style={{ fontWeight: '500', color: 'var(--text-dark, #1f2937)' }}>Nội dung có còn đọc rõ?</span>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-dark, #1f2937)' }}>
                        <input type="radio" checked={formData.readable === true} onChange={() => setFormData({...formData, readable: true})} /> Có
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-dark, #1f2937)' }}>
                        <input type="radio" checked={formData.readable === false} onChange={() => setFormData({...formData, readable: false})} /> Không
                      </label>
                    </div>
                  </div>
                  
                  <div style={{ height: '1px', background: '#e2e8f0' }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <span style={{ fontWeight: '500', color: 'var(--text-dark, #1f2937)' }}>Sách có thiếu trang?</span>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-dark, #1f2937)' }}>
                        <input type="radio" checked={formData.hasMissingPages === true} onChange={() => setFormData({...formData, hasMissingPages: true})} /> Có
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-dark, #1f2937)' }}>
                        <input type="radio" checked={formData.hasMissingPages === false} onChange={() => setFormData({...formData, hasMissingPages: false})} /> Không
                      </label>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: '#e2e8f0' }} />
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <span style={{ fontWeight: '500', color: 'var(--text-dark, #1f2937)' }}>Có thiếu nội dung trọng yếu?</span>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-dark, #1f2937)' }}>
                        <input type="radio" checked={formData.missingEssentialContent === true} onChange={() => setFormData({...formData, missingEssentialContent: true})} /> Có
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-dark, #1f2937)' }}>
                        <input type="radio" checked={formData.missingEssentialContent === false} onChange={() => setFormData({...formData, missingEssentialContent: false})} /> Không
                      </label>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>
              <Tag size={24} color="var(--brand-green, #10b981)" /> Bán hoặc đổi
            </h2>
            <div style={{ display: 'grid', gap: '2rem' }}>
              <div>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '1rem', color: 'var(--text-dark, #1f2937)' }}>Bạn muốn bán hay đổi?</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                  {['Sale', 'Exchange', 'Both'].map(mode => (
                    <button
                      key={mode}
                      onClick={() => setFormData({...formData, mode})}
                      style={{
                        padding: '1rem', borderRadius: '12px', border: `2px solid ${formData.mode === mode ? 'var(--brand-green, #10b981)' : '#e2e8f0'}`,
                        background: formData.mode === mode ? '#ecfdf5' : 'white', cursor: 'pointer', fontWeight: '600',
                        color: formData.mode === mode ? 'var(--brand-green, #10b981)' : '#64748b', transition: 'all 0.2s', outline: 'none'
                      }}
                    >
                      {mode === 'Sale' ? 'Bán sách' : mode === 'Exchange' ? 'Đổi sách' : 'Bán hoặc đổi'}
                    </button>
                  ))}
                </div>
              </div>

              {(formData.mode === 'Sale' || formData.mode === 'Both') && (
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>Giá bán (VNĐ)</label>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>Từ 10.000 đến 1.000.000 đồng.</p>
                  
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input 
                      type="number"
                      value={formData.salePrice}
                      onChange={e => setFormData({...formData, salePrice: e.target.value})}
                      placeholder="VD: 125000"
                      style={{ flex: 1, minWidth: '200px', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1.1rem', outline: 'none', boxSizing: 'border-box' }}
                    />
                    
                    <button 
                      type="button"
                      onClick={handleAiSuggest}
                      disabled={isAiLoading}
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.5rem', 
                        padding: '1rem 1.5rem', borderRadius: '8px', 
                        background: 'linear-gradient(135deg, #10b981, #059669)', 
                        color: 'white', border: 'none', cursor: 'pointer',
                        fontWeight: 'bold', opacity: isAiLoading ? 0.7 : 1, transition: 'transform 0.1s'
                      }}
                    >
                      {isAiLoading ? 'Đang phân tích...' : <><Sparkles size={18} /> AI Gợi ý</>}
                    </button>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <label htmlFor="accessories" style={{ fontWeight: 600 }}>Phụ kiện đi kèm</label>
                <textarea id="accessories" rows={2} value={formData.accessories} onChange={(e) => setFormData({ ...formData, accessories: e.target.value })} placeholder="Ví dụ: Không có; hoặc ghi rõ bookmark, bọc sách..." style={{ width: '100%', boxSizing: 'border-box', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'inherit' }} />
                <small>Nếu không có phụ kiện, nhập “Không có”.</small>
              </div>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <label htmlFor="description" style={{ fontWeight: 600 }}>Mô tả chung</label>
                <textarea id="description" rows={4} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Viết ít nhất 30 ký tự về cuốn sách, tình trạng và điều bạn muốn người nhận biết." style={{ width: '100%', boxSizing: 'border-box', padding: '0.8rem', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'inherit' }} />
                <small>{formData.description.trim().length}/30 ký tự tối thiểu</small>
              </div>
              {submitError && <p role="alert" style={{ margin: 0, padding: '1rem', background: '#fff1f0', color: '#963F28', borderRadius: '8px' }}>{submitError}</p>}

              {(formData.mode === 'Exchange' || formData.mode === 'Both') && (
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>Giá trị quy đổi (VNĐ)</label>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>Mức giá trị để đối chiếu khi đổi sách.</p>
                  <input 
                    type="number"
                    value={formData.exchangeValue}
                    onChange={e => setFormData({...formData, exchangeValue: e.target.value})}
                    placeholder="VD: 100000"
                    style={{ width: '100%', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', fontSize: '1.1rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-dark, #1f2937)' }}>
              <List size={24} color="var(--brand-green, #10b981)" /> Kiểm tra thông tin
            </h2>
            <div style={{ display: 'grid', gap: '1.5rem', fontSize: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Tên sách</span>
                <span style={{ fontWeight: '600', color: 'var(--text-dark, #1f2937)' }}>{formData.title || '(Chưa nhập)'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Tác giả</span>
                <span style={{ fontWeight: '600', color: 'var(--text-dark, #1f2937)' }}>{formData.author || '(Chưa nhập)'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Tình trạng</span>
                <span style={{ fontWeight: '600', color: 'var(--text-dark, #1f2937)' }}>{formData.condition === 'LikeNew' ? 'Gần như mới' : formData.condition === 'Good' ? 'Còn tốt' : formData.condition === 'Fair' ? 'Đã dùng nhiều' : 'Cũ nhiều'}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                <span style={{ color: '#64748b', fontWeight: '500' }}>Hình thức</span>
                <span style={{ fontWeight: '600', color: 'var(--text-dark, #1f2937)' }}>{formData.mode === 'Sale' ? 'Bán sách' : formData.mode === 'Exchange' ? 'Đổi sách' : 'Bán và Đổi'}</span>
              </div>
              {(formData.mode === 'Sale' || formData.mode === 'Both') && (
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
                  <span style={{ color: '#64748b', fontWeight: '500' }}>Giá bán</span>
                  <span style={{ fontWeight: '700', color: 'var(--brand-green, #10b981)' }}>{formData.salePrice ? `${parseInt(formData.salePrice).toLocaleString('vi-VN')} đ` : '(Chưa nhập)'}</span>
                </div>
              )}
              
              <div style={{ background: '#fef3c7', padding: '1rem', borderRadius: '8px', display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <Info size={20} color="#d97706" style={{ flexShrink: 0 }} />
                <p style={{ color: '#b45309', margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>Vui lòng kiểm tra kỹ thông tin. Sách của bạn sẽ được gửi cho Admin duyệt trước khi hiển thị công khai trên kệ.</p>
              </div>
            </div>
          </div>
        )}

        {/* Nút điều hướng */}
        {step <= 4 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
            <button 
              onClick={() => setStep(step - 1)}
              style={{ 
                visibility: step > 1 ? 'visible' : 'hidden',
                padding: '0.75rem 1.5rem', borderRadius: '8px', background: '#f1f5f9', color: '#475569', 
                border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', outline: 'none'
              }}
            >
              <ChevronLeft size={18} /> Quay lại
            </button>

            {step < 4 ? (
              <button 
                onClick={() => setStep(step + 1)}
                style={{ 
                  padding: '0.75rem 1.5rem', borderRadius: '8px', background: 'var(--brand-green, #10b981)', color: 'white', 
                  border: 'none', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', outline: 'none'
                }}
              >
                Tiếp tục <ChevronRight size={18} />
              </button>
            ) : (
              <button 
                onClick={() => void handleSubmit()}
                disabled={submitting}
                style={{ 
                  padding: '0.75rem 2rem', borderRadius: '8px', background: 'var(--brand-green, #10b981)', color: 'white', 
                  border: 'none', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.05rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)', outline: 'none'
                }}
              >
                {submitting ? 'Đang gửi…' : 'Gửi duyệt'} <ArrowRight size={18} />
              </button>
            )}
          </div>
        )}

        {step === 5 && !submitError && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', animation: 'fadeIn 0.5s ease' }}>
            <Clock size={80} color="#f59e0b" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--text-dark, #1f2937)' }}>Đang chờ duyệt</h2>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-light, #6b7280)', maxWidth: '560px', margin: '0 auto', lineHeight: '1.6' }}>
              Sách <strong>{formData.title}</strong> đã được gửi lên hệ thống. Admin sẽ kiểm tra và duyệt bài đăng trước khi sách hiển thị công khai.
            </p>
          </div>
        )}

        {submitError && step !== 4 && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', animation: 'fadeIn 0.5s ease' }}>
            <Clock size={80} color="#f59e0b" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--text-dark, #1f2937)' }}>Chưa gửi được bài đăng</h2>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-light, #6b7280)', marginBottom: '2.5rem', maxWidth: '500px', margin: '0 auto 2.5rem', lineHeight: '1.6' }}>
              {submitError}
            </p>
            
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
