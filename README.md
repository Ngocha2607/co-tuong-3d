# Cờ Tướng 3D

Cờ tướng trên bàn cờ 3D. Quân cờ khắc chữ Hán, và khi ra trận mỗi quân hoá thành một chiến binh thời Tam Quốc:
Đỏ là quân Thục (đỏ – vàng), Đen là quân Ngụy (xanh đen – bạc). Mọi mô hình, bàn cờ và âm thanh đều được tạo bằng code (Three.js, Web Audio).

- **Chiến dịch "Chinh chiến Tam Quốc":** 8 chương, mỗi chương 3 trận, đánh trên bối cảnh của trận đó:
  - 5 chương theo dòng lịch sử: **Đào viên kết nghĩa** (184), **Hổ Lao quan** (190), **Trường Bản** (208), **Xích Bích** (208), **Ngũ Trượng Nguyên** (234).
  - **Ngoại truyện**, mở sau chương 5: **Định Quân Sơn** (219), **Nam chinh** (225), **Không thành kế** (228). Các trận khó hơn hẳn: cờ thế 3 nước có nước mở đầu không chiếu (hoặc phải thí quân), thủ thành dài hơn khi thiếu cả Xe, và máy ở mức "rất mạnh" (nghĩ 4,5 giây mỗi nước).
  - Bốn kiểu trận:
    - **Cờ thế**: chiếu bí trong N nước. Máy phòng thủ hết sức.
    - **Thủ thành**: cầm cự N nước trước thế tấn công áp đảo.
    - **Chấp quân**: đánh trọn ván khi một bên thiếu quân.
    - **Quyết chiến**: đánh trọn ván, quân hai bên ngang nhau.
  - Mỗi trận tối đa 3 sao: một sao cho chiến thắng, một sao nếu không dùng Đi lại hay Gợi ý, một sao cho mục tiêu riêng của trận (chiếu bí đúng N nước, thắng trong số nước quy định, hay giữ lại đủ quân). Tổng cộng 72 sao.
  - Thắng trận trước mới mở trận sau.
  - **Phần thưởng:**
    - Mỗi chương xong cho một danh hiệu, hiện trên bảng xếp hạng và hồ sơ.
    - Chương 1 mở bối cảnh **Đào viên**; chương 4 mở chủ tướng **Chu Du**; chương 5 mở **Tư Mã Ý**.
    - Ngoại truyện: Định Quân Sơn mở chủ tướng **Hạ Hầu Uyên** và bối cảnh **Định Quân Sơn**; Nam chinh mở **Mạnh Hoạch** và bối cảnh **Nam Man**; Không thành kế mở **Khương Duy** và bối cảnh **Tây Thành**.
    - 15 sao mở **Hoàng Trung**, 30 sao mở **Mã Siêu**, 45 sao được danh hiệu "Thiên hạ vô song", 60 sao mở **Chúc Dung**, đủ 72 sao được danh hiệu "Nhất thống thiên hạ".
    - Chủ tướng và bối cảnh đã có từ trước vẫn miễn phí.
  - Tiến độ của khách lưu trong trình duyệt. Đăng nhập thì đồng bộ lên server, đổi máy không mất, và những trận đã thắng lúc chưa đăng nhập được gửi lên. Server đi lại từng ván để xác minh trước khi ghi sao.
  - Khi đăng nhập, chủ tướng và bối cảnh đang chọn cũng lưu theo tài khoản: sang máy khác đăng nhập là có lại. Lần đăng nhập đầu tiên, lựa chọn trên máy đang dùng được gửi lên làm mặc định.
- **Đánh với máy:** chọn cầm quân Đỏ hoặc Đen, ba mức Dễ / Thường / Khó. Máy tính nước trong Web Worker nên hình không bị giật. Có Đi lại và Gợi ý.
- **Tam Quốc tranh hùng (cờ tướng ba người):** Thục (đỏ), Ngô (xanh lục), Ngụy (xanh đen) chung một bàn lục giác ghép từ ba nửa bàn cờ, ba con sông 長江, 淮水, 漢水 ngăn giữa. Mỗi nước chọn Người hoặc Máy: đánh với hai máy, hai ba người chung một máy (bàn cờ tự xoay về phía nước đến lượt), hay ngồi xem ba máy đấu. Ba mức Dễ / Thường / Khó, có Đi lại và Gợi ý.
  - **Online:** tạo phòng 3 người rồi gửi link `…/?tq=ABCD` cho hai người bạn (hoặc nhập mã phòng). Người vào trước cầm Thục, rồi Ngô, rồi Ngụy; đủ ba người mới bắt đầu. Máy chủ kiểm tra từng nước, mỗi nước một đồng hồ (không giờ, 10 phút + 5 giây hoặc 5 phút + 3 giây). Xin hàng hay hết giờ thì nước đó rút quân khỏi bàn, hai nước kia đánh tiếp; người đã mất nước ở lại xem được. Đấu lại thì cả ba xoay một ghế, ai cũng có lượt đi trước.
  - **Xếp hạng Tam Quốc:** đăng nhập rồi bấm *Tìm trận xếp hạng · 3 người*: ghép ba người có điểm Tam Quốc gần nhau, ghế bốc ngẫu nhiên, 10 phút + 5 giây. Điểm Tam Quốc tách riêng khỏi điểm cờ tướng, bắt đầu từ 1200. Mỗi cặp người chơi tính như một ván Elo (ai về trên thì thắng, cùng hạng thì hòa) với K giảm một nửa: ba người ngang điểm thì nhất +20, nhì ±0, ba −20. Bỏ ván quá 60 giây khi đến lượt thì rút quân; một nước chưa đi nước đầu sau 30 giây thì ván bị hủy, không tính điểm. Bảng xếp hạng có thêm tab Tam Quốc, hồ sơ có thành tích và 20 ván Tam Quốc gần nhất.
  - Ba nước đi lần lượt Thục, Ngô, Ngụy (ngược chiều kim đồng hồ). Quân đi như cờ tướng.
  - Nửa trái của mỗi nước giáp nửa phải của nước bên trái: qua sông, cột c gặp cột 8 − c như trên bàn thường. Đường giữa của ba nước gặp nhau ở tam giác trung tâm, đi lên đường giữa thì rẽ được sang cả hai nước.
  - Tốt sang đất nước khác thì tiến về phía cung nước đó hoặc đi ngang. Tượng, Sĩ, Tướng không rời đất nhà.
  - Không được để Tướng mình bị bất kỳ nước nào chiếu, kể cả lộ mặt Tướng. Tướng không bị ăn: đến lượt mà không còn nước đi (bị chiếu bí hay hết nước) thì mất nước, Tướng rời bàn và tàn quân về tay người vừa đi nước cuối (theo ghi chép cổ về 三國棋), quân đổi sang màu nước đó nhưng vẫn đi theo đất nhà cũ.
  - Nước cuối cùng còn Tướng nhất thống thiên hạ. 50 vòng không ăn quân hoặc lặp thế ba lần thì hòa.
  - Máy tính nước theo lối "paranoid": coi hai nước kia là liên minh chống mình, giữ quân mình hơn trung bình quân của họ.
- **Chơi online:** tạo phòng, gửi link `…/?room=ABCD` cho bạn bè. Máy chủ kiểm tra từng nước đi, lưu ván cờ (đóng tab rồi mở lại vẫn vào đúng ván), người thứ ba vào được để xem. Hết ván bấm Đấu lại thì hai bên đổi màu quân. Người tạo phòng chọn thời gian: không giới hạn, 10 phút + 5 giây hoặc 5 phút + 3 giây.
- **Sảnh chờ (phòng bạn bè, cả 2 người và 3 người):** tạo phòng hay mở link mời thì vào sảnh trước. Bàn cờ được cất đi, chủ tướng của từng người đứng trên bệ đá giữa bối cảnh, mỗi bệ có thẻ tên và trạng thái. Ai cũng đổi được chủ tướng của mình, mọi người thấy ngay. Chủ phòng (người tạo phòng) chọn bối cảnh cho cả phòng và thời gian. Những người khác bấm *Sẵn sàng* (chủ tướng giơ binh khí); đủ người và mọi người sẵn sàng thì chủ phòng bấm *Bắt đầu trận*. Ván đấu diễn ra trên bối cảnh chủ phòng chọn. Hết ván, *Đấu lại* đưa cả phòng về sảnh (ghế xoay như trước). Ai cũng có thể bấm *Rời phòng* (trong sảnh hoặc ở màn kết thúc) để trả ghế cho người khác; rời khi ván đang đánh thì tính là xin thua/xin hàng. Chủ phòng rời đi thì người kế tiếp còn trong phòng làm chủ phòng. Chủ phòng có nút *Mời ra* trên thẻ của từng người (bấm hai lần để chắc chắn): người đó về menu, ghế trống ra, và trình duyệt cũng như tài khoản của họ không vào lại phòng ấy được. Trận xếp hạng không qua sảnh.
- **Phòng chơi (danh sách phòng):** trang 2 người và trang 3 người có mục *Phòng chơi*, ghi sẵn có bao nhiêu phòng đang mở và bao nhiêu còn chỗ. Bên trong là các phòng bạn bè công khai, tự cập nhật vài giây một lần: mã phòng, chủ phòng, bối cảnh, thời gian, số người đang trong phòng trên số ghế (ví dụ 2/3) và trạng thái *Chờ kiện tướng* (đang ở sảnh) hay *Đang chiến đấu*. Lọc *Còn chỗ / Đang chiến đấu / Tất cả* (kèm số phòng), tìm theo mã hoặc tên chủ phòng, mỗi lần 20 phòng với *Xem thêm*. Phòng còn chỗ xếp trước, phòng gần đủ người đứng đầu. *Vào nhanh* đưa bạn vào phòng còn chỗ gần đủ người nhất; *Tạo phòng mới* mở phần chọn thời gian. Chủ phòng chọn *Công khai* (mặc định) hoặc *Riêng tư* (chỉ ai có link hay mã mới vào được) ngay trong sảnh.
- **Đăng nhập Google và xếp hạng (cờ tướng):** đăng nhập để có tên hiển thị (đổi được) và điểm Elo, bắt đầu từ 1200. **Tìm trận xếp hạng** ghép bạn với người có điểm gần nhất (lúc đầu chênh tối đa 100 điểm, nới thêm 20 điểm cho mỗi giây chờ), màu quân bốc ngẫu nhiên, mỗi bên 10 phút + 5 giây. Chơi đủ 10 ván xếp hạng thì có tên trên **Bảng xếp hạng** (top 100). Hồ sơ mỗi người có số ván thắng/hòa/thua và 20 ván gần nhất. Không đăng nhập vẫn đánh với máy và chơi phòng bạn bè bình thường.
- **Chủ tướng:** chọn một trong 8 danh tướng (Quan Vũ, Trương Phi, Triệu Vân, Gia Cát Lượng, Lưu Bị, Tào Tháo, Tôn Quyền, Lữ Bố), hoặc 8 tướng mở trong Chiến dịch (Hoàng Trung, Mã Siêu, Chu Du, Tư Mã Ý, Hạ Hầu Uyên, Mạnh Hoạch, Khương Duy, Chúc Dung). Quân Tướng của bạn hóa thành người đó: dáng hình, mũ, râu và binh khí riêng, cờ hiệu mang chữ họ (關, 曹…). Khi bạn chiếu tướng, bóng chủ tướng đổ dài trên bàn cờ, và đậm hơn khi bạn thắng. Quân lính vẫn theo màu phe. Đánh với máy thì máy bốc ngẫu nhiên một chủ tướng khác; chơi online thì đối thủ thấy chủ tướng của bạn, và lựa chọn được giữ nguyên đến hết ván.
- **Bối cảnh:** chọn nơi đặt bàn cờ trong menu, đổi được cả khi đang chơi:
  - **Quân trướng** (mặc định): căn phòng đèn lồng.
  - **Hổ Lao quan**: cửa ải đá giữa hai vách núi, lầu cổng có biển 虎牢關, cờ 呂 trên mặt thành. Trước cổng, Lưu Bị, Quan Vũ và Trương Phi đại chiến Lữ Bố. Trời rạng sáng, sương trôi. Âm thanh nền là gió, tiếng cờ bay và trống trận vọng lại.
  - **Trường Bản**: chạng vạng bụi mờ bên bờ sông, Trương Phi một mình đứng chặn trên cầu. Bên kia sông, kỵ binh Tào Tháo phi ngang cuốn bụi. Âm thanh nền là gió và tiếng vó ngựa.
  - **Xích Bích**: bàn cờ trên boong thuyền giữa sông đêm, chiến thuyền Tào Tháo bốc cháy, vách đá khắc chữ 赤壁, tàn lửa bay. Âm thanh nền là sóng nước và tiếng lửa.
  - **Ngũ Trượng Nguyên**: đêm thu trong doanh trại Thục, lều trại, lò lửa, trời sao, thỉnh thoảng có sao băng rơi. Âm thanh nền là gió và dế.
  - **Định Quân Sơn** (mở trong Ngoại truyện): bàn cờ trên đỉnh núi lúc bình minh, biển mây bên dưới, lá cờ đỏ 法 của Pháp Chính. Hoàng Trung đứng trên mỏm đá chờ lệnh; bên kia vực, doanh trại Hạ Hầu Uyên trên núi Định Quân. Đại bàng lượn vòng. Âm thanh nền là gió núi, tiếng đại bàng và trống trận vọng qua vực.
  - **Nam Man**: sàn tre trong rừng rậm bên sông Lô, khí độc xanh tím trôi trên mặt nước, cột vật tổ, cọ và tre. Bên kia sông, Mạnh Hoạch và đàn voi chiến. Âm thanh nền là ve, ếch và chim rừng.
  - **Tây Thành**: bàn cờ trên lầu thành lúc chiều tà, cổng thành mở toang, hai lính già quét đường. Khổng Minh ngồi gảy đàn bên cạnh, dưới chân thành là quân Tư Mã Ý dàn trận với cờ 魏, 懿. Âm thanh nền là gió và tiếng đàn.

  Khi chơi, camera nhìn xuống bàn cờ nên cảnh chỉ hiện quanh mép bàn. Ở menu, và trong vài giây sau khi đổi cảnh, camera hạ thấp để thấy toàn cảnh; kéo xoay bàn để ngắm lúc nào cũng được. Máy yếu hoặc màn hình nhỏ dùng ít hạt hơn.
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
npm test           # luật cờ (perft), luật Tam Quốc, máy chơi, Elo, đồng hồ, đăng nhập, và chứng minh mọi thế cờ của chiến dịch
npm run verify:campaign   # (chậm, vài phút) cho máy đánh các trận thủ thành, chấp quân, quyết chiến để xem độ khó
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

Khi có migration mới trong `migrations/` (ví dụ `0002_campaign.sql` cho chiến dịch và danh hiệu, `0003_sanguo.sql` cho xếp hạng Tam Quốc), chạy `npm run db:remote` **trước** khi deploy code mới. Phòng Tam Quốc là một Durable Object mới (`SgRoom`, migration `v3` trong `wrangler.toml`), wrangler tự tạo khi deploy.

Máy chủ chỉ lưu mã tài khoản Google (`sub`) và tên hiển thị. Không lưu email hay ảnh đại diện.

## Nhạc nền

Mỗi bối cảnh có một bài đàn tranh riêng trong thư mục `music/`, đặt tên theo mã bối cảnh. Mỗi file là một đoạn 2 phút cắt từ album *Hòa Tấu Đàn Tranh – Cực Độ Ma Tranh (2015)*, chỗ cuối nối êm (crossfade 4 giây) vào chỗ đầu để phát lặp, và được chỉnh cùng độ to (−18 LUFS, mp3 128 kbps):

| Bối cảnh | File | Đoạn trong file gốc |
|---|---|---|
| Quân trướng | `music/room.mp3` | 0:20 – 2:20 |
| Đào viên | `music/dao-vien.mp3` | 51:15 – 53:15 |
| Hổ Lao quan | `music/ho-lao.mp3` | 6:27 – 8:27 |
| Trường Bản | `music/truong-ban.mp3` | 47:03 – 49:03 |
| Xích Bích | `music/xich-bich.mp3` | 1:00:22 – 1:02:22 |
| Ngũ Trượng Nguyên | `music/ngu-truong.mp3` | 32:44 – 34:44 |
| Định Quân Sơn | `music/dinh-quan.mp3` | 1:09:35 – 1:11:35 |
| Nam Man | `music/nam-man.mp3` | 20:24 – 22:24 |
| Tây Thành | `music/tay-thanh.mp3` | 56:06 – 58:06 |

Nhạc phát lặp, nhỏ dần rồi lớn dần khi đổi bối cảnh, và theo nút Nhạc nền trên thanh công cụ. Muốn thay bài nào thì chép đè file cùng tên (mp3 128 kbps, 1–3 MB). Chỉ dùng nhạc bạn có quyền phát công khai (tự làm, mua license, hoặc giấy phép CC0 / miễn phí bản quyền).

## Luật

Đủ luật cờ tướng: Tướng và Sĩ không ra khỏi cung, hai Tướng không được đối mặt trên một cột trống, Mã bị cản chân, Tượng bị cản mắt và không qua sông,
Pháo ăn quân phải có đúng một ngòi, Tốt qua sông mới được đi ngang. Hết nước đi là thua (kể cả khi không bị chiếu).
Hoà khi 60 nước liền không bên nào ăn quân.

**Lặp thế cờ, chiếu dai, đuổi dai** (theo luật châu Á, có rút gọn): khi một thế cờ xuất hiện lần thứ ba, xét mọi nước đi kể từ lần đầu thế đó xuất hiện:
- Bên nào nước nào cũng chiếu thì bị xử thua (chiếu dai).
- Nếu không có ai chiếu dai: bên nào nước nào cũng đuổi cùng một quân thì bị xử thua (đuổi dai).
- Còn lại là hòa.

Một nước tính là "đuổi" khi nó vừa tạo ra một đe dọa ăn quân hợp lệ, và quân bị dọa không có quân bảo vệ, hoặc đáng giá hơn quân đuổi (Xe > Mã, Pháo > Sĩ, Tượng, Tốt). Tướng và Tốt được phép đuổi. Tốt chưa qua sông được phép bị đuổi. Hai quân cùng loại dọa ăn nhau là mời đổi quân, không tính là đuổi. Khi thế cờ lặp lại lần thứ hai, trang báo trước cho người chơi.

**Cầu hòa** (chơi online): bấm Cầu hòa sau khi hai bên đã đi nước đầu. Đối thủ chọn Đồng ý hoặc Từ chối; đi tiếp mà không trả lời cũng là từ chối. Mỗi bên phải đi thêm 2 nước mới được cầu hòa lại. Hòa thỏa thuận ở trận xếp hạng được tính điểm như một ván hòa.

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
| `src/sanguo.js` | Cờ Tam Quốc ba người: hình bàn lục giác, các đường nối qua sông, luật, mất nước và giao quân, ký hiệu nước đi, máy chơi (paranoid alpha-beta) |
| `src/ai-worker.js` | Chạy máy chơi trong Web Worker (cả cờ thường lẫn Tam Quốc) |
| `src/models.js` | Bàn cờ, quân cờ, chiến binh, các chủ tướng, đèn lồng (dựng bằng code) |
| `src/heroes.js` | Danh sách chủ tướng, dùng chung cho trang web và server |
| `src/campaign.js` | Các chương, trận và thế cờ của chiến dịch; luật chấm thắng thua, sao và mở khóa. Dùng chung cho trang web và server |
| `src/campaign-ui.js` | Bản đồ chiến dịch, bảng nhiệm vụ, phần thưởng, danh hiệu; lưu và đồng bộ tiến độ |
| `src/stage-list.js` | Danh sách bối cảnh (tên, chữ Hán, phần thưởng), dùng chung cho trang web và server |
| `src/stages.js` | Các bối cảnh quanh bàn cờ: bầu trời, mặt đất, cảnh xa, ánh sáng, sương mù, chuyển động |
| `src/scene.js` | Cảnh 3D: camera, chọn quân, hiệu ứng, hoạt cảnh giao chiến; hai kiểu bàn (thường và lục giác Tam Quốc) |
| `src/audio.js` | Âm thanh tổng hợp bằng Web Audio; phát nhạc nền `music/` |
| `src/game.js` | Ván cờ, ván Tam Quốc, menu, chế độ online, đồng hồ, tìm trận xếp hạng, biên bản |
| `src/account.js` | Nút đăng nhập Google, tên và điểm của người chơi, bảng xếp hạng, hồ sơ |
| `worker/index.js` | Cloudflare Worker: định tuyến tới file tĩnh, API và các Durable Object |
| `worker/room.js` | Durable Object cho từng phòng: trọng tài, đồng hồ, ghi kết quả ván xếp hạng vào D1 |
| `worker/sg-room.js` | Durable Object cho từng phòng Tam Quốc: ba ghế, trọng tài, ba đồng hồ, ghi kết quả xếp hạng vào D1 |
| `worker/sg-game.js` | Luật của phòng Tam Quốc (dựng lại ván, đồng hồ, hạn chót, thứ hạng), không phụ thuộc Cloudflare nên test được bằng Node |
| `worker/hall.js` | Sảnh chờ của phòng bạn bè (dùng chung cho hai loại phòng): chủ phòng, ai đã sẵn sàng, khi nào được bắt đầu, chuyển quyền chủ phòng, mời người ra, rời phòng, cách phòng hiện trong danh sách phòng đang mở |
| `worker/lobby.js` | Durable Object hàng chờ xếp hạng (ghép cặp cờ tướng, ghép bộ ba Tam Quốc theo điểm) và danh sách phòng đang mở |
| `worker/rooms.js` | Chọn phòng cho danh sách: lọc, tìm, sắp xếp, chia trang, đếm (test được bằng Node) |
| `worker/api.js` | Đăng nhập, người chơi hiện tại, đổi tên, bảng xếp hạng, hồ sơ |
| `worker/auth.js` | Kiểm tra ID token của Google bằng WebCrypto, cookie phiên ký HMAC |
| `worker/clock.js`, `worker/elo.js` | Luật thời gian và cách tính điểm (cả Elo ba người), không phụ thuộc Cloudflare nên test được bằng Node |
| `migrations/` | Cấu trúc bảng D1 (`users`, `games`, `campaign`, `sg_games`) |
| `test/rules.test.js` | Kiểm tra luật bằng perft và vài thế cờ đặc biệt |
| `test/server.test.mjs` | Kiểm tra Elo, đồng hồ, xác thực token Google và cookie phiên |
| `test/mate.js` | Bộ giải chiếu bí vét cạn, dùng để chứng minh các thế cờ (chỉ dùng khi kiểm tra) |
| `test/campaign.test.js` | Mỗi thế cờ: chiếu bí đúng N nước trước mọi cách phòng thủ, không có cách thắng ngắn hơn, nước đầu duy nhất. Kèm luật chấm và mở khóa |
| `test/campaign-sim.js` | Mô phỏng máy đánh với máy cho các trận thủ thành, chấp quân, quyết chiến |
