import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  categories,
  categoryFor,
  facetsFor,
  compatibleAttributes,
  supportsSeries,
  languageOptions,
  type Attributes,
} from "@used-books/api-contract/catalog-taxonomy";
import { useSession } from "../../core/session/session-provider";
import { useForeground } from "../../core/hooks/use-foreground";
import {
  AppModal,
  AppText,
  AppTextInput,
  Icon,
  Screen,
  StatePanel,
  TopNavbar,
  Toast,
  stitchTokens,
} from "../../core/ui";
import { MemberNavigation } from "../navigation/member-navigation";
import { publicPage, type Listing } from "../shelf/contracts";
import {
  initialFilters,
  queryString,
  type Filters,
} from "../shelf/filters";
import { SearchBookCard } from "./search-book-card";
import { PublicPhoto } from "../shelf/public-photo";
import { FALLBACK_LISTINGS } from "../shelf/home-mock-data";
import { HomeNotificationsModal } from "../shelf/home-components/home-notifications-modal";
import { useNotifications } from "../notifications/notifications-model";
import { useListingWishlist } from "../wishlist";

const MODE_TABS = [
  { id: "", title: "Tất cả" },
  { id: "Sale", title: "Mua sách" },
  { id: "Exchange", title: "Đổi sách" },
  { id: "Both", title: "Bán hoặc đổi" },
  { id: "Rare", title: "Sách hiếm Sài Gòn" },
] as const;

const CONDITIONS = [
  { id: "", title: "Tất cả" },
  { id: "LikeNew", title: "Như mới" },
  { id: "Good", title: "Còn tốt" },
  { id: "Fair", title: "Đã dùng nhiều" },
  { id: "Worn", title: "Cũ nhiều" },
] as const;

const PRICE_PRESETS = [50000, 100000, 200000] as const;

const SORTS = [
  { id: "newest", title: "Mới đăng" },
  { id: "salePriceAsc", title: "Giá bán tăng dần" },
  { id: "salePriceDesc", title: "Giá bán giảm dần" },
  { id: "exchangeValueAsc", title: "Giá trị đổi tăng dần" },
  { id: "exchangeValueDesc", title: "Giá trị đổi giảm dần" },
] as const;

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { client, state } = useSession();
  const isAuthenticated = state.status === "authenticated";
  const active = useForeground();
  const scrollRef = useRef<ScrollView>(null);
  const params = useLocalSearchParams<{ q?: string; mode?: string }>();

  // Real backend notifications
  const notifQuery = useNotifications(client, isAuthenticated);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationCount = isAuthenticated && notifQuery.data
    ? notifQuery.data.unreadCount
    : 0;

  // Search & Filter State
  const [search, setSearch] = useState(params.q ?? "");
  const [selectedMode, setSelectedMode] = useState<string>(params.mode ?? "");

  const [prevModeParam, setPrevModeParam] = useState(params.mode);
  const [prevQParam, setPrevQParam] = useState(params.q);
  if (params.mode !== prevModeParam) {
    setPrevModeParam(params.mode);
    if (params.mode !== undefined) {
      setSelectedMode(params.mode);
    }
  }
  if (params.q !== prevQParam) {
    setPrevQParam(params.q);
    if (params.q !== undefined) {
      setSearch(params.q);
    }
  }
  const [selectedCondition, setSelectedCondition] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>("");
  const [selectedAttributes, setSelectedAttributes] = useState<Attributes>({});
  const [selectedSeries, setSelectedSeries] = useState<string>("");
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [subcategoryModalOpen, setSubcategoryModalOpen] = useState(false);
  const [sortIndex, setSortIndex] = useState(0);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [sortTriggerLayout, setSortTriggerLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const sortTriggerRef = useRef<View>(null);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [priceBudgetOpen, setPriceBudgetOpen] = useState(false);
  const [minExchangeValue, setMinExchangeValue] = useState("");
  const [maxExchangeValue, setMaxExchangeValue] = useState("");
  const [exchangeBudgetOpen, setExchangeBudgetOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const [pickupIndex, setPickupIndex] = useState(0);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(4);

  const pickupLocations = [
    { name: "Cà phê Thứ Bảy, Q.1", detail: "Cà phê Thứ Bảy, Q.1 · Tự nhận 0đ" },
    {
      name: "45 Nguyễn Gia Trí, Bình Thạnh",
      detail: "45 Nguyễn Gia Trí, Bình Thạnh · Tự nhận 0đ",
    },
  ];

  const currentPickup = pickupLocations[pickupIndex];
  const currentSort = SORTS[sortIndex];

  // Active category & dynamic facets
  const activeCategoryId = selectedSubcategoryId || selectedCategoryId;
  const currentCategory = activeCategoryId
    ? categoryFor(activeCategoryId)
    : undefined;
  const rootCategory = selectedCategoryId
    ? categoryFor(selectedCategoryId)
    : undefined;
  const rootChildren = rootCategory?.children ?? [];

  const dynamicFacets = useMemo(() => {
    if (!activeCategoryId) return [];
    return facetsFor(activeCategoryId, selectedAttributes, "search");
  }, [activeCategoryId, selectedAttributes]);

  const hasSeriesSupport = activeCategoryId
    ? supportsSeries(activeCategoryId)
    : false;

  const handleSelectRootCategory = (catId: string) => {
    if (!catId) {
      setSelectedCategoryId("");
      setSelectedSubcategoryId("");
      setSelectedAttributes({});
      setSelectedSeries("");
    } else {
      setSelectedCategoryId(catId);
      setSelectedSubcategoryId("");
      setSelectedAttributes(
        compatibleAttributes(catId, selectedAttributes, "search"),
      );
      if (!supportsSeries(catId)) setSelectedSeries("");
    }
    setCategoryModalOpen(false);
  };

  const handleSelectSubcategory = (subId: string) => {
    setSelectedSubcategoryId(subId);
    const targetId = subId || selectedCategoryId;
    setSelectedAttributes(
      compatibleAttributes(targetId, selectedAttributes, "search"),
    );
    if (!supportsSeries(targetId)) setSelectedSeries("");
    setSubcategoryModalOpen(false);
  };

  const handleToggleFacetOption = useCallback(
    (facetId: string, optionId: string) => {
      setSelectedAttributes((prev) => {
        const current = prev[facetId] ?? [];
        const nextVals = current.includes(optionId)
          ? current.filter((v) => v !== optionId)
          : [...current, optionId];
        const updated = { ...prev };
        if (nextVals.length === 0) {
          delete updated[facetId];
        } else {
          updated[facetId] = nextVals;
        }
        return compatibleAttributes(activeCategoryId, updated, "search");
      });
    },
    [activeCategoryId],
  );

  const handleClearFacet = (facetId: string) => {
    setSelectedAttributes((prev) => {
      const updated = { ...prev };
      delete updated[facetId];
      return compatibleAttributes(activeCategoryId, updated, "search");
    });
  };

  // Map to API query
  const appliedFilters: Filters = useMemo(() => {
    return {
      ...initialFilters,
      q: search.trim(),
      mode:
        selectedMode === "Rare"
          ? ""
          : selectedMode,
      condition:
        selectedMode === "Rare"
          ? "LikeNew"
          : selectedCondition,
      sort: currentSort.id as Filters["sort"],
      minSalePrice: minPrice,
      maxSalePrice: maxPrice,
      minExchangeValue: minExchangeValue || undefined,
      maxExchangeValue: maxExchangeValue || undefined,
      language: selectedLanguage || undefined,
      categoryId: activeCategoryId || undefined,
      facets:
        Object.keys(selectedAttributes).length > 0
          ? JSON.stringify(selectedAttributes)
          : undefined,
      series: selectedSeries.trim() || undefined,
    };
  }, [
    search,
    selectedMode,
    selectedCondition,
    currentSort,
    minPrice,
    maxPrice,
    minExchangeValue,
    maxExchangeValue,
    selectedLanguage,
    activeCategoryId,
    selectedAttributes,
    selectedSeries,
  ]);

  const { isSaved, toggle, toastMessage, clearToast } = useListingWishlist();

  const query = queryString(appliedFilters);

  // Real TanStack API Query
  const result = useQuery({
    queryKey: ["public-search", query],
    queryFn: () =>
      client.publicRequest(
        `/listings?${query}`,
        publicPage,
      ),
    enabled: active,
    staleTime: 15_000,
    gcTime: 120_000,
    retry: false,
  });

  // Combined real + fallback listings with interactive filtering
  const displayItems = useMemo(() => {
    const serverItems = result.data?.items ?? [];
    let list: (Listing & {
      coverUrl?: string;
      badgeLabel?: string;
      tags?: string[];
      salesCount?: number;
      location?: string;
    })[] = [];

    if (serverItems.length > 0) {
      list = [...serverItems];
    } else {
      list = [...FALLBACK_LISTINGS];
    }

    // Filter by search text
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.book.title.toLowerCase().includes(q) ||
          item.book.authors.some((a) => a.toLowerCase().includes(q)) ||
          item.book.category.toLowerCase().includes(q),
      );
    }

    // Filter by mode
    if (selectedMode === "Sale") {
      list = list.filter((item) => item.mode === "Sale" || item.mode === "Both");
    } else if (selectedMode === "Exchange") {
      list = list.filter(
        (item) => item.mode === "Exchange" || item.mode === "Both",
      );
    } else if (selectedMode === "Both") {
      list = list.filter((item) => item.mode === "Both");
    } else if (selectedMode === "Rare") {
      list = list.filter((item) => item.condition === "LikeNew");
    }

    // Filter by condition
    if (selectedCondition && selectedMode !== "Rare") {
      list = list.filter((item) => item.condition === selectedCondition);
    }

    // Filter by Category
    if (activeCategoryId) {
      const catObj = categoryFor(activeCategoryId);
      const catLabel = catObj?.label.toLowerCase();
      if (catLabel) {
        list = list.filter((item) => {
          const itemCat = item.book.category.toLowerCase();
          return (
            itemCat.includes(catLabel) ||
            (item.book as Record<string, unknown>).categoryId ===
              activeCategoryId
          );
        });
      }
    }

    // Filter by Series
    if (selectedSeries.trim()) {
      const s = selectedSeries.trim().toLowerCase();
      list = list.filter((item) => {
        const itemTitle = item.book.title.toLowerCase();
        const itemSeries =
          typeof (item.book as Record<string, unknown>).series === "string"
            ? (
                (item.book as Record<string, unknown>).series as string
              ).toLowerCase()
            : "";
        return itemTitle.includes(s) || itemSeries.includes(s);
      });
    }

    // Filter by dynamic facets
    const activeFacetEntries = Object.entries(selectedAttributes);
    if (activeFacetEntries.length > 0) {
      list = list.filter((item) => {
        const textToSearch = [
          item.book.title,
          item.book.category,
          item.book.edition,
          ...(item.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();

        return activeFacetEntries.every(([facetId, optionIds]) => {
          const facetDef = dynamicFacets.find((f) => f.id === facetId);
          if (!facetDef) return true;
          return optionIds.some((optId) => {
            const opt = facetDef.options.find((o) => o.id === optId);
            if (!opt) return true;
            return (
              textToSearch.includes(opt.label.toLowerCase()) ||
              textToSearch.includes(opt.id.toLowerCase())
            );
          });
        });
      });
    }

    // Filter by min and max sale price
    if (minPrice || maxPrice) {
      const min = minPrice ? Number(minPrice.replace(/\D/g, "")) : 0;
      const max = maxPrice ? Number(maxPrice.replace(/\D/g, "")) : Infinity;
      if (!Number.isNaN(min) && !Number.isNaN(max)) {
        list = list.filter((item) => {
          const p = item.salePrice || item.exchangeValue || 0;
          return p >= min && p <= max;
        });
      }
    }

    // Filter by Exchange Value (Khoảng giá trị đổi)
    if (minExchangeValue || maxExchangeValue) {
      const minEx = minExchangeValue
        ? Number(minExchangeValue.replace(/\D/g, ""))
        : 0;
      const maxEx = maxExchangeValue
        ? Number(maxExchangeValue.replace(/\D/g, ""))
        : Infinity;
      if (!Number.isNaN(minEx) && !Number.isNaN(maxEx)) {
        list = list.filter((item) => {
          const p = item.exchangeValue || 0;
          return p >= minEx && p <= maxEx;
        });
      }
    }

    // Filter by Language (Ngôn ngữ của sách)
    if (selectedLanguage) {
      list = list.filter((item) => item.book.language === selectedLanguage);
    }

    // Sort items
    if (currentSort.id === "salePriceAsc") {
      list.sort(
        (a, b) =>
          (a.salePrice ?? a.exchangeValue ?? 0) -
          (b.salePrice ?? b.exchangeValue ?? 0),
      );
    } else if (currentSort.id === "salePriceDesc") {
      list.sort(
        (a, b) =>
          (b.salePrice ?? b.exchangeValue ?? 0) -
          (a.salePrice ?? a.exchangeValue ?? 0),
      );
    } else if (currentSort.id === "exchangeValueAsc") {
      list.sort(
        (a, b) =>
          (a.exchangeValue ?? a.salePrice ?? 0) -
          (b.exchangeValue ?? b.salePrice ?? 0),
      );
    } else if (currentSort.id === "exchangeValueDesc") {
      list.sort(
        (a, b) =>
          (b.exchangeValue ?? b.salePrice ?? 0) -
          (a.exchangeValue ?? a.salePrice ?? 0),
      );
    } else {
      list.sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() -
          new Date(a.publishedAt).getTime(),
      );
    }

    return list;
  }, [
    result.data?.items,
    search,
    selectedMode,
    selectedCondition,
    activeCategoryId,
    selectedSeries,
    selectedAttributes,
    dynamicFacets,
    minPrice,
    maxPrice,
    minExchangeValue,
    maxExchangeValue,
    selectedLanguage,
    currentSort,
  ]);

  const handleResetFilters = () => {
    setSelectedMode("");
    setSelectedCondition("");
    setMinPrice("");
    setMaxPrice("");
    setPriceBudgetOpen(false);
    setMinExchangeValue("");
    setMaxExchangeValue("");
    setExchangeBudgetOpen(false);
    setSelectedLanguage("");
    setSelectedCategoryId("");
    setSelectedSubcategoryId("");
    setSelectedAttributes({});
    setSelectedSeries("");
  };

  const handlePricePreset = (price: number) => {
    setPriceBudgetOpen(true);
    const str = String(price);
    if (!minPrice && maxPrice === str) {
      setMaxPrice("");
    } else {
      setMinPrice("");
      setMaxPrice(str);
    }
  };

  const handleExchangePreset = (price: number) => {
    setExchangeBudgetOpen(true);
    const str = String(price);
    if (!minExchangeValue && maxExchangeValue === str) {
      setMaxExchangeValue("");
    } else {
      setMinExchangeValue("");
      setMaxExchangeValue(str);
    }
  };

  const handleOpenSortDropdown = () => {
    if (sortTriggerRef.current) {
      sortTriggerRef.current.measureInWindow((x, y, width, height) => {
        setSortTriggerLayout({ x, y, width, height });
        setSortDropdownOpen(true);
      });
    } else {
      setSortDropdownOpen(true);
    }
  };

  const handleTogglePickup = () => {
    setPickupIndex((prev) => (prev + 1) % pickupLocations.length);
  };

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    if (selectedCategoryId) {
      const cat = categoryFor(selectedCategoryId);
      if (cat) {
        chips.push({
          key: "category",
          label: `Danh mục: ${cat.label}`,
          onRemove: () => {
            setSelectedCategoryId("");
            setSelectedSubcategoryId("");
            setSelectedAttributes({});
            setSelectedSeries("");
          },
        });
      }
    }
    if (selectedSubcategoryId) {
      const sub = categoryFor(selectedSubcategoryId);
      if (sub && sub.id !== selectedCategoryId) {
        chips.push({
          key: "subcategory",
          label: `Nhóm: ${sub.label}`,
          onRemove: () => {
            setSelectedSubcategoryId("");
            setSelectedAttributes(
              compatibleAttributes(
                selectedCategoryId,
                selectedAttributes,
                "search",
              ),
            );
          },
        });
      }
    }
    // Dynamic Facets chips
    Object.entries(selectedAttributes).forEach(([facetId, optionIds]) => {
      const facet = dynamicFacets.find((f) => f.id === facetId);
      optionIds.forEach((optId) => {
        const opt = facet?.options.find((o) => o.id === optId);
        chips.push({
          key: `facet-${facetId}-${optId}`,
          label: opt?.label || optId,
          onRemove: () => handleToggleFacetOption(facetId, optId),
        });
      });
    });
    // Series chip
    if (selectedSeries.trim()) {
      chips.push({
        key: "series",
        label: `Bộ: ${selectedSeries.trim()}`,
        onRemove: () => setSelectedSeries(""),
      });
    }
    if (selectedMode) {
      const modeLabel =
        selectedMode === "Sale"
          ? "Mua sách"
          : selectedMode === "Exchange"
            ? "Đổi sách"
            : selectedMode === "Both"
              ? "Bán hoặc đổi"
              : "Sách hiếm";
      chips.push({
        key: "mode",
        label: modeLabel,
        onRemove: () => setSelectedMode(""),
      });
    }
    if (selectedCondition) {
      const cond = CONDITIONS.find((c) => c.id === selectedCondition);
      if (cond && cond.id) {
        chips.push({
          key: "condition",
          label: cond.title,
          onRemove: () => setSelectedCondition(""),
        });
      }
    }
    if (minPrice || maxPrice) {
      let label = "";
      if (minPrice && maxPrice) {
        label = `${Number(minPrice) / 1000}k - ${Number(maxPrice) / 1000}k`;
      } else if (maxPrice) {
        label = `≤ ${Number(maxPrice) / 1000}k`;
      } else if (minPrice) {
        label = `≥ ${Number(minPrice) / 1000}k`;
      }
      chips.push({
        key: "price",
        label,
        onRemove: () => {
          setMinPrice("");
          setMaxPrice("");
        },
      });
    }
    if (minExchangeValue || maxExchangeValue) {
      let label = "";
      if (minExchangeValue && maxExchangeValue) {
        label = `Đổi: ${Number(minExchangeValue) / 1000}k - ${Number(maxExchangeValue) / 1000}k`;
      } else if (maxExchangeValue) {
        label = `Đổi: ≤ ${Number(maxExchangeValue) / 1000}k`;
      } else if (minExchangeValue) {
        label = `Đổi: ≥ ${Number(minExchangeValue) / 1000}k`;
      }
      chips.push({
        key: "exchangeValue",
        label,
        onRemove: () => {
          setMinExchangeValue("");
          setMaxExchangeValue("");
        },
      });
    }
    if (selectedLanguage) {
      const langOption = languageOptions.find((o) => o.id === selectedLanguage);
      chips.push({
        key: "language",
        label: `Ngôn ngữ: ${langOption?.label || selectedLanguage}`,
        onRemove: () => setSelectedLanguage(""),
      });
    }
    return chips;
  }, [
    selectedCategoryId,
    selectedSubcategoryId,
    selectedAttributes,
    selectedSeries,
    dynamicFacets,
    selectedMode,
    selectedCondition,
    minPrice,
    maxPrice,
    minExchangeValue,
    maxExchangeValue,
    selectedLanguage,
    handleToggleFacetOption,
  ]);

  const handleVoiceSearch = () => {
    Alert.alert(
      "Tìm Kiếm Bằng Giọng Nói",
      "Đang lắng nghe: 'Tìm các tác phẩm của Nguyễn Tuân hoặc Thạch Lam xuất bản trước 1954'...",
      [
        {
          text: "Áp dụng từ khóa",
          onPress: () => setSearch("Thạch Lam"),
        },
        { text: "Đóng", style: "cancel" },
      ],
    );
  };

  const handleOpenBook = (id: string) => {
    router.push({ pathname: "./book", params: { id } });
  };

  const facetOptionCount = Object.values(selectedAttributes).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  const filterCount =
    Number(!!selectedMode) +
    Number(!!selectedCondition) +
    Number(Boolean(minPrice || maxPrice)) +
    Number(Boolean(minExchangeValue || maxExchangeValue)) +
    Number(!!selectedLanguage) +
    Number(!!selectedCategoryId) +
    Number(!!selectedSubcategoryId) +
    facetOptionCount +
    Number(Boolean(selectedSeries.trim()));

  return (
    <Screen
      appearance="home"
      scrollRef={scrollRef}
      header={
        <TopNavbar
          notificationCount={notificationCount}
          hasNotification={notificationCount > 0}
          onNotificationsPress={() => setNotificationsOpen(true)}
          onMessagesPress={() => router.navigate("/account")}
        />
      }
      footer={<MemberNavigation current="/search" />}
      footerAppearance="navigation"
      compactFooter
    >
      <View style={styles.searchBody}>
        {/* 1. Sticky Search Bar & Input Controls */}
        <View style={styles.searchBarSection}>
          <View style={styles.searchBarBox}>
            <Icon name="search" size={20} color={stitchTokens.wine} />
            <AppTextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm tên sách, tác giả, NXB..."
              placeholderTextColor={stitchTokens.ashBrown}
              returnKeyType="search"
              style={styles.searchInput}
              accessibilityLabel="Ô tìm kiếm sách"
              autoFocus
            />
            {search.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xóa từ khóa"
                onPress={() => setSearch("")}
                hitSlop={8}
                style={styles.clearBtn}
              >
                <Icon name="close" size={16} color={stitchTokens.stoneMuted} />
              </Pressable>
            ) : null}
            <View style={styles.searchDivider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tìm kiếm giọng nói"
              onPress={handleVoiceSearch}
              hitSlop={8}
              style={styles.micBtn}
            >
              <Icon name="mic" size={18} color={stitchTokens.wine} />
            </Pressable>
          </View>

          {/* Horizontal Mode Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modeTabsScroll}
          >
            {MODE_TABS.map((tab) => {
              const isSelected = selectedMode === tab.id;
              return (
                <Pressable
                  key={tab.id || "all"}
                  accessibilityRole="tab"
                  accessibilityLabel={`Chế độ: ${tab.title}`}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedMode(tab.id)}
                  style={[
                    styles.modeTab,
                    isSelected
                      ? styles.modeTabSelected
                      : styles.modeTabUnselected,
                  ]}
                >
                  <AppText
                    kind="small"
                    style={[
                      styles.modeTabText,
                      isSelected
                        ? styles.modeTabTextSelected
                        : styles.modeTabTextUnselected,
                    ]}
                  >
                    {tab.title}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* 2. Search Summary & Advanced Filter Toggle */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryLeft}>
            <Icon name="explore" size={16} color={stitchTokens.wine} />
            <AppText kind="small" style={styles.summaryText}>
              Tìm thấy{" "}
              <AppText kind="bold" style={styles.summaryCount}>
                {displayItems.length}
              </AppText>{" "}
              cuốn tại TP.HCM
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mở bộ lọc (${filterCount})`}
            onPress={() => setFilterPanelOpen((prev) => !prev)}
            style={[
              styles.filterToggleBtn,
              (filterPanelOpen || filterCount > 0) &&
                styles.filterToggleBtnActive,
            ]}
          >
            <Icon
              name="tune"
              size={15}
              color={
                filterPanelOpen || filterCount > 0
                  ? stitchTokens.warmIvory
                  : stitchTokens.wine
              }
            />
            <AppText
              kind="small"
              style={[
                styles.filterToggleText,
                (filterPanelOpen || filterCount > 0) &&
                  styles.filterToggleTextActive,
              ]}
            >
              Bộ lọc ({filterCount})
            </AppText>
            {filterCount > 0 && !filterPanelOpen ? (
              <View style={styles.filterDot} />
            ) : null}
          </Pressable>
        </View>

        {/* Dedicated Sort Bar (Khung dropdown đẹp theo thiết kế) */}
        <View style={styles.sortBar}>
          <AppText kind="small" style={styles.sortBarLabel}>
            Sắp xếp
          </AppText>
          <View ref={sortTriggerRef} collapsable={false}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sắp xếp: ${currentSort.title}`}
              onPress={handleOpenSortDropdown}
              style={[
                styles.sortDropdownTrigger,
                sortDropdownOpen && styles.sortDropdownTriggerActive,
              ]}
            >
              <AppText kind="bold" style={styles.sortDropdownTriggerText}>
                {currentSort.title}
              </AppText>
              <Icon
                name="chevronDown"
                size={14}
                color={stitchTokens.wine}
              />
            </Pressable>
          </View>
        </View>

        {/* 3. Filter Panel Styled Matching Web (Chỉ hiện khi bấm vào "Bộ lọc") */}
        {filterPanelOpen ? (
          <View style={styles.webFilterPanel}>
            {/* Header */}
            <View style={styles.filterHeadRow}>
              <View style={styles.filterHeadTitle}>
                <Icon name="tune" size={17} color={stitchTokens.wine} />
                <AppText kind="bold" style={styles.filterHeadText}>
                  Bộ lọc sách
                </AppText>
              </View>
              <View style={styles.filterHeadRightGroup}>
                {filterCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Xóa toàn bộ lựa chọn bộ lọc"
                    onPress={handleResetFilters}
                    hitSlop={8}
                    style={styles.resetBtn}
                  >
                    <Icon name="sync" size={12} color={stitchTokens.wine} />
                    <AppText kind="small" style={styles.resetBtnText}>
                      Xóa lựa chọn
                    </AppText>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đóng bảng bộ lọc"
                  onPress={() => setFilterPanelOpen(false)}
                  hitSlop={8}
                  style={styles.closeFilterBtn}
                >
                  <Icon name="close" size={16} color={stitchTokens.stoneMuted} />
                </Pressable>
              </View>
            </View>

            {/* Section: Danh mục sách & Thuộc tính động (Catalog Taxonomy) */}
            <View style={styles.filterSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <AppText kind="bold" style={styles.sectionTitleText}>
                    Danh mục sách
                  </AppText>
                  {selectedCategoryId ? (
                    <AppText kind="small" style={styles.selectedCountBadge}>
                      1 đã chọn
                    </AppText>
                  ) : null}
                </View>
              </View>

              {/* Category Dropdown Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Chọn danh mục sách"
                onPress={() => setCategoryModalOpen(true)}
                style={styles.categoryDropdownBtn}
              >
                <AppText
                  kind="body"
                  style={styles.categoryDropdownText}
                  numberOfLines={1}
                >
                  {rootCategory?.label ?? "Tất cả danh mục"}
                </AppText>
                <Icon name="chevronDown" size={16} color={stitchTokens.stoneMuted} />
              </Pressable>

              {/* Subcategory Dropdown (Nhóm sách con nếu có) */}
              {rootChildren.length > 0 ? (
                <View style={styles.subcategoryField}>
                  <View style={styles.sectionHeaderRow}>
                    <AppText kind="bold" style={styles.sectionTitleText}>
                      Nhóm sách
                    </AppText>
                    {selectedSubcategoryId ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Xóa lựa chọn nhóm sách"
                        onPress={() => handleSelectSubcategory("")}
                        hitSlop={8}
                      >
                        <AppText kind="small" style={styles.clearGroupText}>
                          Xóa
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Chọn nhóm sách"
                    onPress={() => setSubcategoryModalOpen(true)}
                    style={styles.categoryDropdownBtn}
                  >
                    <AppText
                      kind="body"
                      style={styles.categoryDropdownText}
                      numberOfLines={1}
                    >
                      {selectedSubcategoryId
                        ? (categoryFor(selectedSubcategoryId)?.label ??
                          `Tất cả ${rootCategory?.label.toLowerCase()}`)
                        : `Tất cả ${rootCategory?.label.toLowerCase()}`}
                    </AppText>
                    <Icon name="chevronDown" size={16} color={stitchTokens.stoneMuted} />
                  </Pressable>
                </View>
              ) : null}

              {/* Context Note when Category is selected (giống web) */}
              {currentCategory ? (
                <AppText kind="small" style={styles.facetContextNote}>
                  Lọc riêng cho{" "}
                  <AppText kind="bold" style={{ color: stitchTokens.wine }}>
                    {currentCategory.label}
                  </AppText>
                  . Chọn nhiều mục để mở rộng kết quả trong cùng nhóm.
                </AppText>
              ) : null}

              {/* Dynamic Facets (Thuộc tính động cho danh mục) */}
              {dynamicFacets.map((facet) => {
                const selectedFacetVals = selectedAttributes[facet.id] ?? [];
                return (
                  <View key={facet.id} style={styles.facetSection}>
                    <View style={styles.sectionHeaderRow}>
                      <View style={styles.sectionHeaderLeft}>
                        <AppText kind="bold" style={styles.facetTitleText}>
                          {facet.label}
                        </AppText>
                        {selectedFacetVals.length > 0 ? (
                          <AppText
                            kind="small"
                            style={styles.selectedCountBadge}
                          >
                            {selectedFacetVals.length} đã chọn
                          </AppText>
                        ) : null}
                      </View>
                      {selectedFacetVals.length > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Xóa lựa chọn ${facet.label}`}
                          onPress={() => handleClearFacet(facet.id)}
                          hitSlop={8}
                        >
                          <AppText kind="small" style={styles.clearGroupText}>
                            Xóa
                          </AppText>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.facetChoicesWrap}>
                      {facet.options.map((opt) => {
                        const isSelected = selectedFacetVals.includes(opt.id);
                        return (
                          <Pressable
                            key={opt.id}
                            accessibilityRole="button"
                            accessibilityLabel={`${facet.label}: ${opt.label}`}
                            onPress={() =>
                              handleToggleFacetOption(facet.id, opt.id)
                            }
                            style={[
                              styles.choicePill,
                              isSelected
                                ? styles.choicePillSelected
                                : styles.choicePillUnselected,
                            ]}
                          >
                            <AppText
                              kind="small"
                              style={[
                                styles.choicePillText,
                                isSelected
                                  ? styles.choicePillTextSelected
                                  : styles.choicePillTextUnselected,
                              ]}
                            >
                              {opt.label}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}

              {/* Bộ sách / Series Input nếu danh mục hỗ trợ series */}
              {hasSeriesSupport ? (
                <View style={styles.seriesSection}>
                  <View style={styles.sectionHeaderRow}>
                    <AppText kind="bold" style={styles.sectionTitleText}>
                      Bộ sách / Series
                    </AppText>
                    {selectedSeries.trim() ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Xóa bộ sách"
                        onPress={() => setSelectedSeries("")}
                        hitSlop={8}
                      >
                        <AppText kind="small" style={styles.clearGroupText}>
                          Xóa
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.seriesInputBox}>
                    <AppTextInput
                      value={selectedSeries}
                      onChangeText={setSelectedSeries}
                      placeholder="Ví dụ: Doraemon, Harry Potter..."
                      placeholderTextColor={stitchTokens.taupeMuted}
                      style={styles.seriesInputText}
                      accessibilityLabel="Tên bộ sách hoặc series"
                    />
                    {selectedSeries.trim() ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Xóa tên bộ sách"
                        onPress={() => setSelectedSeries("")}
                        hitSlop={8}
                      >
                        <Icon name="close" size={14} color={stitchTokens.stoneMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>

            {/* Section: Tình trạng sách */}
            <View style={styles.filterSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <AppText kind="bold" style={styles.sectionTitleText}>
                    Tình trạng sách
                  </AppText>
                  {selectedCondition ? (
                    <AppText kind="small" style={styles.selectedCountBadge}>
                      1 đã chọn
                    </AppText>
                  ) : null}
                </View>
                {selectedCondition ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Xóa lựa chọn tình trạng sách"
                    onPress={() => setSelectedCondition("")}
                    hitSlop={8}
                  >
                    <AppText kind="small" style={styles.clearGroupText}>
                      Xóa
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.conditionChoicesWrap}>
                {CONDITIONS.map((cond) => {
                  const isSelected = selectedCondition === cond.id;
                  return (
                    <Pressable
                      key={cond.id || "all"}
                      accessibilityRole="button"
                      accessibilityLabel={`Tình trạng: ${cond.title}`}
                      onPress={() =>
                        setSelectedCondition(isSelected ? "" : cond.id)
                      }
                      style={[
                        styles.choicePill,
                        isSelected
                          ? styles.choicePillSelected
                          : styles.choicePillUnselected,
                      ]}
                    >
                      <AppText
                        kind="small"
                        style={[
                          styles.choicePillText,
                          isSelected
                            ? styles.choicePillTextSelected
                            : styles.choicePillTextUnselected,
                        ]}
                      >
                        {cond.title}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Section: Khoảng giá bán (Collapsible giống Khoảng giá trị đổi) */}
            {selectedMode !== "Exchange" ? (
              <View style={styles.exchangeSection}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đóng mở khoảng giá bán"
                  onPress={() => setPriceBudgetOpen((prev) => !prev)}
                  style={styles.exchangeToggleHeader}
                >
                  <View style={styles.exchangeToggleLeft}>
                    <AppText kind="bold" style={styles.exchangeToggleText}>
                      {priceBudgetOpen ? "▼" : "▶"} Giá bán (₫)
                    </AppText>
                    {minPrice || maxPrice ? (
                      <AppText kind="small" style={styles.selectedCountBadge}>
                        Đã chọn khoảng
                      </AppText>
                    ) : null}
                  </View>
                  {minPrice || maxPrice ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Xóa lựa chọn khoảng giá"
                      onPress={(e) => {
                        e.stopPropagation();
                        setMinPrice("");
                        setMaxPrice("");
                      }}
                      hitSlop={8}
                    >
                      <AppText kind="small" style={styles.clearGroupText}>
                        Xóa
                      </AppText>
                    </Pressable>
                  ) : null}
                </Pressable>

                {priceBudgetOpen ? (
                  <View style={styles.exchangeBody}>
                    {/* Inputs: Từ & Đến */}
                    <View style={styles.priceInputsRow}>
                      <View style={styles.priceInputBox}>
                        <AppText kind="small" style={styles.priceFieldLabel}>
                          Từ
                        </AppText>
                        <AppTextInput
                          value={minPrice}
                          onChangeText={(val) => setMinPrice(val.replace(/\D/g, ""))}
                          placeholder="10.000"
                          placeholderTextColor={stitchTokens.taupeMuted}
                          keyboardType="numeric"
                          style={styles.priceInputText}
                          accessibilityLabel="Giá bán từ"
                        />
                      </View>
                      <AppText kind="small" style={styles.priceDash}>
                        -
                      </AppText>
                      <View style={styles.priceInputBox}>
                        <AppText kind="small" style={styles.priceFieldLabel}>
                          Đến
                        </AppText>
                        <AppTextInput
                          value={maxPrice}
                          onChangeText={(val) => setMaxPrice(val.replace(/\D/g, ""))}
                          placeholder="1.000.000"
                          placeholderTextColor={stitchTokens.taupeMuted}
                          keyboardType="numeric"
                          style={styles.priceInputText}
                          accessibilityLabel="Giá bán đến"
                        />
                      </View>
                    </View>

                    {/* Price Presets */}
                    <View style={styles.presetsRow}>
                      {PRICE_PRESETS.map((p) => {
                        const isPressed = !minPrice && maxPrice === String(p);
                        return (
                          <Pressable
                            key={p}
                            accessibilityRole="button"
                            accessibilityLabel={`Giá tối đa ${p / 1000}k`}
                            onPress={() => handlePricePreset(p)}
                            style={[
                              styles.presetBtn,
                              isPressed
                                ? styles.presetBtnSelected
                                : styles.presetBtnUnselected,
                            ]}
                          >
                            <AppText
                              kind="small"
                              style={[
                                styles.presetBtnText,
                                isPressed
                                  ? styles.presetBtnTextSelected
                                  : styles.presetBtnTextUnselected,
                              ]}
                            >
                              ≤ {p / 1000}k
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Section: Khoảng giá trị đổi (Collapsible giống web) */}
            {selectedMode !== "Sale" ? (
              <View style={styles.exchangeSection}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Đóng mở khoảng giá trị đổi"
                  onPress={() => setExchangeBudgetOpen((prev) => !prev)}
                  style={styles.exchangeToggleHeader}
                >
                  <View style={styles.exchangeToggleLeft}>
                    <AppText kind="bold" style={styles.exchangeToggleText}>
                      {exchangeBudgetOpen ? "▼" : "▶"} Khoảng giá trị đổi
                    </AppText>
                    {minExchangeValue || maxExchangeValue ? (
                      <AppText kind="small" style={styles.selectedCountBadge}>
                        Đã chọn khoảng
                      </AppText>
                    ) : null}
                  </View>
                  {minExchangeValue || maxExchangeValue ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Xóa lựa chọn giá trị đổi"
                      onPress={(e) => {
                        e.stopPropagation();
                        setMinExchangeValue("");
                        setMaxExchangeValue("");
                      }}
                      hitSlop={8}
                    >
                      <AppText kind="small" style={styles.clearGroupText}>
                        Xóa
                      </AppText>
                    </Pressable>
                  ) : null}
                </Pressable>

                {exchangeBudgetOpen ? (
                  <View style={styles.exchangeBody}>
                    {/* Inputs: Từ & Đến */}
                    <View style={styles.priceInputsRow}>
                      <View style={styles.priceInputBox}>
                        <AppText kind="small" style={styles.priceFieldLabel}>
                          Từ
                        </AppText>
                        <AppTextInput
                          value={minExchangeValue}
                          onChangeText={(val) =>
                            setMinExchangeValue(val.replace(/\D/g, ""))
                          }
                          placeholder="10.000"
                          placeholderTextColor={stitchTokens.taupeMuted}
                          keyboardType="numeric"
                          style={styles.priceInputText}
                          accessibilityLabel="Giá trị đổi từ"
                        />
                      </View>
                      <AppText kind="small" style={styles.priceDash}>
                        -
                      </AppText>
                      <View style={styles.priceInputBox}>
                        <AppText kind="small" style={styles.priceFieldLabel}>
                          Đến
                        </AppText>
                        <AppTextInput
                          value={maxExchangeValue}
                          onChangeText={(val) =>
                            setMaxExchangeValue(val.replace(/\D/g, ""))
                          }
                          placeholder="1.000.000"
                          placeholderTextColor={stitchTokens.taupeMuted}
                          keyboardType="numeric"
                          style={styles.priceInputText}
                          accessibilityLabel="Giá trị đổi đến"
                        />
                      </View>
                    </View>

                    {/* Presets */}
                    <View style={styles.presetsRow}>
                      {PRICE_PRESETS.map((p) => {
                        const isPressed =
                          !minExchangeValue &&
                          maxExchangeValue === String(p);
                        return (
                          <Pressable
                            key={p}
                            accessibilityRole="button"
                            accessibilityLabel={`Giá trị đổi tối đa ${p / 1000}k`}
                            onPress={() => handleExchangePreset(p)}
                            style={[
                              styles.presetBtn,
                              isPressed
                                ? styles.presetBtnSelected
                                : styles.presetBtnUnselected,
                            ]}
                          >
                            <AppText
                              kind="small"
                              style={[
                                styles.presetBtnText,
                                isPressed
                                  ? styles.presetBtnTextSelected
                                  : styles.presetBtnTextUnselected,
                              ]}
                            >
                              ≤ {p / 1000}k
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>

                    {/* Hint text giống web */}
                    <AppText kind="small" style={styles.exchangeHintText}>
                      Nếu chọn cả hai khoảng tiền, sách cần đáp ứng cả hai.
                    </AppText>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Section: Ngôn ngữ của sách */}
            <View style={styles.filterSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderLeft}>
                  <AppText kind="bold" style={styles.sectionTitleText}>
                    Ngôn ngữ của sách
                  </AppText>
                  {selectedLanguage ? (
                    <AppText kind="small" style={styles.selectedCountBadge}>
                      1 đã chọn
                    </AppText>
                  ) : null}
                </View>
                {selectedLanguage ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Xóa lựa chọn ngôn ngữ của sách"
                    onPress={() => setSelectedLanguage("")}
                    hitSlop={8}
                  >
                    <AppText kind="small" style={styles.clearGroupText}>
                      Xóa
                    </AppText>
                  </Pressable>
                ) : null}
              </View>

              {/* Language Dropdown Trigger */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Chọn ngôn ngữ của sách"
                onPress={() => setLanguageModalOpen(true)}
                style={styles.categoryDropdownBtn}
              >
                <AppText
                  kind="body"
                  style={styles.categoryDropdownText}
                  numberOfLines={1}
                >
                  {selectedLanguage
                    ? (languageOptions.find((o) => o.id === selectedLanguage)?.label ??
                       selectedLanguage)
                    : "Tất cả ngôn ngữ"}
                </AppText>
                <Icon name="chevronDown" size={16} color={stitchTokens.stoneMuted} />
              </Pressable>
            </View>

            {/* ViaPoint Pickup Selector */}
            <View style={styles.pickupCard}>
              <View style={styles.pickupLeft}>
                <View style={styles.pickupPinCircle}>
                  <Icon name="pin" size={15} color={stitchTokens.gold} />
                </View>
                <View style={styles.pickupDetails}>
                  <AppText kind="bold" style={styles.pickupTitle}>
                    Điểm giao nhận ViaPoint TP.HCM
                  </AppText>
                  <AppText
                    kind="small"
                    style={styles.pickupSubtitle}
                    numberOfLines={1}
                  >
                    {currentPickup.detail}
                  </AppText>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đổi trạm giao nhận ViaPoint"
                onPress={handleTogglePickup}
                style={styles.changePickupBtn}
              >
                <AppText kind="small" style={styles.changePickupText}>
                  Đổi trạm
                </AppText>
              </Pressable>
            </View>

            {/* Nút Tìm kiếm để kích hoạt bộ lọc */}
            <View style={styles.filterActionSection}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tìm kiếm theo bộ lọc"
                onPress={() => {
                  Keyboard.dismiss();
                  setFilterPanelOpen(false);
                }}
                style={styles.applyFilterBtn}
              >
                <Icon name="search" size={17} color={stitchTokens.warmIvory} />
                <AppText kind="bold" style={styles.applyFilterBtnText}>
                  Tìm kiếm
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Active Filter Chips Bar (Giống hệt Web khi có bộ lọc được kích hoạt) */}
        {activeChips.length > 0 ? (
          <View style={styles.activeFiltersRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeChipsScroll}
            >
              {activeChips.map((chip) => (
                <Pressable
                  key={chip.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Bỏ lọc ${chip.label}`}
                  onPress={chip.onRemove}
                  style={styles.activeChip}
                >
                  <AppText kind="small" style={styles.activeChipText}>
                    {chip.label}
                  </AppText>
                  <Icon name="close" size={12} color={stitchTokens.wine} />
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Xóa toàn bộ bộ lọc"
                onPress={handleResetFilters}
                style={styles.clearAllChip}
              >
                <Icon name="sync" size={12} color={stitchTokens.stoneMuted} />
                <AppText kind="small" style={styles.clearAllChipText}>
                  Xóa bộ lọc
                </AppText>
              </Pressable>
            </ScrollView>
          </View>
        ) : null}

        {/* 4. 2-Column Book Grid */}
        <View style={styles.gridSection}>
          {displayItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <StatePanel
                icon="book"
                title="Không tìm thấy cuốn sách phù hợp"
                message="Hãy thử thay đổi từ khóa tìm kiếm hoặc bấm 'Đặt lại' bộ lọc."
                action={{
                  label: "Đặt lại tiêu chí",
                  onPress: handleResetFilters,
                }}
              />
            </View>
          ) : (
            <View style={styles.cardsGrid}>
              {displayItems.slice(0, visibleCount).map((item) => (
                <SearchBookCard
                  key={item.id}
                  item={item}
                  photoNode={
                    item.photos?.[0]?.id ? (
                      <PublicPhoto
                        listingId={item.id}
                        revisionId={item.revisionId}
                        mediaId={item.photos[0].id}
                        label={`Ảnh sách ${item.book.title}`}
                        active={active && !result.isError}
                        result
                      />
                    ) : undefined
                  }
                  onOpen={() => handleOpenBook(item.id)}
                  isSaved={isSaved(item.id)}
                  onToggleSave={() => void toggle(item.id)}
                />
              ))}
            </View>
          )}

          {/* 5. Pagination / Progress Cursor */}
          {displayItems.length > 0 ? (
            <View style={styles.paginationSection}>
              {/* Progress Bar */}
              <View style={styles.progressBarWrapper}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, Math.round((Math.min(visibleCount, displayItems.length) / displayItems.length) * 100))}%`,
                    },
                  ]}
                />
              </View>
              <AppText kind="small" style={styles.progressText}>
                Đang hiển thị {Math.min(visibleCount, displayItems.length)} trên{" "}
                {displayItems.length} cuốn
              </AppText>

              {visibleCount < displayItems.length ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Xem thêm sách xưa và trao đổi"
                  onPress={() => setVisibleCount((prev) => prev + 4)}
                  style={styles.loadMoreBtn}
                >
                  <Icon name="arrow" size={16} color={stitchTokens.wine} />
                  <AppText kind="bold" style={styles.loadMoreBtnText}>
                    Xem thêm sách xưa & trao đổi
                  </AppText>
                </Pressable>
              ) : (
                <View style={styles.endOfCatalog}>
                  <AppText kind="small" style={styles.endOfCatalogText}>
                    Đã hiển thị toàn bộ kết quả tìm kiếm
                  </AppText>
                </View>
              )}
            </View>
          ) : null}
        </View>
      </View>

      {/* Category Picker Modal */}
      <AppModal
        visible={categoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCategoryModalOpen(false)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <AppText kind="bold" style={styles.modalTitle}>
                Chọn danh mục sách
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={() => setCategoryModalOpen(false)}
                hitSlop={8}
              >
                <Icon name="close" size={18} color={stitchTokens.stoneMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalListScroll}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tất cả danh mục"
                onPress={() => handleSelectRootCategory("")}
                style={[
                  styles.modalItemRow,
                  !selectedCategoryId && styles.modalItemRowSelected,
                ]}
              >
                <AppText
                  kind="body"
                  style={[
                    styles.modalItemText,
                    !selectedCategoryId && styles.modalItemTextSelected,
                  ]}
                >
                  Tất cả danh mục
                </AppText>
                {!selectedCategoryId ? (
                  <Icon name="check" size={18} color={stitchTokens.wine} />
                ) : null}
              </Pressable>
              {categories.map((cat) => {
                const isSelected = rootCategory?.id === cat.id;
                return (
                  <Pressable
                    key={cat.id}
                    accessibilityRole="button"
                    accessibilityLabel={cat.label}
                    onPress={() => handleSelectRootCategory(cat.id)}
                    style={[
                      styles.modalItemRow,
                      isSelected && styles.modalItemRowSelected,
                    ]}
                  >
                    <AppText
                      kind="body"
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextSelected,
                      ]}
                    >
                      {cat.label}
                    </AppText>
                    {isSelected ? (
                      <Icon name="check" size={18} color={stitchTokens.wine} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* Subcategory Picker Modal */}
      <AppModal
        visible={subcategoryModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSubcategoryModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSubcategoryModalOpen(false)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <AppText kind="bold" style={styles.modalTitle}>
                Chọn nhóm sách
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={() => setSubcategoryModalOpen(false)}
                hitSlop={8}
              >
                <Icon name="close" size={18} color={stitchTokens.stoneMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalListScroll}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Tất cả ${rootCategory?.label ?? ""}`}
                onPress={() => handleSelectSubcategory("")}
                style={[
                  styles.modalItemRow,
                  !selectedSubcategoryId && styles.modalItemRowSelected,
                ]}
              >
                <AppText
                  kind="body"
                  style={[
                    styles.modalItemText,
                    !selectedSubcategoryId && styles.modalItemTextSelected,
                  ]}
                >
                  Tất cả {rootCategory?.label.toLowerCase()}
                </AppText>
                {!selectedSubcategoryId ? (
                  <Icon name="check" size={18} color={stitchTokens.wine} />
                ) : null}
              </Pressable>
              {rootChildren.map((sub) => {
                const isSelected = selectedSubcategoryId === sub.id;
                return (
                  <Pressable
                    key={sub.id}
                    accessibilityRole="button"
                    accessibilityLabel={sub.label}
                    onPress={() => handleSelectSubcategory(sub.id)}
                    style={[
                      styles.modalItemRow,
                      isSelected && styles.modalItemRowSelected,
                    ]}
                  >
                    <AppText
                      kind="body"
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextSelected,
                      ]}
                    >
                      {sub.label}
                    </AppText>
                    {isSelected ? (
                      <Icon name="check" size={18} color={stitchTokens.wine} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* Language Picker Modal */}
      <AppModal
        visible={languageModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLanguageModalOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setLanguageModalOpen(false)}
        >
          <Pressable
            style={styles.modalSheet}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <AppText kind="bold" style={styles.modalTitle}>
                Chọn ngôn ngữ của sách
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={() => setLanguageModalOpen(false)}
                hitSlop={8}
              >
                <Icon name="close" size={18} color={stitchTokens.stoneMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalListScroll}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Tất cả ngôn ngữ"
                onPress={() => {
                  setSelectedLanguage("");
                  setLanguageModalOpen(false);
                }}
                style={[
                  styles.modalItemRow,
                  !selectedLanguage && styles.modalItemRowSelected,
                ]}
              >
                <AppText
                  kind="body"
                  style={[
                    styles.modalItemText,
                    !selectedLanguage && styles.modalItemTextSelected,
                  ]}
                >
                  Tất cả ngôn ngữ
                </AppText>
                {!selectedLanguage ? (
                  <Icon name="check" size={18} color={stitchTokens.wine} />
                ) : null}
              </Pressable>
              {languageOptions.map((opt) => {
                const isSelected = selectedLanguage === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="button"
                    accessibilityLabel={opt.label}
                    onPress={() => {
                      setSelectedLanguage(opt.id);
                      setLanguageModalOpen(false);
                    }}
                    style={[
                      styles.modalItemRow,
                      isSelected && styles.modalItemRowSelected,
                    ]}
                  >
                    <AppText
                      kind="body"
                      style={[
                        styles.modalItemText,
                        isSelected && styles.modalItemTextSelected,
                      ]}
                    >
                      {opt.label}
                    </AppText>
                    {isSelected ? (
                      <Icon name="check" size={18} color={stitchTokens.wine} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </AppModal>

      {/* Sort Dropdown Popup Modal */}
      <AppModal
        visible={sortDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortDropdownOpen(false)}
      >
        <Pressable
          style={styles.sortModalBackdrop}
          onPress={() => setSortDropdownOpen(false)}
        >
          <View
            style={[
              styles.sortDropdownCard,
              sortTriggerLayout
                ? {
                    top: Math.max(
                      sortTriggerLayout.y + sortTriggerLayout.height + 4,
                      insets.top + 60,
                    ),
                    right: 14,
                  }
                : { top: insets.top + 140, right: 14 },
            ]}
          >
            {SORTS.map((s, idx) => {
              const isSelected = sortIndex === idx;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={s.title}
                  onPress={() => {
                    setSortIndex(idx);
                    setSortDropdownOpen(false);
                  }}
                  style={[
                    styles.sortDropdownItem,
                    isSelected && styles.sortDropdownItemSelected,
                  ]}
                >
                  <AppText
                    kind="body"
                    style={[
                      styles.sortDropdownItemText,
                      isSelected && styles.sortDropdownItemTextSelected,
                    ]}
                  >
                    {s.title}
                  </AppText>
                  {isSelected ? (
                    <Icon
                      name="check"
                      size={16}
                      color={stitchTokens.wine}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </AppModal>

      {/* Notifications Modal */}
      <HomeNotificationsModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      <Toast
        visible={Boolean(toastMessage)}
        message={toastMessage ?? ""}
        onDismiss={clearToast}
        actionTitle="Xem"
        onAction={() => router.push("/wishlist")}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
  topNavHeader: {
    backgroundColor: stitchTokens.wine,
    paddingBottom: 10,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
  },
  topNavContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIconBtn: {
    position: "relative",
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  notifDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: stitchTokens.flashRed,
  },
  profileBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: stitchTokens.wineDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: stitchTokens.goldAlpha40,
  },
  searchBody: {
    paddingBottom: 24,
    backgroundColor: stitchTokens.roseWarmSurface,
  },
  searchBarSection: {
    backgroundColor: stitchTokens.roseWarmBlur,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  searchBarBox: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    backgroundColor: stitchTokens.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
    shadowColor: stitchTokens.shadowSoft,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    height: "100%",
    fontSize: 13,
    color: stitchTokens.charcoalBrown,
    paddingHorizontal: 8,
    fontFamily: "BeRegular",
  },
  clearBtn: {
    padding: 4,
  },
  searchDivider: {
    width: 1,
    height: 18,
    backgroundColor: stitchTokens.sandBorder,
    marginHorizontal: 6,
  },
  micBtn: {
    padding: 4,
  },
  modeTabsScroll: {
    paddingTop: 10,
    paddingBottom: 4,
    gap: 6,
  },
  modeTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  modeTabSelected: {
    backgroundColor: stitchTokens.wine,
    elevation: 2,
  },
  modeTabUnselected: {
    backgroundColor: stitchTokens.canvasMuted,
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: "600",
  },
  modeTabTextSelected: {
    color: stitchTokens.gold,
  },
  modeTabTextUnselected: {
    color: stitchTokens.darkTaupe,
  },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  summaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  summaryText: {
    fontSize: 12,
    color: stitchTokens.mediumMuted,
  },
  summaryCount: {
    color: stitchTokens.wine,
    fontSize: 12,
  },
  filterToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: stitchTokens.creamMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
  },
  filterToggleBtnActive: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  filterToggleText: {
    fontSize: 11,
    fontWeight: "600",
    color: stitchTokens.charcoalBrown,
  },
  filterToggleTextActive: {
    color: stitchTokens.warmIvory,
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: stitchTokens.flashRed,
  },
  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 6,
    gap: 10,
  },
  sortBarLabel: {
    fontSize: 13,
    color: stitchTokens.mediumMuted,
    fontWeight: "500",
  },
  sortDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: stitchTokens.parchment,
    borderWidth: 1.5,
    borderColor: stitchTokens.wine,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    minWidth: 140,
  },
  sortDropdownTriggerActive: {
    backgroundColor: stitchTokens.warmIvory,
    borderColor: stitchTokens.wine,
  },
  sortDropdownTriggerText: {
    fontSize: 13,
    color: stitchTokens.charcoalBrown,
    fontWeight: "600",
  },
  sortModalBackdrop: {
    flex: 1,
    backgroundColor: "transparent",
  },
  sortDropdownCard: {
    position: "absolute",
    width: 220,
    backgroundColor: stitchTokens.warmIvory,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: stitchTokens.desertSand,
    paddingVertical: 6,
    paddingHorizontal: 4,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  sortDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  sortDropdownItemSelected: {
    backgroundColor: stitchTokens.wineAlpha05,
  },
  sortDropdownItemText: {
    fontSize: 13,
    color: stitchTokens.charcoalBrown,
    fontWeight: "500",
  },
  sortDropdownItemTextSelected: {
    color: stitchTokens.wine,
    fontWeight: "700",
  },
  webFilterPanel: {
    marginHorizontal: 12,
    backgroundColor: stitchTokens.antiqueWhite,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: stitchTokens.warmCanvas,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 6,
  },
  filterHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.paperBorder,
  },
  filterHeadTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  filterHeadText: {
    fontSize: 13,
    fontWeight: "700",
    color: stitchTokens.wine,
    letterSpacing: 0.2,
  },
  filterHeadRightGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  closeFilterBtn: {
    padding: 2,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  resetBtnText: {
    fontSize: 11,
    color: stitchTokens.wine,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  filterSection: {
    gap: 6,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitleText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.mediumMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedCountBadge: {
    fontSize: 10,
    color: stitchTokens.wine,
    backgroundColor: stitchTokens.wineAlpha08,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    fontWeight: "600",
  },
  clearGroupText: {
    fontSize: 11,
    color: stitchTokens.wine,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  conditionChoicesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  choicePill: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  choicePillSelected: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  choicePillUnselected: {
    backgroundColor: stitchTokens.white,
    borderColor: stitchTokens.borderWarm,
  },
  choicePillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  choicePillTextSelected: {
    color: stitchTokens.warmIvory,
  },
  choicePillTextUnselected: {
    color: stitchTokens.darkEarth,
  },
  priceInputsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  priceInputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    paddingHorizontal: 8,
    height: 34,
  },
  priceFieldLabel: {
    fontSize: 11,
    color: stitchTokens.neutralMuted,
    marginRight: 4,
  },
  priceInputText: {
    flex: 1,
    fontSize: 11,
    color: stitchTokens.wine,
    fontWeight: "700",
    padding: 0,
  },
  priceDash: {
    fontSize: 12,
    color: stitchTokens.neutralMuted,
    fontWeight: "600",
  },
  presetsRow: {
    flexDirection: "row",
    gap: 6,
  },
  presetBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  presetBtnSelected: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  presetBtnUnselected: {
    backgroundColor: stitchTokens.creamMuted,
    borderColor: stitchTokens.borderWarm,
  },
  presetBtnText: {
    fontSize: 10,
    fontWeight: "600",
  },
  presetBtnTextSelected: {
    color: stitchTokens.warmIvory,
  },
  presetBtnTextUnselected: {
    color: stitchTokens.coffee,
  },
  sortChoicesRow: {
    flexDirection: "row",
    gap: 6,
  },
  sortPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sortPillSelected: {
    backgroundColor: stitchTokens.wine,
    borderColor: stitchTokens.wine,
  },
  sortPillUnselected: {
    backgroundColor: stitchTokens.white,
    borderColor: stitchTokens.borderWarm,
  },
  sortPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  sortPillTextSelected: {
    color: stitchTokens.warmIvory,
  },
  sortPillTextUnselected: {
    color: stitchTokens.darkEarth,
  },
  activeFiltersRow: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 2,
  },
  activeChipsScroll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: stitchTokens.wineAlpha08,
    borderWidth: 1,
    borderColor: stitchTokens.wineAlpha20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
  },
  activeChipText: {
    fontSize: 11,
    color: stitchTokens.wine,
    fontWeight: "600",
  },
  clearAllChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: stitchTokens.creamMuted,
  },
  clearAllChipText: {
    fontSize: 11,
    color: stitchTokens.brownMuted,
    fontWeight: "500",
  },
  pickupCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.cardSurface,
    padding: 8,
    borderRadius: 8,
  },
  pickupLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  pickupPinCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: stitchTokens.wine,
    alignItems: "center",
    justifyContent: "center",
  },
  pickupDetails: {
    flex: 1,
  },
  pickupTitle: {
    fontSize: 11,
    color: stitchTokens.charcoalBrown,
  },
  pickupSubtitle: {
    fontSize: 10,
    color: stitchTokens.mediumMuted,
  },
  changePickupBtn: {
    backgroundColor: stitchTokens.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  changePickupText: {
    fontSize: 10,
    fontWeight: "600",
    color: stitchTokens.wine,
  },
  gridSection: {
    marginTop: 12,
    paddingHorizontal: 12,
  },
  cardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  emptyContainer: {
    backgroundColor: stitchTokens.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: stitchTokens.warmBorder,
  },
  paginationSection: {
    alignItems: "center",
    marginTop: 14,
    gap: 8,
  },
  progressBarWrapper: {
    width: 140,
    height: 4,
    backgroundColor: stitchTokens.borderMuted,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: stitchTokens.wine,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    color: stitchTokens.stoneMuted,
  },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    backgroundColor: stitchTokens.linenBg,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  loadMoreBtnText: {
    fontSize: 12,
    color: stitchTokens.wine,
  },
  endOfCatalog: {
    paddingVertical: 8,
  },
  endOfCatalogText: {
    fontSize: 11,
    color: stitchTokens.slateWarm,
    fontStyle: "italic",
  },
  categoryDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: stitchTokens.white,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    marginTop: 2,
  },
  categoryDropdownText: {
    fontSize: 12,
    color: stitchTokens.charcoalBrown,
    fontWeight: "500",
    flex: 1,
  },
  subcategoryField: {
    gap: 4,
    marginTop: 6,
  },
  facetContextNote: {
    fontSize: 11,
    color: stitchTokens.stoneMuted,
    fontStyle: "italic",
    lineHeight: 16,
    marginVertical: 4,
    paddingHorizontal: 2,
  },
  facetSection: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.parchmentBorder,
    marginTop: 4,
  },
  facetTitleText: {
    fontSize: 10,
    fontWeight: "700",
    color: stitchTokens.mediumMuted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  facetChoicesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  seriesSection: {
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: stitchTokens.parchmentBorder,
    marginTop: 4,
  },
  seriesInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: stitchTokens.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: stitchTokens.borderWarm,
    paddingHorizontal: 10,
    height: 36,
  },
  seriesInputText: {
    flex: 1,
    fontSize: 11,
    color: stitchTokens.charcoalBrown,
    padding: 0,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: stitchTokens.blackAlpha45,
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: stitchTokens.ivoryWhite,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "75%",
    paddingBottom: 28,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.parchmentBorder,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  modalListScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  modalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.biscuit,
  },
  modalItemRowSelected: {
    backgroundColor: stitchTokens.wineAlpha05,
  },
  modalItemText: {
    fontSize: 13,
    color: stitchTokens.charcoalBrown,
  },
  modalItemTextSelected: {
    fontWeight: "700",
    color: stitchTokens.wine,
  },
  filterActionSection: {
    paddingTop: 4,
  },
  applyFilterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: stitchTokens.wine,
    paddingVertical: 11,
    borderRadius: 8,
    shadowColor: stitchTokens.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  applyFilterBtnText: {
    fontSize: 13,
    color: stitchTokens.warmIvory,
    fontWeight: "700",
  },
  exchangeSection: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: stitchTokens.linenBg,
    gap: 8,
  },
  exchangeToggleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  exchangeToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  exchangeToggleText: {
    fontSize: 13,
    color: stitchTokens.wine,
    fontWeight: "700",
  },
  exchangeBody: {
    gap: 8,
    marginTop: 4,
  },
  exchangeHintText: {
    fontSize: 11,
    color: stitchTokens.stoneMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
});
