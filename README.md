# the Collage of Games

A 30-day project hub where each day publishes a new playable browser game.

## Structure

- `/index.html` is the main gallery page.
- `/games/day-01-skyline-rescue/` is the first published game.
- Days 2-30 are scaffolded as locked cards and can be unlocked by updating `app.js`.

## Run locally

```bash
cd /Users/snyperf1/Downloads/GitHub_Repos/collage-of-games
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

## Vercel deployment

This project is static and Vercel-ready.

```bash
npm i -g vercel
vercel
```

For production:

```bash
vercel --prod
```
