# Cờ Tướng 3D

Cờ tướng trên bàn cờ 3D. Quân cờ khắc chữ Hán, và khi ra trận mỗi quân hoá thành một chiến binh thời Tam Quốc:
Đỏ là quân Thục (đỏ – vàng), Đen là quân Ngụy (xanh đen – bạc). Mọi mô hình, bàn cờ và âm thanh đều được tạo bằng code (Three.js, Web Audio).

- **Đánh với máy:** chọn cầm quân Đỏ hoặc Đen, ba mức Dễ / Thường / Khó. Máy tính nước trong Web Worker nên hình không bị giật. Có Đi lại và Gợi ý.
- **Chơi online:** tạo phòng, gửi link `…/?room=ABCD` cho bạn bè. Máy chủ kiểm tra từng nước đi, lưu ván cờ (đóng tab rồi mở lại vẫn vào đúng ván), người thứ ba vào được để xem. Hết ván bấm Đấu lại thì hai bên đổi màu quân.
- **Chiến binh:** khi đi quân, chiến binh trồi lên từ quân cờ và hành quân. Khi ăn quân, camera lia cận cảnh pha giao chiến; Pháo là máy bắn đá, bắn đá qua ngòi. Nút ⚔ ở góc trên bật chế độ đội quân: mọi quân luôn hiện chiến binh, chữ Hán in trên cờ hiệu.

| Quân | Chữ (Đỏ / Đen) | Chiến binh |
|---|---|---|
| Tướng | 帥 / 將 | Tướng quân giáp vàng, mũ cắm hai lông trĩ, áo choàng |
| Sĩ | 仕 / 士 | Quân sư áo dài, mũ nho sĩ, quạt lông |
| Tượng | 相 / 象 | Voi chiến có bành |
| Mã | 傌 / 馬 | Kỵ binh cầm kích |
| Xe | 俥 / 車 | Chiến xa có lọng |
| Pháo | 炮 / 砲 | Máy bắn đá |
| Tốt | 兵 / 卒 | Lính cầm giáo và khiên |

## Chạy trên máy

```bash
npm install
npm start          # wrangler dev, mở http://localhost:8787
npm test           # kiểm tra luật cờ (perft) và máy chơi
```

`npm start` chạy cả chế độ online trên máy (không cần đăng nhập Cloudflare). Mở bằng một web server tĩnh bất kỳ thì vẫn đánh với máy được, chỉ thiếu chế độ online.

## Đưa lên Internet (Cloudflare, miễn phí)

```bash
npx wrangler login   # một lần
npm run deploy       # in ra địa chỉ dạng https://co-tuong-3d.<tên-tài-khoản>.workers.dev
```

## Luật

Đủ luật cờ tướng: Tướng và Sĩ không ra khỏi cung, hai Tướng không được đối mặt trên một cột trống, Mã bị cản chân, Tượng bị cản mắt và không qua sông,
Pháo ăn quân phải có đúng một ngòi, Tốt qua sông mới được đi ngang. Hết nước đi là thua (kể cả khi không bị chiếu).
Hoà khi một thế cờ lặp lại ba lần, hoặc 60 nước liền không bên nào ăn quân. Luật cấm chiếu dai / đuổi dai chưa được áp dụng.

Biên bản ghi theo cách đọc của Việt Nam, ví dụ `Pháo 2 bình 5`, `Mã 8 tiến 7`, `Xe trước tiến 1`.

## Cấu trúc

| File | Nội dung |
|---|---|
| `src/xiangqi.js` | Luật, ký hiệu nước đi, máy chơi (alpha-beta, bảng chuyển vị, nước sát thủ). Dùng chung cho trang web, Web Worker và Cloudflare Worker |
| `src/ai-worker.js` | Chạy máy chơi trong Web Worker |
| `src/models.js` | Bàn cờ, quân cờ, chiến binh, đèn lồng (dựng bằng code) |
| `src/scene.js` | Cảnh 3D: camera, chọn quân, hiệu ứng, hoạt cảnh giao chiến |
| `src/audio.js` | Âm thanh và nhạc nền ngũ cung, tổng hợp bằng Web Audio |
| `src/game.js` | Ván cờ, menu, chế độ online, biên bản |
| `worker/index.js` | Cloudflare Worker + Durable Object cho phòng online |
| `test/rules.test.js` | Kiểm tra luật bằng perft và vài thế cờ đặc biệt |
