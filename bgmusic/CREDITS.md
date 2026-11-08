# Games panel background music

Instrumental jazz / latin / electronic / upbeat tracks for the Games panel
(`src/components/Games/GameMusic.tsx`), all by Alex Morgan, hand-picked (2026-11-08 - replaced
the earlier house/trance/jazz set entirely). Free to use without attribution under the Pixabay
Content License - credited here anyway.

## Layout

- `jazz/`, `latin/`, `electronic/`, `upbeat/` - the subfolder is the genre shown in the player.
- Files are named `Artist - Title.opus`; the player shows "Title" over "Artist". Titles come from
  the Pixabay download filenames (`alex-morgan-<title>-<id>.mp3`) - the files carry no tags.
- Re-encoded from the original MP3s to Opus 112kbps, metadata stripped
  (`ffmpeg -vn -map_metadata -1 -c:a libopus -b:a 112k`) to keep the bundle small.
- Album art: drop a `.jpg` / `.png` / `.webp` with the same base name next to a track
  (`jazz/Alex Morgan - Acid Jazz Groove.jpg`) and the player shows it; otherwise it shows Gus in
  headphones.
- New downloads: stage them in `/bgmusic-incoming/` (gitignored), not here - everything under
  `bgmusic/` with an audio extension is bundled into the app.

## Pixabay (Pixabay Content License)

| File | Pixabay id |
|---|---|
| electronic/Alex Morgan - Chillstep | 601097 |
| electronic/Alex Morgan - Dark Electronic | 601096 |
| electronic/Alex Morgan - Focus Music | 601104 |
| electronic/Alex Morgan - UK Garage | 601105 |
| jazz/Alex Morgan - Acid Jazz Cafe Lounge Groove | 573653 |
| jazz/Alex Morgan - Acid Jazz Groove | 517096 |
| jazz/Alex Morgan - Big Band Rainy Night | 552786 |
| jazz/Alex Morgan - Big Band Sunny Cafe | 552776 |
| jazz/Alex Morgan - Chill Jazz Rainy Night Music | 564273 |
| jazz/Alex Morgan - Funky Jazz Cocktail Bar Music | 564282 |
| jazz/Alex Morgan - Groovy Jazz Restaurant Music | 564285 |
| jazz/Alex Morgan - Lofi Jazz Swing Cocktail Bar | 560067 |
| jazz/Alex Morgan - Nu Lounge Chill | 587425 |
| jazz/Alex Morgan - Smooth Jazz Cocktail Bar | 568176 |
| jazz/Alex Morgan - Smooth Jazz Restaurant | 568175 |
| jazz/Alex Morgan - Smooth Jazz Sunny Cafe | 568177 |
| jazz/Alex Morgan - Soul Jazz Cocktail Bar | 568178 |
| jazz/Alex Morgan - Soul Jazz Midnight Club | 568183 |
| jazz/Alex Morgan - Soul Jazz Rainy Night | 568174 |
| jazz/Alex Morgan - Soul Jazz Study Session | 568182 |
| latin/Alex Morgan - Latin Jazz Jam Restaurant | 560054 |
| latin/Alex Morgan - Latin Jazz Rhythm Midnight Club | 560052 |
| latin/Alex Morgan - Latin Jazz Solo Sunny Cafe | 560053 |
| latin/Alex Morgan - Samba Jazz Cocktail Bar | 567546 |
| latin/Alex Morgan - Samba Jazz Midnight Club | 567543 |
| latin/Alex Morgan - Samba Jazz Study Session | 567536 |
| upbeat/Alex Morgan - Detective | 587423 |
| upbeat/Alex Morgan - Fashion Runway Catwalk Strut | 578499 |
| upbeat/Alex Morgan - Surf Rock | 591326 |
| upbeat/Alex Morgan - Quick Cuts | 573932 |
| upbeat/Alex Morgan - Sunny Travel Diary | 578504 |

Some titles are shortened from the Pixabay originals (the id is the source of truth): "Nu Lounge
Chill" = "Lounge Chill Nu Jazz Restaurant", "Quick Cuts" = "Video Editing Vlog Edit Pack", "Sunny
Travel Diary" = "Vlog Sunny Travel Diary".
