// i18n.js — the page in English. The game is written in Vietnamese, and stays so by default for Vietnamese browsers;
// in English this file translates what the page shows as it appears: a MutationObserver looks at every text node and
// the title, aria-label and placeholder of every element, and puts the English for any Vietnamese it knows.
//   - the words: EN below, Vietnamese → English. A key with {0}, {1}… is a pattern: the parts in its holes are
//     translated in turn (a piece, a kingdom, a name of a place…), and the English puts them where it says.
//   - moves: "Mã 2 tiến 3" becomes the WXF notation H2+3 ("Xe trước tiến 1" +R+1); Tam Quốc moves name their pieces.
//   - anything else made of parts joined by " · " is translated part by part.
// What it does not know stays Vietnamese (I18N.missing lists it, to add). Loaded first, before the page's scripts.
'use strict';
const I18N = (() => {
  const KEY = 'cotuong_lang';
  let lang = '';
  try { lang = localStorage.getItem(KEY) || ''; } catch (e) { }
  // not chosen yet: Vietnamese for a browser that reads Vietnamese or a device on Vietnam's clock (many there use an
  // English browser), English for everyone else; the EN / VI switch in the top bar changes it
  if (lang !== 'vi' && lang !== 'en') {
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { }
    lang = (navigator.languages || [navigator.language || '']).some(l => /^vi/i.test(l)) || /^Asia\/(Ho_Chi_Minh|Saigon)$/.test(tz) ? 'vi' : 'en';
  }

  // ---------- the words ----------
  const EN = {
    // the game, its parts and its people
    'Cờ Tướng 3D': 'Xiangqi 3D', 'Cờ tướng': 'Xiangqi', 'Tam Quốc': 'Three Kingdoms', 'Chân Long Kỳ Trận': 'True Dragon Formation',
    'Đỏ': 'Red', 'Đen': 'Black', 'Thục': 'Shu', 'Ngô': 'Wu', 'Ngụy': 'Wei',
    'Tướng': 'General', 'Sĩ': 'Advisor', 'Tượng': 'Elephant', 'Mã': 'Horse', 'Xe': 'Chariot', 'Pháo': 'Cannon', 'Tốt': 'Soldier',
    'Quan Vũ': 'Guan Yu', 'Trương Phi': 'Zhang Fei', 'Triệu Vân': 'Zhao Yun', 'Gia Cát Lượng': 'Zhuge Liang', 'Lưu Bị': 'Liu Bei',
    'Tào Tháo': 'Cao Cao', 'Tôn Quyền': 'Sun Quan', 'Lữ Bố': 'Lü Bu', 'Hoàng Trung': 'Huang Zhong', 'Mã Siêu': 'Ma Chao',
    'Chu Du': 'Zhou Yu', 'Tư Mã Ý': 'Sima Yi', 'Hạ Hầu Uyên': 'Xiahou Yuan', 'Mạnh Hoạch': 'Meng Huo', 'Khương Duy': 'Jiang Wei',
    'Chúc Dung': 'Lady Zhurong', 'Tướng quân': 'The General', 'Giặc Khăn Vàng': 'Yellow Turbans', 'Quân địch': 'The enemy',
    'Quân trướng': 'Command Tent', 'Đào viên': 'Peach Garden', 'Hổ Lao quan': 'Hulao Pass', 'Trường Bản': 'Changban',
    'Xích Bích': 'Red Cliffs', 'Ngũ Trượng Nguyên': 'Wuzhang Plains', 'Định Quân Sơn': 'Mount Dingjun', 'Nam Man': 'Nanman', 'Tây Thành': 'Xicheng',
    'Dễ': 'Easy', 'Thường': 'Normal', 'Khó': 'Hard', 'Máy': 'Computer', 'Người': 'Human', 'Bạn': 'You', 'Đối thủ': 'Opponent',
    'Xuân': 'Spring', 'Hạ': 'Summer', 'Thu': 'Autumn', 'Đông': 'Winter', 'Mùa {0} {1}': '{0} {1}',
    'Chủ nhật, {0}': 'Sunday, {0}', 'Thứ Hai, {0}': 'Monday, {0}', 'Thứ Ba, {0}': 'Tuesday, {0}', 'Thứ Tư, {0}': 'Wednesday, {0}',
    'Thứ Năm, {0}': 'Thursday, {0}', 'Thứ Sáu, {0}': 'Friday, {0}', 'Thứ Bảy, {0}': 'Saturday, {0}',

    // the top bar and the menu
    'Chơi': 'Play', 'Chinh chiến': 'Campaign', 'Xếp hạng': 'Ranked', 'Ván đã chơi': 'My games', 'Bạn bè': 'Friends',
    'Chủ tướng': 'Generals', 'Luật chơi': 'Rules', 'Cập nhật': 'Update', 'Nhạc nền': 'Music', 'Lưu': 'Save',
    'Hồ sơ của tôi': 'My profile', 'Đổi tên': 'Rename', 'Đăng xuất': 'Sign out', 'Phòng': 'Room', 'Sao chép link mời': 'Copy invite link',
    'Nhiệm vụ': 'Objective', 'Xem lại': 'Review', 'Phân tích ván': 'Analyse game', 'Biên bản': 'Moves', 'Đối thủ cầu hòa': 'Your opponent offers a draw',
    'Đồng ý': 'Accept', 'Từ chối': 'Decline', 'Đi lại': 'Undo', 'Gợi ý': 'Hint', 'Biểu cảm': 'Emotes', 'Cầu hòa': 'Offer draw',
    'Ván mới': 'New game', 'Sảnh chờ': 'Lobby', 'Bối cảnh': 'Battlefield', 'Ai được vào': 'Who may join', 'Công khai': 'Public',
    'Riêng tư': 'Private', 'Thời gian mỗi bên': 'Time per side', 'Không giờ': 'Untimed', 'Sẵn sàng': 'Ready', 'Rời phòng': 'Leave room',
    'Tiếp tục ván đang chơi': 'Back to the game', '▶ Chơi ngay': '▶ Play now', 'Với máy ·': 'Vs computer ·', 'Phòng chơi': 'Rooms',
    'Mời bạn bè': 'Invite friends', 'Đánh với máy': 'Play the computer', 'Cầm quân': 'Play as', 'Đỏ (đi trước)': 'Red (moves first)',
    'Độ khó': 'Difficulty', 'Vào trận': 'To battle', 'Phòng chơi · 2 người': 'Rooms · 2 players', 'Phòng đang mở': 'Open rooms',
    'Còn chỗ': 'Seats free', 'Đang chiến đấu': 'In battle', 'Tất cả': 'All', 'Vào phòng': 'Join', 'Đang tải…': 'Loading…',
    'Xem thêm': 'Show more', 'Vào nhanh': 'Quick join', 'Tạo phòng mới': 'New room', 'Tạo phòng 2 người': 'New 2-player room',
    'Bạn làm chủ phòng: trong sảnh chờ còn đổi được thời gian, bối cảnh, và chọn phòng công khai hay riêng tư. Gửi link mời cho bạn bè, hoặc chờ người vào từ danh sách phòng.':
      'You host the room: in the lobby you can still change the time, the battlefield, and make the room public or private. Send the invite link to friends, or wait for someone from the room list.',
    'Tạo phòng': 'Create room', 'Đấu xếp hạng · 2 người': 'Ranked · 2 players', 'Tìm trận · 10 phút': 'Find a game · 10 min',
    'Xem bảng xếp hạng': 'See the leaderboard', 'Đang diễn ra': 'Live now', 'Đánh với máy · 3 người': 'Play the computer · 3 players',
    'Ai cầm quân': 'Who leads each kingdom', 'đi trước': 'moves first',
    'Chọn Người cho nhiều nước để chơi chung một máy: bàn cờ tự xoay về phía nước đến lượt.': 'Pick Human for several kingdoms to share one device: the board turns to whoever is to move.',
    'Phòng chơi · 3 người': 'Rooms · 3 players', 'Tạo phòng 3 người': 'New 3-player room', 'Thời gian mỗi nước': 'Time per kingdom',
    'Bạn làm chủ phòng và cầm Thục; mỗi lần đấu lại, cả ba xoay một ghế. Trong sảnh chờ còn đổi được thời gian, bối cảnh, và chọn phòng công khai hay riêng tư.':
      'You host the room and lead Shu; at each rematch all three move round one seat. In the lobby you can still change the time, the battlefield, and make the room public or private.',
    'Đấu xếp hạng · 3 người': 'Ranked · 3 players', 'Chủ tướng, bối cảnh & thành tựu': 'Generals, battlefields & achievements',
    'Thành tựu': 'Achievements', 'Danh hiệu': 'Title', 'Chính sách bảo mật': 'Privacy policy', 'Điều khoản sử dụng': 'Terms of use',
    'Đánh lại': 'Retry', 'Xem lại · phân tích': 'Review · analyse', 'Bản đồ chiến dịch': 'Campaign map', 'Về menu': 'Menu',
    'Đang tìm đối thủ': 'Looking for an opponent', 'Đang vào hàng chờ…': 'Joining the queue…', 'Hủy tìm trận': 'Stop searching',
    'Chinh chiến Tam Quốc': 'The Three Kingdoms Campaign', 'Phần thưởng': 'Rewards', 'Điều khiển': 'Controls', 'Mục tiêu:': 'Objective:',
    'Quay lại': 'Back', 'Xuất trận': 'March out', 'Đỏ đi trước ·': 'Red to move ·', 'Phá trận': 'Break it', 'Phá trận nhanh nhất hôm nay': 'Fastest today',
    'ngày phá trận liên tiếp': 'days in a row',
    'Mỗi ngày một trận mới, giống nhau cho mọi người, chỉ dành cho bậc cao thủ. Máy giữ quân Đen, chống đỡ hết sức, và chỉ có đúng một nước mở đầu phá được trận.':
      'A new formation every day, the same for everyone, for strong players only. The computer holds Black and defends with all it has, and exactly one first move breaks the formation.',
    'Lưu 30 ván cờ tướng gần nhất trên máy này, kèm phần phân tích. Ván xếp hạng còn xem lại được trong Hồ sơ.':
      'The last 30 games of xiangqi on this device, with their analysis. Ranked games can also be reviewed from the profile.',
    'Tìm': 'Search', 'Thách đấu với': 'Challenge with',
    'Kết bạn cần cả hai đồng ý. Chỉ bạn bè mới thấy nhau đang online và thách đấu nhau: nhận lời là cả hai vào một phòng riêng, người thách đấu cầm quân Đỏ.':
      'Both must agree to be friends. Only friends see each other online and challenge each other: accepting takes both into a private room, the challenger playing Red.',
    'Đang bày quân…': 'Setting up the pieces…', 'Bàn cờ tướng 3D': '3D xiangqi board', 'Điều hướng': 'Navigation',
    'Tải bản mới của trò chơi': 'Load the new version of the game', 'Cài trò chơi lên máy': 'Install the game', 'Hiện chiến binh trên mọi quân': 'Show warriors on every piece',
    'Hiện chiến binh': 'Show warriors', 'Đặt lại góc nhìn': 'Reset the view', 'Bật nhạc nền': 'Music on', 'Âm lượng nhạc nền': 'Music volume',
    'Âm thanh': 'Sound', 'Tài khoản': 'Account', 'Tên hiển thị': 'Display name', 'Thu gọn bảng': 'Fold the panel', 'Mở rộng bảng': 'Unfold the panel',
    'Cơ hội thắng của Đỏ (trên) và Đen (dưới) qua từng nước: chạm để đến nước đó': 'Red’s chances (above) and Black’s (below) move by move: tap to go there',
    'Về thế đầu': 'To the start', 'Lùi một nước': 'Back one move', 'Tự chạy': 'Play', 'Tới một nước': 'Forward one move', 'Đến nước cuối': 'To the end',
    'Lật bàn cờ': 'Flip the board', 'Tùy chỉnh ván với máy': 'Set up the computer game', 'Mã phòng hoặc tên chủ phòng': 'Room code or host name',
    'Tìm phòng hoặc nhập mã phòng': 'Find a room or enter its code', 'Tìm phòng Tam Quốc hoặc nhập mã phòng': 'Find a Three Kingdoms room or enter its code',
    'Xem lại bàn cờ': 'Look at the board', 'Đóng': 'Close', 'Tìm kỳ thủ theo tên': 'Find players by name', 'Ngôn ngữ': 'Language',

    // the rules
    'Đỏ đi trước. Tướng và Sĩ không ra khỏi cung; hai Tướng không được đối mặt trên một cột trống.': 'Red moves first. Generals and advisors stay in the palace; the two generals may not face each other on an open file.',
    'Mã bị cản chân, Tượng bị cản mắt và không qua sông. Pháo ăn quân phải cách đúng một ngòi. Tốt qua sông mới được đi ngang.': 'A horse can be hobbled and an elephant blocked, and elephants never cross the river. A cannon captures by jumping exactly one piece. Soldiers move sideways only once across the river.',
    'Chiếu bí hoặc làm đối phương hết nước đi là thắng (hết nước cũng thua, dù không bị chiếu).': 'Checkmate, or leave the opponent no move, to win (having no move loses even without check).',
    '60 nước liền không ai ăn quân thì hòa.': '60 moves each without a capture is a draw.', 'Lặp thế cờ lần thứ ba': 'A position seen the third time',
    ': bên nào nước nào cũng chiếu thì thua (chiếu dai); không ai chiếu dai mà bên nào nước nào cũng đuổi cùng một quân thì thua (đuổi dai); còn lại là hòa. Lần lặp thứ hai trang sẽ nhắc trước.':
      ': a side that checked with every move loses (perpetual check); otherwise a side that chased one piece with every move loses (perpetual chase); else it is a draw. The page warns at the second time.',
    'Online': 'Online', ': cầu hòa được sau khi hai bên đã đi nước đầu. Đồng hồ chạy từ sau nước đầu của mỗi bên; hết giờ là thua, trừ khi bên kia chỉ còn Sĩ, Tượng thì hòa.':
      ': a draw may be offered once both sides have moved. Each clock starts after that side’s first move; running out of time loses, unless the other side has only advisors and elephants left, which draws.',
    ': không đi nước đầu trong 30 giây thì ván bị hủy; đến lượt mà mất kết nối quá 60 giây thì thua.': ': no first move within 30 seconds calls the game off; disconnected for over 60 seconds on your turn loses.',
    'Ba nước Thục, Ngô, Ngụy chung một bàn lục giác ghép từ ba nửa bàn cờ, đi lần lượt Thục, Ngô, Ngụy (ngược chiều kim đồng hồ). Quân đi như cờ tướng.':
      'Shu, Wu and Wei share a hexagonal board made of three half-boards and move in turn: Shu, Wu, Wei (anticlockwise). Pieces move as in xiangqi.',
    'Qua sông bên trái là đất nước bên trái, qua sông bên phải là đất nước bên phải. Đường giữa của ba nước gặp nhau ở tam giác trung tâm và thông vào cả hai nước.':
      'Across the left river is the kingdom on the left, across the right river the one on the right. The three middle files meet in the central triangle and lead into both kingdoms.',
    'Tốt sang đất nước khác thì tiến về phía cung nước đó hoặc đi ngang. Tượng, Sĩ, Tướng không rời đất nhà.': 'A soldier in another kingdom advances towards that kingdom’s palace or moves sideways. Elephants, advisors and generals stay at home.',
    'Không được để Tướng mình bị bất kỳ nước nào chiếu, kể cả lộ mặt Tướng. Tướng không bị ăn, chỉ bị dồn.': 'Your general may not be left in check by anyone, facing generals included. Generals are never taken, only cornered.',
    'Đến lượt mà không còn nước đi (bị chiếu bí hay hết nước) thì': 'A kingdom with no move on its turn (checkmated or stalemated)', 'mất nước': 'falls',
    ': Tướng rời bàn, tàn quân về tay người vừa đi nước cuối.': ': its general leaves the board, and its army goes to whoever made the last move.',
    'Nước cuối cùng còn Tướng': 'The last kingdom with a general', 'nhất thống thiên hạ': 'unites the realm',
    '. 50 vòng không ăn quân, hoặc lặp thế ba lần, thì hòa.': '. 50 rounds without a capture, or a position seen three times, is a draw.',
    ': xin hàng, hết giờ hay bỏ ván thì nước đó rút quân khỏi bàn, hai nước kia đánh tiếp.': ': a kingdom that resigns, runs out of time or walks away leaves the board, and the other two play on.',
    ': điểm Tam Quốc tính riêng. Mỗi cặp người chơi tính như một ván (ai về trên thì thắng, cùng hạng thì hòa), hệ số K giảm một nửa.':
      ': Three Kingdoms has its own rating. Each pair of players counts as a game (the better place wins, the same place draws), at half the K factor.',
    'Chạm một quân để xem nước đi, chạm điểm sáng để đi.': 'Tap a piece to see its moves, tap a glowing point to move.',
    'Kéo để xoay bàn; cuộn chuột hoặc chụm hai ngón để phóng to, thu nhỏ; nhấp đúp hoặc nút ↻ để đặt lại góc nhìn.': 'Drag to turn the board; scroll or pinch to zoom; double-click or ↻ to reset the view.',
    'Nút ⚔ bật chế độ đội quân: mọi quân hiện thành chiến binh.': 'The ⚔ button shows the army: every piece as a warrior.',
    'Trên điện thoại, vuốt bảng dưới xuống để thu gọn, vuốt lên để mở lại.': 'On a phone, swipe the bottom panel down to fold it, up to unfold it.',

    // a game: the status, banners and messages
    'Chiếu bí': 'Checkmate', 'Hết nước đi': 'No moves left', 'Lặp lại thế cờ ba lần': 'Threefold repetition', '60 nước liền không ăn quân': '60 moves without a capture',
    'Hai bên đồng ý hòa': 'Draw agreed', '10 phút + 5s': '10 min + 5s', '5 phút + 3s': '5 min + 3s', '10′ + 5s': '10′ + 5s',
    'Chưa lưu được lựa chọn lên tài khoản': 'Could not save the choice to your account', 'Chiếu tướng!': 'Check!',
    'Thế cờ lặp lại lần 2. Lần 3: bên chiếu dai hoặc đuổi dai bị xử thua, không thì hòa': 'Position repeated twice. A third time: perpetual check or chase loses, otherwise it is a draw',
    'Khai cuộc': 'Battle begins', 'Đang tìm…': 'Thinking…', 'Gợi ý: {0}': 'Hint: {0}', 'Xin hàng': 'Resign', 'Xin thua': 'Resign', 'Chắc chắn?': 'Sure?',
    'Trận xếp hạng': 'Ranked game', 'Phòng {0}': 'Room {0}', 'Chiến dịch {0}': 'Campaign {0}', 'Với máy': 'Vs computer', 'Ván không tính điểm.': 'The game is not rated.',
    'Đang cập nhật điểm xếp hạng…': 'Updating ratings…', 'Điểm xếp hạng: {0}': 'Rating: {0}', 'Đỏ {0}': 'Red {0}', 'Đen {0}': 'Black {0}',
    'Đã cầm cự đủ {0} nước': 'Held out for {0} moves', 'Chưa chiếu bí được sau {0} nước': 'No checkmate after {0} moves', 'Ván cờ kéo quá dài': 'The game went on too long',
    'Bạn đã rút quân': 'You withdrew', 'Bạn bị chiếu bí': 'You were checkmated', 'Đối phương hết nước đi': 'The enemy has no move', 'Bạn hết nước đi': 'You have no move',
    'Đối phương chiếu dai, phạm luật': 'The enemy checked perpetually, against the rules', 'Bạn chiếu dai, phạm luật': 'You checked perpetually, against the rules',
    'Đối phương đuổi dai, phạm luật': 'The enemy chased perpetually, against the rules', 'Bạn đuổi dai, phạm luật': 'You chased perpetually, against the rules',
    'Phá trận!': 'Formation broken!', 'Chưa phá được trận': 'Not broken yet', 'Chân Long Kỳ Trận · Trận {0}': 'True Dragon Formation · No. {0}',
    'Đại thắng!': 'Great victory!', 'Thất bại': 'Defeat', 'Ván bị hủy': 'Game called off', 'Một bên không đi nước đầu trong 30 giây': 'A side made no first move within 30 seconds',
    'Hòa cờ': 'Draw', '{0} thắng': '{0} wins', 'Chiến thắng!': 'Victory!', '{0} ({1}) thắng': '{0} ({1}) wins', 'Hai bên bất phân thắng bại': 'Neither side could win',
    '{0} hết giờ': '{0} ran out of time', 'Hết giờ, nhưng bên kia không còn quân để chiếu bí': 'Out of time, but the other side cannot checkmate',
    '{0} chiếu dai, phạm luật': '{0} checked perpetually, against the rules', '{0} đuổi dai, phạm luật': '{0} chased perpetually, against the rules',
    '{0} rời ván quá 60 giây': '{0} was away for over 60 seconds', '{0} xin thua': '{0} resigned', '{0} sau {1} nước': '{0} after {1} moves', 'sau {0} nước': 'after {0} moves',
    'Đi nước đầu trong {0} giây, không thì ván bị hủy': 'Make your first move within {0} seconds or the game is called off', 'Chờ {0} đi nước đầu': 'Waiting for {0} to move first',
    'Chờ đối thủ đi nước đầu': 'Waiting for the opponent’s first move', 'Bạn đang mất kết nối': 'You are disconnected', '{0} mất kết nối': '{0} disconnected',
    'xử thua sau {0}s': 'loses in {0}s', 'rời ván sau {0}s': 'leaves in {0}s', 'Bạn cầm quân {0}': 'You play {0}', 'Bạn đang xem trận': 'You are watching',
    'Trận xếp hạng: gặp {0}': 'Ranked game against {0}', '{0} điểm': '{0} pts', 'Đối thủ cầu hòa.': 'Your opponent offers a draw.', 'Đối thủ từ chối hòa': 'Your opponent declined the draw',
    'Có lỗi xảy ra': 'Something went wrong', 'Chủ phòng đã mời bạn ra khỏi phòng': 'The host asked you to leave the room', 'Đăng nhập Google để chơi xếp hạng': 'Sign in with Google to play ranked',
    'Đang tìm hai đối thủ': 'Looking for two opponents', '{0} kỳ thủ đang chờ trận Tam Quốc. Cần đủ ba người có điểm gần nhau…': '{0} players are waiting for Three Kingdoms. Three with close ratings are needed…',
    'Lúc này chỉ có bạn chờ trận Tam Quốc. Cần thêm hai người nữa.': 'Only you are waiting for Three Kingdoms now. Two more are needed.',
    '{0} kỳ thủ đang tìm trận. Đang chờ người có điểm gần bạn…': '{0} players are searching. Waiting for someone close to your rating…',
    'Lúc này chỉ có bạn đang tìm trận. Chờ thêm chút nhé.': 'You are the only one searching right now. Hang on a little.',
    'Bạn đang tìm trận ở một tab khác': 'You are searching in another tab', 'Không vào được hàng chờ. Thử đăng nhập lại nhé.': 'Could not join the queue. Try signing in again.',
    'xin hàng': 'resigns', 'hết giờ': 'out of time', 'bỏ ván': 'walked away', 'rút lui': 'withdraws', 'Tam Quốc tranh hùng': 'Three Kingdoms at War',
    'Bạn cầm quân {0}. Luật chơi: nút quyển sách ở góc trên.': 'You lead {0}. The rules: the book button at the top.', 'Lượt {0}': '{0} to move', '{0} diệt vong!': '{0} has fallen!',
    'Bị chiếu bí: {0}': 'Checkmated: {0}', 'Hết nước đi: {0}': 'No moves: {0}', 'tàn quân {0} về tay {1}': 'what is left of {0} goes to {1}', '{0} rút quân': '{0} withdraws',
    'Bạn đã mất nước. Có thể ở lại xem hai nước kia phân thắng bại.': 'Your kingdom has fallen. You can stay and watch the other two fight it out.',
    '{0} bị chiếu!': '{0} in check!', 'Thế cờ lặp lại lần 2. Lần 3 thì hòa': 'Position repeated twice. A third time draws', 'sau {0} vòng': 'after {0} rounds',
    'Có nước không đi nước đầu trong 30 giây': 'A kingdom made no first move within 30 seconds', 'Nhất thống thiên hạ!': 'The realm is united!',
    '{0} thu phục cả hai nước {1}': '{0} conquers both kingdoms {1}', '{0} thống nhất thiên hạ {1}': '{0} unites the realm {1}', '{0} thống nhất thiên hạ!': '{0} unites the realm!',
    'Hai nước kia đã diệt vong {0}': 'The other two have fallen {0}', '{0} đã mất nước {1}': '{0} has fallen {1}', '{0} xin hàng {1}': '{0} resigned {1}',
    '{0} đã mất nước': '{0} has fallen', '{0} hòa nhau': '{0} draw', 'Thế chân vạc': 'A three-way stand-off', '{0} bất phân thắng bại': '{0} — neither could win',
    'Xin hàng khi đến lượt nước mình': 'Resign on your own kingdom’s turn', 'Quân này không có nước đi hợp lệ': 'This piece has no legal move',
    'Trận xếp hạng Tam Quốc: {0}': 'Ranked Three Kingdoms: {0}', 'Người chơi': 'Player', 'Chưa vào': 'Not here yet', '{0} (bạn)': '{0} (you)', '(bạn)': '(you)',
    'Đang kết nối phòng…': 'Connecting to the room…', 'Mất kết nối, đang nối lại…': 'Connection lost, reconnecting…', 'Đang chờ đủ ba người vào phòng ({0}/3)…': 'Waiting for three players ({0}/3)…',
    '{0} đang đi quân…': '{0} is moving…', 'Máy {0} đang tính nước…': 'Computer {0} is thinking…', 'Máy {0} chuẩn bị đi…': 'Computer {0} is about to move…',
    'Đang xem': 'Watching', 'Bạn đã mất nước': 'Your kingdom has fallen', 'Lượt bạn': 'Your move', 'Đã mất nước': 'Fallen', 'Danh hiệu: {0}': 'Title: {0}',
    'Phòng Tam Quốc': 'Three Kingdoms room', 'Trận mới': 'New game', 'Đấu lại': 'Rematch', 'Tìm trận mới': 'Find a new game', 'Điểm Tam Quốc: {0}': 'Three Kingdoms rating: {0}',
    'Đang chờ những người khác…': 'Waiting for the others…', 'Đấu lại (xoay ghế)': 'Rematch (seats move round)', '{0}/3 người muốn đấu lại.': '{0}/3 want a rematch.',
    'Mời ra': 'Remove', '3 người chơi': '3 players', '2 người chơi': '2 players', 'Chờ đủ người vào phòng': 'Waiting for players', 'chờ đủ người vào phòng': 'waiting for players',
    'Có người đang mất kết nối': 'Someone is disconnected', 'có người đang mất kết nối': 'someone is disconnected', 'Chờ mọi người sẵn sàng': 'Waiting for everyone to be ready',
    'chờ mọi người sẵn sàng': 'waiting for everyone to be ready', 'Đang chờ…': 'Waiting…', 'Ghế trống': 'Empty seat', 'Mất kết nối': 'Disconnected', '主 Chủ phòng': '主 Host',
    'Chưa sẵn sàng': 'Not ready', 'có thể bắt đầu': 'ready to start', 'chờ chủ phòng bắt đầu': 'waiting for the host to start', 'chủ phòng chọn': 'the host picks',
    'Bối cảnh: {0}': 'Battlefield: {0}', 'Phòng hiện trong danh sách phòng đang mở: ai cũng vào được': 'The room shows in the list of open rooms: anyone may join',
    'Chỉ ai có link hoặc mã phòng mới vào được': 'Only those with the link or the room code may join', 'Bắt đầu': 'Start', 'Đã sẵn sàng': 'Ready!',
    'Bấm để hủy sẵn sàng': 'Click to stop being ready', 'Phòng đã đủ người, bạn đang xem.': 'The room is full; you are watching.', 'Mọi người đã sẵn sàng!': 'Everyone is ready!',
    'Chờ chủ phòng bắt đầu… (bấm để hủy)': 'Waiting for the host to start… (click to undo)', 'Ẩn biểu cảm của người khác': 'Hide other players’ emotes',
    'Chờ một chút rồi nói tiếp': 'Wait a moment before speaking again', 'Hết giờ': 'Out of time', 'Bỏ ván': 'Walked away', 'Chiếu dai': 'Perpetual check', 'Đuổi dai': 'Perpetual chase',
    'Cầm cự đủ số nước': 'Held out', 'Hết số nước cho phép': 'Out of moves', 'Đã phân tích xong: chọn từng nước để xem lời bình': 'Analysis done: pick a move to see what the computer says',
    'Xem lại · {0}': 'Review · {0}', 'Độ chính xác {0}%': 'Accuracy {0}%', 'Về phòng': 'Back to the room', 'Thoát xem lại': 'Close review',
    'Kết thúc: {0}': 'Result: {0}', 'giữ được thành': 'held out', 'hòa': 'draw', 'Nước {0} · {1}/{2}': 'Move {0} · {1}/{2}', 'Thế đầu · 0/{0}': 'Start · 0/{0}',
    'Thế cờ ban đầu. Dùng các nút dưới đây, phím ← → hoặc chạm vào biên bản để đi từng nước.': 'The starting position. Use the buttons below, the ← → keys, or tap the move list to step through.',
    'Máy đang chấm từng nước… {0}%': 'The computer is judging every move… {0}%', 'Phân tích tiếp': 'Continue analysis', 'Dừng': 'Pause', 'Đang phân tích…': 'Analysing…',
    '{0} ván gần nhất trên máy này': 'The last {0} games on this device', 'Chưa có ván nào': 'No games yet',
    'Đánh xong một ván cờ tướng (với máy, chiến dịch, Chân Long Kỳ Trận hay online) là ván đó được lưu ở đây, để xem lại từng nước và nhờ máy phân tích.':
      'Finish a game of xiangqi (against the computer, in the campaign, the True Dragon Formation or online) and it is kept here, to step through and have the computer analyse.',
    'gặp {0}': 'vs {0}', 'Xếp hạng · {0}': 'Ranked · {0}', 'Không tải được ván cờ này': 'Could not load this game', 'Ván cờ': 'Game', 'Chính xác {0}%': 'Accuracy {0}%',
    '{0} xin hàng, rút quân khỏi bàn': '{0} resigns and leaves the board', '{0} diệt vong, tàn quân về {1}': '{0} falls; its army goes to {1}',
    'Chưa có nước nào. Thục đi trước, rồi Ngô, rồi Ngụy.': 'No moves yet. Shu moves first, then Wu, then Wei.', '{0} vòng': '{0} rounds',
    'Ván này chưa có nước nào.': 'This game has no moves.', '{0} nước': '{0} moves', 'Chưa có nước nào. Đỏ đi trước.': 'No moves yet. Red moves first.',
    'Máy chuẩn bị đi…': 'The computer is about to move…', 'Máy đang đi quân…': 'The computer is moving…', 'Đã đi, chờ đối thủ…': 'Moved, waiting for the opponent…',
    'Đối thủ đang đi quân…': 'The opponent is moving…', 'Máy đang tính nước…': 'The computer is thinking…', 'Đang chờ đối thủ vào phòng…': 'Waiting for the opponent to join…',
    'Lượt đối thủ': 'Opponent to move', 'Đã cầu hòa': 'Draw offered', 'Trận xếp hạng · {0}': 'Ranked game · {0}', 'Phòng · {0}': 'Room · {0}',
    'Nước của bạn: {0}/{1} (tối đa {2})': 'Your moves: {0}/{1} (at most {2})', 'Đã cầm cự: {0}/{1} nước': 'Held out: {0}/{1} moves', 'còn {0} quân': '{0} pieces left',
    'Nước của bạn: {0}': 'Your moves: {0}', 'thắng trong {0} nước được thêm ★': 'win within {0} moves for an extra ★',
    'Đã dùng Đi lại hoặc Gợi ý: không vào bảng nhanh nhất': 'Undo or hints used: not on the fastest board', 'Đã dùng Đi lại hoặc Gợi ý: tối đa 2 sao': 'Undo or hints used: 2 stars at most',
    'Tiếp tục xem lại': 'Back to the review', 'Chờ kiện tướng': 'Awaiting generals', '{0} phòng': '{0} rooms', '{0} còn chỗ': '{0} with seats', 'Không tải được danh sách phòng.': 'Could not load the rooms.',
    'Không tải được danh sách phòng': 'Could not load the rooms', 'Không tải được danh sách ván.': 'Could not load the games.', '{0} ván': '{0} games', 'vừa bắt đầu': 'just started',
    'bắt đầu {0} phút trước': 'started {0} min ago', 'Trực tiếp': 'Live', 'Điểm trung bình {0}': 'Average rating {0}',
    'Lúc này chưa có ván xếp hạng nào đang diễn ra.': 'No ranked games are being played right now.', 'Lúc này chưa có ván xếp hạng Tam Quốc nào đang diễn ra.': 'No ranked Three Kingdoms games are being played right now.',
    'Xem thêm (còn {0} phòng)': 'Show more ({0} more rooms)', 'Không có phòng nào khớp.': 'No room matches.',
    'Chưa có phòng nào còn chỗ. Tạo phòng mới, hoặc xem các phòng đang chiến đấu.': 'No room has a free seat. Open a new one, or watch the rooms in battle.',
    'Chưa có phòng nào.': 'No rooms yet.', 'Chủ phòng {0}': 'Host {0}', 'Vào': 'Join', 'Xem': 'Watch', 'Chưa có phòng nào còn chỗ. Tạo phòng mới để mời mọi người!': 'No room has a free seat. Open a new one and invite everyone!',
    'Đang chờ đối thủ…': 'Waiting for the opponent…', 'Đồng ý đấu lại': 'Accept rematch', 'Đấu lại (đổi bên)': 'Rematch (swap sides)', 'Đối thủ muốn đấu lại.': 'Your opponent wants a rematch.',
    'Đã gửi lời mời đấu lại.': 'Rematch offered.', 'Thành tựu mới: {0}': 'New achievement: {0}', 'Trận tiếp: {0}': 'Next battle: {0}', 'Mở khóa: {0}!': 'Unlocked: {0}!',
    'Thành tích tốt nhất của bạn: {0}': 'Your best: {0}', 'Đánh lại để thử cách khác. Bí quá thì xem Gợi ý ở nước đầu, chỉ mất một sao.': 'Try another way. If stuck, take a hint on the first move: it costs only one star.',
    'Có thể Đi lại vài nước để gỡ, hoặc đánh lại từ đầu. Dùng Đi lại hay Gợi ý chỉ mất một sao.': 'Undo a few moves to recover, or start again. Undo or hints cost only one star.',
    'Phá lại để luyện tay': 'Play it again for practice', 'Thử lại': 'Try again', 'Bảng Chân Long Kỳ Trận': 'True Dragon Formation board',
    'Trận chưa vỡ: phải chiếu bí trong {0} nước. Đồng hồ vẫn chạy, thử đường khác nhé.': 'Still standing: checkmate within {0} moves. The clock keeps running; try another way.',
    'Đang ghi kết quả…': 'Saving the result…', 'Bạn đã phá trận hôm nay rồi: lần này để luyện tay.': 'You broke today’s formation already: this one is for practice.',
    'Phá trận trong {0}': 'Broken in {0}', 'ngay lần đầu': 'at the first try', '{0} lần thử': '{0} tries', 'hạng {0} hôm nay': 'rank {0} today', 'chuỗi {0} ngày': '{0}-day streak',
    '{0} người': '{0} people', 'Ba máy': 'Three computers', 'nhà {0}': 'house of {0}',
    'Chọn một danh tướng: quân Tướng của bạn sẽ hóa thành người đó, và bóng của họ phủ lên bàn cờ khi bạn chiếu tướng.': 'Pick a hero: your general becomes them, and their shadow falls across the board when you give check.',
    'Chủ tướng mới sẽ ra trận từ phòng online tiếp theo': 'The new general leads from your next online room', 'Không tìm thấy ván này trên máy': 'This game is not on this device',
    'Đã phá trận': 'Broken', 'Chưa phá trận': 'Not broken yet',
    'Bạn đang trong một ván online: nhận lời sẽ là xin thua ván này. Bấm Nhận lần nữa nếu chắc chắn.': 'You are in an online game: accepting resigns it. Click Accept again if you are sure.',
    'Bạn bè đã nhận lời! Đang vào phòng riêng…': 'Your friend accepted! Going to a private room…', 'Đang vào phòng riêng…': 'Going to a private room…', 'Cần đăng nhập': 'Sign in needed',
    'Ghép ba người có điểm Tam Quốc gần nhau (bạn: {0}). Mỗi nước 10 phút, cộng 5 giây sau mỗi nước.': 'Matches three players with close Three Kingdoms ratings (you: {0}). 10 minutes each, plus 5 seconds a move.',
    'Ghép ba người có điểm Tam Quốc gần nhau. Mỗi nước 10 phút, cộng 5 giây sau mỗi nước.': 'Matches three players with close Three Kingdoms ratings. 10 minutes each, plus 5 seconds a move.',
    'Đăng nhập Google ở màn hình chính để chơi xếp hạng.': 'Sign in with Google on the home screen to play ranked.',
    'Ghép với người có điểm gần bạn. Mỗi bên 10 phút, cộng 5 giây sau mỗi nước.': 'Matched with someone close to your rating. 10 minutes each, plus 5 seconds a move.',
    'Đã sao chép link mời': 'Invite link copied', 'Nhập mã phòng 4 ký tự': 'Enter the 4-character room code', 'Ván đang diễn ra. Xin thua hoặc chờ hết ván để đấu lại.': 'A game is under way. Resign or finish it to rematch.',
    'Đội quân: mọi quân hiện chiến binh': 'Army: every piece shows its warrior', 'Quân cờ: chiến binh chỉ hiện khi ra trận': 'Pieces: warriors appear only in battle',
    'Đang offline: vẫn đánh với máy, chiến dịch, Chân Long Kỳ Trận và xem lại ván cũ được.': 'Offline: you can still play the computer, the campaign, the True Dragon Formation, and review old games.',
    'Chơi online cần chạy qua Cloudflare Worker (npm start hoặc bản đã deploy).': 'Online play needs the Cloudflare Worker (npm start or the deployed site).',
    'Đã cài Cờ Tướng 3D lên máy': 'Xiangqi 3D is installed', 'Có bản mới của trò chơi: bấm Cập nhật ở góc trên khi tiện': 'A new version is ready: click Update at the top when convenient',
    'Bạn đang trong ván': 'You are in a game',

    // the account, the boards, profiles
    'Nhất': '1st', 'Nhì': '2nd', 'Ba': '3rd', 'Thống nhất': 'United', 'Lặp thế cờ': 'Repetition', '50 vòng không ăn quân': '50 rounds without a capture', 'Hết nước': 'No moves',
    '60 nước không ăn quân': '60 moves without a capture', 'Thỏa thuận hòa': 'Draw agreed', 'Không tải được nút đăng nhập Google. Kiểm tra mạng rồi tải lại trang.': 'Could not load the Google sign-in button. Check the connection and reload.',
    'Chào {0}!': 'Welcome, {0}!', 'Đăng nhập không thành công, thử lại nhé': 'Sign-in failed, please try again',
    '{0} điểm · hạng {1} mùa này · {2} ván trong mùa': '{0} pts · #{1} this season · {2} games this season', '{0} điểm · còn {1} ván để có tên trên bảng mùa này': '{0} pts · {1} more games to be on this season’s board',
    'Tam Quốc: {0} điểm · hạng {1} mùa này · {2} ván trong mùa': 'Three Kingdoms: {0} pts · #{1} this season · {2} games this season',
    'Tam Quốc: {0} điểm · còn {1} ván để có tên trên bảng mùa này': 'Three Kingdoms: {0} pts · {1} more games to be on this season’s board',
    'Tam Quốc {0}': 'Three Kingdoms {0}', 'Đã đổi tên': 'Name changed', 'Chưa đổi được tên, thử lại nhé': 'Could not change the name, please try again', 'Không tải được, thử lại sau.': 'Could not load; try again later.',
    'Bảng xếp hạng lúc kết thúc mùa': 'The board as the season ended', 'Còn {0} ngày': '{0} days left', 'hết mùa, top 10 nhận danh hiệu và điểm kéo về gần 1200': 'at the end the top ten earn a title and ratings move halfway back to 1200',
    'Mùa trước': 'Last season', 'Mùa trước nữa': 'The season before', 'Mùa này': 'This season', 'Mùa đó chưa ai có tên trên bảng.': 'Nobody made that season’s board.',
    'Kỳ thủ': 'Player', 'Điểm': 'Rating', 'Ván': 'Games', 'Mùa này chưa ai chơi đủ {0} ván xếp hạng. Hãy là người đầu tiên có tên trên bảng!': 'Nobody has played {0} ranked games this season yet. Be the first on the board!',
    'Mùa này chưa ai chơi đủ {0} ván xếp hạng Tam Quốc. Hãy là người đầu tiên có tên trên bảng!': 'Nobody has played {0} ranked Three Kingdoms games this season yet. Be the first on the board!',
    'Bạn: {0}': 'You: {0}', 'Đăng nhập Google rồi chơi trận xếp hạng để có tên trên bảng.': 'Sign in with Google and play ranked to be on the board.',
    'Kết bạn': 'Add friend', 'Hủy lời mời kết bạn': 'Cancel friend request', 'Đồng ý kết bạn': 'Accept friend request', 'Xóa bạn': 'Remove friend', 'Chắc chắn xóa?': 'Really remove?',
    'Thách đấu': 'Challenge', 'Thắng': 'Wins', 'Hòa': 'Draws', 'Thua': 'Losses', 'Ván gần đây': 'Recent games', 'Chưa có ván xếp hạng nào.': 'No ranked games yet.', 'gặp': 'vs',
    'Mất nước': 'Fallen', 'Hạng {0}': 'Place: {0}', 'Các mùa giải': 'Seasons', 'hạng {0}': '#{0}', 'Thành tựu · {0}': 'Achievements · {0}', 'Xem lại · phân tích ': 'Review · analyse',

    // the campaign
    'Chưa lưu được lên tài khoản, lần đăng nhập sau sẽ thử lại': 'Not saved to your account yet; it will be tried at the next sign-in',
    'chủ tướng {0}': 'general {0}', 'bối cảnh {0}': 'battlefield {0}', 'danh hiệu "{0}"': 'title "{0}"', '{0} sao': '{0} stars', '{0} chương': '{0} chapters',
    'Chủ tướng {0}': 'General {0}', 'Bối cảnh {0}': 'Battlefield {0}', 'Danh hiệu "{0}"': 'Title "{0}"', 'Xong chương {0}': 'Finish {0}', 'đã nhận': 'earned',
    'Không hiện danh hiệu': 'No title', 'Hoàn thành một chương để nhận danh hiệu đầu tiên.': 'Finish a chapter for your first title.',
    'Đăng nhập Google để giữ tiến độ trên mọi thiết bị và hiện danh hiệu trên bảng xếp hạng.': 'Sign in with Google to keep your progress on every device and show your title on the leaderboard.',
    'Các trận khó hơn, máy suy nghĩ lâu hơn': 'Harder battles, and the computer thinks longer', 'Năm {0}': 'Year {0}', 'đã hoàn thành': 'complete', '{0} · năm {1}': '{0} · year {1}',
    'Đối thủ: {0} (máy, {1})': 'Opponent: {0} (computer, {1})', 'dễ': 'easy', 'vừa': 'normal', 'mạnh': 'strong', 'rất mạnh': 'very strong', 'phòng thủ chặt': 'tight defence',
    'Thắng trận trước để mở trận này': 'Win the battle before to open this one', 'Đã đổi danh hiệu': 'Title changed', 'Đã ẩn danh hiệu': 'Title hidden',
    'Chưa đổi được danh hiệu, thử lại nhé': 'Could not change the title, please try again', 'Chưa đổi được danh hiệu': 'Could not change the title',
    'Đào viên kết nghĩa': 'The Oath of the Peach Garden', 'Lời thề vườn đào': 'The Peach Garden Oath', 'Thao luyện binh mã': 'Drilling the Troops', 'Dẹp giặc Khăn Vàng': 'Crushing the Yellow Turbans',
    'Tam anh chiến Lữ Bố': 'Three Heroes Fight Lü Bu', 'Giữ trận trước cửa ải': 'Holding Before the Pass', 'Phá Hổ Lao': 'Breaking Hulao', 'Trương Phi trấn cầu': 'Zhang Fei Holds the Bridge',
    'Triệu Vân cứu chúa': 'Zhao Yun Saves His Lord', 'Rút về Hạ Khẩu': 'Retreat to Xiakou', 'Liên hoàn kế': 'The Chained Ships', 'Hỏa thiêu chiến thuyền': 'Fire on the Fleet',
    'Đại phá quân Tào': 'Routing Cao Cao', 'Giữ vững doanh trại': 'Holding the Camp', 'Đèn thất tinh': 'The Seven-Star Lamps', 'Trận cuối': 'The Last Battle', 'Ngoại truyện': 'Side Stories',
    'Pháp Chính phất cờ': 'Fa Zheng Waves the Flag', 'Lấy nhàn đợi mỏi': 'Rested Against Weary', 'Chém Hạ Hầu Uyên': 'Slaying Xiahou Yuan', 'Vượt sông Lô': 'Crossing the Lu River',
    'Hỏa thiêu Đằng giáp': 'Burning the Rattan Armour', 'Thất cầm Mạnh Hoạch': 'Seven Captures of Meng Huo', 'Không thành kế': 'The Empty Fort Strategy', 'Thu phục Khương Duy': 'Winning Over Jiang Wei',
    'Tiếng đàn trên thành': 'The Zither on the Wall', 'Kỳ phùng địch thủ': 'Worthy Rivals', 'Nam chinh': 'The Southern Campaign',
    'Giặc Khăn Vàng nổi dậy khắp nơi. Dưới gốc đào nhà Trương Phi, ba người thề cùng sinh tử, rồi lên đường dẹp loạn.': 'The Yellow Turbans rise everywhere. Under the peach trees of Zhang Fei’s garden three men swear to live and die together, then set out to end the rebellion.',
    'Trận đầu tiên của huynh đệ: dồn Tướng địch vào góc cung, chỉ một nước là xong.': 'The brothers’ first battle: the enemy general is cornered in his palace, and one move ends it.',
    'Xe và Mã phải phối hợp: một quân dồn, một quân chặn đường lui.': 'Chariot and horse work together: one drives, the other cuts off the retreat.',
    'Quân Khăn Vàng đông nhưng ô hợp, không có lấy một cỗ Xe. Hãy đánh một trận ra trò.': 'The Yellow Turbans are many but a rabble, without a single chariot. Fight a proper battle.',
    'Mười tám lộ chư hầu kéo đến đánh Đổng Trác. Lữ Bố cưỡi Xích Thố trấn giữ cửa ải Hổ Lao, không ai địch nổi.': 'Eighteen lords march against Dong Zhuo. Lü Bu on Red Hare holds Hulao Pass, and none can stand against him.',
    'Lưu, Quan, Trương cùng xông vào: Xe, Mã, Pháo phải đánh như một.': 'Liu, Guan and Zhang charge together: chariot, horse and cannon must strike as one.',
    'Quân ta mới đến, đội ngũ chưa đủ, Lữ Bố đã dàn quân xông trận. Coi chừng cỗ Pháo địch ngay từ nước đầu.': 'Our troops have only just arrived, the ranks not yet formed, and Lü Bu is already attacking. Watch the enemy cannon from the very first move.',
    'Lữ Bố đã núng, quân giữ ải thiếu một cỗ Xe. Thừa thắng phá cửa ải.': 'Lü Bu wavers, and the pass is held without one chariot. Press on and break through.',
    'Tào Tháo đem năm nghìn thiết kỵ đuổi theo Lưu Bị đến Đương Dương. Triệu Vân phá vây cứu A Đẩu, Trương Phi một mình đứng trên cầu Trường Bản.': 'Cao Cao pursues Liu Bei to Dangyang with five thousand armoured horsemen. Zhao Yun breaks through to save A Dou, and Zhang Fei stands alone on Changban Bridge.',
    'Chỉ còn một cỗ Xe và vài quân giữ cung, kỵ binh Tào đã vượt sông. Hãy cầm cự cho đại quân rút lui.': 'Only a chariot and a few palace guards are left, and Cao’s horsemen have crossed the river. Hold out while the army withdraws.',
    'Bảy lần xông vào, bảy lần phá ra: hai con ngựa của Triệu Vân phải mở đường giữa vòng vây.': 'Seven times in, seven times out: Zhao Yun’s two horses must cut a way through the ring.',
    'Lần này bạn cầm quân Đen, đi sau. Quân truy kích của Tào Tháo đã mất một cỗ Xe và một con Mã ở cầu Trường Bản.': 'This time you play Black, moving second. Cao Cao’s pursuers lost a chariot and a horse at Changban Bridge.',
    'Tào Tháo đem tám mươi vạn quân xuống Giang Nam. Tôn Quyền và Lưu Bị liên minh; Chu Du cầm quân, Gia Cát Lượng mượn gió đông.': 'Cao Cao brings eight hundred thousand men south of the Yangtze. Sun Quan and Liu Bei ally; Zhou Yu commands, and Zhuge Liang borrows the east wind.',
    'Chiến thuyền nhà Tào đã bị xích lại với nhau. Xe, Pháo, Tốt cùng siết, không để địch thoát.': 'Cao’s warships are chained together. Chariot, cannon and soldier close in, leaving no escape.',
    'Gió đông đã nổi. Hai cỗ Pháo là hai mồi lửa, chỉ chờ châm đúng chỗ.': 'The east wind has risen. Two cannons are two fire ships, waiting to be lit in the right place.',
    'Lửa cháy rực sông, quân Tào rối loạn và thiếu một cỗ Xe. Nhưng Tào Tháo vẫn là tay cờ cao.': 'The river is ablaze, Cao’s army in disarray and short of a chariot. But Cao Cao is still a fine player.',
    'Lần Bắc phạt cuối cùng. Gia Cát Lượng đóng quân ở Ngũ Trượng Nguyên, Tư Mã Ý cố thủ không ra. Đêm ấy một ngôi sao lớn rơi xuống doanh trại.': 'The last Northern Expedition. Zhuge Liang camps at Wuzhang Plains; Sima Yi stays behind his walls. That night a great star falls over the camp.',
    'Tư Mã Ý bất ngờ đánh úp, một cỗ Pháo đã lọt vào sát trại. Quân ta thiếu Xe, thiếu Mã: giữ cho được mười hai nước.': 'Sima Yi attacks by surprise, and a cannon is already at the camp. We lack chariots and horses: hold for twelve moves.',
    'Khổng Minh lập đàn, thắp bảy ngọn đèn cầu sao. Có khi một nước đi lặng lẽ lại quyết định cả thế trận.': 'Kongming lights seven lamps to pray to the stars. Sometimes a quiet move decides the whole battle.',
    'Ván cờ cuối cùng với Tư Mã Ý, kỳ phùng địch thủ. Ngụy quân chỉ thiếu một con Mã, mọi nước đi đều phải tính kỹ.': 'The last game against Sima Yi, a worthy rival. Wei is short only a horse; every move must be weighed.',
    'Lưu Bị tranh Hán Trung với Tào Tháo. Lão tướng Hoàng Trung theo kế Pháp Chính chiếm ngọn núi đối diện, chờ quân Hạ Hầu Uyên mỏi mệt rồi từ trên cao đổ xuống.': 'Liu Bei contests Hanzhong with Cao Cao. On Fa Zheng’s advice the old general Huang Zhong takes the facing peak and waits for Xiahou Yuan’s men to tire, then sweeps down from above.',
    'Pháp Chính đứng trên đỉnh núi chờ thời. Hai cỗ Pháo chung một đường như hai lá cờ hiệu: chỉ cần phất đúng lá cờ, quân Ngụy không còn đường lui.': 'Fa Zheng waits on the summit. Two cannons on one line are two signal flags: wave the right one and Wei has no way back.',
    'Quân ta trên núi không có lấy một cỗ Xe, Hạ Hầu Uyên dốc toàn lực đánh lên. Giữ vững mười tám nước cho quân địch mỏi mệt.': 'On the mountain we have not a single chariot, and Xiahou Yuan throws everything uphill. Hold for eighteen moves until the enemy tires.',
    'Hoàng Trung từ trên núi đổ xuống như thác, quân Ngụy rối loạn, mất một cỗ Pháo. Nhưng Hạ Hầu Uyên vẫn là danh tướng, và máy nghĩ lâu hơn mọi trận trước.': 'Huang Zhong pours down the mountain like a waterfall; Wei is in disarray and has lost a cannon. But Xiahou Yuan is a famous general, and the computer thinks longer than in any battle before.',
    'Phương Nam nổi loạn. Gia Cát Lượng dẫn quân vượt sông Lô giữa tháng năm, khí độc bốc trên mặt nước, để bắt Mạnh Hoạch bảy lần, tha bảy lần, cho đến khi vua Nam Man thật lòng quy phục.': 'The south rebels. Zhuge Liang crosses the Lu River in the fifth month, poison mist rising off the water, to capture Meng Huo seven times and free him seven times, until the king of the Nanman truly submits.',
    'Quân ta mới qua được nửa sông, Xe chưa sang, một con Mã còn kẹt bờ bên kia. Pháo của Mạnh Hoạch đã đặt giữa trận: cầm cự mười sáu nước.': 'Half our army is across, the chariots not yet, a horse stuck on the far bank. Meng Huo’s cannon is already in the centre: hold for sixteen moves.',
    'Quân Đằng giáp đao thương không thủng. Khổng Minh nhử chúng vào hang Bàn Xà: phải dám đưa mồi, lửa mới bùng lên được.': 'No blade pierces the rattan-armoured troops. Kongming lures them into Coiled Serpent Valley: you must dare to offer the bait before the fire can catch.',
    'Lần thứ bảy đối mặt. Không ai chấp ai, quân hai bên đủ cả: thắng được ván này thì Mạnh Hoạch mới chịu phục.': 'The seventh meeting. No odds given, both armies whole: win this one and Meng Huo will submit at last.',
    'Lần Bắc phạt đầu tiên. Khổng Minh thu phục Khương Duy ở Thiên Thủy, nhưng Mã Tốc làm mất Nhai Đình. Tư Mã Ý kéo mười lăm vạn quân đến Tây Thành, nơi chỉ còn vài nghìn lính già.': 'The first Northern Expedition. Kongming wins Jiang Wei over at Tianshui, but Ma Su loses Jieting. Sima Yi brings a hundred and fifty thousand men to Xicheng, held by a few thousand old soldiers.',
    'Khương Duy trí dũng song toàn, đánh thẳng thì không bắt được. Có khi phải lui một bước mới tiến được ba bước.': 'Jiang Wei is both wise and brave, and cannot be taken head on. Sometimes one step back leads three steps forward.',
    'Cổng thành mở toang, trong thành chỉ còn một cỗ Pháo, hai tên lính và mấy quân giữ cung. Khổng Minh vẫn ung dung gảy đàn: giữ thành mười lăm nước, đừng để Tư Mã Ý nhìn ra sơ hở.': 'The gates stand open, and inside are only a cannon, two soldiers and a few palace guards. Kongming calmly plays his zither: hold the town for fifteen moves, and let Sima Yi see no weakness.',
    'Tư Mã Ý đã lui quân, nhưng ván cờ giữa hai người chưa bao giờ dứt. Lần này bạn cầm quân Đen, đi sau, quân hai bên ngang nhau.': 'Sima Yi has withdrawn, but the game between the two never ends. This time you play Black, moving second, the armies even.',
    'Huynh đệ kết nghĩa': 'Sworn Brother', 'Anh hùng Hổ Lao': 'Hero of Hulao', 'Hổ tướng Trường Bản': 'Tiger of Changban', 'Đô đốc Xích Bích': 'Admiral of Red Cliffs', 'Ngọa Long': 'Sleeping Dragon',
    'Thiên hạ vô song': 'Peerless Under Heaven', 'Lão tướng Định Quân': 'Old General of Dingjun', 'Bình Nam đại tướng': 'Pacifier of the South', 'Thần cơ diệu toán': 'Divine Strategist', 'Nhất thống thiên hạ': 'Unifier of the Realm',
    'Hoàn thành chương {0} trong Chiến dịch': 'Finish the chapter {0} in the Campaign', 'Đạt {0} sao trong Chiến dịch': 'Earn {0} stars in the Campaign',
    'Cầm cự {0} nước, không để bị chiếu bí': 'Hold out for {0} moves without being checkmated', 'Thắng ván cờ (bạn cầm quân Đỏ, đi trước)': 'Win the game (you play Red, moving first)',
    'Thắng ván cờ (bạn cầm quân Đen, đi sau)': 'Win the game (you play Black, moving second)', 'Chiếu bí trong tối đa {0} nước': 'Checkmate within {0} moves', 'Cầm cự đủ {0} nước': 'Hold out for {0} moves',
    'Thắng ván cờ': 'Win the game', 'Không đi lại, không xem gợi ý': 'No undo, no hints', 'Chiếu bí đúng {0} nước': 'Checkmate in exactly {0} moves', 'Còn ít nhất {0} quân (không tính Tướng)': 'Keep at least {0} pieces (besides the general)',
    'Thắng trong {0} nước': 'Win within {0} moves', 'Cờ thế': 'Puzzle', 'Thủ thành': 'Siege', 'Chấp quân': 'Handicap', 'Quyết chiến': 'Decisive battle', 'Chiếu bí trong {0} nước': 'Checkmate in {0} moves',

    // the daily formation
    'Chưa ghi được lên bảng Chân Long Kỳ Trận': 'Not yet on the True Dragon Formation board', 'Trận {0}': 'No. {0}', 'Trận đồ hôm nay': 'Today’s formation', 'hạng {0} mùa này': '#{0} this season', '{0} ván trong mùa': '{0} games this season',
    'còn {0} ván để có tên trên bảng mùa này': '{0} more games to be on this season’s board', '{0}: {1}': '{0}: {1}','Bậc Đại sư': 'Grandmaster', 'Bậc Cao thủ': 'Master', 'Chân Long Kỳ Trận · Trận {0}{1}': 'True Dragon Formation · No. {0}{1}',
    'Bạn đã phá trận trong {0}': 'You broke it in {0}', 'sau {0} lần thử': 'after {0} tries', '(có dùng gợi ý)': '(with hints)', 'Hạng {0} hôm nay.': 'Rank {0} today.',
    'Đã thử {0} lần. Đồng hồ chạy từ lần mở đầu tiên.': '{0} tries so far. The clock runs from the first time you opened it.',
    'Đồng hồ bắt đầu khi bạn bấm Phá trận, và chạy tiếp qua mỗi lần thử lại.': 'The clock starts when you click Break it, and keeps running through every retry.',
    'Bảng nhanh nhất cần tài khoản: chưa bật trên máy chủ này.': 'The fastest board needs accounts, which this server does not have.',
    'Đang chơi offline: chuỗi ngày vẫn được giữ trên máy này.': 'Playing offline: your streak is kept on this device.', 'Chưa ai phá được trận hôm nay. Hãy là người đầu tiên!': 'Nobody has broken today’s formation yet. Be the first!',
    'Thời gian': 'Time', 'Lần thử': 'Tries', '{0} kỳ thủ đã phá trận hôm nay.': '{0} players broke it today.',
    'Đăng nhập Google để có tên trên bảng và giữ chuỗi ngày khi đổi máy.': 'Sign in with Google to be on the board and keep your streak on any device.',
    'Lời giải có dùng Đi lại hay Gợi ý không vào bảng nhanh nhất.': 'Solutions with undo or hints are not on the fastest board.', 'Trận mới sau {0}': 'Next formation in {0}',
    'Giải lại để luyện tay': 'Play it again for practice', 'Trận đồ này đã qua ngày': 'This formation’s day has passed',

    // friends
    'không giờ': 'untimed', 'Đang online': 'Online', 'Đang chơi': 'Playing', 'Offline': 'Offline', '{0} muốn kết bạn với bạn': '{0} wants to be your friend', '{0} đã đồng ý kết bạn': '{0} accepted your friend request',
    'Người này vừa rời đi, chưa thách đấu được': 'They just left; the challenge did not go through', 'Chỉ thách đấu được bạn bè': 'You can only challenge friends',
    '{0} đã từ chối lời thách đấu': '{0} declined the challenge', 'Lời thách đấu đã được rút lại': 'The challenge was withdrawn', 'Chưa kết nối được máy chủ, thử lại sau giây lát': 'Not connected to the server yet; try again in a moment',
    'Đang chờ một lời thách đấu khác': 'Another challenge is still waiting', '{0} chưa trả lời lời thách đấu': '{0} did not answer the challenge', 'thách đấu bạn': 'challenges you',
    'còn {0}s': '{0}s left', 'Nhận': 'Accept', 'Đang chờ': 'Waiting for', 'trả lời': 'to answer', 'Hủy': 'Cancel', '{0} bạn': '{0} friends', '{0} đang online': '{0} online',
    'Chưa có bạn nào': 'No friends yet', 'Lời mời kết bạn': 'Friend requests', 'Hồ sơ': 'Profile', 'Hủy lời mời': 'Cancel request', 'Đang chờ đồng ý': 'Waiting for an answer',
    'Tìm kỳ thủ theo tên ở trên, hoặc mở hồ sơ của ai đó trên bảng xếp hạng để kết bạn. Bạn bè thấy nhau đang online và thách đấu nhau được ngay.':
      'Find players by name above, or open someone’s profile on the leaderboard to add them. Friends see each other online and can challenge each other at once.',
    'Đã gửi lời mời': 'Request sent', 'Gõ ít nhất 2 chữ của tên.': 'Type at least 2 letters of the name.', 'Không tìm được, thử lại sau.': 'Search failed; try again later.',
    'Không có kỳ thủ nào tên như vậy.': 'No player by that name.', 'Đã gửi lời mời kết bạn': 'Friend request sent', 'Đã thành bạn bè': 'You are now friends', 'Đã từ chối': 'Declined',
    'Đã xóa': 'Removed', 'Chưa làm được, thử lại sau': 'That did not work; try again later', 'Bạn bè ': 'Friends',

    // the review's verdicts
    'Nước hớ': 'Blunder', 'Sai lầm': 'Mistake', 'Chưa chính xác': 'Inaccuracy', 'Nước hay': 'Good move', 'Đúng nước máy chọn': 'The computer’s choice',
    'bỏ lỡ đường chiếu bí trong {0} nước': 'missed a mate in {0}', 'để đối phương có đường chiếu bí trong {0} nước': 'allowed a mate in {0}',
    'chiếu bí chậm hơn ({0} nước thay vì {1})': 'a slower mate ({0} moves instead of {1})', 'mất lợi thế cỡ một cỗ Xe': 'gave away about a chariot',
    'mất lợi thế cỡ một quân Mã hay Pháo': 'gave away about a horse or cannon', 'mất lợi thế cỡ một Sĩ hay Tượng': 'gave away about an advisor or elephant', 'mất lợi thế vài Tốt': 'gave away a few soldiers',
    '{0}: nước duy nhất giữ được thế cờ.': '{0}: the only move that holds the position.', 'Được. Máy chọn {0}.': 'Fine. The computer chose {0}.', '{0}: {1}. Nên đi {2}.': '{0}: {1}. Better was {2}.', '{0}.': '{0}.',
    '{0} chiếu bí trong {1} nước': '{0} mates in {1}', 'Cân bằng': 'Even', '{0} hơn {1}': '{0} is ahead by {1}', 'Đỏ: {0}': 'Red: {0}', 'Đen: {0}': 'Black: {0}',

    // achievements and seasons
    'Thành tựu được giữ trên máy này.': 'Achievements are kept on this device.', 'Danh hiệu hiện cạnh tên bạn trên bảng xếp hạng và trong các ván online.': 'Your title shows by your name on the leaderboard and in online games.',
    'Thành tựu được giữ trên máy này. Đăng nhập Google để giữ chúng trên mọi thiết bị và đeo danh hiệu cạnh tên.': 'Achievements are kept on this device. Sign in with Google to keep them everywhere and wear a title by your name.',
    'danh hiệu “{0}”': 'title “{0}”',
    'Tiểu tốt đánh xe': 'The Soldier Takes the Chariot', 'Dùng một con Tốt ăn Xe của đối phương': 'Capture an enemy chariot with a soldier',
    'Mã đáo thành công': 'Instant Success', 'Chiếu bí bằng một nước Mã': 'Checkmate with a horse move', 'Tốt sát': 'Soldier’s Mate', 'Chiếu bí bằng một nước Tốt': 'Checkmate with a soldier move',
    'Trùng pháo': 'Double Cannon', 'Chiếu bí bằng Pháo, ngòi là cỗ Pháo thứ hai của mình': 'Checkmate with a cannon that jumps your other cannon',
    'Lộ mặt Tướng': 'Face of the General', 'Chiếu bí mà Tướng địch không dám tránh sang vì sẽ đối mặt Tướng mình': 'Checkmate where the enemy general cannot step aside without facing yours',
    'Ngự giá thân chinh': 'The Emperor Rides Out', 'Thần tốc': 'Lightning Strike', 'Chiếu bí trong 15 nước, đánh từ thế khai cuộc': 'Checkmate within 15 moves from the opening position',
    'Toàn quân': 'Not a Man Lost', 'Chiếu bí từ thế khai cuộc mà không mất một quân nào': 'Checkmate from the opening position without losing a single piece', 'Bất bại tướng quân': 'Undefeated General',
    'Đơn kỵ': 'Lone Rider', 'Chiếu bí khi quân tấn công duy nhất còn lại là một con Mã': 'Checkmate when your only attacking piece left is one horse', 'Đơn kỵ cứu chúa': 'Lone Rider to the Rescue',
    'Thí Xe': 'Chariot Sacrifice', 'Mất Xe rồi chiếu bí trong vòng 5 nước sau đó': 'Lose a chariot, then checkmate within 5 moves', 'Khí phách anh hùng': 'Heroic Spirit',
    'Trường kỳ': 'The Long War', 'Chiếu bí sau một ván dài từ 100 nước trở lên': 'Checkmate after a game of 100 moves or more',
    'Thất tinh': 'Seven Stars', 'Phá Chân Long Kỳ Trận 7 ngày liên tiếp': 'Break the True Dragon Formation 7 days in a row', 'Phá trận tiên sinh': 'Formation Breaker',
    'Thân kinh bách chiến': 'Veteran of a Hundred Battles', 'Đánh 50 ván xếp hạng cờ tướng': 'Play 50 ranked games of xiangqi',
    'Danh chấn thiên hạ': 'Renowned Under Heaven', 'Đạt 1600 điểm xếp hạng cờ tướng': 'Reach a xiangqi rating of 1600',
    'Thống nhất Tam Quốc': 'Unifier of the Three Kingdoms', 'Một mình nhất thống thiên hạ trong một ván xếp hạng Tam Quốc': 'Unite the realm alone in a ranked Three Kingdoms game',
    'Kỳ vương {0}': 'Champion · {0}', 'Á vương {0}': 'Runner-up · {0}', 'Thập đại cao thủ {0}': 'Top Ten · {0}',
    'Bá chủ Tam Quốc {0}': 'Three Kingdoms Overlord · {0}', 'Kiêu hùng Tam Quốc {0}': 'Three Kingdoms Hero · {0}', 'Thập đại kiêu hùng {0}': 'Three Kingdoms Top Ten · {0}',

    // emotes and battle cries
    'Xin chào!': 'Greetings!', 'Chúc may mắn!': 'Good luck!', 'Nước hay!': 'Nice move!', 'Ối chà!': 'Whoa!', 'Để ta tính đã…': 'Let me think…', 'Mau lên nào!': 'Hurry up!',
    'Đa tạ!': 'Many thanks!', 'Ván hay lắm!': 'Great game!', 'Toàn quân, xung trận!': 'All troops, charge!',
    'Thanh Long đao đã sẵn, kẻ nào dám ra đây!': 'My Green Dragon Blade is ready — who dares face me!',
    'Ta là Trương Dực Đức đây! Ai dám cùng ta quyết chiến?': 'I am Zhang Yide! Who dares fight me to the death?', 'Ta là Thường Sơn Triệu Tử Long!': 'I am Zhao Zilong of Changshan!',
    'Mưu sự tại nhân, thành sự tại thiên.': 'Man proposes, Heaven disposes.', 'Lấy nhân nghĩa mà phục lòng người.': 'Win hearts with kindness and righteousness.',
    'Thà ta phụ người trong thiên hạ, chứ không để người trong thiên hạ phụ ta!': 'Better I betray the world than let the world betray me!',
    'Giang Đông đâu dễ khuất phục!': 'Jiangdong will not bow so easily!', 'Người có Lữ Bố, ngựa có Xích Thố!': 'Among men, Lü Bu; among horses, Red Hare!',
    'Tuổi già nhưng đao chưa cùn!': 'Old I may be, but my blade is still sharp!', 'Cẩm Mã Siêu ở đây, kẻ nào dám địch!': 'Splendid Ma Chao is here — who will face me!',
    'Gió đông đã nổi, lửa đốt chiến thuyền!': 'The east wind blows — burn the fleet!', 'Kiên nhẫn chờ thời, thắng ắt về ta.': 'Patience: victory will come to me.',
    'Ba ngày năm trăm dặm, sáu ngày một nghìn!': 'Five hundred li in three days, a thousand in six!', 'Bắt ta bảy lần, ta vẫn chưa phục!': 'Capture me seven times — I still won’t submit!',
    'Kế chí Thừa tướng, Bắc phạt chưa thôi!': 'For the Chancellor’s cause, the march north goes on!', 'Phi đao của ta chưa trượt bao giờ!': 'My flying knives have never missed!',

    // generals' looks and battlefields' notes
    'Mặt đỏ, râu dài, áo xanh, Thanh Long Yển Nguyệt đao': 'Red face, long beard, green robe, the Green Dragon Crescent Blade',
    'Râu hùm rậm, giáp đen, Trượng bát xà mâu': 'Bristling tiger whiskers, black armour, the Serpent Spear',
    'Giáp bạc, mũ cắm lông trắng, ngân thương': 'Silver armour, a white-plumed helmet, a silver spear', 'Áo trắng, khăn luân, quạt lông vũ': 'White robe, scholar’s cap, feather fan',
    'Áo vàng, mũ miện, song cổ kiếm': 'Yellow robe, a crown, twin swords', 'Áo tía, mũ quan, Ỷ Thiên kiếm': 'Purple robe, an official’s cap, the Heaven-Reliant Sword',
    'Râu tím, giáp xanh ngọc, mũ vàng': 'Purple beard, jade armour, golden helmet', 'Hai lông trĩ thật dài, Phương Thiên họa kích': 'Two very long pheasant plumes, the Sky Piercer halberd',
    'Lão tướng tóc bạc râu trắng, đại đao và cung': 'An old general, white hair and beard, a great blade and a bow',
    'Giáp bạc, mũ đầu sư tử, thương dài': 'Silver armour, a lion-head helmet, a long spear', 'Đô đốc trẻ, giáp đỏ sẫm, mũ cắm lông đỏ': 'A young admiral in dark red armour with a red-plumed helmet',
    'Áo đen, mũ quan cao, râu bạc, kiếm': 'Black robe, a tall official’s cap, grey beard, a sword',
    'Giáp thép xanh, mũ mào đỏ, song đao: vị tướng hành quân thần tốc': 'Blue steel armour, a red-crested helmet, twin blades: the general of lightning marches',
    'Vua Nam Man: da ngăm, mũ lông chim, áo da hổ, đại đao': 'King of the Nanman: dark skin, a feathered headdress, tiger-skin coat, a great blade',
    'Tướng trẻ giáp xanh lam, mũ tua đỏ, thương dài: người kế thừa Khổng Minh': 'A young general in blue armour with a red-tasselled helmet and a long spear: Kongming’s heir',
    'Nữ tướng Nam Man, vợ Mạnh Hoạch: tóc búi cài lông chim, phi đao': 'Woman warrior of the Nanman, Meng Huo’s wife: feathers in her hair, flying knives',
    'Đêm trong trướng, đèn lồng đỏ, bụi bay trong ánh đèn.': 'Night in the command tent: red lanterns, dust drifting in the light.',
    'Năm 184, vườn đào nhà Trương Phi: nơi ba anh em thề kết nghĩa.': 'The year 184, Zhang Fei’s peach garden: where the three swore brotherhood.',
    'Năm 190, trước cửa ải Hổ Lao: Lưu Bị, Quan Vũ, Trương Phi đại chiến Lữ Bố.': 'The year 190, before Hulao Pass: Liu Bei, Guan Yu and Zhang Fei battle Lü Bu.',
    'Năm 208, bên cầu Trường Bản: Trương Phi một mình chặn đại quân Tào Tháo.': 'The year 208, at Changban Bridge: Zhang Fei alone holds back Cao Cao’s army.',
    'Năm 208, trên sông Trường Giang: hỏa công đốt chiến thuyền Tào Tháo dưới vách đá đỏ.': 'The year 208, on the Yangtze: fire burns Cao Cao’s fleet beneath the red cliffs.',
    'Năm 234, đêm thu trong doanh trại Thục, một ngôi sao lớn rơi xuống.': 'The year 234, an autumn night in the Shu camp, as a great star falls.',
    'Năm 219, trên đỉnh núi đối diện Định Quân Sơn: cờ đỏ phất lên là Hoàng Trung đổ xuống.': 'The year 219, on the peak facing Mount Dingjun: when the red flag waves, Huang Zhong charges down.',
    'Năm 225, rừng rậm phương Nam bên sông Lô: khí độc trên mặt nước, voi chiến và cột vật tổ.': 'The year 225, the southern jungle by the Lu River: poison mist on the water, war elephants and totem poles.',
    'Năm 228, cổng thành mở toang, Khổng Minh gảy đàn trên lầu trước mười lăm vạn quân Tư Mã Ý.': 'The year 228: the gates wide open, Kongming plays his zither on the tower before Sima Yi’s hundred and fifty thousand.',
    // sharing the moment
    'Chia sẻ khoảnh khắc': 'Share the moment', 'Chiếu bí trên Cờ Tướng 3D! Vào chơi: {0}': 'Checkmate in Xiangqi 3D! Come and play: {0}',
    'Đã lưu video; lời mời đã chép, dán kèm khi gửi': 'Video saved; the invitation is copied, paste it in when you send it', 'Đã lưu video': 'Video saved',
    // learning to play (lessons.js)
    'Học chơi': 'Learn to play', 'Học chơi · {0}': 'Learn to play · {0}', 'Đúng rồi!': 'That’s it!', 'Xong bài {0}!': 'Lesson done: {0}!', 'Làm lại': 'Again',
    '{0} · Bước {1}/{2}': '{0} · Step {1}/{2}', '{0} ✓': '{0} ✓', 'Chạm vào một quân để xem nó đi được những đâu.': 'Touch a piece to see where it can go.',
    'Chưa đúng, thử lại nhé': 'Not quite, try again', 'Bạn đã biết cách đi của mọi quân. Vào Chơi để đánh với máy!': 'You know how every piece moves. Go to Play and take on the computer!',
    'Mỗi bài một quân, vài bước nhỏ: chạm vào quân để xem nó đi được những đâu, rồi làm theo nhiệm vụ ở khung bên cạnh. Bài xong được đánh dấu ✓.':
      'One lesson for each piece, in a few small steps: touch a piece to see where it can go, then do the task in the panel beside. Lessons done are ticked ✓.',
    'Tướng đi ngang hay dọc từng ô theo đường kẻ, không ra khỏi cung (ô có gạch chéo). Đưa Tướng lên một ô.': 'The general moves one point along the lines, across or up and down, and never leaves the palace (the square with the cross). Move the general up one point.',
    'Lên phía trước một ô.': 'One point forward.',
    'Hai Tướng không được nhìn thẳng mặt nhau trên một cột trống: ô bên trái bị cấm vì Tướng đen ở cột đó. Đưa Tướng sang ngang về bên phải.': 'The two generals may never face each other on an open file: the point to the left is forbidden, Black’s general stands on that file. Move the general across to the right.',
    'Đi sang ngang, về bên phải.': 'Across, to the right.',
    'Sĩ đi chéo một ô trong cung. Tốt đen đang chiếu Tướng: dùng Sĩ ăn nó.': 'The advisor moves one point diagonally inside the palace. A black soldier is checking your general: take it with the advisor.',
    'Lần này hãy dùng Sĩ.': 'This time, use the advisor.',
    'Sĩ không bao giờ ra khỏi cung (ô có gạch chéo). Đưa Sĩ lên góc trên bên phải của cung.': 'The advisor never leaves the palace (the square with the cross). Move it to the palace’s top right corner.',
    'Tượng đi chéo đúng hai ô, như hai đường chéo của chữ điền 田. Ăn con Tốt đen.': 'The elephant moves exactly two points diagonally, like the diagonals of the character 田. Take the black soldier.',
    'Có quân đứng ở giữa đường chéo (mắt Tượng) thì Tượng không đi được về hướng đó. Tượng cũng không qua sông. Ăn quân Tượng còn với tới.': 'A piece in the middle of the diagonal (the elephant’s eye) blocks that way. The elephant never crosses the river either. Take the piece it can still reach.',
    'Tốt đỏ đang cản mắt Tượng về phía Mã đen.': 'The red soldier blocks the elephant’s eye towards the black horse.',
    'Mã đi một bước thẳng rồi một bước chéo, như chữ nhật 日. Ăn con Tốt đen.': 'The horse moves one point straight, then one diagonally, like the character 日. Take the black soldier.',
    'Có quân đứng sát Mã theo hướng đi (chân Mã) thì Mã không nhảy về hướng đó. Ăn con Tốt mà Mã còn với tới.': 'A piece right next to the horse in the way it goes (the horse’s leg) stops it jumping that way. Take the soldier it can still reach.',
    'Tốt đỏ đứng ngay trước Mã, chặn chân Mã đi lên.': 'The red soldier right in front of the horse hobbles it going up.',
    'Xe đi thẳng, dọc hay ngang, bao xa cũng được. Ăn con Tốt đen.': 'The chariot moves straight, up and down or across, as far as it likes. Take the black soldier.',
    'Xe không nhảy qua quân nào. Ăn quân Pháo đen.': 'The chariot never jumps over a piece. Take the black cannon.',
    'Tốt đỏ chặn đường ngang tới Mã đen.': 'The red soldier blocks the way across to the black horse.',
    'Pháo đi như Xe. Nhưng muốn ăn quân, Pháo phải nhảy qua đúng một quân ở giữa (ngòi). Ăn quân Mã đen.': 'The cannon moves like the chariot. But to take a piece it must jump over exactly one piece in between (the screen). Take the black horse.',
    'Không có ngòi thì Pháo không ăn được. Ăn quân Xe đen, Tốt đỏ làm ngòi.': 'Without a screen the cannon cannot take. Take the black chariot, with the red soldier as the screen.',
    'Giữa Pháo và Mã đen không có ngòi nào.': 'There is no screen between the cannon and the black horse.',
    'Tốt đi thẳng về phía trước từng ô một, không bao giờ lùi. Chưa qua sông thì chưa được đi ngang. Ăn con Tốt đen trước mặt.': 'The soldier moves straight ahead one point at a time and never back. Before the river it cannot go sideways. Take the black soldier in front.',
    'Tốt chưa qua sông nên chưa ăn ngang được.': 'The soldier has not crossed the river, so it cannot take sideways yet.',
    'Qua sông rồi, Tốt được đi thêm sang ngang. Ăn quân Mã đen bên cạnh.': 'Over the river, the soldier may also move sideways. Take the black horse beside it.',
    'Chiếu bí là chiếu Tướng mà Tướng không còn đường thoát: ai làm được là thắng. Một Xe giữ hàng dưới, Xe kia chiếu bí.': 'Checkmate is a check the general cannot escape: whoever gives it wins. One chariot holds the row below, the other gives mate.',
    'Tướng đen vẫn còn đường thoát.': 'Black’s general can still get away.',
    'Tốt cũng chiếu bí được khi có quân giữ cho nó. Đẩy Tốt chiếu bí.': 'Even a soldier can mate when another piece guards it. Push the soldier for checkmate.',
    // looks (skins.js)
    'Trang phục': 'Looks', 'Bàn cờ': 'Board', 'Quân cờ': 'Pieces', 'Chiến binh': 'Warriors',
    'Gỗ': 'Wood', 'Sơn mài': 'Lacquer', 'Ngọc bích': 'Jade', 'Đồng': 'Bronze', 'Ngà': 'Ivory', 'Ngọc': 'Jade', 'Gỗ mun': 'Ebony',
    'Tô màu': 'Painted', 'Tượng đồng': 'Bronze statues', 'Tượng vàng': 'Gold statues',
    'Đạt {0} thành tựu': 'Earn {0} achievements', 'Lọt vào top 10 một mùa giải xếp hạng': 'Finish in the top 10 of a ranked season',
    'Thành tựu Thất tinh: phá Chân Long Kỳ Trận 7 ngày liên tiếp': 'The Seven Stars achievement: break the True Dragon Formation 7 days in a row',
    'Thành tựu Thân kinh bách chiến: đánh 50 ván xếp hạng cờ tướng': 'The Veteran of a Hundred Battles achievement: play 50 ranked xiangqi games',
    'Trang phục này chưa mở khóa': 'This look is not unlocked yet',
    'Mở khóa bằng sao Chiến dịch, thành tựu và mùa giải xếp hạng. Chơi online, đối thủ thấy quân cờ và chiến binh của bạn; bàn cờ theo chủ phòng.':
      'Unlocked with Campaign stars, achievements and ranked seasons. Online, your opponents see your pieces and warriors; the board is the host’s.',

    // cờ úp (jieqi.js)
    'Cờ úp': 'Jieqi (face-down)', 'Kiểu cờ': 'Kind of game', 'Cờ úp · {0}': 'Jieqi · {0}', 'Bạn cầm quân {0} · Cờ úp': 'You play {0} · Jieqi',
    '2 người chơi · Cờ úp': '2 players · Jieqi', '{0}, lật {1}': '{0}, turns up {1}', '{0}, ăn {1} úp': '{0}, takes a face-down {1}',
    'Cờ úp: mọi quân trừ Tướng úp mặt, xáo lẫn trên các điểm xuất phát. Quân úp đi như quân vốn đứng ở điểm đó, đi rồi mới lật ra; Sĩ, Tượng đã lật đi được khắp bàn.':
      'Jieqi: every piece but the general starts face down, shuffled over the starting points. A face-down piece moves as the piece that starts on its point, and is turned up by that move; an advisor or elephant once turned up may go anywhere.',
  };

  // ---------- translating ----------
  // Vietnamese letters (a string without any is left alone, unless EN has it); not ü and the like (Lü Bu is English)
  const VI = /[àáâãèéêìíòóôõùúýăđĩũơưÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠƯẠ-ỹ]/;
  const esc = s => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const exact = new Map(), patterns = [];
  for (const [vi, en] of Object.entries(EN)) {
    if (!/\{\d\}/.test(vi)) { exact.set(vi, en); continue; }
    const re = new RegExp('^' + vi.split(/(\{\d\})/).map(p => (/^\{\d\}$/.test(p) ? '(.+?)' : esc(p))).join('') + '$');
    // dot: may match across a " · " (it has one of its own, or is a label "…: {0}" before whatever follows)
    patterns.push({ re, en, lit: vi.replace(/\{\d\}/g, '').length, dot: vi.includes(' · ') || /^[^{]+: \{0\}$/.test(vi) });
  }
  patterns.sort((a, b) => b.lit - a.lit);                 // the most specific first
  // moves in Vietnamese notation → WXF: piece, file (or + front, - rear), + forward, - back, = across, then the number
  const PIECE = { 'Tướng': 'K', 'Sĩ': 'A', 'Tượng': 'E', 'Mã': 'H', 'Xe': 'R', 'Pháo': 'C', 'Tốt': 'P' };
  const WHICH = { 'trước': '+', 'giữa': '=', 'sau': '-', 'tư': '4', 'năm': '5' }, ACT = { 'tiến': '+', 'thoái': '-', 'bình': '=' };
  const MOVE = /^(Tướng|Sĩ|Tượng|Mã|Xe|Pháo|Tốt) (\d|trước|giữa|sau|tư|năm) (tiến|thoái|bình) (\d)$/;
  // a Tam Quốc move: "Mã 2·3 → Ngô 5·1 ăn Xe"
  const SGMOVE = /^(Tướng|Sĩ|Tượng|Mã|Xe|Pháo|Tốt) (.+?) → (.+?)(?: ăn (Tướng|Sĩ|Tượng|Mã|Xe|Pháo|Tốt))?$/;
  function one(t) {
    if (exact.has(t)) return exact.get(t);
    let m = MOVE.exec(t);
    if (m) return WHICH[m[2]] ? `${WHICH[m[2]]}${PIECE[m[1]]}${ACT[m[3]]}${m[4]}` : `${PIECE[m[1]]}${m[2]}${ACT[m[3]]}${m[4]}`;
    if ((m = /^(Tướng|Sĩ|Tượng|Mã|Xe|Pháo|Tốt) úp (.+)$/.exec(t))) return '?' + one(m[1] + ' ' + m[2]);   // cờ úp: a face-down piece
    if ((m = SGMOVE.exec(t))) return `${EN[m[1]]} ${one(m[2])} → ${one(m[3])}${m[4] ? ` takes ${EN[m[4]].toLowerCase()}` : ''}`;
    if (!VI.test(t)) return t;
    const dotted = t.includes(' · ');
    for (const p of patterns) {
      if (dotted && !p.dot) continue;                       // a pattern without a · does not reach across one: the parts go one by one
      const g = p.re.exec(t);
      if (g) return p.en.replace(/\{(\d)\}/g, (_, i) => one(g[+i + 1].trim()));
    }
    // a Tam Quốc point "Ngô 5·1", or parts joined by " · "
    if ((m = /^(Thục|Ngô|Ngụy) (\d·\d)$/.exec(t))) return `${EN[m[1]]} ${m[2]}`;
    if (t.includes(' · ')) return t.split(' · ').map(x => one(x.trim())).join(' · ');
    return t;
  }
  const missing = new Set();
  function tr(s) {
    if (lang === 'vi' || typeof s !== 'string') return s;
    const t = s.trim();
    if (!t || (!VI.test(t) && !exact.has(t))) return s;
    const out = one(t);
    if (VI.test(out)) missing.add(t);
    return out === t ? s : s.replace(t, out);
  }

  // ---------- the page ----------
  const ATTRS = ['title', 'aria-label', 'placeholder'];
  function walk(n) {
    if (n.nodeType === 3) { const v = n.nodeValue, t = tr(v); if (t !== v) n.nodeValue = t; return; }
    if (n.nodeType !== 1 || n.nodeName === 'SCRIPT' || n.nodeName === 'STYLE' || n.closest('[translate="no"]')) return;
    for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v); if (t !== v) n.setAttribute(a, t); }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c);
  }
  function start() {
    document.documentElement.lang = lang;
    if (lang === 'vi') return;
    document.title = 'Xiangqi 3D';
    walk(document.body);
    new MutationObserver(list => {
      for (const r of list) {
        if (r.type === 'childList') r.addedNodes.forEach(walk);
        else if (r.type === 'characterData') walk(r.target);
        else if (r.type === 'attributes') { const v = r.target.getAttribute(r.attributeName), t = tr(v); if (t !== v) r.target.setAttribute(r.attributeName, t); }
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function setLang(l) { try { localStorage.setItem(KEY, l); } catch (e) { } location.reload(); }
  start();
  // the switch in the top bar names the other language
  const b = document.getElementById('bLang');
  if (b) { b.textContent = lang === 'vi' ? 'EN' : 'VI'; b.addEventListener('click', () => setLang(lang === 'vi' ? 'en' : 'vi')); }
  return { get lang() { return lang; }, tr, setLang, missing };
})();
