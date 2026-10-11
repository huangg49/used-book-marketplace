// Versioned classification vocabulary shared by API and clients. Codes are stable;
// labels may evolve. Unknown legacy categories remain readable and unclassified.
const options = (values) => values.map(([id, label]) => ({ id, label }));
const field = (id, label, values) => ({ id, label, options: options(values) });
export const taxonomyVersion = 'catalog-v1';
export const facetDefinitions = [
  field('genre', 'Thể loại nội dung', [
    ['action', 'Hành động'],
    ['adventure', 'Phiêu lưu'],
    ['fantasy', 'Giả tưởng'],
    ['romance', 'Tình cảm'],
    ['comedy', 'Hài hước'],
    ['drama', 'Chính kịch'],
    ['mystery', 'Bí ẩn / trinh thám'],
    ['horror', 'Kinh dị'],
    ['scifi', 'Khoa học viễn tưởng'],
    ['historical', 'Lịch sử'],
  ]),
  field('audience', 'Nhóm độc giả manga', [
    ['shounen', 'Shounen'],
    ['shoujo', 'Shoujo'],
    ['seinen', 'Seinen'],
    ['josei', 'Josei'],
    ['kodomo', 'Kodomo'],
  ]),
  field('setting', 'Chủ đề / bối cảnh', [
    ['school', 'Học đường'],
    ['isekai', 'Dị giới'],
    ['daily', 'Đời sống thường ngày'],
    ['apocalypse', 'Hậu tận thế'],
    ['supernatural', 'Siêu nhiên'],
  ]),
  field('form', 'Loại tác phẩm', [
    ['novel', 'Tiểu thuyết'],
    ['short', 'Truyện ngắn'],
    ['essay', 'Tản văn / tùy bút'],
    ['poetry', 'Thơ'],
    ['memoir', 'Hồi ký / tự truyện'],
    ['picture', 'Sách tranh'],
    ['activity', 'Sách hoạt động'],
    ['story', 'Truyện đọc'],
  ]),
  field('purpose', 'Mục đích sử dụng', [
    ['general', 'Học tổng quát'],
    ['communication', 'Giao tiếp'],
    ['exam', 'Luyện thi'],
    ['textbook', 'Giáo khoa'],
    ['workbook', 'Bài tập'],
    ['reference', 'Tham khảo'],
  ]),
  field('level', 'Trình độ / chứng chỉ', [
    ['beginner', 'Nhập môn'],
    ['intermediate', 'Trung cấp'],
    ['advanced', 'Nâng cao'],
    ['n5', 'JLPT N5'],
    ['n4', 'JLPT N4'],
    ['n3', 'JLPT N3'],
    ['n2', 'JLPT N2'],
    ['n1', 'JLPT N1'],
    ['ielts', 'IELTS'],
    ['toeic', 'TOEIC'],
    ['hsk', 'HSK'],
    ['topik', 'TOPIK'],
  ]),
  field('skill', 'Kỹ năng', [
    ['listening', 'Nghe'],
    ['speaking', 'Nói'],
    ['reading', 'Đọc'],
    ['writing', 'Viết'],
    ['grammar', 'Ngữ pháp'],
    ['vocabulary', 'Từ vựng'],
    ['characters', 'Chữ viết'],
  ]),
  field('schoolStage', 'Cấp học', [
    ['primary', 'Tiểu học'],
    ['secondary', 'THCS'],
    ['high', 'THPT'],
    ['university', 'Đại học / cao đẳng'],
  ]),
  field(
    'grade',
    'Lớp',
    Array.from({ length: 12 }, (_, i) => [String(i + 1), `Lớp ${i + 1}`]),
  ),
  field('subject', 'Môn học', [
    ['math', 'Toán'],
    ['literature', 'Ngữ văn'],
    ['english', 'Tiếng Anh'],
    ['physics', 'Vật lý'],
    ['chemistry', 'Hóa học'],
    ['biology', 'Sinh học'],
    ['history', 'Lịch sử'],
    ['geography', 'Địa lý'],
    ['computing', 'Tin học'],
    ['civics', 'Giáo dục công dân'],
  ]),
  field('reader', 'Đối tượng sử dụng', [
    ['student', 'Học sinh / sinh viên'],
    ['professional', 'Người đi làm'],
    ['manager', 'Quản lý'],
    ['entrepreneur', 'Người khởi nghiệp'],
    ['parent', 'Cha mẹ'],
    ['teen', 'Tuổi mới lớn'],
    ['general', 'Bạn đọc phổ thông'],
  ]),
  field('topic', 'Chủ đề', [
    ['habits', 'Thói quen'],
    ['communication', 'Giao tiếp'],
    ['emotion', 'Cảm xúc'],
    ['relationships', 'Các mối quan hệ'],
    ['career', 'Nghề nghiệp'],
    ['animals', 'Động vật'],
    ['nature', 'Thiên nhiên'],
    ['discovery', 'Khám phá'],
    ['culture', 'Văn hóa'],
    ['politics', 'Chính trị'],
    ['civilization', 'Văn minh'],
  ]),
  field('age', 'Độ tuổi được giới thiệu', [
    ['0-3', '0–3 tuổi'],
    ['4-6', '4–6 tuổi'],
    ['7-10', '7–10 tuổi'],
    ['11-15', '11–15 tuổi'],
  ]),
  field('depth', 'Mức độ tiếp cận', [
    ['intro', 'Nhập môn'],
    ['popular', 'Phổ thông'],
    ['specialist', 'Chuyên sâu'],
  ]),
  field('region', 'Phạm vi địa lý', [
    ['vietnam', 'Việt Nam'],
    ['asia', 'Châu Á'],
    ['europe', 'Châu Âu'],
    ['americas', 'Châu Mỹ'],
    ['world', 'Thế giới'],
  ]),
  field('period', 'Thời kỳ', [
    ['ancient', 'Cổ đại'],
    ['medieval', 'Trung đại'],
    ['modern', 'Cận đại'],
    ['contemporary', 'Hiện đại'],
  ]),
];
const group = (id, label, facets, children = []) => ({
  id,
  label,
  parentId: null,
  facets,
  children: children.map(([key, name]) => ({
    id: `${id}.${key}`,
    label: name,
    parentId: id,
    facets,
  })),
});
export const categories = [
  group('manga', 'Manga / Comic', ['genre', 'audience']),
  group('light-novel', 'Light Novel', ['genre', 'setting']),
  group('literature', 'Văn học', ['form', 'genre']),
  group(
    'languages',
    'Học ngoại ngữ',
    ['purpose', 'level', 'skill'],
    [
      ['en', 'Tiếng Anh'],
      ['ja', 'Tiếng Nhật'],
      ['ko', 'Tiếng Hàn'],
      ['zh', 'Tiếng Trung'],
      ['other', 'Ngoại ngữ khác'],
    ],
  ),
  group('education', 'Giáo khoa / tham khảo', [
    'schoolStage',
    'grade',
    'subject',
    'purpose',
  ]),
  group(
    'business',
    'Kinh tế / kinh doanh',
    ['reader'],
    [
      ['management', 'Quản trị / lãnh đạo'],
      ['marketing', 'Marketing / bán hàng'],
      ['finance', 'Tài chính / đầu tư'],
      ['startup', 'Khởi nghiệp'],
      ['economics', 'Kinh tế học'],
    ],
  ),
  group(
    'psychology',
    'Tâm lý / kỹ năng sống',
    ['topic', 'reader'],
    [
      ['psychology', 'Tâm lý'],
      ['skills', 'Kỹ năng sống'],
    ],
  ),
  group('children', 'Thiếu nhi', ['age', 'form', 'topic']),
  group(
    'science',
    'Khoa học / công nghệ',
    ['depth'],
    [
      ['natural', 'Khoa học tự nhiên'],
      ['technology', 'Công nghệ / lập trình'],
      ['space', 'Thiên văn / vũ trụ'],
      ['environment', 'Môi trường'],
    ],
  ),
  group(
    'history',
    'Lịch sử / địa lý',
    ['region', 'period', 'topic'],
    [
      ['history', 'Lịch sử'],
      ['geography', 'Địa lý'],
    ],
  ),
  group('other', 'Sách khác', []),
];
export const allCategories = categories.flatMap((c) => [c, ...c.children]);
export const languageOptions = options([
  ['vi', 'Tiếng Việt'],
  ['en', 'Tiếng Anh'],
  ['ja', 'Tiếng Nhật'],
  ['ko', 'Tiếng Hàn'],
  ['zh', 'Tiếng Trung'],
  ['fr', 'Tiếng Pháp'],
  ['de', 'Tiếng Đức'],
]);
const aliases = {
  Manga: 'manga',
  'Light novel': 'light-novel',
  'Light Novel': 'light-novel',
  'Văn học': 'literature',
  'Kỹ năng sống': 'psychology.skills',
  'Kinh doanh': 'business',
  'Khoa học': 'science',
  'Lịch sử': 'history',
  'Thiếu nhi': 'children',
  Khác: 'other',
};
export function categoryFor(value) {
  return (
    allCategories.find((c) => c.id === value || c.label === value) ??
    allCategories.find((c) => c.id === aliases[value])
  );
}
export function descendantIds(value) {
  const c = categoryFor(value);
  return c
    ? [
        c.id,
        ...allCategories.filter((x) => x.parentId === c.id).map((x) => x.id),
      ]
    : [];
}
export function facetsFor(categoryId, attributes = {}) {
  const c = categoryFor(categoryId);
  if (!c) return [];
  return c.facets.map((id) => {
    const definition = facetDefinitions.find((f) => f.id === id);
    let values = definition.options;
    if (id === 'form' && c.id === 'children')
      values = values.filter((o) =>
        ['picture', 'activity', 'story'].includes(o.id),
      );
    if (id === 'form' && c.id === 'literature')
      values = values.filter(
        (o) => !['picture', 'activity', 'story'].includes(o.id),
      );
    if (id === 'purpose')
      values = values.filter((o) =>
        (c.id === 'education'
          ? ['textbook', 'workbook', 'reference', 'exam']
          : ['general', 'communication', 'exam']
        ).includes(o.id),
      );
    if (id === 'topic')
      values = values.filter((o) =>
        (c.id.startsWith('history')
          ? ['culture', 'politics', 'civilization']
          : c.id === 'children'
            ? ['animals', 'nature', 'emotion', 'discovery']
            : ['habits', 'communication', 'emotion', 'relationships', 'career']
        ).includes(o.id),
      );
    if (id === 'level') {
      const exams =
        c.id === 'languages.ja'
          ? ['n5', 'n4', 'n3', 'n2', 'n1']
          : c.id === 'languages.en'
            ? ['ielts', 'toeic']
            : c.id === 'languages.zh'
              ? ['hsk']
              : c.id === 'languages.ko'
                ? ['topik']
                : [];
      values = values.filter((o) =>
        [
          'beginner',
          'intermediate',
          'advanced',
          ...(attributes.purpose?.includes('exam') ? exams : []),
        ].includes(o.id),
      );
    }
    if (id === 'grade') {
      const stages = attributes.schoolStage || [];
      values = values.filter((o) =>
        stages.includes(
          Number(o.id) <= 5
            ? 'primary'
            : Number(o.id) <= 9
              ? 'secondary'
              : 'high',
        ),
      );
    }
    return { ...definition, options: values };
  });
}
// Changing context retains only compatible choices, without selecting new ones.
export function compatibleAttributes(categoryId, attributes = {}) {
  return Object.fromEntries(
    facetsFor(categoryId, attributes).flatMap((f) => {
      const values = [
        ...new Set(
          (attributes[f.id] ?? []).filter((v) =>
            f.options.some((o) => o.id === v),
          ),
        ),
      ].sort();
      return values.length ? [[f.id, values]] : [];
    }),
  );
}
export function classificationErrors(categoryId, attributes = {}) {
  if (!categoryFor(categoryId)) return ['categoryId'];
  if (
    !attributes ||
    typeof attributes !== 'object' ||
    Array.isArray(attributes)
  )
    return ['attributes'];
  if (Object.values(attributes).some((v) => !Array.isArray(v)))
    return ['attributes'];
  const allowed = facetsFor(categoryId, attributes);
  return Object.entries(attributes).flatMap(([key, values]) => {
    const f = allowed.find((f) => f.id === key);
    return !f ||
      !Array.isArray(values) ||
      !values.length ||
      values.length > 16 ||
      new Set(values).size !== values.length ||
      values.some(
        (v) => typeof v !== 'string' || !f.options.some((o) => o.id === v),
      )
      ? [key]
      : [];
  });
}
export function matchesClassification(book, query) {
  const category = categoryFor(book.categoryId || book.category);
  if (
    query.categoryId &&
    !descendantIds(query.categoryId).includes(category?.id)
  )
    return false;
  const primary = book.language.toLowerCase().split('-')[0];
  if (
    query.language &&
    ({ eng: 'en', vie: 'vi', jpn: 'ja' }[primary] || primary) !==
      query.language.toLowerCase()
  )
    return false;
  if (
    query.series &&
    book.series?.normalize('NFC').toLowerCase() !==
      query.series.normalize('NFC').toLowerCase()
  )
    return false;
  return Object.entries(query.attributes ?? {}).every(([key, values]) =>
    values.some((v) => book.attributes?.[key]?.includes(v)),
  );
}
