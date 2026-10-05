export const mockBooks: Record<string, unknown>[] = [
  {
    id: '1',
    title: 'Sapiens: Lược Sử Loài Người',
    author: 'Yuval Noah Harari',
    coverUrl: 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=600&auto=format&fit=crop',
    price: 150000,
    condition: 'LIKE_NEW',
    location: 'Quận 1, TP.HCM',
  },
  {
    id: '2',
    title: 'Nhà Giả Kim',
    author: 'Paulo Coelho',
    coverUrl: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?q=80&w=600&auto=format&fit=crop',
    price: 'trao-doi',
    condition: 'GOOD',
    location: 'Quận 3, TP.HCM',
  },
  {
    id: '3',
    title: 'Đắc Nhân Tâm',
    author: 'Dale Carnegie',
    coverUrl: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?q=80&w=600&auto=format&fit=crop',
    price: 80000,
    condition: 'ACCEPTABLE',
    location: 'Thủ Đức, TP.HCM',
  },
  {
    id: '4',
    title: 'Chủ Nghĩa Khắc Kỷ',
    author: 'William B. Irvine',
    coverUrl: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=600&auto=format&fit=crop',
    price: 120000,
    condition: 'NEW',
    location: 'Bình Thạnh, TP.HCM',
  },
];

export const mockCategories = [
  'Văn học', 'Tiểu thuyết', 'Kinh tế', 'Kỹ năng sống', 'Lịch sử', 'Khoa học', 'Ngoại ngữ', 'Thiếu nhi'
];
