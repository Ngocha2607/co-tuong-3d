# Cờ Tướng 3D

Cờ tướng trên bàn cờ 3D. Quân cờ khắc chữ Hán, và khi ra trận mỗi quân hoá thành một chiến binh thời Tam Quốc:
Đỏ là quân Thục (đỏ – vàng), Đen là quân Ngụy (xanh đen – bạc). Mọi mô hình, bàn cờ và âm thanh đều được tạo bằng code (Three.js, Web Audio).

- **Đánh với máy:** chọn cầm quân Đỏ hoặc Đen, ba mức Dễ / Thường / Khó. Máy tính nước trong Web Worker nên hình không bị giật. Có Đi lại và Gợi ý.
- **Chơi online:** tạo phòng, gửi link `…/?room=ABCD` cho bạn bè. Máy chủ kiểm tra từng nước đi, lưu ván cờ (đóng tab rồi mở lại vẫn vào đúng ván), người thứ ba vào được để xem. Hết ván bấm Đấu lại thì hai bên đổi màu quân. Người tạo phòng chọn thời gian: không giới hạn, 10 phút + 5 giây hoặc 5 phút + 3 giây.
- **Đăng nhập Google và xếp hạng:** đăng nhập để có tên hiển thị (đổi được) và điểm Elo, bắt đầu từ 1200. **Tìm trận xếp hạng** ghép bạn với người có điểm gần nhất (lúc đầu chênh tối đa 100 điểm, nới thêm 20 điểm cho mỗi giây chờ), màu quân bốc ngẫu nhiên, mỗi bên 10 phút + 5 giây. Chơi đủ 10 ván xếp hạng thì có tên trên **Bảng xếp hạng** (top 100). Hồ sơ mỗi người có số ván thắng/hòa/thua và 20 ván gần nhất. Không đăng nhập vẫn đánh với máy và chơi phòng bạn bè bình thường.
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
npm test           # kiểm tra luật cờ (perft), máy chơi, Elo, đồng hồ và đăng nhập
```

`npm start` chạy cả chế độ online trên máy (không cần đăng nhập Cloudflare). Mở bằng một web server tĩnh bất kỳ thì vẫn đánh với máy được, chỉ thiếu chế độ online.

Muốn thử đăng nhập và xếp hạng trên máy:

```bash
npm run db:local     # tạo bảng trong D1 cục bộ (một lần, và mỗi khi có migration mới)
```

rồi tạo file `.dev.vars` (đã có trong `.gitignore`):

```
SESSION_SECRET="một-chuỗi-ngẫu-nhiên-dài"
GOOGLE_CLIENT_ID="xxxx.apps.googleusercontent.com"
```

Thiếu một trong hai biến này thì trang tự ẩn phần tài khoản và xếp hạng, mọi thứ khác vẫn chạy.

## Đưa lên Internet (Cloudflare, miễn phí)

```bash
npx wrangler login   # một lần
npm run deploy       # in ra địa chỉ dạng https://co-tuong-3d.<tên-tài-khoản>.workers.dev
```

Lần deploy đầu tiên wrangler tự tạo cơ sở dữ liệu D1 `co-tuong-3d`. Để bật đăng nhập và xếp hạng, làm thêm một lần:

1. **Tạo OAuth client của Google:** vào [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials), chọn *Create credentials → OAuth client ID → Web application*. Ở *Authorized JavaScript origins* thêm địa chỉ trang (ví dụ `https://co-tuong-3d.<tên-tài-khoản>.workers.dev`) và `http://localhost:8787`. Màn hình xin quyền (*OAuth consent screen*) chỉ cần các quyền mặc định `openid`, `profile`. Khi đưa ứng dụng ra công khai, Google yêu cầu có link chính sách bảo mật.
2. Dán Client ID vào `GOOGLE_CLIENT_ID` trong `wrangler.toml`. Client ID không phải bí mật.
3. Tạo khóa ký phiên: `npx wrangler secret put SESSION_SECRET` rồi nhập một chuỗi ngẫu nhiên dài, ví dụ lấy từ `openssl rand -base64 32`. Đổi khóa này thì mọi người bị đăng xuất.
4. Tạo bảng: `npm run db:remote`, rồi `npm run deploy` lại.

Máy chủ chỉ lưu mã tài khoản Google (`sub`) và tên hiển thị. Không lưu email hay ảnh đại diện.

## Luật

Đủ luật cờ tướng: Tướng và Sĩ không ra khỏi cung, hai Tướng không được đối mặt trên một cột trống, Mã bị cản chân, Tượng bị cản mắt và không qua sông,
Pháo ăn quân phải có đúng một ngòi, Tốt qua sông mới được đi ngang. Hết nước đi là thua (kể cả khi không bị chiếu).
Hoà khi một thế cờ lặp lại ba lần, hoặc 60 nước liền không bên nào ăn quân. Luật cấm chiếu dai / đuổi dai chưa được áp dụng.

Biên bản ghi theo cách đọc của Việt Nam, ví dụ `Pháo 2 bình 5`, `Mã 8 tiến 7`, `Xe trước tiến 1`.

**Đồng hồ:** đồng hồ bắt đầu chạy sau khi mỗi bên đã đi nước đầu. Hết giờ là thua, trừ khi bên kia chỉ còn Sĩ và Tượng (không thể chiếu bí), khi đó hòa. Máy chủ giữ đồng hồ, nên nước đi đến sau lúc hết giờ không được tính.
Trong ván có tính giờ, hoạt cảnh không lia camera cận cảnh, và khi bạn còn dưới 60 giây thì quân đi ngay, không có hoạt cảnh.

**Ván xếp hạng:**
- Bên đến lượt không đi nước đầu trong 30 giây thì ván bị hủy, không tính điểm.
- Bên đến lượt mất kết nối quá 60 giây thì bị xử thua.
- Ván xếp hạng không có Đấu lại. Hết ván thì bấm Tìm trận mới.
- Điểm Elo: hệ số K là 40 trong 20 ván đầu, sau đó 20, từ 2100 điểm trở lên là 10.

## Cấu trúc

| File | Nội dung |
|---|---|
| `src/xiangqi.js` | Luật, ký hiệu nước đi, máy chơi (alpha-beta, bảng chuyển vị, nước sát thủ). Dùng chung cho trang web, Web Worker và Cloudflare Worker |
| `src/ai-worker.js` | Chạy máy chơi trong Web Worker |
| `src/models.js` | Bàn cờ, quân cờ, chiến binh, đèn lồng (dựng bằng code) |
| `src/scene.js` | Cảnh 3D: camera, chọn quân, hiệu ứng, hoạt cảnh giao chiến |
| `src/audio.js` | Âm thanh và nhạc nền ngũ cung, tổng hợp bằng Web Audio |
| `src/game.js` | Ván cờ, menu, chế độ online, đồng hồ, tìm trận xếp hạng, biên bản |
| `src/account.js` | Nút đăng nhập Google, tên và điểm của người chơi, bảng xếp hạng, hồ sơ |
| `worker/index.js` | Cloudflare Worker: định tuyến tới file tĩnh, API và các Durable Object |
| `worker/room.js` | Durable Object cho từng phòng: trọng tài, đồng hồ, ghi kết quả ván xếp hạng vào D1 |
| `worker/lobby.js` | Durable Object hàng chờ xếp hạng: ghép cặp theo điểm |
| `worker/api.js` | Đăng nhập, người chơi hiện tại, đổi tên, bảng xếp hạng, hồ sơ |
| `worker/auth.js` | Kiểm tra ID token của Google bằng WebCrypto, cookie phiên ký HMAC |
| `worker/clock.js`, `worker/elo.js` | Luật thời gian và cách tính điểm, không phụ thuộc Cloudflare nên test được bằng Node |
| `migrations/` | Cấu trúc bảng D1 (`users`, `games`) |
| `test/rules.test.js` | Kiểm tra luật bằng perft và vài thế cờ đặc biệt |
| `test/server.test.mjs` | Kiểm tra Elo, đồng hồ, xác thực token Google và cookie phiên |
