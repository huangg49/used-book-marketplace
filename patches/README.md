# Bản vá dependency được giữ trong repo

`react-native-screens@4.26.2.patch` backport bốn file C++ của
[PR4413 upstream](https://github.com/software-mansion/react-native-screens/pull/4413),
head `204d36b45f2a718c6f86e00cfc70765cbde06565`, merge
`b3badd012f83679b12f4e29f2e28eceaa4830efd`. Code upstream theo MIT của
react-native-screens. Chỉ map đường dẫn `cpp/legacy/RNSScreenRemovalListener.*`
thành `cpp/RNSScreenRemovalListener.*` của4.26.2; không viết lại thuật toán.

Sửa race đăng ký mounting delegate lúc cold launch và ownership callback khi
teardown; giữ version Expo SDK57 khuyến nghị. `pnpm install --frozen-lockfile`
áp patch theo hash trong lockfile/workspace. Phải rebuild/cài APK, không chỉ
reload Metro. Nguồn/finding/checks/giới hạn trong
[báo cáo native](../docs/ui/NATIVE_JOURNEYS_2026_10_28.md).

`.gitattributes` chỉ miễn `blank-at-eol` cho `patches/*.patch`: dòng context rỗng
của unified diff bắt buộc có tiền tố một dấu cách. Không trim patch để xóa tiền
tố hoặc thay hash; kiểm whitespace của source khác giữ nguyên.

Khi đổi version screens, đối chiếu fix đã có upstream, bỏ patch có chủ đích và
kiểm lại native startup/navigation. Không tự bỏ patch chỉ vì install mismatch;
không coi20coldstarts x86_64 là chứng minh hết race, ARM/iOS hoặc release PASS.
