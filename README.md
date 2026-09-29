# Counterstrike Air Force: First Contact

An open-world 3D browser game set on Kestrel Island, a fictional island in the Pacific. You can walk around, talk to the people who live there, fly jets, a light plane and helicopters, and look into the saucers that show up after sunset. There are eight mysteries to find, and the last one is on the Moon. You can play alone or with friends in the same world.

## The world

- **Planet Earth, the Sun and the Moon.** The title screen shows the real Earth (NASA Blue Marble and Black Marble imagery), with city lights on the night side, drifting clouds and an atmosphere glow. In the game, a physically based sky follows a full day and night cycle, with sunrise, sunset, stars and moonlight. If you fly the saucer above 3,000 m, you leave the atmosphere and reach orbit. From there you see the whole Earth lit by the same sun as your time of day, plus the Moon, a space station and satellites.
- **People.** About 45 islanders with individual faces, skin tones and clothing: ground crew, pilots, villagers, farmers, beachgoers, researchers, hikers and a lighthouse keeper. They walk between places, talk to each other, wave at you, sunbathe, and dance in the plaza at night. When a saucer flies over, they stop and point at it. Press **E** to talk; many of them give hints about the mysteries.
- **Real players.** Create a room and share the 5-character code or the invite link. Everyone in the room plays on the same island and appears as a person or in the aircraft they are flying, with name tags, a shared clock and chat.
- **Aircraft.** The F-7 Falcon jet (afterburner, energy bolts against alien drone swarms), the C-2 Skylark light plane, two H-60 Kite helicopters, the Nova X-1 prototype (the original neon starfighter from earlier versions), and the Visitor Craft saucer, which has a tractor beam and can reach orbit.
- **Air traffic.** An airliner leaves contrails overhead, a pair of jets flies in formation, and a patrol helicopter and a touring plane cross the island.
- **Aliens.** Two saucers roam the island at night, hover over the crop circles and lift cows (the cows come back unharmed). They escape when an aircraft gets close. Grey visitors keep watch at the crash site and blink away if you get too near. Drone swarms appear for pilots flying armed jets.
- **Mysteries.** The Monolith, The Circles, The Crash at Red Mesa, the Temple of the Sun, the Hollow Hill Stones, the Western Vortex, The Watcher (a cloaked mothership above the clouds) and the Lunar Echo. Your field journal (**J**) records what you find, and the map (**M**) marks search areas.
- **Places.** Kestrel Airbase, Harrow Village, Aldren Farms, Windward Ridge wind farm, Gull Point lighthouse, Sunset Beach and harbour, the Red Mesa desert and snow-capped Mount Kestrel.

## Controls

| | Keyboard / mouse |
|---|---|
| On foot | WASD walk · mouse look · Shift run · Space jump or swim · E talk · F board an aircraft |
| Planes | W/S throttle · mouse or ↑↓ pitch · A/D roll · Q/E rudder · Shift afterburner · click or Space to fire · F to exit (eject in flight) |
| Helicopter | Space/C up and down · WASD fly · mouse or Q/E turn · Shift fast |
| Saucer | Space/C up and down · WASD fly · E tractor beam · Shift boost · climb past 3,000 m for orbit |
| Anywhere | V cockpit view · right-drag look around · M map · J journal · H help · T time-lapse · P photo mode · Enter chat · Esc menu |

Touch devices get a virtual stick, a look area and action buttons.

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
- Terrain, forests, buildings, people, aircraft and aliens are all procedural and seeded, so every player gets the same island.
- The sky uses the Preetham model with an image-based lighting probe that follows the sun. The ocean is shaded with depth-aware shallows and foam, and the clouds are instanced billboards.
- Post-processing: bloom, a cinematic grade and an anamorphic sun flare. Where float render targets are unsupported, the game falls back automatically, and it lowers resolution to hold the frame rate.
- Audio is procedural Web Audio: engine voices, rotor chop, wind, surf, birds and crickets.

Earth imagery: NASA Visible Earth (Blue Marble, Black Marble), public domain.

Developed by **SkyCoder YazanPK**.

## License

MIT
