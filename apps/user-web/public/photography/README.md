# Login photograph

`bookshop-barcelona.jpg`: photograph by Davit Margaryan, Barcelona, Spain.
Source: [Cozy bookstore interior with bookshelves and warm lighting](https://unsplash.com/photos/cozy-bookstore-interior-with-bookshelves-and-warm-lighting-mWWD9Up47OM).
The source page identifies it as free under the [Unsplash License](https://unsplash.com/license),
checked10/10/2026. Downloaded image3000×2818 JPEG,607304bytes; pixels are not
regenerated. The Auth scene applies4px CSS blur,1.035 scale, a #460909c9 wine tint,
cover fitting and60%52% object position behind the central paper stack.
It is decorative stock photography, not a photo of a Lật lại premises or a
listing. The visible page credit was removed at the owner’s request11/10/2026;
photographer/source attribution is retained above. Runtime image is local;
no remote stock host request is needed to render the login photograph.

## Bản ảnh theo viewport — 03/11/2026

Auth ưu tiên WebP 960×902 hoặc 1920×1804 từ JPEG local 3000×2818 hiện có.
JPEG 607.891 byte vẫn phục vụ cấu hình cần độ phân giải cao và dùng lại
khi bản WebP tải lỗi. Các bản mới kế thừa nguồn/ghi công bên trên.
Giữ toàn ảnh và để CSS gốc xác định khung cắt, blur, scale và lớp phủ.

Tạo bằng Sharp 0.35.4, libvips 8.18.6 và libwebp 1.6.0:

```js
await sharp(input)
  .resize({ width, withoutEnlargement: true })
  .withIccProfile('srgb', { attach: false })
  .webp({ quality: 88, smartSubsample: true, effort: 6 })
  .toFile(output);
```

- `bookshop-barcelona-960.webp`: 95.910 B, SHA256
  `9d5188db49b6aee56729e2c0ad8b876730c8532e7edd8c94e7c365dc155b1053`.
- `bookshop-barcelona-1920.webp`: 225.244 B, SHA256
  `e01185d5c1a7bd2bba03a7c31fa0494914c279fc2ab7ea110d95ac15c7d391f2`.
