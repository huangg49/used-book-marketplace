import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  AppText,
  BackAction,
  Button,
  Chip,
  Screen,
  space,
} from "../../core/ui";
const guides = [
  {
    id: "buy",
    title: "Mua sách",
    action: "Tìm sách để mua",
    target: "/search" as const,
    manage: "/orders" as const,
    manageLabel: "Xem đơn trực tiếp",
    steps: [
      "Tìm bản sách, xem ảnh, tình trạng và giá.",
      "Dùng Mua ngay nếu có, hoặc trò chuyện để người bán chốt đơn. Mở chat chưa giữ sách.",
      "Kiểm tra địa chỉ và tổng tiền rồi thanh toán bằng ví. Theo dõi bước tiếp theo trong đơn.",
    ],
    note: "Sách thắng đấu giá được theo dõi tại Đấu giá của tôi.",
  },
  {
    id: "sell",
    title: "Bán sách",
    action: "Mở kệ sách để đăng",
    target: "/drafts" as const,
    manage: "/orders" as const,
    manageLabel: "Xem đơn trực tiếp",
    steps: [
      "Vào Kệ sách của tôi, chọn tạo bản nháp. Thêm ảnh thật, tình trạng và giá rồi gửi duyệt.",
      "Theo dõi kết quả duyệt trên kệ. Bản nháp và bài chưa duyệt chưa xuất hiện công khai.",
      "Khi có đơn hoặc thương lượng với người mua, theo dõi trong Đơn trực tiếp và Trò chuyện.",
    ],
    note: "Đăng bán không tự tạo phiên đấu giá. Muốn bán đấu giá, cần gửi sách tới điểm để tiếp nhận và kiểm tra.",
  },
  {
    id: "exchange",
    title: "Đổi sách",
    action: "Tìm sách để đổi",
    target: "/search" as const,
    manage: "/exchanges" as const,
    manageLabel: "Xem trao đổi của tôi",
    steps: [
      "Có bản sách lẻ phù hợp để đổi trên kệ của mình.",
      "Mở bản sách muốn nhận và gửi đề nghị đổi, chọn sách của mình và khoản bù nếu có.",
      "Theo dõi đề nghị đã gửi, nhận được tại Trao đổi của tôi; khi chấp nhận, làm bước đặt cọc và giao nhận theo trạng thái.",
    ],
    note: "Gửi đề nghị chưa hoàn tất trao đổi. Đọc điều kiện trong chi tiết; không tạo đề nghị mới để ép thành công.",
  },
  {
    id: "auction",
    title: "Đấu giá",
    action: "Xem phiên đấu giá",
    target: "/auctions" as const,
    manage: "/my-auctions" as const,
    manageLabel: "Mở đấu giá của tôi",
    steps: [
      "Xem sách, điểm giữ sách, giá và thời gian trong phiên.",
      "Đặt giá hoặc mua ngay khi phiên cho phép. Theo dõi kết quả tại Đấu giá của tôi.",
      "Nếu thắng, thanh toán đúng hạn và mở đơn thắng để theo dõi nhận sách.",
    ],
    note: "Muốn bán đấu giá, bắt đầu từ sách đủ điều kiện trên kệ hoặc gửi sách tới điểm; cần tiếp nhận và kiểm tra trước khi có phiên.",
  },
];
export function GuideScreen() {
  const { task } = useLocalSearchParams<{ task?: string }>();
  const selected = guides.find((g) => g.id === task) ?? guides[0];
  return (
    <Screen
      header={
        <BackAction title="Về trang chủ" onPress={() => router.navigate("/")} />
      }
    >
      <AppText kind="title" accessibilityRole="header">
        Bắt đầu với Lật lại
      </AppText>
      <AppText>
        Chọn điều bạn muốn làm để xem các bước và nơi theo dõi kết quả.
      </AppText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {guides.map((g) => (
          <Chip
            wine
            key={g.id}
            title={g.title}
            selected={g.id === selected.id}
            onPress={() => router.setParams({ task: g.id })}
          />
        ))}
      </View>
      <AppText kind="heading" accessibilityRole="header">
        {selected.title}
      </AppText>
      {selected.steps.map((step, index) => (
        <AppText key={step}>
          {index + 1}. {step}
        </AppText>
      ))}
      <AppText kind="small">{selected.note}</AppText>
      <Button
        wine
        title={selected.action}
        onPress={() =>
          router.push(
            selected.id === "exchange"
              ? { pathname: "/search", params: { mode: "Exchange" } }
              : selected.id === "buy"
                ? { pathname: "/search", params: { mode: "Sale" } }
                : selected.target,
          )
        }
      />
      <Button
        wine
        secondary
        title={selected.manageLabel}
        onPress={() => router.push(selected.manage)}
      />
      <AppText kind="heading" accessibilityRole="header">
        Biết mình đang ở bước nào
      </AppText>
      <AppText>
        Đọc trạng thái, thời hạn và nút được phép trong chi tiết giao dịch. Chưa
        rõ kết quả yêu cầu thì thử lại cùng yêu cầu đang chờ, không tạo đơn mới
        thay thế.
      </AppText>
      <AppText>
        Khi đã hoàn tất và đủ điều kiện, bạn có thể đánh giá từ giao dịch hoặc
        mục Đánh giá của tôi.
      </AppText>
      <Button
        wine
        secondary
        title="Về việc của tôi"
        onPress={() => router.push("/account")}
      />
    </Screen>
  );
}
