-- The looks a player picked (src/skins.js) for the board, their pieces and their warriors, packed as
-- 'board/pieces/army', so they follow the player to another device and are shown to the others in a room
-- (NULL = never saved). A look is accepted only once earned.
ALTER TABLE users ADD COLUMN skin TEXT;
