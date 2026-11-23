# AI tour (prototype)

A 360° tour of a house where every room is designed by an image model on the exact architecture of the plan.
These are the scripts the first tour was made with; they are not wired into the app yet.

1. `pano.js <houseId> tour/points.json tour/cap [k/n]` captures six cube faces from every standing point of the
   static demo viewer (`npm run demo:serve`, opened with `?test&bare`). `points.json` lists `{id, floor, name, room, x, y}`
   per point (plan px), plus the house's `bounds` and `stairs`.
2. `equirect.py <prefix> <out.jpg> [width]` joins six faces into one equirectangular panorama. The middle of the picture
   looks west (−x); in the tour viewer the picture's x is the plan's x and its z the plan's y.
3. `tour/gen.py [ids…]` sends each panorama to the image model (Higgsfield CLI, `seedream_v5_pro`, image to image) with a
   prompt for the room, and writes `tour-site/ai/<id>.jpg`. Each picture costs credits; finished ones are skipped.
4. `tour/build.py` links the points through doors, open-plan neighbours and the stairs, and writes the tour page from
   `tour/tour.tpl.html` (a self-contained page: `three.js`, `plan_f*.svg`, `ai/` and `base/` next to it).

The scripts expect this layout: `<root>/{pano.js, equirect.py, dwgout/plan.json, tour/…, tour-site/…}`.
