# Counterstrike Air Force — Sky Patrol

A 3D arcade flight game. Pick an aircraft, fly through a changing sky, and clear glowing drone targets with energy bolts. The action is stylized and non-graphic.

## Play locally

The project includes a local copy of Three.js and needs no package install:

```sh
npm start
```

Open http://localhost:8080.

## Controls

- **Fly:** WASD or arrow keys; move the mouse to steer.
- **Fire energy bolts:** click or press Space; hold the on-screen FIRE button on touch devices.
- **Pause/finish the patrol:** Escape.
- **Choose aircraft:** select one of four jets before launch. Your choice is saved on the device.

The four aircraft have different speed, agility, and shield ratings. Keyboard, mouse, and touch controls are supported.

## Tech

Vanilla JavaScript and Three.js with procedural aircraft and drone models. No build step or external game service is required. Google Fonts are used for display typography when online.

## License

MIT
