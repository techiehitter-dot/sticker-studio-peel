Run:
  npm install
  npm run dev

iPhone / Xcode:
  npm run ios:sync
  npm run ios:open

The iOS wrapper is in ios/. Open ios/App/App.xcodeproj on a Mac, choose an
iPhone simulator or connected device, then Run. The bundle identifier is
com.peelandplace.stickerstudio; change it in Xcode before App Store release.

Pages:
  /            sticker book (holo foil)
  /room.html   cosy cottage room (Cottage + Kitchen tabs, gloss only)
Pack opening (on /):
  "Open a pack" opens the Kawaii Unicorns pack. Pull the RIP HERE strip to tear it,
  slide the wrapper down off screen, then add the 12 stickers to your library.
  Collected stickers are saved in localStorage (key: peel-library-v1).
  Packs are defined in src/stickers.js (PACKS). Pack art: public/pack, stickers: public/unicorns.
Scrapbook (on /):
  Drag a lower corner of the page across to turn it. Turning past the last page adds a blank one.
  Each sticker is placed once; placed stickers stay on their page (localStorage key: peel-book-v1).
  Pages turn with the same peel as the stickers, a little heavier: pull a lower corner across.
  Page numbers sit in the bottom-left corner. The dog-eared corners show where to grab.
  Turns go right to left only. Turned pages stay on the left, hinged at the spine, face-down.
Sound: public/sounds/peel.mp3 - the rip loops while a sticker is pulled, and its snap plays once when the sticker comes fully free.
Paper: public/paper/paper.jpg, the textured stock, multiplied into the cream. Pack back: public/pack/unicorn-strip-back.jpg, on the back of the torn strip.
Pack: while sealed, the pack leans toward the pointer and springs back to its spot.
Turns: a page turns automatically once the sheet is half way off (fold 50%); released before that it snaps back.
Look: the wood table is the background behind the book (public/table/wood.jpg). The sticker dock is a plastic sheet over it with a curled top edge.
Dock: liquid glass over the wood, which runs the full height of the screen. The plastic paper texture is gone.
Dock: drag its handle up and the same glass panel grows to show every sticker. Drag it down, or tap the handle, to close it.
Page flip: the paper flip starts as a page starts to lift, and its length follows how far the page turns.
Drawing: the pencil button in the top bar opens the tools on the right. Crayon (waxy; it leaves no mark on stickers), blue ballpoint (presses a groove into what it crosses, stickers too), and a drip pen with colours (its paint runs). Marks are saved per page.
