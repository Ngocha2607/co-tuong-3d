// daily.js — the daily puzzle, Chân Long Kỳ Trận (真龍棋陣, the true dragon's chess formation: one to break each day): one position a day for everyone, the same all over Vietnam's day
// (UTC+7). Red to move and checkmate within n moves against the computer's best defence. The puzzles were found by
// test/gen-daily.js and are proven by test/daily.test.js like the campaign's: checkmate in exactly n against every
// defence, no win in fewer, one first move that works. After the last one the list starts again.
// Shared by the page and the Worker (which replays a solution with CAMPAIGN.judge before it goes on the board).
'use strict';
const DAILY = (() => {
  // [FEN, n, tier]: mate in n; tier 2 (Đại sư) for a mate in 5 or 6, or a first move a shallow search (4 plies) does
  // not find, else 1 (Cao thủ). The masters' formations are spread evenly through the days.
  const PUZZLES = [
    ['3ak4/4a4/9/9/2b3b2/2p4R1/7r1/5R3/9/3AK4 w', 4, 1],   // Xe 2 thoái 1 (ăn quân)
    ['2bNCa3/3k5/9/3P5/2b6/4R4/9/3A4p/9/3K5 w', 4, 1],   // Pháo 5 thoái 4
    ['3Nka3/9/c8/9/9/9/1R7/4N4/3K5/9 w', 4, 1],   // Mã 6 thoái 7
    ['9/5k3/4ba3/1N3P3/3R5/c8/9/5p3/9/4K4 w', 4, 1],   // Tốt 4 tiến 1 (thí quân) (chiếu) (ăn quân)
    ['9/3ka4/9/3C5/6b1R/R8/9/3ARK3/6p2/1r7 w', 4, 1],   // Xe 5 tiến 6 (thí quân) (chiếu) (ăn quân)
    ['5k2N/9/4ba3/9/1C3R3/9/8P/5K3/2p6/9 w', 4, 2],   // Mã 1 thoái 3
    ['4N4/5k3/b3ba3/9/4R4/9/2c6/4R2p1/3K5/9 w', 4, 1],   // Xe trước tiến 2 (ăn quân)
    ['1n3a2n/5k3/b1R2a3/5N3/9/4p4/5R3/3A5/9/5K3 w', 4, 1],   // Xe 7 bình 4 (thí quân) (chiếu) (ăn quân)
    ['3kNa3/P3a4/9/5n3/9/4N1R2/9/9/4K4/9 w', 4, 1],   // Mã sau tiến 4 (ăn quân)
    ['3a5/3k2c2/9/9/2bNR4/3N5/9/9/4K4/9 w', 4, 1],   // Mã trước tiến 7
    ['7C1/3Nk4/b8/7N1/9/7n1/9/3K5/9/9 w', 4, 1],   // Pháo 2 thoái 5 (ăn quân)
    ['6P2/R3a4/3k3n1/9/2b6/5R3/9/3n1K3/4A4/9 w', 4, 1],   // Xe 9 bình 5 (ăn quân)
    ['5a3/9/4k4/9/4N4/9/9/5A3/4K3R/n8 w', 4, 1],   // Xe 1 tiến 5
    ['2b4R1/3ka4/C8/9/2b6/N8/C8/9/8n/4K4 w', 4, 1],   // Mã 9 tiến 7 (ăn quân)
    ['5k3/5N3/5a2b/9/9/4p4/R5N2/4K4/9/7n1 w', 4, 1],   // Mã 4 thoái 6
    ['6R2/3k5/3cRa3/4P4/4P4/4n4/9/2c6/9/4K4 w', 4, 1],   // Xe 5 bình 6 (thí quân) (chiếu) (ăn quân)
    ['6b2/R8/5k3/9/2b2c3/9/9/9/9/4K4 w', 5, 2],   // Xe 9 thoái 2
    ['5k3/4a1N2/9/9/1R3Nb2/9/9/9/2p6/3K5 w', 4, 1],   // Mã 4 tiến 6
    ['3a5/9/3k1a3/9/4PR3/3p2N2/9/9/9/4K4 w', 4, 1],   // Tốt 5 tiến 1
    ['9/3k5/R2abN3/9/6n2/p1r2N1p1/5R3/5A2N/p2c3p1/4K4 w', 4, 1],   // Xe 9 bình 6 (thí quân) (chiếu) (ăn quân)
    ['3a1a3/9/3k4b/9/9/9/9/2r1Rc2N/4K4/1c7 w', 4, 1],   // Xe 5 bình 7 (ăn quân)
    ['6b2/2P1k4/4N4/9/9/2R6/4p4/9/2c1K4/9 w', 4, 1],   // Tốt 7 bình 6 (thí quân) (chiếu)
    ['9/4k4/b3b1n1R/8R/9/7p1/8N/9/9/3K5 w', 4, 1],   // Xe trước bình 3 (ăn quân)
    ['5kb2/3Na4/5a3/C6R1/9/9/9/c8/7p1/3AK4 w', 4, 1],   // Xe 2 tiến 3
    ['3k5/4a3C/b3b4/9/3N1P1R1/4c4/9/9/4AK3/9 w', 4, 1],   // Mã 6 tiến 5 (ăn quân)
    ['3k2b1N/9/3ab2R1/9/9/6R2/r8/3K5/9/9 w', 4, 1],   // Xe 3 tiến 5 (thí quân) (chiếu) (ăn quân)
    ['9/rn2k4/4b4/R8/9/9/9/R8/4K4/9 w', 4, 1],   // Xe trước tiến 2 (ăn quân)
    ['3a5/4N4/4k4/7c1/2p1P1C2/2N6/9/3K5/9/9 w', 4, 1],   // Mã 5 tiến 3
    ['3a5/4k4/2P6/9/7R1/8p/9/9/4A4/5K3 w', 4, 2],   // Tốt 7 bình 6
    ['3a5/3k2N2/b2a2R2/2c6/3N5/4R2p1/9/9/2p6/3K5 w', 4, 1],   // Mã 6 tiến 4
    ['3aka3/N8/6P2/9/6p2/9/9/8R/9/5K3 w', 4, 1],   // Mã 9 thoái 8
    ['2ba1k2P/4P4/3a4b/9/9/5N1N1/9/4K4/9/4c4 w', 4, 1],   // Tốt 5 bình 4 (thí quân) (chiếu)
    ['2bk5/7R1/3aPc3/9/9/7N1/9/9/3c5/4K4 w', 4, 1],   // Tốt 5 bình 6 (ăn quân)
    ['3k5/2N1a4/9/9/3P2C2/9/9/9/9/4K2n1 w', 4, 1],   // Tốt 6 tiến 1
    ['2r1k4/3P5/3aC4/9/6b2/9/9/6R2/9/n4K3 w', 4, 1],   // Pháo 5 thoái 7
    ['6C2/3k5/2cab4/2R6/3R5/9/9/5A3/8N/2n1K4 w', 4, 1],   // Xe 6 tiến 2 (thí quân) (chiếu) (ăn quân)
    ['3a5/4P4/3k1a3/C7N/N5c2/9/9/9/4K4/9 w', 4, 1],   // Mã 1 thoái 3 (ăn quân)
    ['9/1Rc1a4/3k1a3/9/5c3/8P/8C/4KR3/9/N4A3 w', 4, 1],   // Xe 4 tiến 3 (ăn quân)
    ['9/5k3/b3baP2/1r7/9/3R5/9/1N7/9/4K4 w', 4, 1],   // Tốt 3 bình 4 (thí quân) (chiếu) (ăn quân)
    ['1N3N3/5rR2/3kb3r/N8/p8/7p1/9/9/4K4/9 w', 5, 2],   // Xe 3 bình 4 (ăn quân)
    ['4k4/9/b1Pa4b/8R/9/8C/9/p8/9/2p2K3 w', 4, 1],   // Tốt 7 bình 6 (ăn quân)
    ['3a1ab2/4k1n2/4b4/9/5R3/5N3/R8/3A5/9/3K5 w', 4, 1],   // Xe 4 tiến 4 (ăn quân)
    ['5a3/5k3/9/1N2p4/9/2n6/9/1C1AR3p/4K4/9 w', 4, 1],   // Xe 5 tiến 4 (ăn quân)
    ['9/4a1NR1/3k2N2/9/7r1/9/1n7/9/9/5K3 w', 4, 1],   // Xe 2 thoái 3 (ăn quân)
    ['2bk1a3/9/9/3N5/p5b2/8N/9/7R1/3K5/9 w', 4, 1],   // Xe 2 bình 6
    ['2b2k3/1N7/8b/9/6N2/9/1C7/9/9/pc2K4 w', 4, 1],   // Mã 8 thoái 7
    ['9/5N3/3ak4/6rr1/6b2/9/2R6/6N1R/5K3/9 w', 4, 1],   // Mã 4 thoái 3 (thí quân) (chiếu) (ăn quân)
    ['3kN4/4a4/9/9/9/5C3/r7R/3A5/9/p3K4 w', 4, 1],   // Xe 1 bình 9 (ăn quân)
    ['3k2N2/7cR/9/9/9/9/7N1/5A3/2c2K3/4p4 w', 4, 1],   // Mã 3 thoái 4
    ['N2a5/1c3k3/3ab4/5P2R/2c6/9/9/2N6/4K4/9 w', 4, 1],   // Tốt 4 tiến 1 (thí quân) (chiếu)
    ['3anC3/4k4/9/7P1/2b6/4N3R/9/5K3/9/9 w', 4, 2],   // Mã 5 tiến 7 (ăn quân)
    ['3ak4/9/4c4/2N6/4R3P/2p6/9/9/9/5K3 w', 4, 1],   // Mã 7 tiến 5 (ăn quân)
    ['P3k4/3ra4/b7b/6N2/5R3/3R5/9/3K5/9/9 w', 4, 1],   // Xe 6 tiến 4 (ăn quân)
    ['9/C1P1rk3/R4a3/9/9/9/9/4N4/9/3K5 w', 4, 1],   // Tốt 7 bình 6
    ['2b3R2/N2ka4/3a5/9/2b6/9/9/5A2n/9/4K4 w', 4, 1],   // Mã 9 tiến 7 (ăn quân)
    ['3a5/9/4Nk3/9/6c2/R8/9/9/3KA4/8c w', 4, 1],   // Mã 5 tiến 6 (ăn quân)
    ['5k3/4N1P2/3a5/9/3R5/8n/N5r2/7C1/9/4K4 w', 4, 1],   // Tốt 3 tiến 1 (thí quân) (chiếu)
    ['1R3N3/2R1ak3/9/9/8c/2c6/9/9/2n6/3K5 w', 4, 1],   // Xe 7 bình 5 (thí quân) (chiếu) (ăn quân)
    ['R3Ra3/4akC2/4b4/9/9/1r7/9/1R2K4/4c4/9 w', 4, 1],   // Xe 8 tiến 2 (ăn quân)
    ['3a2b2/1N3k3/9/5c3/5R3/3C5/9/N8/3K5/9 w', 4, 1],   // Tướng 6 bình 5
    ['2P6/3k5/5a3/4P4/5Rp2/9/9/2c6/1p2p4/p4K3 w', 4, 1],   // Tốt 5 tiến 1
    ['3a1kbR1/9/9/1P7/9/3N5/9/3K1A3/9/Nnp6 w', 4, 1],   // Mã 6 tiến 5
    ['1c1a2b2/4k4/9/5P3/9/5p3/2R6/5R3/3KA4/9 w', 4, 2],   // Xe 4 bình 6
    ['4k4/4a4/5a3/1N7/1R7/5cP2/9/4R4/4K4/3c5 w', 4, 1],   // Xe 5 tiến 6 (thí quân) (chiếu) (ăn quân)
    ['9/4a4/5k3/N4c3/2b6/1R3p3/9/1C1AK4/9/9 w', 4, 1],   // Xe 8 bình 4 (ăn quân)
    ['5aN2/4a4/3k5/9/6R2/9/9/9/5K3/4c4 w', 4, 1],   // Tướng 4 bình 5
    ['9/5k3/5a3/9/2RN5/5c3/9/N8/4K2p1/9 w', 4, 1],   // Mã 6 thoái 4 (ăn quân)
    ['1N3ab2/3P1k3/5a3/9/9/9/R8/9/c8/3K5 w', 4, 1],   // Mã 8 thoái 7
    ['2b6/4a4/3k5/3c5/9/N8/9/4K4/5R3/9 w', 4, 1],   // Xe 4 bình 6
    ['R2a1kb2/4a4/9/9/9/9/8R/4K4/2r6/5A3 w', 4, 1],   // Xe 9 bình 6 (thí quân) (chiếu) (ăn quân)
    ['7R1/3ka4/9/p8/5n1R1/9/9/9/c2N5/4K4 w', 4, 1],   // Xe sau bình 4 (ăn quân)
    ['5k2N/4a4/b4a3/4P4/1N4b2/9/C8/3p1A3/5K3/9 w', 4, 1],   // Mã 1 thoái 3
    ['3a5/3k5/N4a2R/9/9/1n1c5/9/3AN2C1/9/4K4 w', 4, 1],   // Mã 5 tiến 6 (ăn quân)
    ['5a3/4k1P2/P4a3/2R6/2b6/9/5p3/9/3KA4/9 w', 4, 2],   // Xe 7 thoái 1 (ăn quân)
    ['9/4ak3/1R1a2N2/1N7/1c7/1N7/9/5pp2/4K4/3c5 w', 4, 1],   // Mã trước tiến 6 (thí quân) (chiếu) (ăn quân)
    ['3aca3/5k3/8b/1P2R4/9/9/4R4/9/4K4/9 w', 4, 1],   // Xe trước tiến 3 (ăn quân)
    ['3a5/4k4/4b4/4R4/9/1N4c2/3N5/1c4R2/9/5K3 w', 4, 1],   // Xe 5 tiến 1 (thí quân) (chiếu) (ăn quân)
    ['9/3k5/2Paba3/8R/7c1/9/1nR2R3/9/4K4/3A5 w', 4, 1],   // Tốt 7 bình 6 (thí quân) (chiếu) (ăn quân)
    ['4k1Nr1/4a4/7R1/9/1n3Rc2/9/9/3K5/9/9 w', 4, 1],   // Mã 3 thoái 4 (thí quân) (chiếu)
    ['9/9/2Nkba3/4NR3/2b6/c8/7R1/5K3/2n6/9 w', 4, 1],   // Mã 5 thoái 7 (thí quân) (chiếu) (ăn quân)
    ['5rP2/3k5/3a3Nb/9/7N1/9/8R/4K4/9/9 w', 4, 1],   // Tốt 3 bình 4 (ăn quân)
    ['N2ak4/2R6/4b4/9/6b2/6p2/5p3/4R4/9/5K3 w', 4, 1],   // Xe 7 bình 4
    ['9/9/1R1aka3/9/9/R5r2/9/8p/5K3/2c6 w', 4, 1],   // Xe 9 bình 3 (ăn quân)
    ['3ak4/4a4/1N7/3r5/6b2/9/p3R4/4K3p/9/6pp1 w', 4, 1],   // Mã 8 thoái 6 (ăn quân)
    ['9/2N2k3/3a5/6p2/9/1N7/1R1r5/9/4K4/5A3 w', 4, 1],   // Xe 8 bình 6 (ăn quân)
    ['3k1a3/2R6/b7N/9/9/9/2c6/2N6/2p6/4K4 w', 5, 2],   // Xe 7 thoái 5 (ăn quân)
    ['4Na3/4k4/9/4N4/7N1/9/2n3p2/9/9/3K5 w', 4, 1],   // Mã trước thoái 7
    ['1r1k5/3Na4/3N5/9/9/9/4p4/9/9/2p1K1R2 w', 4, 1],   // Mã trước tiến 8 (ăn quân)
    ['3a1a3/5k2P/b4N2b/9/R8/9/9/9/5K2c/9 w', 4, 1],   // Xe 9 bình 4
    ['3ak4/2NN4R/4ba3/9/2b6/9/3c5/4c4/5K3/9 w', 4, 1],   // Mã 7 thoái 6
    ['3aNk3/9/5a2b/9/9/R8/9/3N5/4K4/9 w', 4, 1],   // Mã 5 thoái 4 (ăn quân)
    ['2bk1a1R1/4a4/b8/1R7/9/5c3/9/9/9/4K4 w', 4, 1],   // Xe 2 bình 4 (thí quân) (chiếu) (ăn quân)
    ['N1b1kan2/9/4baN2/9/9/6C2/9/8R/6c2/1N2K4 w', 4, 1],   // Pháo 3 tiến 5 (thí quân) (chiếu) (ăn quân)
    ['3a5/3k5/1n2Pa3/9/9/9/9/4c1R2/9/4K4 w', 4, 1],   // Xe 3 bình 5 (ăn quân)
    ['3k5/2R1a4/7R1/9/2b6/9/5c3/9/8N/4cK3 w', 4, 1],   // Xe 7 bình 5 (ăn quân)
    ['3a5/3k4N/9/9/9/3p5/8R/3K5/9/3A5 w', 4, 1],   // Mã 1 thoái 3
    ['4R4/N3a4/1r1k4b/4n4/6b2/Nn7/9/8R/9/5K3 w', 4, 2],   // Xe 5 thoái 1 (ăn quân)
    ['5k3/R5N2/5a3/6p2/9/9/8p/5K3/2N6/8n w', 4, 1],   // Xe 9 thoái 1
    ['5a3/4Ck3/9/R4N3/9/9/9/5K3/9/4c4 w', 4, 1],   // Tướng 4 bình 5
    ['n2k2b2/3C5/5a2b/6R2/1P7/9/9/7R1/3K5/9 w', 4, 1],   // Xe 2 tiến 6
    ['4k4/N2ra4/3a1R2b/8p/9/7c1/7R1/4K4/1C7/9 w', 4, 1],   // Xe 2 tiến 1 (ăn quân)
    ['6P2/4a4/3k5/9/2bN5/9/2N2r3/5R1p1/2rNK4/9 w', 4, 1],   // Mã trước tiến 4 (thí quân) (chiếu)
    ['2C2k3/2N1a4/6R2/6r2/2b6/1C7/9/3A5/3c5/3K5 w', 4, 1],   // Xe 3 thoái 1 (ăn quân)
    ['5k3/4a4/P2ab4/9/8N/9/9/Rp4R2/9/4K4 w', 4, 1],   // Xe 9 bình 8 (ăn quân)
    ['3aC2n1/4ak3/9/2R2N3/9/9/9/9/4K4/9 w', 4, 1],   // Mã 4 tiến 6 (thí quân) (chiếu)
    ['N3Nk3/9/3a5/9/9/8r/9/5A2R/4K4/9 w', 4, 1],   // Xe 1 tiến 2 (ăn quân)
    ['2P6/3ka4/b2a5/2n3R2/9/9/9/6R2/7p1/3K5 w', 4, 1],   // Xe trước bình 7 (ăn quân)
    ['c1ba2b2/3k5/3a5/9/2c1R4/6R2/9/5A3/9/4K4 w', 4, 1],   // Xe 5 bình 7 (ăn quân)
    ['4kaN2/9/3a5/9/9/1N7/rR7/9/9/3K5 w', 4, 2],   // Xe 8 bình 9 (ăn quân)
    ['5k3/4a1N2/9/5PC2/6b1P/9/9/9/4K1p2/9 w', 4, 1],   // Pháo 3 thoái 5 (ăn quân)
    ['R1b4P1/N8/4ka3/8p/9/9/9/9/3p1K3/9 w', 4, 1],   // Mã 9 tiến 7 (ăn quân)
    ['9/4ak3/b4a3/5R3/9/4N4/1R7/9/9/1p3Kc2 w', 4, 1],   // Xe 8 tiến 5
    ['3k2b1R/9/3a1a2c/9/6b1C/5R3/6p2/3K5/9/9 w', 4, 1],   // Xe 4 tiến 3 (ăn quân)
    ['5a3/5k3/3a5/3C1PP2/2c6/9/6N2/4K4/9/9 w', 4, 1],   // Pháo 6 thoái 1
    ['2b5n/4a4/3aNk3/4N4/7r1/2R6/9/9/4K4/9 w', 4, 1],   // Mã sau thoái 3 (thí quân) (chiếu)
    ['5k3/3n5/bR1aRa3/6P2/3C5/9/2N6/3A5/4K3n/9 w', 4, 1],   // Xe 8 tiến 2 (thí quân) (chiếu)
    ['4k1N2/R3ac3/b7b/1C7/2N6/9/9/3A5/n3pNp1r/3K5 w', 4, 1],   // Mã 7 tiến 6 (thí quân) (chiếu)
    ['5k3/1R2a4/4N3b/4p4/2b4n1/8C/9/1R3N3/5K3/9 w', 4, 1],   // Xe trước bình 5 (ăn quân)
    ['3k1r3/4a4/9/9/9/5R2R/1N7/1p7/4K4/9 w', 4, 1],   // Xe 4 tiến 5 (thí quân) (chiếu) (ăn quân)
    ['9/3k5/b1Na5/N8/6b2/1N1p5/9/4K4/1c7/5A3 w', 5, 2],   // Mã 7 tiến 8 (thí quân) (chiếu)
    ['5R3/4a1N2/3k3C1/4c4/9/8r/9/5K3/9/3A5 w', 4, 1],   // Mã 3 thoái 5 (thí quân) (chiếu)
    ['2b1k4/3NN4/5a3/2c5p/7R1/9/9/9/9/5K3 w', 4, 1],   // Mã 5 thoái 6
    ['2bk1aN2/9/8b/4R4/7N1/6r2/6c2/9/5K3/9 w', 4, 1],   // Mã 3 thoái 4
    ['2bak2N1/9/4b4/9/9/6CR1/9/5K3/5p3/9 w', 4, 1],   // Mã 2 thoái 3
    ['9/5k3/3ab3R/9/9/1N7/9/1n1AK1p2/4R4/1c7 w', 4, 1],   // Xe 1 bình 4 (thí quân) (chiếu)
    ['4Nk3/9/5aP2/P8/2b3b2/9/9/9/3p5/5K3 w', 4, 1],   // Mã 5 thoái 6
    ['C2k5/9/3ab4/4R3R/9/9/1p7/4K4/9/5A1c1 w', 4, 1],   // Xe 5 tiến 1 (ăn quân)
    ['3k5/9/3a5/3R5/4N1b2/6N2/6n2/9/9/5K3 w', 4, 1],   // Mã 5 tiến 4
    ['5k3/9/3a1a3/5NN2/2bN5/n5p2/9/5A3/9/3K5 w', 4, 1],   // Mã 4 tiến 6 (ăn quân)
    ['2bk5/9/4baR2/1P7/7n1/9/8R/3CK4/9/9 w', 4, 1],   // Xe 3 tiến 2 (thí quân) (chiếu)
    ['3ak4/4a4/c5P2/9/6R2/9/6N2/9/9/4K4 w', 5, 2],   // Tốt 3 bình 4
    ['9/5k3/5aN2/5N3/9/9/9/5K3/9/6p2 w', 4, 1],   // Tướng 4 bình 5
    ['5k3/P5N2/5a2b/9/9/7R1/9/5K3/9/5Ac2 w', 4, 1],   // Xe 2 bình 4
    ['7n1/4ak3/3a5/7C1/3RN4/9/c8/9/4K4/9 w', 4, 1],   // Mã 5 tiến 6 (thí quân) (chiếu) (ăn quân)
    ['6R2/3k5/3a5/n6Pp/6b2/4N4/9/9/9/4K4 w', 4, 1],   // Mã 5 tiến 3 (ăn quân)
    ['2b6/4k1P2/2R2a3/9/9/2P5R/p6c1/9/5K3/8n w', 4, 1],   // Tốt 3 bình 4 (thí quân) (chiếu)
    ['2b6/5N3/NN1aka3/9/9/2N6/9/9/2n6/3K1A3 w', 4, 1],   // Mã 8 tiến 7 (ăn quân)
    ['4k2c1/4a2N1/b2a3RR/9/9/9/9/2p2K3/9/3p5 w', 4, 1],   // Mã 2 thoái 4 (thí quân) (chiếu)
    ['3a5/3c5/4k3b/6P2/3R5/9/3R5/9/3K4c/9 w', 4, 1],   // Xe trước tiến 3 (ăn quân)
    ['1R1P5/3k5/5a3/9/9/6N2/2p6/9/5K3/9 w', 4, 1],   // Mã 3 tiến 5
    ['2Na5/4ak3/3c5/2N6/2P4n1/9/R8/5A3/9/4K4 w', 4, 1],   // Mã trước thoái 6 (thí quân) (chiếu) (ăn quân)
    ['5k3/4a4/b8/9/2N6/9/9/1R7/5c3/4K4 w', 4, 1],   // Mã 7 tiến 6 (thí quân)
    ['5k2C/9/b4ac1b/r8/1c3RN2/9/9/R8/9/5K3 w', 4, 2],   // Mã 3 tiến 4 (ăn quân)
    ['4k4/4a4/9/9/2r3N2/9/N1R6/2p6/4K4/9 w', 4, 1],   // Xe 7 tiến 2 (ăn quân)
    ['3a5/5k2N/b2R5/9/4p4/5N3/P8/7p1/9/5K3 w', 4, 1],   // Xe 6 tiến 2 (ăn quân)
    ['5k3/4a4/3a5/2R6/9/5p2N/7NN/9/9/4K4 w', 4, 1],   // Mã 2 tiến 4 (ăn quân)
    ['3k2N2/4a4/b8/9/8R/6c2/9/3p3p1/9/4K4 w', 4, 1],   // Mã 3 thoái 4 (thí quân)
    ['2b6/9/5kC2/1P7/2b5N/9/9/9/2p3p2/4K4 w', 4, 1],   // Pháo 3 bình 1
    ['3a5/4k4/5R3/9/4N1c2/3R5/1p3n3/4K4/9/9 w', 4, 1],   // Xe 6 tiến 4 (thí quân) (chiếu)
    ['2bk5/3N2N2/c4aR2/2n6/2b6/9/1R7/9/9/4K4 w', 4, 1],   // Mã 6 thoái 7 (ăn quân)
    ['3a2b2/3kN4/9/9/2b6/9/7c1/R4K3/7N1/9 w', 4, 1],   // Mã 5 thoái 4
    ['2b6/4a4/3k5/1P7/2b6/6c1R/9/R3p4/9/4K4 w', 4, 1],   // Xe 9 bình 5 (ăn quân)
    ['6bN1/r8/5k2b/9/9/9/1p3p3/8R/1p7/2R2K3 w', 4, 1],   // Xe 1 tiến 5 (thí quân) (chiếu) (ăn quân)
    ['7R1/R3a3N/b3k4/9/6p2/1r1c2C2/9/9/3K5/3A5 w', 4, 2],   // Pháo 3 bình 8 (ăn quân)
    ['5k3/2N6/5a3/9/P5b1C/9/9/1C3p2R/4K4/1n7 w', 4, 1],   // Xe 1 bình 4 (ăn quân)
    ['9/9/4ka3/2r5R/4nr3/9/2R6/9/7R1/3K5 w', 4, 1],   // Xe 1 bình 5 (thí quân) (chiếu)
    ['5a3/5k3/2R3r1b/9/9/9/3p5/6R2/4A4/4K4 w', 4, 1],   // Xe 3 tiến 5 (ăn quân)
    ['6C2/4ak3/b8/3c1N3/9/N7R/9/5A3/9/4K1n2 w', 4, 1],   // Mã 4 tiến 6 (thí quân) (chiếu)
    ['3a2b2/5k3/9/1C1N5/2b6/1r4R2/9/3A5/3K1p3/9 w', 4, 1],   // Xe 3 bình 8 (ăn quân)
    ['3a1kC2/9/b5P1R/9/6b2/9/9/3A5/4K4/9 w', 4, 1],   // Pháo 3 thoái 4 (ăn quân)
  ];
  const DAY = 86400000, TZ = 7 * 3600000;
  const EPOCH = Math.floor(Date.UTC(2026, 10, 1) / DAY);   // 1 November 2026: puzzle Số 1
  const dayOf = (ms = Date.now()) => Math.floor((ms + TZ) / DAY);
  const at = day => PUZZLES[(((day - EPOCH) % PUZZLES.length) + PUZZLES.length) % PUZZLES.length];
  // the puzzle of a day as a campaign battle, so CAMPAIGN.judge decides it and the page plays it like one
  function level(day) {
    const [fen, n, tier] = at(day);
    return { id: 'daily', daily: true, day, no: day - EPOCH + 1, name: `Chân Long Kỳ Trận · Trận ${day - EPOCH + 1}`, type: 'mate', n, tier, side: 1, ai: 'hard', fen };   // the longest think short of the side stories: a long mate needs a stubborn defence
  }
  // how hard a formation is: every one is for strong players, the masters' ones more so
  const rank = tier => (tier >= 2 ? 'Bậc Đại sư' : 'Bậc Cao thủ');
  const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  function dateText(day) {
    const d = new Date(day * DAY);
    return `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
  }
  // days solved in a row, up to today (or up to yesterday while today's is still to do)
  function streak(days, today = dayOf()) {
    const set = new Set(days);
    let d = set.has(today) ? today : today - 1, n = 0;
    while (set.has(d)) { n++; d--; }
    return n;
  }
  // ms until the next puzzle
  const untilNext = (ms = Date.now()) => (dayOf(ms) + 1) * DAY - TZ - ms;
  const clock = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  return { PUZZLES, EPOCH, dayOf, level, rank, dateText, streak, untilNext, clock };
})();
if (typeof module === 'object' && module.exports) module.exports = DAILY;
