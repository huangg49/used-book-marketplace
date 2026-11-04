/// Catalog Taxonomy matching `packages/api-contract/src/catalog-taxonomy.js`
class TaxonomyOption {
  const TaxonomyOption({required this.id, required this.label});
  final String id;
  final String label;
}

class TaxonomyFacet {
  const TaxonomyFacet({
    required this.id,
    required this.label,
    required this.options,
  });
  final String id;
  final String label;
  final List<TaxonomyOption> options;
}

class TaxonomyCategory {
  const TaxonomyCategory({
    required this.id,
    required this.label,
    this.children = const [],
    this.facets = const [],
  });
  final String id;
  final String label;
  final List<TaxonomyOption> children;
  final List<TaxonomyFacet> facets;
}

abstract final class CatalogTaxonomy {
  static const List<TaxonomyCategory> rootCategories = [
    TaxonomyCategory(
      id: 'literature',
      label: 'Văn học',
      facets: [
        TaxonomyFacet(
          id: 'form',
          label: 'Loại tác phẩm',
          options: [
            TaxonomyOption(id: 'novel', label: 'Tiểu thuyết'),
            TaxonomyOption(id: 'short', label: 'Truyện ngắn'),
            TaxonomyOption(id: 'essay', label: 'Tản văn / tùy bút'),
            TaxonomyOption(id: 'poetry', label: 'Thơ'),
            TaxonomyOption(id: 'memoir', label: 'Hồi ký / tự truyện'),
            TaxonomyOption(id: 'reportage', label: 'Ký sự / phóng sự'),
            TaxonomyOption(id: 'travelogue', label: 'Du ký'),
            TaxonomyOption(id: 'criticism', label: 'Phê bình văn học'),
          ],
        ),
        TaxonomyFacet(
          id: 'genre',
          label: 'Thể loại nội dung',
          options: [
            TaxonomyOption(id: 'action', label: 'Hành động'),
            TaxonomyOption(id: 'adventure', label: 'Phiêu lưu'),
            TaxonomyOption(id: 'fantasy', label: 'Giả tưởng'),
            TaxonomyOption(id: 'romance', label: 'Tình cảm'),
            TaxonomyOption(id: 'comedy', label: 'Hài hước'),
            TaxonomyOption(id: 'mystery', label: 'Trinh thám'),
            TaxonomyOption(id: 'horror', label: 'Kinh dị'),
            TaxonomyOption(id: 'scifi', label: 'Viễn tưởng'),
            TaxonomyOption(id: 'historical', label: 'Lịch sử'),
            TaxonomyOption(id: 'psychological', label: 'Tâm lý'),
          ],
        ),
      ],
    ),
    TaxonomyCategory(
      id: 'business',
      label: 'Kinh tế / kinh doanh',
      children: [
        TaxonomyOption(id: 'business.management', label: 'Quản trị / lãnh đạo'),
        TaxonomyOption(id: 'business.marketing', label: 'Marketing / bán hàng'),
        TaxonomyOption(id: 'business.finance', label: 'Tài chính / đầu tư'),
        TaxonomyOption(id: 'business.startup', label: 'Khởi nghiệp'),
        TaxonomyOption(id: 'business.economics', label: 'Kinh tế học'),
        TaxonomyOption(
          id: 'business.accounting',
          label: 'Kế toán / kiểm toán / thuế',
        ),
        TaxonomyOption(id: 'business.hr', label: 'Nhân sự / việc làm'),
        TaxonomyOption(
          id: 'business.supply-chain',
          label: 'Chuỗi cung ứng / logistics',
        ),
        TaxonomyOption(
          id: 'business.lessons',
          label: 'Nhân vật / bài học kinh doanh',
        ),
      ],
    ),
    TaxonomyCategory(
      id: 'psychology',
      label: 'Tâm lý / kỹ năng sống',
      children: [
        TaxonomyOption(id: 'psychology.psychology', label: 'Tâm lý học'),
        TaxonomyOption(id: 'psychology.skills', label: 'Kỹ năng sống'),
        TaxonomyOption(id: 'psychology.teen', label: 'Sách tuổi mới lớn'),
      ],
    ),
    TaxonomyCategory(
      id: 'manga',
      label: 'Manga / Comic',
      facets: [
        TaxonomyFacet(
          id: 'genre',
          label: 'Thể loại manga',
          options: [
            TaxonomyOption(id: 'action', label: 'Hành động'),
            TaxonomyOption(id: 'adventure', label: 'Phiêu lưu'),
            TaxonomyOption(id: 'fantasy', label: 'Giả tưởng'),
            TaxonomyOption(id: 'romance', label: 'Tình cảm'),
            TaxonomyOption(id: 'comedy', label: 'Hài hước'),
            TaxonomyOption(id: 'mystery', label: 'Trinh thám'),
            TaxonomyOption(id: 'horror', label: 'Kinh dị'),
            TaxonomyOption(id: 'sports', label: 'Thể thao'),
            TaxonomyOption(id: 'school', label: 'Học đường'),
            TaxonomyOption(id: 'isekai', label: 'Dị giới'),
          ],
        ),
        TaxonomyFacet(
          id: 'audience',
          label: 'Nhóm độc giả',
          options: [
            TaxonomyOption(id: 'shounen', label: 'Shounen'),
            TaxonomyOption(id: 'shoujo', label: 'Shoujo'),
            TaxonomyOption(id: 'seinen', label: 'Seinen'),
            TaxonomyOption(id: 'josei', label: 'Josei'),
            TaxonomyOption(id: 'kodomo', label: 'Kodomo'),
          ],
        ),
        TaxonomyFacet(
          id: 'comicStyle',
          label: 'Phong cách',
          options: [
            TaxonomyOption(id: 'manga', label: 'Manga Nhật Bản'),
            TaxonomyOption(id: 'manhwa', label: 'Manhwa Hàn Quốc'),
            TaxonomyOption(id: 'manhua', label: 'Manhua Trung Quốc'),
            TaxonomyOption(id: 'comic', label: 'Comic Âu Mỹ'),
          ],
        ),
      ],
    ),
    TaxonomyCategory(
      id: 'light-novel',
      label: 'Light Novel',
      facets: [
        TaxonomyFacet(
          id: 'genre',
          label: 'Thể loại',
          options: [
            TaxonomyOption(id: 'fantasy', label: 'Giả tưởng'),
            TaxonomyOption(id: 'isekai', label: 'Dị giới'),
            TaxonomyOption(id: 'romance', label: 'Lãng mạn'),
            TaxonomyOption(id: 'action', label: 'Hành động'),
            TaxonomyOption(id: 'comedy', label: 'Hài hước'),
            TaxonomyOption(id: 'school', label: 'Học đường'),
          ],
        ),
      ],
    ),
    TaxonomyCategory(
      id: 'languages',
      label: 'Học ngoại ngữ',
      children: [
        TaxonomyOption(id: 'languages.en', label: 'Tiếng Anh'),
        TaxonomyOption(id: 'languages.ja', label: 'Tiếng Nhật'),
        TaxonomyOption(id: 'languages.ko', label: 'Tiếng Hàn'),
        TaxonomyOption(id: 'languages.zh', label: 'Tiếng Trung'),
        TaxonomyOption(id: 'languages.fr', label: 'Tiếng Pháp'),
        TaxonomyOption(id: 'languages.de', label: 'Tiếng Đức'),
        TaxonomyOption(
          id: 'languages.vi',
          label: 'Tiếng Việt cho người nước ngoài',
        ),
        TaxonomyOption(id: 'languages.other', label: 'Ngoại ngữ khác'),
      ],
    ),
    TaxonomyCategory(
      id: 'children',
      label: 'Thiếu nhi',
      facets: [
        TaxonomyFacet(
          id: 'age',
          label: 'Độ tuổi',
          options: [
            TaxonomyOption(id: '0-3', label: '0–3 tuổi'),
            TaxonomyOption(id: '4-6', label: '4–6 tuổi'),
            TaxonomyOption(id: '7-10', label: '7–10 tuổi'),
            TaxonomyOption(id: '11-15', label: '11–15 tuổi'),
          ],
        ),
        TaxonomyFacet(
          id: 'form',
          label: 'Hình thức',
          options: [
            TaxonomyOption(id: 'picture', label: 'Sách tranh'),
            TaxonomyOption(id: 'activity', label: 'Sách hoạt động'),
            TaxonomyOption(id: 'story', label: 'Truyện đọc'),
          ],
        ),
      ],
    ),
    TaxonomyCategory(
      id: 'education',
      label: 'Giáo khoa / tham khảo',
      facets: [
        TaxonomyFacet(
          id: 'schoolStage',
          label: 'Cấp học',
          options: [
            TaxonomyOption(id: 'primary', label: 'Tiểu học'),
            TaxonomyOption(id: 'secondary', label: 'THCS'),
            TaxonomyOption(id: 'high', label: 'THPT'),
            TaxonomyOption(id: 'university', label: 'Đại học / CĐ'),
          ],
        ),
        TaxonomyFacet(
          id: 'subject',
          label: 'Môn học',
          options: [
            TaxonomyOption(id: 'math', label: 'Toán'),
            TaxonomyOption(id: 'literature', label: 'Ngữ văn'),
            TaxonomyOption(id: 'english', label: 'Tiếng Anh'),
            TaxonomyOption(id: 'physics', label: 'Vật lý'),
            TaxonomyOption(id: 'chemistry', label: 'Hóa học'),
            TaxonomyOption(id: 'biology', label: 'Sinh học'),
            TaxonomyOption(id: 'history', label: 'Lịch sử'),
          ],
        ),
      ],
    ),
    TaxonomyCategory(
      id: 'science',
      label: 'Khoa học / công nghệ',
      children: [
        TaxonomyOption(id: 'science.natural', label: 'Khoa học tự nhiên'),
        TaxonomyOption(
          id: 'science.technology',
          label: 'Công nghệ / lập trình',
        ),
        TaxonomyOption(id: 'science.space', label: 'Thiên văn / vũ trụ'),
        TaxonomyOption(id: 'science.environment', label: 'Môi trường'),
      ],
    ),
    TaxonomyCategory(
      id: 'history',
      label: 'Lịch sử / địa lý',
      children: [
        TaxonomyOption(id: 'history.history', label: 'Lịch sử'),
        TaxonomyOption(id: 'history.geography', label: 'Địa lý'),
      ],
    ),
    TaxonomyCategory(
      id: 'biography',
      label: 'Tiểu sử / hồi ký',
      children: [
        TaxonomyOption(id: 'biography.politics', label: 'Nhân vật chính trị'),
        TaxonomyOption(id: 'biography.business', label: 'Doanh nhân'),
        TaxonomyOption(id: 'biography.science', label: 'Nhà khoa học'),
        TaxonomyOption(id: 'biography.arts', label: 'Nghệ sĩ'),
        TaxonomyOption(id: 'biography.life', label: 'Câu chuyện cuộc đời'),
      ],
    ),
    TaxonomyCategory(
      id: 'parenting',
      label: 'Nuôi dạy con',
      children: [
        TaxonomyOption(id: 'parenting.care', label: 'Chăm sóc trẻ'),
        TaxonomyOption(id: 'parenting.education', label: 'Giáo dục trẻ'),
        TaxonomyOption(id: 'parenting.family', label: 'Gia đình'),
      ],
    ),
    TaxonomyCategory(
      id: 'health',
      label: 'Sức khỏe / y học',
      children: [
        TaxonomyOption(id: 'health.medicine', label: 'Y học'),
        TaxonomyOption(id: 'health.nutrition', label: 'Dinh dưỡng'),
        TaxonomyOption(id: 'health.wellness', label: 'Chăm sóc sức khỏe'),
        TaxonomyOption(id: 'health.fitness', label: 'Thể chất / vận động'),
      ],
    ),
    TaxonomyCategory(
      id: 'arts',
      label: 'Nghệ thuật / thiết kế',
      children: [
        TaxonomyOption(id: 'arts.visual', label: 'Mỹ thuật'),
        TaxonomyOption(id: 'arts.design', label: 'Thiết kế'),
        TaxonomyOption(id: 'arts.photography', label: 'Nhiếp ảnh'),
        TaxonomyOption(id: 'arts.music', label: 'Âm nhạc'),
        TaxonomyOption(id: 'arts.cinema', label: 'Điện ảnh'),
        TaxonomyOption(id: 'arts.architecture', label: 'Kiến trúc'),
      ],
    ),
    TaxonomyCategory(
      id: 'society',
      label: 'Xã hội / triết học',
      children: [
        TaxonomyOption(id: 'society.philosophy', label: 'Triết học'),
        TaxonomyOption(id: 'society.law', label: 'Pháp luật'),
        TaxonomyOption(id: 'society.politics', label: 'Chính trị'),
        TaxonomyOption(id: 'society.sociology', label: 'Xã hội học'),
        TaxonomyOption(id: 'society.religion', label: 'Tôn giáo'),
      ],
    ),
    TaxonomyCategory(
      id: 'lifestyle',
      label: 'Đời sống / sở thích',
      children: [
        TaxonomyOption(id: 'lifestyle.cooking', label: 'Nấu ăn'),
        TaxonomyOption(id: 'lifestyle.crafts', label: 'Thủ công'),
        TaxonomyOption(id: 'lifestyle.gardening', label: 'Làm vườn'),
        TaxonomyOption(id: 'lifestyle.travel', label: 'Du lịch'),
        TaxonomyOption(id: 'lifestyle.sports', label: 'Thể thao'),
      ],
    ),
    TaxonomyCategory(id: 'other', label: 'Sách khác'),
  ];

  static const List<TaxonomyOption> languageOptions = [
    TaxonomyOption(id: 'vi', label: 'Tiếng Việt'),
    TaxonomyOption(id: 'en', label: 'Tiếng Anh'),
    TaxonomyOption(id: 'ja', label: 'Tiếng Nhật'),
    TaxonomyOption(id: 'ko', label: 'Tiếng Hàn'),
    TaxonomyOption(id: 'zh', label: 'Tiếng Trung'),
    TaxonomyOption(id: 'fr', label: 'Tiếng Pháp'),
    TaxonomyOption(id: 'de', label: 'Tiếng Đức'),
  ];

  static TaxonomyCategory? getCategory(String id) {
    if (id.isEmpty) return null;
    for (final cat in rootCategories) {
      if (cat.id == id) return cat;
      if (id.startsWith('${cat.id}.')) return cat;
    }
    return null;
  }

  static String getLabel(String id) {
    if (id.isEmpty) return 'Tất cả';
    for (final cat in rootCategories) {
      if (cat.id == id) return cat.label;
      for (final ch in cat.children) {
        if (ch.id == id) return '${cat.label} › ${ch.label}';
      }
    }
    return id;
  }

  static String getLanguageLabel(String code) {
    if (code.isEmpty) return 'Tất cả ngôn ngữ';
    for (final opt in languageOptions) {
      if (opt.id == code.toLowerCase()) return opt.label;
    }
    return code;
  }
}
