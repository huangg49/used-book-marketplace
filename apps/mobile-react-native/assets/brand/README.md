# Biểu tượng ứng dụng

Sinh từ SVG gốc ở `packages/brand/logos/` bằng `pnpm brand:app-icons` tại root.
Không vẽ lại hoặc thay hình học logo. Màu giấy lấy từ token nhận diện v1.1.
PNG được lưu trong Git để Expo prebuild không cần chạy Sharp trên máy client.

- `icon.png`: 1024 px, nền giấy đặc, dùng cho icon chung và iOS.
- `adaptive-foreground.png`: nền trong suốt, biểu tượng trong vùng an toàn của
  Android adaptive icon. Background do Expo dùng màu giấy.
- `adaptive-monochrome.png`: hình học một màu cho themed icon Android.
- `splash.png`: biểu tượng gốc trong suốt, đặt trên nền giấy.
- `favicon.png`: biểu tượng trên nền giấy, dùng cho web.

Không chứa ảnh sách/người dùng hoặc ảnh tạo sinh. Cần kiểm tra launcher/splash
trên thiết bị; build APK chỉ xác nhận pipeline tạo tài nguyên. iOS chưa kiểm tra.
