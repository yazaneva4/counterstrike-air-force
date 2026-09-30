# Counterstrike Air Force: First Contact

An open-world 3D browser game set on Kestrel Island, a fictional island in the Pacific. You can walk around, talk to the people who live there, fly jets, a light plane and helicopters, and look into the saucers that show up after sunset. From Kestrel Spaceport you can launch a two-stage rocket or a spaceplane into orbit, warp to the Moon and Mars, land there and explore on foot in a space suit. There are nine mysteries to find, two of them on other worlds. You can play alone or with friends in the same world.

## The world

- **Planet Earth, the Sun and the Moon.** The title screen shows the real Earth (NASA Blue Marble and Black Marble imagery), with city lights on the night side, drifting clouds and an atmosphere glow. In the game, a physically based sky follows a full day and night cycle, with sunrise, sunset, stars and moonlight. Climb past 3,000 m in the saucer, the spaceplane or the rocket and you reach orbit. From there you see the whole Earth lit by the same sun as your time of day, the Moon, Mars with Phobos and Deimos, a space station, satellites and Kestrel Space traffic against the Tycho star catalogue.
- **Kestrel Spaceport.** On the east coast: a launch pad with a 70 m service tower, lightning masts, propellant spheres, the Vehicle Assembly Building, Mission Control, a spaceplane pad and a booster landing zone.
- **Rockets and spaceships.** The Aurora is a two-stage rocket that flies on real thrust against gravity: countdown, liftoff clouds, gimballed steering, fuel, stage separation and deployable landing legs. After staging, the booster flips, flies back and lands itself on the landing zone. You can land the upper stage on its engine on Earth, the Moon or Mars. The Odyssey is a spaceplane that takes off vertically on lift thrusters and climbs to orbit.
- **The Moon and Mars.** In orbit, press 1, 2 or 3 to warp to Earth, the Moon or Mars, then dive towards a world to land. The Moon has cratered highlands, a dark mare, black sky, hard-edged shadows, the Earth overhead, a lunar module and a flag. Mars (inside Jezero crater) has dunes, layered buttes, a dry canyon, a butterscotch sky with a blue-white sun halo, the Ares Station habitat, a rover driving its loop and dust devils. Both have local gravity (1.62 and 3.71 m/s²), and you step out in a space suit.
- **People.** About 50 islanders, all men by default (see `FEMALE_SHARE` in `src/actors/human.js`), with individual faces, skin tones and clothing: ground crew, pilots, villagers, farmers, beachgoers, researchers, hikers, a lighthouse keeper and the spaceport's engineers, flight directors and astronauts. They walk between places, talk to each other, wave at you, sunbathe, and dance in the plaza at night. When a saucer flies over, they stop and point at it. Press **E** to talk; many of them give hints about the mysteries.
- **Real players.** Create a room and share the 5-character code or the invite link. Everyone in the room plays on the same island and appears as a person or in the aircraft they are flying, with name tags, a shared clock and chat.
- **Aircraft.** The F-7 Falcon jet (afterburner, energy bolts against alien drone swarms), the C-2 Skylark light plane, two H-60 Kite helicopters, the Nova X-1 prototype (the original neon starfighter from earlier versions), and the Visitor Craft saucer, which has a tractor beam and can reach orbit.
- **Air traffic.** An airliner leaves contrails overhead, a pair of jets flies in formation, and a patrol helicopter and a touring plane cross the island.
- **Aliens.** Two saucers roam the island at night, hover over the crop circles and lift cows (the cows come back unharmed). They escape when an aircraft gets close. Grey visitors keep watch at the crash site and blink away if you get too near. Drone swarms appear for pilots flying armed jets.
- **Mysteries.** The Monolith, The Circles, The Crash at Red Mesa, the Temple of the Sun, the Hollow Hill Stones, the Western Vortex, The Watcher (a cloaked mothership above the clouds), the Lunar Echo on the Moon and the Ares Beacon on Mars. Your field journal (**J**) records what you find, and the map (**M**) marks search areas.
- **Places.** Kestrel Airbase, Kestrel Spaceport, Harrow Village, Aldren Farms, Windward Ridge wind farm, Gull Point lighthouse, Sunset Beach and harbour, the Red Mesa desert and snow-capped Mount Kestrel.

## Controls

| | Keyboard / mouse |
|---|---|
| On foot | WASD walk · mouse look · Shift run · Space jump or swim · E talk · F board an aircraft |
| Planes | W/S throttle · mouse or ↑↓ pitch · A/D roll · Q/E rudder · Shift afterburner · click or Space to fire · F to exit (eject in flight) |
| Helicopter | Space/C up and down · WASD fly · mouse or Q/E turn · Shift fast |
| Saucer and Odyssey | Space/C up and down · WASD fly · E tractor beam (saucer) · Shift boost · hold Space above 3,000 m for orbit |
| Aurora rocket | Space launch, then stage · W/S throttle · Shift full throttle · mouse or A/D steer · Q/E roll · R hold upright · G landing legs |
| In space | W thrust · mouse steer · Space/C up and down · Shift boost · 1/2/3 warp to Earth, Moon or Mars · dive towards a world to land |
| Anywhere | V cockpit view · right-drag look around · M map · J journal · H help · T time-lapse · P photo mode · Enter chat · Esc menu |

Touch devices get a virtual stick, a look area and action buttons.

## Cloud saves

Progress (solved mysteries, score, stats, your character and start options) is saved to a private Vercel Blob store through `api/save.js`. Each browser gets a random save id, so there are no accounts; the same id on another device is what carries progress across. Saves merge, so nothing is lost when two devices play. If the API is unreachable (for example when running locally), the game keeps using local storage. The Blob store is connected through the `BLOB_READ_WRITE_TOKEN` environment variable.

## Run locally

The project has no dependencies to install and no build step. Three.js r160 and PeerJS are vendored in `lib/`.

```sh
npm start
```

Then open http://localhost:8080.

## Deploy on Vercel

The site is static, so Vercel serves the repository root as-is. `vercel.json` adds long-lived caching for `lib/` and `assets/` plus security headers. You can import the repository in the Vercel dashboard or run `vercel --prod`; no framework preset and no build command are needed. Multiplayer is peer-to-peer (WebRTC through the public PeerJS broker), so there is no game server to host.

## Tech

- Vanilla ES modules and Three.js. There is no bundler.
- Terrain, forests, buildings, people, aircraft, spacecraft and aliens are all procedural and seeded, so every player gets the same island, Moon and Mars.
- People are sculpted from lathed and deformed geometry with painted faces and fabric normals. Aircraft and spacecraft are lofted from superellipse sections and carry painted liveries with panel lines, rivets, roughness maps and weathering. Trees use bark-textured limbs and alpha-tested leaf, needle and frond cards with crown-shaped normals. The terrain blends grass, rock and sand detail textures with tri-planar cliffs, and the ocean layers photographic ripple normals over simulated swell.
- Rocket exhaust is a shader plume with a hot core, turbulence and shock diamonds. The Moon and Mars maps and relief were baked offline from the Cesium lunar map and procedural Mars noise.
- The sky uses the Preetham model with an image-based lighting probe that follows the sun. The ocean is shaded with depth-aware shallows and foam, and the clouds are instanced billboards.
- Post-processing: bloom, a cinematic grade and an anamorphic sun flare. Where float render targets are unsupported, the game falls back automatically, and it lowers resolution to hold the frame rate.
- Audio is procedural Web Audio: engine voices, rotor chop, rocket roar, wind, surf, birds and crickets.

Earth imagery: NASA Visible Earth (Blue Marble, Black Marble), public domain. Moon colour map (derived from NASA imagery), Tycho star catalogue skybox and water normals: CesiumJS, Apache License 2.0. The Moon and Mars relief and the Mars colour map were baked for this game.

Developed by **SkyCoder YazanPK**.

## License

MIT
