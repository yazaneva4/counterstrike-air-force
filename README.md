# Counterstrike Air Force: First Contact

An open-world 3D browser game set on Kestrel Island, a fictional island in the Pacific. You can walk around, talk to the people who live there, fly jets, a light plane and helicopters, and look into the saucers that show up after sunset. You can drive four kinds of car along the island's roads, and from Kestrel Spaceport you can launch a two-stage rocket or a spaceplane into orbit, warp to the Moon and Mars, land there and explore on foot in a space suit. There are nine mysteries to find, two of them on other worlds. You can play alone or with friends in the same world.

## The world

- **Planet Earth, the Sun and the Moon.** The title screen shows the real Earth (NASA Blue Marble and Black Marble imagery), with city lights on the night side, drifting clouds and an atmosphere glow. In the game, a physically based sky follows a full day and night cycle, with sunrise, sunset, stars and moonlight. Climb past 3,000 m in the saucer, the spaceplane or the rocket and you reach orbit. From there you see the whole Earth lit by the same sun as your time of day, the Moon, Mars with Phobos and Deimos, a space station, satellites and Kestrel Space traffic against the Tycho star catalogue.
- **Kestrel Spaceport.** On the east coast: a launch pad with a 70 m service tower, lightning masts, propellant spheres, the Vehicle Assembly Building, Mission Control, a spaceplane pad and a booster landing zone.
- **Rockets and spaceships.** The Aurora is a two-stage rocket that flies on real thrust against gravity: countdown, liftoff clouds, gimballed steering, fuel, stage separation and deployable landing legs. After staging, the booster flips, flies back and lands itself on the landing zone. You can land the upper stage on its engine on Earth, the Moon or Mars. The Odyssey is a spaceplane that takes off vertically on lift thrusters and climbs to orbit.
- **The Moon and Mars.** In orbit, press 1, 2 or 3 to warp to Earth, the Moon or Mars, then dive towards a world to land. The Moon has cratered highlands, a dark mare, black sky, hard-edged shadows, the Earth overhead, a lunar module and a flag. Mars (inside Jezero crater) has dunes, layered buttes, a dry canyon, a butterscotch sky with a blue-white sun halo, the Ares Station habitat, a rover driving its loop and dust devils. Both have local gravity (1.62 and 3.71 m/s²), and you step out in a space suit.
- **Real time.** The sky is live by default: the Sun, Moon and stars are where they really are for the real date and time at Kestrel Island (20.5°N, 158.5°W, clock in HST), including the Moon's real phase and the seasons. Hold T to time-lapse and press Y to snap back to real time; the title screen also offers fixed dawn, day, sunset and night. Real weather is fetched from Open-Meteo every five minutes and drives cloud cover, cloud drift, wind in the trees and sea, overcast, haze and rain (if it cannot be reached, the last successful reading is retained and retried after 30 seconds).
- **People.** About 50 islanders, all men by default (see `FEMALE_SHARE` in `src/actors/human.js`), with individual faces, skin tones and clothing: ground crew, pilots, villagers, farmers, beachgoers, researchers, hikers, a lighthouse keeper and the spaceport's engineers, flight directors and astronauts. They walk between places, talk to each other, wave at you, sunbathe, and dance in the plaza at night. When a saucer flies over, they stop and point at it. Press **E** to talk; many of them give hints about the mysteries.
- **Real players.** Create a room and share the 5-character code or the invite link. Everyone in the room plays on the same island and appears as a person or in the aircraft they are flying, with name tags, a shared clock and chat.
- **Cars.** The Meridian S sedan, the Vanguard GT sports coupe, the Ranger pickup and the Trail 4x4 are parked around the airbase, Harrow, the farm, the beach, the lighthouse and the spaceport. They have clear-coated metallic paint with panel gaps, glass, profiled tyres with alloy rims, brake discs, working headlights, brake lights, a horn and a driver. Driving uses a bicycle-model physics model: gears and engine sound, grip limits that make fast corners slide, a handbrake that drifts, road versus off-road grip, slopes, body roll and squat, air time over crests and bumps against buildings, trees and other vehicles. Ambient cars drive the roads, stop for you and switch their lights on at dusk.
- **Aircraft.** The F-7 Falcon jet (afterburner, energy bolts against alien drone swarms), the C-2 Skylark light plane, two H-60 Kite helicopters, the Nova X-1 prototype (the original neon starfighter from earlier versions), and the Visitor Craft saucer, which has a tractor beam and can reach orbit.
- **Air traffic.** An airliner leaves contrails overhead, a pair of jets flies in formation, and a patrol helicopter and a touring plane cross the island.
- **Aliens.** Two saucers roam the island at night, hover over the crop circles and lift cows (the cows come back unharmed). They escape when an aircraft gets close. Grey visitors keep watch at the crash site and blink away if you get too near. Drone swarms appear for pilots flying armed jets.
- **Mysteries.** The Monolith, The Circles, The Crash at Red Mesa, the Temple of the Sun, the Hollow Hill Stones, the Western Vortex, The Watcher (a cloaked mothership above the clouds), the Lunar Echo on the Moon and the Ares Beacon on Mars. Your field journal (**J**) records what you find, and the map (**M**) marks search areas.
- **Places.** Kestrel Airbase, Kestrel Spaceport, Harrow Village, Aldren Farms, Windward Ridge wind farm, Gull Point lighthouse, Sunset Beach and harbour, the Red Mesa desert and snow-capped Mount Kestrel.

## Controls

| | Keyboard / mouse |
|---|---|
| On foot | WASD walk · mouse look · Shift run · Space jump or swim · E talk · F board an aircraft |
| Planes | W/S throttle · mouse or ↑↓ pitch · A/D roll · Q/E rudder · Shift afterburner · click or Space to fire · F to exit (eject in flight). Keys ramp the controls smoothly; let go and the wings and nose level out. The Skylark limits its bank to about 63°; the jets can roll freely. On a gamepad the left stick is throttle and rudder and the right stick is pitch and roll. |
| Helicopter | Space/C up and down · WASD fly · mouse or Q/E turn · Shift fast |
| Cars | W/S throttle, brake and reverse · A/D steer · Space handbrake · Shift full throttle · L headlights · B horn · V driver view · F get out |
| Saucer and Odyssey | Space/C up and down · WASD fly · E tractor beam (saucer) · Shift boost · hold Space above 3,000 m for orbit |
| Aurora rocket | Space launch, then stage · W/S throttle · Shift full throttle · mouse or A/D steer · Q/E roll · R hold upright · G landing legs |
| In space | W thrust · mouse or I/K pitch · ←/→ yaw · Space or ↑ up · C or ↓ down · Shift boost · 1/2/3 warp to Earth, Moon or Mars · dive towards a world to land |
| Anywhere | V first-person / third-person view · right-drag look around · M map · J journal · H help · T time-lapse · P photo mode · Enter chat · Esc menu |

A gamepad works everywhere (standard layout): left stick moves, steers or sets throttle, right stick looks or flies, A/B/X/Y are Space/C/F/E, the bumpers are Q and R, RT boosts, LT works the landing legs, the d-pad switches view, lights, map and journal, and Start pauses.

Touch devices get a virtual stick, a look area and buttons that change with what you are doing (on foot, driving, flying, launching, in space), plus Map, Journal, View, Help, Chat, full-screen and pause. The game asks for full screen and landscape when you start, and can be added to the home screen as an app.

## Cloud saves

Progress (solved mysteries, score, stats, your character and start options) is saved to a private Vercel Blob store through `api/save.js`. Each browser gets a random save id, so there are no accounts; the same id on another device is what carries progress across. Saves merge, so nothing is lost when two devices play. If the API is unreachable (for example when running locally), the game keeps using local storage. The Blob store is connected through the `BLOB_READ_WRITE_TOKEN` environment variable.

## Run locally

The game itself has no dependencies to install and no build step; Three.js r160 and PeerJS are vendored in `lib/`. Only the cloud-save function in `api/` uses an npm package (`@vercel/blob`), which Vercel installs on deploy. Locally the game simply skips cloud saves.

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

## Camera views and flight realism

Press **V** or tap **View** to switch between first-person and third-person views on foot, in vehicles, under a parachute, and in orbit. Desktop players can also use the view button at the bottom right. First-person walking uses eye height and hides your local avatar; cockpit views hide the local pilot, and third-person walking draws the camera closer when a wall or hillside blocks the view.

Fixed-wing aircraft turn according to airspeed and bank angle. Steep banks raise stall speed; live wind drifts airborne aircraft without changing their indicated airspeed. Cloud puffs now use their texture opacity for soft edges, and rain darkens pavement and lowers its roughness. Flight remains an accessible game model.

Run `npm test` (Node.js 22.15+ or 24+) for the offline gameplay regression checks. They use the vendored Three.js modules and require no test dependencies.

## Grounded visuals and movement

Harrow's houses use plaster and tile surface detail, framed windows on all four sides, wooden doors, stone sills, foundations, eaves and entry steps. The plaza's trees have bark, branching crowns and alpha-tested leaves that move in the wind. The northern range uses broader, eroded ridges.

People receive shadows on their clothing and skin; skin and hair use nonmetallic surfaces with fine pore and fabric detail. Walking is 1.65 m/s, running is 5.8 m/s, and jumping uses 9.81 m/s² on Earth with each world's gravity applied on the Moon and Mars. First-person eyes follow the character's height with a small gait-linked bob. Steep uphill faces block walking.

Car roofs and pillars remain opaque while the windows reveal the seats, driver and dashboard. Paint has a softer clear coat, front wheels use separate inner and outer steering angles, and wet roads reduce braking and cornering grip. Shift uses full engine effort. Pavement wets gradually and dries over several minutes. Reflections remain available when the supported HDR pipeline is used with post-processing disabled.

The scenery and people remain procedural browser-game assets; this pass improves their materials and behaviour rather than replacing them with scanned models.


### 4K and motorsport

Select **4K Ultra** before entering the island for a fixed 3840-pixel long edge (3840 × 2160 on a 16:9 display). The renderer preserves the screen aspect ratio and reports the actual dimensions; this mode does not silently reduce resolution. A GPU that supports a smaller render surface is limited to its reported maximum. High and Auto retain adaptive resolution. 4K increases GPU load and does not replace the game's procedural assets with scanned photorealistic models.

Choose **Race paddock** to start beside the **Vanguard GT-R** and **Vanguard D-Spec**, parked on the airbase apron. Press **F** to board. **W/S** accelerate/brake/reverse, **A/D** steer, **Shift** uses full throttle, and **Space** operates the rear handbrake. Tap the handbrake while turning at speed to initiate a drift, release it, then countersteer and balance the throttle. Rear-axle grip returns progressively; the D-Spec also supports power oversteer. Dry tarmac produces fading tyre marks and smoke; wet pavement reduces grip and smoke. The instruments show drift angle and time. Liveries and wheel steering also work for other players.

Car first-person view uses mouse or gamepad look without holding right-click, honours sensitivity and vertical inversion, and keeps its field of view steady. The camera follows the current chassis and suspension position, uses a close near plane for the dashboard, and hides the driver model immediately. On-foot first-person view has a wider vertical look range and eye-level collision clearance. Press **V** or the view button to switch between first-person and third-person.
