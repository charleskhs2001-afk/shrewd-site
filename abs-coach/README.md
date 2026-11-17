# Core Check

A mobile-first website where you photograph your stomach (one relaxed, one tensed) and get:

- **A Today screen with 4 jobs**: the workout (or a walk on rest days), your protein, your water (tap the glasses) and staying inside your snack allowance. Tick 3 of 4 for a "good day" and build a streak.
- **A diet**: daily calories, protein, carbs, fat, fibre and water, and a menu for each day (breakfast, lunch and dinner) with gram amounts scaled to your numbers. Don't fancy a meal? Tap **Swap**. Works for anything / no pork / pescatarian / vegetarian / vegan, with dairy-, gluten- and nut-free swaps.
- **A shopping list** for the next 7 days of menus, grouped by aisle, with tick boxes and a copy button.
- **A snack allowance**: a daily calorie budget for snacks and treats, with a tap-to-log tracker that shows what's left.
- **A workout routine** built for a gym, or for home with whatever kit you tick (dumbbells, kettlebell, bands, pull-up bar, bench, ab wheel, skipping rope, a chair, or nothing at all). It covers 2–6 days a week and 20–60 minute sessions, and every session includes ab work.
- **Workout mode**: tap Start and it takes you through the warm-up and every set, with a rest timer (beeps and buzzes when it's time), timers for planks and intervals, and a note of the weight you used so it can tell you what you lifted last time. The screen stays on while it's open.
- **A timeline**: roughly how many weeks until your goal (four-pack, six-pack or shredded), with a date range and milestones.
- **Check-ins every 5 days**: two new photos (the camera shows a faint "ghost" of last time so you line up the same) and a weigh-in. It tells you whether it's working and adjusts calories if progress stalls. When a check-in is due, today's plan is blurred until you do it (or tap "Not today"). You can also add repeating calendar reminders.
- **Progress**: a 4-week habit calendar and streaks, recent workouts, a before/after photo slider, weight, waist and body-fat charts, and the full check-in history.
- **A demo**: "See a demo" on the front page loads sample data (drawn photos, three check-ins, two weeks of ticks and workouts) so people can look around before taking their own photos. "Start my own" clears it.

Everything is saved on the user's own phone (no accounts). Under-18s get a gentler plan and their photos are never sent anywhere.

## Run it on your computer

Needs [Node.js](https://nodejs.org) 20 or newer.

```bash
cd abs-coach
npm install
npm start
```

Open http://localhost:3000. The camera only works on `localhost` or an `https://` address. Every hosting option below gives you https automatically.

## Publish it on the web

Pick one. Option 1 is the easiest and keeps the AI photo analysis.

### Option 1: Render (free, about 5 minutes)

1. Go to https://dashboard.render.com and sign in with GitHub.
2. Click **New > Blueprint** and pick the `shrewd-site` repository.
3. Set **Blueprint Path** to `abs-coach/render.yaml`.
4. When it asks for `ANTHROPIC_API_KEY`, paste your key (see "Photo analysis" below), or leave it blank to run without it.
5. Click **Apply**. In a couple of minutes you get an address like `https://core-check.onrender.com`.

Only changes inside `abs-coach/` redeploy it, so your Shrewd site is unaffected.

The free plan goes to sleep when nobody has visited for a while, so the first visit after a quiet spell takes around a minute. The paid "Starter" plan stays awake.

**Your own domain:** in the service's **Settings > Custom Domains**, add something like `abs.sparkwash.co.uk`, then add the CNAME record Render shows you at your domain provider.

### Option 2: Google Cloud Run (same as Shrewd)

Follow the steps in `../DEPLOY-CLOUDRUN.md`, with three changes:
- In **Set up with Cloud Build**, set the build type to **Dockerfile** and the source location to `/abs-coach/Dockerfile`.
- Name the service `core-check`.
- Under **Variables & secrets** add `ANTHROPIC_API_KEY` (optional) and `TRUST_PROXY` = `1`.

### Option 3: No server at all (no photo analysis)

The whole app also works as plain files. Estimates then come from the user's answers, tape measurements and their own rating of their photos.

- **Netlify Drop:** go to https://app.netlify.com/drop and drag the `abs-coach/public` folder onto the page. You get a live https link straight away.
- **GitHub Pages:** works too, as long as the published folder is `abs-coach/public`.

## Photo analysis (optional)

With an Anthropic API key set, the server sends the two photos (and the previous pair at a check-in) to Claude, which returns a body-fat range, which abs are showing, a short summary and, at check-ins, whether things look leaner. The server doesn't save or log photos.

1. Create a key at https://console.anthropic.com (**Settings > API keys**) and add some credit.
2. Set it as `ANTHROPIC_API_KEY` on your host. For local use, copy `.env.example` to `.env` and put it there.

**Cost:** roughly 2–5p per analysis with the default model (`claude-opus-5-5`), so about 20–35p per active user per month (one plan plus six check-ins). Two settings keep the bill predictable:

| Setting | Default | What it does |
|---|---|---|
| `ANALYSES_PER_HOUR` | 12 | Limit per visitor (by IP address) |
| `ANALYSES_PER_DAY` | 300 | Limit for the whole site. After that, people still get a plan from their answers |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Model used. `claude-sonnet-5-5` is about half the price |

If the key is missing, wrong or out of credit, nothing breaks: the app says the analysis wasn't available and uses the user's answers instead.

## How the numbers are worked out

- **Body fat** blends whatever is available: the photo analysis, the US Navy tape formula (waist and neck, plus hips for women), weight change since the start, the user's own rating, and a BMI-based formula as a last resort.
- **Calories**: Mifflin–St Jeor BMR × daily activity + the planned workouts, minus a deficit worth 0.4–1% of body weight a week (faster when there's more to lose). The deficit is capped at 25% (12% for under-18s), and calories never drop below 1,500 for men or 1,200 for women (2,000 and 1,700 for under-18s).
- **Protein**: about 1.9 g per kg of goal weight (1.6 g/kg for under-18s). Fat is at least 25% of calories and carbs make up the rest.
- **Timeline**: fat to lose ÷ weekly rate, with a range. After a few check-ins it blends in the real rate of progress.
- **Check-ins**: "on track" if weight, waist or photos are moving. If progress has stalled over 10 days and the user says they stuck to the plan, calories drop by 100–150 a day. If they're losing too fast, calories go up by 100.

## Changing things

- **Name:** `APP` at the top of `public/js/app.js`, plus the title and meta tags in `public/index.html`.
- **Meals, snacks, exercises:** `public/js/data.js`. Food values are per 100 g.
- **Maths:** `public/js/plan.js`.
- **Colours:** the variables at the top of `public/styles.css`.

## Files

```
abs-coach/
  server.mjs          web server + /api/analyze
  lib/analyze.mjs     the Claude photo-analysis call
  public/             the website (works on its own as static files)
    index.html, styles.css, sw.js, manifest.webmanifest, icons
    js/app.js         screens and navigation
    js/plan.js        calories, macros, meals, daily menus, shopping list, workouts, timeline, check-in verdicts
    js/log.js         the daily ticks, water, snacks, streaks
    js/workout.js     workout mode: sets, rest timer, weights
    js/demo.js        the sample account behind "See a demo"
    js/data.js        foods, meals, snacks, exercises
    js/camera.js      in-page camera with guide, timer and ghost overlay
    js/photos.js      resizing and the on-device definition score
    js/store.js       saving on the device (localStorage + IndexedDB), backups
  render.yaml         Render blueprint
  Dockerfile          for Cloud Run or any Docker host
```

Core Check gives general fitness guidance, not medical advice.
