// Release-controlled vocabulary. Existing codes and canonical labels remain readable.
export const taxonomyVersion = "catalog-v2";
export const categories = [
  {
    id: "manga",
    label: "Manga / Comic",
    parentId: null,
    facets: ["genre", "audience", "setting", "comicStyle"],
    children: [],
  },
  {
    id: "light-novel",
    label: "Light Novel",
    parentId: null,
    facets: ["genre", "setting"],
    children: [],
  },
  {
    id: "literature",
    label: "Văn học",
    parentId: null,
    facets: ["form", "genre", "workOrigin"],
    children: [],
  },
  {
    id: "languages",
    label: "Học ngoại ngữ",
    parentId: null,
    facets: ["purpose", "level", "skill"],
    children: [
      {
        id: "languages.en",
        label: "Tiếng Anh",
        parentId: "languages",
        facets: ["purpose", "level", "skill"],
      },
      {
        id: "languages.ja",
        label: "Tiếng Nhật",
        parentId: "languages",
        facets: ["purpose", "level", "skill"],
      },
      {
        id: "languages.ko",
        label: "Tiếng Hàn",
        parentId: "languages",
        facets: ["purpose", "level", "skill"],
      },
      {
        id: "languages.zh",
        label: "Tiếng Trung",
        parentId: "languages",
        facets: ["purpose", "level", "skill"],
      },
      {
        id: "languages.other",
        label: "Ngoại ngữ khác",
        parentId: "languages",
        facets: ["purpose", "level", "skill"],
      },
      {
        id: "languages.fr",
        label: "Tiếng Pháp",
        parentId: "languages",
        facets: ["purpose", "level", "skill"],
      },
      {
        id: "languages.de",
        label: "Tiếng Đức",
        parentId: "languages",
        facets: ["purpose", "level", "skill"],
      },
      {
        id: "languages.vi",
        label: "Tiếng Việt cho người nước ngoài",
        parentId: "languages",
        facets: ["purpose", "level", "skill"],
      },
    ],
  },
  {
    id: "education",
    label: "Giáo khoa / tham khảo",
    parentId: null,
    facets: ["schoolStage", "grade", "subject", "purpose"],
    children: [],
  },
  {
    id: "business",
    label: "Kinh tế / kinh doanh",
    parentId: null,
    facets: ["businessTopic", "reader", "depth"],
    children: [
      {
        id: "business.management",
        label: "Quản trị / lãnh đạo",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
      {
        id: "business.marketing",
        label: "Marketing / bán hàng",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
      {
        id: "business.finance",
        label: "Tài chính / đầu tư",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
      {
        id: "business.startup",
        label: "Khởi nghiệp",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
      {
        id: "business.economics",
        label: "Kinh tế học",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
      {
        id: "business.accounting",
        label: "Kế toán / kiểm toán / thuế",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
      {
        id: "business.hr",
        label: "Nhân sự / việc làm",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
      {
        id: "business.supply-chain",
        label: "Chuỗi cung ứng / logistics",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
      {
        id: "business.lessons",
        label: "Nhân vật / bài học kinh doanh",
        parentId: "business",
        facets: ["businessTopic", "reader", "depth"],
      },
    ],
  },
  {
    id: "psychology",
    label: "Tâm lý / kỹ năng sống",
    parentId: null,
    facets: ["topic", "reader", "depth"],
    children: [
      {
        id: "psychology.psychology",
        label: "Tâm lý",
        parentId: "psychology",
        facets: ["topic", "reader", "depth"],
      },
      {
        id: "psychology.skills",
        label: "Kỹ năng sống",
        parentId: "psychology",
        facets: ["topic", "reader", "depth"],
      },
      {
        id: "psychology.teen",
        label: "Sách cho tuổi mới lớn",
        parentId: "psychology",
        facets: ["topic", "reader", "depth"],
      },
    ],
  },
  {
    id: "children",
    label: "Thiếu nhi",
    parentId: null,
    facets: ["age", "form", "topic"],
    children: [],
  },
  {
    id: "science",
    label: "Khoa học / công nghệ",
    parentId: null,
    facets: ["scienceField", "depth"],
    children: [
      {
        id: "science.natural",
        label: "Khoa học tự nhiên",
        parentId: "science",
        facets: ["scienceField", "depth"],
      },
      {
        id: "science.technology",
        label: "Công nghệ / lập trình",
        parentId: "science",
        facets: ["technologyTopic", "scienceField", "depth"],
      },
      {
        id: "science.space",
        label: "Thiên văn / vũ trụ",
        parentId: "science",
        facets: ["scienceField", "depth"],
      },
      {
        id: "science.environment",
        label: "Môi trường",
        parentId: "science",
        facets: ["scienceField", "depth"],
      },
    ],
  },
  {
    id: "history",
    label: "Lịch sử / địa lý",
    parentId: null,
    facets: ["region", "period", "topic", "depth"],
    children: [
      {
        id: "history.history",
        label: "Lịch sử",
        parentId: "history",
        facets: ["region", "period", "topic", "depth"],
      },
      {
        id: "history.geography",
        label: "Địa lý",
        parentId: "history",
        facets: ["region", "period", "topic", "depth"],
      },
    ],
  },
  {
    id: "biography",
    label: "Tiểu sử / hồi ký",
    parentId: null,
    facets: ["form", "topic", "region"],
    children: [
      {
        id: "biography.politics",
        label: "Nhân vật chính trị",
        parentId: "biography",
        facets: ["form", "topic", "region"],
      },
      {
        id: "biography.business",
        label: "Doanh nhân",
        parentId: "biography",
        facets: ["form", "topic", "region"],
      },
      {
        id: "biography.science",
        label: "Nhà khoa học",
        parentId: "biography",
        facets: ["form", "topic", "region"],
      },
      {
        id: "biography.arts",
        label: "Nghệ sĩ",
        parentId: "biography",
        facets: ["form", "topic", "region"],
      },
      {
        id: "biography.life",
        label: "Câu chuyện cuộc đời",
        parentId: "biography",
        facets: ["form", "topic", "region"],
      },
    ],
  },
  {
    id: "parenting",
    label: "Nuôi dạy con",
    parentId: null,
    facets: ["age", "topic", "reader"],
    children: [
      {
        id: "parenting.care",
        label: "Chăm sóc trẻ",
        parentId: "parenting",
        facets: ["age", "topic", "reader"],
      },
      {
        id: "parenting.education",
        label: "Giáo dục trẻ",
        parentId: "parenting",
        facets: ["age", "topic", "reader"],
      },
      {
        id: "parenting.development",
        label: "Phát triển của trẻ",
        parentId: "parenting",
        facets: ["age", "topic", "reader"],
      },
      {
        id: "parenting.family",
        label: "Gia đình",
        parentId: "parenting",
        facets: ["age", "topic", "reader"],
      },
    ],
  },
  {
    id: "health",
    label: "Sức khỏe / y học",
    parentId: null,
    facets: ["topic", "reader", "depth"],
    children: [
      {
        id: "health.medicine",
        label: "Y học",
        parentId: "health",
        facets: ["topic", "reader", "depth"],
      },
      {
        id: "health.nutrition",
        label: "Dinh dưỡng",
        parentId: "health",
        facets: ["topic", "reader", "depth"],
      },
      {
        id: "health.wellness",
        label: "Chăm sóc sức khỏe",
        parentId: "health",
        facets: ["topic", "reader", "depth"],
      },
      {
        id: "health.fitness",
        label: "Vận động / thể chất",
        parentId: "health",
        facets: ["topic", "reader", "depth"],
      },
    ],
  },
  {
    id: "arts",
    label: "Nghệ thuật / thiết kế",
    parentId: null,
    facets: ["topic", "depth"],
    children: [
      {
        id: "arts.visual",
        label: "Mỹ thuật",
        parentId: "arts",
        facets: ["topic", "artMedium", "depth"],
      },
      {
        id: "arts.design",
        label: "Thiết kế",
        parentId: "arts",
        facets: ["topic", "artMedium", "depth"],
      },
      {
        id: "arts.photography",
        label: "Nhiếp ảnh",
        parentId: "arts",
        facets: ["topic", "artMedium", "depth"],
      },
      {
        id: "arts.music",
        label: "Âm nhạc",
        parentId: "arts",
        facets: ["topic", "artMedium", "depth"],
      },
      {
        id: "arts.cinema",
        label: "Điện ảnh",
        parentId: "arts",
        facets: ["topic", "depth"],
      },
      {
        id: "arts.architecture",
        label: "Kiến trúc",
        parentId: "arts",
        facets: ["topic", "depth"],
      },
    ],
  },
  {
    id: "society",
    label: "Xã hội / triết học",
    parentId: null,
    facets: ["topic", "region", "depth"],
    children: [
      {
        id: "society.philosophy",
        label: "Triết học",
        parentId: "society",
        facets: ["topic", "region", "depth"],
      },
      {
        id: "society.law",
        label: "Pháp luật",
        parentId: "society",
        facets: ["topic", "lawField", "region", "depth"],
      },
      {
        id: "society.politics",
        label: "Chính trị",
        parentId: "society",
        facets: ["topic", "region", "depth"],
      },
      {
        id: "society.sociology",
        label: "Xã hội học",
        parentId: "society",
        facets: ["topic", "region", "depth"],
      },
      {
        id: "society.religion",
        label: "Tôn giáo",
        parentId: "society",
        facets: ["topic", "region", "depth"],
      },
    ],
  },
  {
    id: "lifestyle",
    label: "Đời sống / sở thích",
    parentId: null,
    facets: ["topic", "depth"],
    children: [
      {
        id: "lifestyle.cooking",
        label: "Nấu ăn",
        parentId: "lifestyle",
        facets: ["topic", "cuisine", "depth"],
      },
      {
        id: "lifestyle.crafts",
        label: "Thủ công",
        parentId: "lifestyle",
        facets: ["topic", "craftType", "depth"],
      },
      {
        id: "lifestyle.gardening",
        label: "Làm vườn",
        parentId: "lifestyle",
        facets: ["topic", "depth"],
      },
      {
        id: "lifestyle.travel",
        label: "Du lịch",
        parentId: "lifestyle",
        facets: ["topic", "region", "depth"],
      },
      {
        id: "lifestyle.sports",
        label: "Thể thao",
        parentId: "lifestyle",
        facets: ["topic", "depth"],
      },
    ],
  },
  {
    id: "other",
    label: "Sách khác",
    parentId: null,
    facets: [],
    children: [],
  },
];
export const allCategories = categories.flatMap((c) => [c, ...c.children]);
export const facetDefinitions = [
  {
    id: "genre",
    label: "Thể loại nội dung",
    options: [
      {
        id: "action",
        label: "Hành động",
      },
      {
        id: "adventure",
        label: "Phiêu lưu",
      },
      {
        id: "fantasy",
        label: "Giả tưởng",
      },
      {
        id: "romance",
        label: "Tình cảm",
      },
      {
        id: "comedy",
        label: "Hài hước",
      },
      {
        id: "drama",
        label: "Chính kịch",
      },
      {
        id: "mystery",
        label: "Bí ẩn / trinh thám",
      },
      {
        id: "horror",
        label: "Kinh dị",
      },
      {
        id: "scifi",
        label: "Khoa học viễn tưởng",
      },
      {
        id: "historical",
        label: "Lịch sử",
      },
      {
        id: "sports",
        label: "Thể thao",
      },
      {
        id: "psychological",
        label: "Tâm lý",
      },
      {
        id: "tragedy",
        label: "Bi kịch",
      },
      {
        id: "suspense",
        label: "Hồi hộp / ly kỳ",
      },
    ],
  },
  {
    id: "audience",
    label: "Nhóm độc giả manga",
    options: [
      {
        id: "shounen",
        label: "Shounen",
      },
      {
        id: "shoujo",
        label: "Shoujo",
      },
      {
        id: "seinen",
        label: "Seinen",
      },
      {
        id: "josei",
        label: "Josei",
      },
      {
        id: "kodomo",
        label: "Kodomo",
      },
    ],
  },
  {
    id: "setting",
    label: "Chủ đề / bối cảnh",
    options: [
      {
        id: "school",
        label: "Học đường",
      },
      {
        id: "isekai",
        label: "Dị giới",
      },
      {
        id: "daily",
        label: "Đời sống thường ngày",
      },
      {
        id: "apocalypse",
        label: "Hậu tận thế",
      },
      {
        id: "supernatural",
        label: "Siêu nhiên",
      },
      {
        id: "gaming",
        label: "Trò chơi / thế giới game",
      },
      {
        id: "mecha",
        label: "Robot / cơ giới",
      },
      {
        id: "workplace",
        label: "Công sở",
      },
    ],
  },
  {
    id: "form",
    label: "Loại tác phẩm",
    options: [
      {
        id: "novel",
        label: "Tiểu thuyết",
      },
      {
        id: "short",
        label: "Truyện ngắn",
      },
      {
        id: "essay",
        label: "Tản văn / tùy bút",
      },
      {
        id: "poetry",
        label: "Thơ",
      },
      {
        id: "memoir",
        label: "Hồi ký / tự truyện",
      },
      {
        id: "picture",
        label: "Sách tranh",
      },
      {
        id: "activity",
        label: "Sách hoạt động",
      },
      {
        id: "story",
        label: "Truyện đọc",
      },
      {
        id: "reportage",
        label: "Ký sự / phóng sự",
      },
      {
        id: "travelogue",
        label: "Du ký",
      },
      {
        id: "criticism",
        label: "Phê bình văn học",
      },
      {
        id: "biography",
        label: "Tiểu sử",
      },
      {
        id: "autobiography",
        label: "Tự truyện",
      },
    ],
  },
  {
    id: "purpose",
    label: "Mục đích sử dụng",
    options: [
      {
        id: "general",
        label: "Học tổng quát",
      },
      {
        id: "communication",
        label: "Giao tiếp",
      },
      {
        id: "exam",
        label: "Luyện thi",
      },
      {
        id: "textbook",
        label: "Giáo khoa",
      },
      {
        id: "workbook",
        label: "Bài tập",
      },
      {
        id: "reference",
        label: "Tham khảo",
      },
      {
        id: "dictionary",
        label: "Từ điển",
      },
    ],
  },
  {
    id: "level",
    label: "Trình độ / chứng chỉ",
    options: [
      {
        id: "beginner",
        label: "Nhập môn",
      },
      {
        id: "intermediate",
        label: "Trung cấp",
      },
      {
        id: "advanced",
        label: "Nâng cao",
      },
      {
        id: "n5",
        label: "JLPT N5",
      },
      {
        id: "n4",
        label: "JLPT N4",
      },
      {
        id: "n3",
        label: "JLPT N3",
      },
      {
        id: "n2",
        label: "JLPT N2",
      },
      {
        id: "n1",
        label: "JLPT N1",
      },
      {
        id: "ielts",
        label: "IELTS",
      },
      {
        id: "toeic",
        label: "TOEIC",
      },
      {
        id: "hsk",
        label: "HSK",
      },
      {
        id: "topik",
        label: "TOPIK",
      },
      {
        id: "delf",
        label: "DELF / DALF",
      },
      {
        id: "goethe",
        label: "Goethe / TestDaF",
      },
    ],
  },
  {
    id: "skill",
    label: "Kỹ năng",
    options: [
      {
        id: "listening",
        label: "Nghe",
      },
      {
        id: "speaking",
        label: "Nói",
      },
      {
        id: "reading",
        label: "Đọc",
      },
      {
        id: "writing",
        label: "Viết",
      },
      {
        id: "grammar",
        label: "Ngữ pháp",
      },
      {
        id: "vocabulary",
        label: "Từ vựng",
      },
      {
        id: "characters",
        label: "Chữ viết",
      },
      {
        id: "pronunciation",
        label: "Phát âm",
      },
    ],
  },
  {
    id: "schoolStage",
    label: "Cấp học",
    options: [
      {
        id: "primary",
        label: "Tiểu học",
      },
      {
        id: "secondary",
        label: "THCS",
      },
      {
        id: "high",
        label: "THPT",
      },
      {
        id: "university",
        label: "Đại học / cao đẳng",
      },
      {
        id: "preschool",
        label: "Mầm non",
      },
    ],
  },
  {
    id: "grade",
    label: "Lớp",
    options: [
      {
        id: "1",
        label: "Lớp 1",
      },
      {
        id: "2",
        label: "Lớp 2",
      },
      {
        id: "3",
        label: "Lớp 3",
      },
      {
        id: "4",
        label: "Lớp 4",
      },
      {
        id: "5",
        label: "Lớp 5",
      },
      {
        id: "6",
        label: "Lớp 6",
      },
      {
        id: "7",
        label: "Lớp 7",
      },
      {
        id: "8",
        label: "Lớp 8",
      },
      {
        id: "9",
        label: "Lớp 9",
      },
      {
        id: "10",
        label: "Lớp 10",
      },
      {
        id: "11",
        label: "Lớp 11",
      },
      {
        id: "12",
        label: "Lớp 12",
      },
    ],
  },
  {
    id: "subject",
    label: "Môn học",
    options: [
      {
        id: "math",
        label: "Toán",
      },
      {
        id: "literature",
        label: "Ngữ văn",
      },
      {
        id: "english",
        label: "Tiếng Anh",
      },
      {
        id: "physics",
        label: "Vật lý",
      },
      {
        id: "chemistry",
        label: "Hóa học",
      },
      {
        id: "biology",
        label: "Sinh học",
      },
      {
        id: "history",
        label: "Lịch sử",
      },
      {
        id: "geography",
        label: "Địa lý",
      },
      {
        id: "computing",
        label: "Tin học",
      },
      {
        id: "civics",
        label: "Giáo dục công dân",
      },
      {
        id: "arts",
        label: "Mỹ thuật",
      },
      {
        id: "music",
        label: "Âm nhạc",
      },
      {
        id: "technology",
        label: "Công nghệ",
      },
    ],
  },
  {
    id: "reader",
    label: "Đối tượng sử dụng",
    options: [
      {
        id: "student",
        label: "Học sinh / sinh viên",
      },
      {
        id: "professional",
        label: "Người đi làm",
      },
      {
        id: "manager",
        label: "Quản lý",
      },
      {
        id: "entrepreneur",
        label: "Người khởi nghiệp",
      },
      {
        id: "parent",
        label: "Cha mẹ",
      },
      {
        id: "teen",
        label: "Tuổi mới lớn",
      },
      {
        id: "general",
        label: "Bạn đọc phổ thông",
      },
    ],
  },
  {
    id: "topic",
    label: "Chủ đề",
    options: [
      {
        id: "habits",
        label: "Thói quen",
      },
      {
        id: "communication",
        label: "Giao tiếp",
      },
      {
        id: "emotion",
        label: "Cảm xúc",
      },
      {
        id: "relationships",
        label: "Các mối quan hệ",
      },
      {
        id: "career",
        label: "Nghề nghiệp",
      },
      {
        id: "animals",
        label: "Động vật",
      },
      {
        id: "nature",
        label: "Thiên nhiên",
      },
      {
        id: "discovery",
        label: "Khám phá",
      },
      {
        id: "culture",
        label: "Văn hóa",
      },
      {
        id: "politics",
        label: "Chính trị",
      },
      {
        id: "civilization",
        label: "Văn minh",
      },
      {
        id: "time-management",
        label: "Quản lý thời gian",
      },
      {
        id: "thinking",
        label: "Tư duy",
      },
      {
        id: "safety",
        label: "An toàn",
      },
      {
        id: "life-skills",
        label: "Kỹ năng sống",
      },
      {
        id: "maps",
        label: "Bản đồ",
      },
      {
        id: "landscapes",
        label: "Địa hình / cảnh quan",
      },
      {
        id: "business-life",
        label: "Cuộc đời doanh nhân",
      },
      {
        id: "scientist",
        label: "Nhà khoa học",
      },
      {
        id: "artist",
        label: "Nghệ sĩ",
      },
      {
        id: "personal-life",
        label: "Câu chuyện cuộc đời",
      },
      {
        id: "infant-care",
        label: "Chăm sóc trẻ",
      },
      {
        id: "education-methods",
        label: "Phương pháp giáo dục",
      },
      {
        id: "child-development",
        label: "Phát triển của trẻ",
      },
      {
        id: "family-life",
        label: "Đời sống gia đình",
      },
      {
        id: "medical-study",
        label: "Kiến thức y học",
      },
      {
        id: "nutrition",
        label: "Dinh dưỡng",
      },
      {
        id: "wellbeing",
        label: "Chăm sóc sức khỏe",
      },
      {
        id: "exercise",
        label: "Vận động",
      },
      {
        id: "public-health",
        label: "Sức khỏe cộng đồng",
      },
      {
        id: "art-history",
        label: "Lịch sử nghệ thuật",
      },
      {
        id: "drawing",
        label: "Hội họa",
      },
      {
        id: "graphic-design",
        label: "Thiết kế đồ họa",
      },
      {
        id: "photography",
        label: "Nhiếp ảnh",
      },
      {
        id: "music-theory",
        label: "Nhạc lý",
      },
      {
        id: "filmmaking",
        label: "Điện ảnh",
      },
      {
        id: "architecture",
        label: "Kiến trúc",
      },
      {
        id: "philosophy",
        label: "Triết học",
      },
      {
        id: "ethics",
        label: "Đạo đức học",
      },
      {
        id: "society",
        label: "Xã hội học",
      },
      {
        id: "religion",
        label: "Tôn giáo",
      },
      {
        id: "law",
        label: "Pháp luật",
      },
      {
        id: "cooking",
        label: "Nấu ăn",
      },
      {
        id: "crafts",
        label: "Thủ công",
      },
      {
        id: "gardening",
        label: "Làm vườn",
      },
      {
        id: "travel",
        label: "Du lịch",
      },
      {
        id: "sports",
        label: "Thể thao",
      },
    ],
  },
  {
    id: "age",
    label: "Độ tuổi được giới thiệu",
    options: [
      {
        id: "0-3",
        label: "0–3 tuổi",
      },
      {
        id: "4-6",
        label: "4–6 tuổi",
      },
      {
        id: "7-10",
        label: "7–10 tuổi",
      },
      {
        id: "11-15",
        label: "11–15 tuổi",
      },
      {
        id: "16-18",
        label: "16–18 tuổi",
      },
    ],
  },
  {
    id: "depth",
    label: "Mức độ tiếp cận",
    options: [
      {
        id: "intro",
        label: "Nhập môn",
      },
      {
        id: "popular",
        label: "Phổ thông",
      },
      {
        id: "specialist",
        label: "Chuyên sâu",
      },
    ],
  },
  {
    id: "region",
    label: "Phạm vi địa lý",
    options: [
      {
        id: "vietnam",
        label: "Việt Nam",
      },
      {
        id: "asia",
        label: "Châu Á",
      },
      {
        id: "europe",
        label: "Châu Âu",
      },
      {
        id: "americas",
        label: "Châu Mỹ",
      },
      {
        id: "world",
        label: "Thế giới",
      },
    ],
  },
  {
    id: "period",
    label: "Thời kỳ",
    options: [
      {
        id: "ancient",
        label: "Cổ đại",
      },
      {
        id: "medieval",
        label: "Trung đại",
      },
      {
        id: "modern",
        label: "Cận đại",
      },
      {
        id: "contemporary",
        label: "Hiện đại",
      },
    ],
  },
  {
    id: "comicStyle",
    label: "Phong cách truyện tranh",
    options: [
      {
        id: "manga",
        label: "Manga Nhật Bản",
      },
      {
        id: "manhwa",
        label: "Manhwa Hàn Quốc",
      },
      {
        id: "manhua",
        label: "Manhua Trung Quốc",
      },
      {
        id: "comic",
        label: "Comic / truyện tranh khác",
      },
    ],
  },
  {
    id: "workOrigin",
    label: "Nguồn tác phẩm",
    options: [
      {
        id: "vietnam",
        label: "Tác phẩm Việt Nam",
      },
      {
        id: "foreign",
        label: "Tác phẩm nước ngoài",
      },
    ],
  },
  {
    id: "businessTopic",
    label: "Chủ đề kinh doanh",
    options: [
      {
        id: "leadership",
        label: "Lãnh đạo",
      },
      {
        id: "strategy",
        label: "Chiến lược",
      },
      {
        id: "digital-marketing",
        label: "Digital marketing",
      },
      {
        id: "branding",
        label: "Thương hiệu",
      },
      {
        id: "sales",
        label: "Bán hàng",
      },
      {
        id: "investing",
        label: "Đầu tư",
      },
      {
        id: "personal-finance",
        label: "Tài chính cá nhân",
      },
      {
        id: "banking",
        label: "Ngân hàng",
      },
      {
        id: "startup",
        label: "Khởi nghiệp",
      },
      {
        id: "innovation",
        label: "Đổi mới",
      },
      {
        id: "microeconomics",
        label: "Kinh tế vi mô",
      },
      {
        id: "macroeconomics",
        label: "Kinh tế vĩ mô",
      },
      {
        id: "accounting",
        label: "Kế toán",
      },
      {
        id: "tax",
        label: "Thuế",
      },
      {
        id: "audit",
        label: "Kiểm toán",
      },
      {
        id: "recruitment",
        label: "Tuyển dụng",
      },
      {
        id: "people-management",
        label: "Quản lý nhân sự",
      },
      {
        id: "logistics",
        label: "Logistics",
      },
      {
        id: "operations",
        label: "Vận hành",
      },
      {
        id: "business-cases",
        label: "Bài học kinh doanh",
      },
    ],
  },
  {
    id: "scienceField",
    label: "Lĩnh vực khoa học",
    options: [
      {
        id: "math",
        label: "Toán học",
      },
      {
        id: "physics",
        label: "Vật lý",
      },
      {
        id: "chemistry",
        label: "Hóa học",
      },
      {
        id: "biology",
        label: "Sinh học",
      },
      {
        id: "earth",
        label: "Khoa học Trái Đất",
      },
      {
        id: "astronomy",
        label: "Thiên văn",
      },
      {
        id: "environment",
        label: "Môi trường",
      },
      {
        id: "engineering",
        label: "Kỹ thuật",
      },
      {
        id: "computing",
        label: "Máy tính",
      },
    ],
  },
  {
    id: "technologyTopic",
    label: "Chủ đề công nghệ",
    options: [
      {
        id: "programming",
        label: "Lập trình",
      },
      {
        id: "web",
        label: "Phát triển web",
      },
      {
        id: "data",
        label: "Dữ liệu",
      },
      {
        id: "ai",
        label: "Trí tuệ nhân tạo",
      },
      {
        id: "hardware",
        label: "Phần cứng",
      },
      {
        id: "networks",
        label: "Mạng máy tính",
      },
      {
        id: "security",
        label: "An toàn thông tin",
      },
    ],
  },
  {
    id: "artMedium",
    label: "Chất liệu / phương tiện",
    options: [
      {
        id: "pencil",
        label: "Chì",
      },
      {
        id: "watercolor",
        label: "Màu nước",
      },
      {
        id: "oil",
        label: "Sơn dầu",
      },
      {
        id: "digital",
        label: "Kỹ thuật số",
      },
      {
        id: "film",
        label: "Phim",
      },
      {
        id: "instrument",
        label: "Nhạc cụ",
      },
    ],
  },
  {
    id: "lawField",
    label: "Lĩnh vực luật",
    options: [
      {
        id: "civil",
        label: "Dân sự",
      },
      {
        id: "criminal",
        label: "Hình sự",
      },
      {
        id: "business",
        label: "Kinh doanh",
      },
      {
        id: "labor",
        label: "Lao động",
      },
      {
        id: "constitutional",
        label: "Hiến pháp",
      },
      {
        id: "international",
        label: "Quốc tế",
      },
    ],
  },
  {
    id: "cuisine",
    label: "Ẩm thực",
    options: [
      {
        id: "vietnam",
        label: "Việt Nam",
      },
      {
        id: "asian",
        label: "Châu Á",
      },
      {
        id: "western",
        label: "Phương Tây",
      },
      {
        id: "vegetarian",
        label: "Món chay",
      },
      {
        id: "baking",
        label: "Làm bánh",
      },
    ],
  },
  {
    id: "craftType",
    label: "Loại thủ công",
    options: [
      {
        id: "sewing",
        label: "May vá",
      },
      {
        id: "knitting",
        label: "Đan / móc",
      },
      {
        id: "paper",
        label: "Giấy / origami",
      },
      {
        id: "wood",
        label: "Đồ gỗ",
      },
      {
        id: "ceramics",
        label: "Gốm",
      },
    ],
  },
];
export const facetRules = {
  restrictions: {
    "arts.music.artMedium": ["instrument", "digital"],
    "arts.visual.artMedium": ["pencil", "watercolor", "oil", "digital"],
    "arts.design.artMedium": ["pencil", "digital"],
    "arts.photography.artMedium": ["digital", "film"],
    "literature.form": [
      "novel",
      "short",
      "essay",
      "poetry",
      "memoir",
      "reportage",
      "travelogue",
      "criticism",
    ],
    "children.form": ["picture", "activity", "story"],
    "biography.form": ["biography", "memoir", "autobiography"],
    "education.purpose": ["textbook", "workbook", "reference", "exam"],
    "languages.purpose": ["general", "communication", "exam", "dictionary"],
    "psychology.topic": [
      "habits",
      "communication",
      "emotion",
      "relationships",
      "career",
      "time-management",
      "thinking",
    ],
    "children.topic": [
      "animals",
      "nature",
      "emotion",
      "discovery",
      "safety",
      "life-skills",
    ],
    "history.topic": [
      "culture",
      "politics",
      "civilization",
      "maps",
      "landscapes",
    ],
    "biography.topic": [
      "politics",
      "business-life",
      "scientist",
      "artist",
      "personal-life",
    ],
    "parenting.topic": [
      "infant-care",
      "education-methods",
      "child-development",
      "family-life",
      "emotion",
      "communication",
    ],
    "health.topic": [
      "medical-study",
      "nutrition",
      "wellbeing",
      "exercise",
      "public-health",
    ],
    "arts.topic": [
      "art-history",
      "drawing",
      "graphic-design",
      "photography",
      "music-theory",
      "filmmaking",
      "architecture",
    ],
    "society.topic": [
      "philosophy",
      "ethics",
      "politics",
      "society",
      "religion",
      "law",
    ],
    "lifestyle.topic": ["cooking", "crafts", "gardening", "travel", "sports"],
    "business.management.businessTopic": [
      "leadership",
      "strategy",
      "operations",
    ],
    "business.marketing.businessTopic": [
      "digital-marketing",
      "branding",
      "sales",
    ],
    "business.finance.businessTopic": [
      "investing",
      "personal-finance",
      "banking",
    ],
    "business.startup.businessTopic": ["startup", "innovation", "strategy"],
    "business.economics.businessTopic": ["microeconomics", "macroeconomics"],
    "business.accounting.businessTopic": ["accounting", "tax", "audit"],
    "business.hr.businessTopic": ["recruitment", "people-management"],
    "business.supply-chain.businessTopic": ["logistics", "operations"],
    "business.lessons.businessTopic": ["business-cases", "leadership"],
    "parenting.care.topic": ["infant-care", "emotion"],
    "parenting.education.topic": [
      "education-methods",
      "communication",
      "emotion",
    ],
    "parenting.development.topic": ["child-development", "emotion"],
    "parenting.family.topic": ["family-life", "communication", "emotion"],
    "health.medicine.topic": ["medical-study", "public-health"],
    "health.nutrition.topic": ["nutrition"],
    "health.wellness.topic": ["wellbeing", "public-health"],
    "health.fitness.topic": ["exercise"],
    "biography.politics.topic": ["politics"],
    "biography.business.topic": ["business-life"],
    "biography.science.topic": ["scientist"],
    "biography.arts.topic": ["artist"],
    "biography.life.topic": ["personal-life"],
    "arts.visual.topic": ["drawing", "art-history"],
    "arts.design.topic": ["graphic-design", "art-history"],
    "arts.photography.topic": ["photography"],
    "arts.music.topic": ["music-theory"],
    "arts.cinema.topic": ["filmmaking"],
    "arts.architecture.topic": ["architecture"],
    "society.philosophy.topic": ["philosophy", "ethics"],
    "society.law.topic": ["law"],
    "society.politics.topic": ["politics"],
    "society.sociology.topic": ["society"],
    "society.religion.topic": ["religion", "ethics"],
    "lifestyle.cooking.topic": ["cooking"],
    "lifestyle.crafts.topic": ["crafts"],
    "lifestyle.gardening.topic": ["gardening"],
    "lifestyle.travel.topic": ["travel"],
    "lifestyle.sports.topic": ["sports"],
  },
  exams: {
    "languages.ja": ["n5", "n4", "n3", "n2", "n1"],
    "languages.en": ["ielts", "toeic"],
    "languages.zh": ["hsk"],
    "languages.ko": ["topik"],
    "languages.fr": ["delf"],
    "languages.de": ["goethe"],
  },
  dependencies: {
    level: {
      field: "purpose",
      value: "exam",
    },
    grade: {
      field: "schoolStage",
      groups: {
        primary: ["1", "2", "3", "4", "5"],
        secondary: ["6", "7", "8", "9"],
        high: ["10", "11", "12"],
      },
    },
  },
  seriesRoots: ["manga", "light-novel"],
};
const options = (values) => values.map(([id, label]) => ({ id, label }));
export const languageOptions = options([
  ["vi", "Tiếng Việt"],
  ["en", "Tiếng Anh"],
  ["ja", "Tiếng Nhật"],
  ["ko", "Tiếng Hàn"],
  ["zh", "Tiếng Trung"],
  ["fr", "Tiếng Pháp"],
  ["de", "Tiếng Đức"],
]);
export const categoryAliases = {
  Manga: "manga",
  "Light novel": "light-novel",
  "Light Novel": "light-novel",
  "Văn học": "literature",
  "Kỹ năng sống": "psychology.skills",
  "Kinh doanh": "business",
  "Khoa học": "science",
  "Lịch sử": "history",
  "Thiếu nhi": "children",
  Khác: "other",
};
export const categoryDirectorySections = [
  {
    label: "Truyện & văn chương",
    ids: ["manga", "light-novel", "literature", "biography", "children"],
  },
  {
    label: "Học tập & công việc",
    ids: ["languages", "education", "business", "science"],
  },
  {
    label: "Con người & xã hội",
    ids: ["psychology", "history", "society", "parenting"],
  },
  {
    label: "Đời sống & sáng tạo",
    ids: ["health", "arts", "lifestyle", "other"],
  },
];
export function categoryFor(value) {
  return (
    allCategories.find((c) => c.id === value || c.label === value) ??
    allCategories.find((c) => c.id === categoryAliases[value])
  );
}
export function categoryPath(value) {
  const path = [],
    seen = new Set();
  let c = categoryFor(value);
  while (c && !seen.has(c.id)) {
    path.unshift(c);
    seen.add(c.id);
    c = categoryFor(c.parentId);
  }
  return path;
}
export function rootCategory(value) {
  return categoryPath(value)[0];
}
export function supportsSeries(value) {
  return facetRules.seriesRoots.includes(rootCategory(value)?.id);
}
export function descendantIds(value) {
  const c = categoryFor(value);
  if (!c) return [];
  const ids = [c.id],
    seen = new Set(ids);
  for (let i = 0; i < ids.length; i++)
    for (const child of allCategories.filter((c) => c.parentId === ids[i]))
      if (!seen.has(child.id)) {
        seen.add(child.id);
        ids.push(child.id);
      }
  return ids;
}
function metadataFacets(categoryId, attributes) {
  const c = categoryFor(categoryId);
  if (!c) return [];
  const path = categoryPath(c.id).reverse();
  return c.facets.map((id) => {
    const definition = facetDefinitions.find((f) => f.id === id);
    const restriction = path
      .map((c) => facetRules.restrictions[`${c.id}.${id}`])
      .find(Boolean);
    let values = definition.options.filter(
      (o) => !restriction || restriction.includes(o.id),
    );
    if (id === "level") {
      const rule = facetRules.dependencies.level;
      const exams = attributes[rule.field]?.includes(rule.value)
        ? (facetRules.exams[c.id] ?? [])
        : [];
      values = values.filter((o) =>
        ["beginner", "intermediate", "advanced", ...exams].includes(o.id),
      );
    }
    if (id === "grade") {
      const rule = facetRules.dependencies.grade;
      const grades = (attributes[rule.field] ?? []).flatMap(
        (v) => rule.groups[v] ?? [],
      );
      values = values.filter((o) => grades.includes(o.id));
    }
    return { ...definition, options: values };
  });
}
export function facetsFor(categoryId, attributes = {}, context = "metadata") {
  if (context === "metadata") return metadataFacets(categoryId, attributes);
  const merged = new Map();
  for (const id of descendantIds(categoryId))
    for (const facet of metadataFacets(id, attributes)) {
      if (!merged.has(facet.id))
        merged.set(facet.id, { ...facet, options: [] });
      const values = merged.get(facet.id).options;
      for (const o of facet.options)
        if (!values.some((v) => v.id === o.id)) values.push(o);
    }
  return [...merged.values()];
}
function shapeErrors(attributes) {
  if (
    !attributes ||
    typeof attributes !== "object" ||
    Array.isArray(attributes)
  )
    return ["attributes"];
  if (Object.keys(attributes).length > 16) return ["attributes"];
  return Object.entries(attributes)
    .filter(
      ([, v]) =>
        !Array.isArray(v) ||
        !v.length ||
        v.length > 16 ||
        new Set(v).size !== v.length ||
        v.some((x) => typeof x !== "string"),
    )
    .map(([k]) => k);
}
export function classificationErrors(categoryId, attributes = {}) {
  if (!categoryFor(categoryId)) return ["categoryId"];
  const errors = shapeErrors(attributes);
  if (errors.length) return errors;
  const allowed = metadataFacets(categoryId, attributes);
  return Object.entries(attributes)
    .filter(([key, values]) => {
      const f = allowed.find((f) => f.id === key);
      return !f || values.some((v) => !f.options.some((o) => o.id === v));
    })
    .map(([key]) => key);
}
// Each branch retains only OR alternatives that are meaningful in that context.
// AND across facets must be satisfiable on the same category, never across books.
export function searchBranches(categoryId, attributes = {}) {
  if (shapeErrors(attributes).length) return [];
  return descendantIds(categoryId).flatMap((id) => {
    const allowed = metadataFacets(id, attributes),
      next = {};
    for (const [key, values] of Object.entries(attributes)) {
      const f = allowed.find((f) => f.id === key);
      const kept = values.filter((v) => f?.options.some((o) => o.id === v));
      if (!kept.length) return [];
      next[key] = kept;
    }
    return [{ categoryId: id, attributes: next }];
  });
}
export function searchClassificationErrors(categoryId, attributes = {}) {
  if (!categoryFor(categoryId)) return ["categoryId"];
  const errors = shapeErrors(attributes);
  if (errors.length) return errors;
  const branches = searchBranches(categoryId, attributes);
  return Object.entries(attributes)
    .filter(([key, values]) =>
      values.some((v) => !branches.some((b) => b.attributes[key]?.includes(v))),
    )
    .map(([key]) => key);
}
export function compatibleAttributes(
  categoryId,
  attributes = {},
  context = "metadata",
) {
  if (
    !attributes ||
    typeof attributes !== "object" ||
    Array.isArray(attributes)
  )
    return {};
  let next = attributes;
  // Recompute after upstream cleanup (purpose -> level, schoolStage -> grade).
  for (let i = 0; i <= Object.keys(facetRules.dependencies).length; i++) {
    next = Object.fromEntries(
      facetsFor(categoryId, next, context).flatMap((f) => {
        const values = [
          ...new Set(
            (Array.isArray(next[f.id]) ? next[f.id] : []).filter((v) =>
              f.options.some((o) => o.id === v),
            ),
          ),
        ].sort();
        return values.length ? [[f.id, values]] : [];
      }),
    );
  }
  return next;
}
export function classificationLabels(book) {
  return Object.entries(book.attributes ?? {}).flatMap(([key, values]) => {
    const f = facetDefinitions.find((f) => f.id === key);
    return f && values.length
      ? [
          {
            id: key,
            label: f.label,
            values: values.map((id) => ({
              id,
              label: f.options.find((o) => o.id === id)?.label ?? id,
            })),
          },
        ]
      : [];
  });
}
export function foldCatalogText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}
export function languageLabel(value) {
  const primary = value.toLowerCase().split("-")[0];
  const id =
    {
      eng: "en",
      vie: "vi",
      jpn: "ja",
      kor: "ko",
      zho: "zh",
      fra: "fr",
      deu: "de",
    }[primary] || primary;
  return languageOptions.find((o) => o.id === id)?.label || value;
}
export function matchesClassification(book, query) {
  const category = categoryFor(book.categoryId || book.category);
  if (
    query.categoryId &&
    !descendantIds(query.categoryId).includes(category?.id)
  )
    return false;
  const primary = book.language.toLowerCase().split("-")[0];
  if (
    query.language &&
    ({
      eng: "en",
      vie: "vi",
      jpn: "ja",
      kor: "ko",
      zho: "zh",
      fra: "fr",
      deu: "de",
    }[primary] || primary) !== query.language.toLowerCase()
  )
    return false;
  if (
    query.series &&
    book.series?.normalize("NFC").toLowerCase() !==
      query.series.normalize("NFC").toLowerCase()
  )
    return false;
  return Object.entries(query.attributes ?? {}).every(([key, values]) =>
    values.some((v) => book.attributes?.[key]?.includes(v)),
  );
}
