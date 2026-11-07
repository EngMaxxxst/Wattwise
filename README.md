# WattWise

A household electricity consumption analysis and optimization dashboard built from the WattWise presentation.

## Files

| File | What it does |
| --- | --- |
| `index.html` | All page content and structure: dashboard, cards, forms, modals, footer. |
| `styles.css` | All visual design: green/lime theme, layout, responsive rules, animations. |
| `app.js` | All logic: calculations, selection sort, budget tracking, what-if simulation, local storage. |

There is no build step and no framework. Edit a file, save it, then refresh the browser.

## Open the app

Double-click `index.html`, or run a tiny local server from this folder:

```powershell
python -m http.server 4173
```

Then open <http://localhost:4173>.

## Where to edit common things

### Text and labels
Open `index.html`. Most visible text lives directly in the markup, for example:

- Hero heading and subtitle — search for `hero-copy`
- Workflow steps — search for `workflow-grid`
- Team names — search for `footer-credits`
- Button labels — search for `Add appliance` or `Visualize sort`

### Colors, fonts, spacing
Open `styles.css` and edit the variables at the top:

```css
:root {
  --lime: #a3ed2a;
  --bg: #08170b;
  --panel: rgba(17, 43, 21, 0.72);
  --font-display: "Barlow Semi Condensed", ...;
  --font-body: "Inter", ...;
}
```

Changing `--lime` updates most accent colors across the app.

### Sample appliances
Open `app.js` and find `SAMPLE_APPLIANCES` near the top:

```js
const SAMPLE_APPLIANCES = [
  { id: 'ac', name: 'Air Conditioner', icon: '❄️', watts: 1000, hours: 6, color: '#a3ed2a' },
  ...
];
```

This is also what the **Restore sample data** button loads.

### Default rate, days, and budget
In `app.js`, find `defaultState()`:

```js
function defaultState() {
  return {
    rate: 12,
    days: 30,
    budget: 3000,
    ...
  };
}
```

### The consumption formulas
In `app.js`, find `calculate()`:

```js
const dailyKwh = (appliance.watts * appliance.hours) / 1000;
const monthlyKwh = dailyKwh * state.days;
const monthlyCost = monthlyKwh * state.rate;
```

### Selection sort
In `app.js`, find `selectionSort()`. It ranks appliances from highest to lowest monthly kWh and is the same algorithm shown in the **Visualize sort** modal.

### Saved data
The app saves everything in the browser under the localStorage key:

```js
wattwise.state.v1
```

To reset during development, open **Settings → Restore sample data**, or clear that key in your browser's developer tools.

## Deploying

Upload `index.html`, `styles.css`, and `app.js` together to any static host:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

No server-side code is required.
