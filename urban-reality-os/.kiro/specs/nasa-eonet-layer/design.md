# Design Document — NASA EONET Layer

## Overview

The NASA EONET Layer integrates the NASA Earth Observatory Natural Event Tracker (EONET) v3 API into Urban Reality OS as a first-class intelligence layer. It follows the established `BaseLayerPlugin` / `LayerEngine` / `DataEngine` patterns already present in the codebase.

The feature introduces:
- **NasaEngine** — a pure-JS singleton data engine for fetching, caching, and transforming EONET events
- **NasaEventsLayerPlugin** — a `BaseLayerPlugin` subclass that manages all MapLibre sources and layers
- **NasaEventPanel** — a React component for event detail popups
- **NasaFilterBar** — a React component for category filtering with a live indicator
- **Impact Overlay Mode** — a composite risk-zone visualization combining NASA events with population and infrastructure data

---

## Architecture

```mermaid
flowchart TD
    subgraph Data Layer
        EONET_API["NASA EONET v3 API\nhttps://eonet.gsfc.nasa.gov/api/v3/events"]
        NasaEngine["NasaEngine (singleton)\nsrc/engines/NasaEngine.js"]
        Cache["In-Memory Cache\nMap<cacheKey, {data, timestamp}>"]
        EONET_API -->|HTTP GET + retry| NasaEngine
        NasaEngine <-->|read/write TTL_5MIN| Cache
    end

    subgraph Layer Layer
        NasaEventsLayerPlugin["NasaEventsLayerPlugin\nsrc/layers/NasaEventsLayerPlugin.js\nextends BaseLayerPlugin"]
        BaseLayerPlugin["BaseLayerPlugin\n_addSource / _addLayer / toggle / destroy"]
        NasaEventsLayerPlugin -->|extends| BaseLayerPlugin
    end

    subgraph Map Layer
        LayerEngine["LayerEngine (singleton)\nregisters 'nasa-events' plugin\nenvironment.nasa zIndex=55"]
        MapLibre["MapLibre GL JS v5\nGeoJSON sources + circle/fill/symbol layers"]
        LayerEngine -->|plugin.init / toggle / destroy| NasaEventsLayerPlugin
        NasaEventsLayerPlugin -->|addSource / addLayer / setData| MapLibre
    end

    subgraph React Layer
        NasaFilterBar["NasaFilterBar\nsrc/components/NasaFilterBar.jsx"]
        NasaEventPanel["NasaEventPanel\nsrc/components/NasaEventPanel.jsx"]
        mapSlice["Zustand mapSlice\nlayers.nasaEvents: false"]
        NasaFilterBar -->|setFilter| NasaEngine
        NasaEngine -->|GeoJSON FeatureCollection| NasaEventsLayerPlugin
        MapLibre -->|nasa:event:select custom event| NasaEventPanel
        mapSlice -->|nasaEvents toggle| LayerEngine
    end

    subgraph Auto-Refresh
        Timer["setInterval TTL_5MIN\n300,000 ms"]
        Timer -->|fetchEvents| NasaEngine
        NasaEngine -->|update(map, newData)| NasaEventsLayerPlugin
    end
```

### Data Flow Summary

1. User toggles NASA layer → `mapSlice.toggleLayer('nasaEvents')` → `LayerEngine.syncAllToggles` → `NasaEventsLayerPlugin.init`
2. `NasaEventsLayerPlugin.init` calls `NasaEngine.fetchEvents(params)` → returns GeoJSON FeatureCollection
3. Plugin adds MapLibre sources and layers; auto-refresh timer starts
4. User clicks filter → `NasaFilterBar` calls `NasaEngine.getEventsByCategory(cat)` → plugin calls `update(map, filteredGeoJSON)`
5. User clicks marker → MapLibre fires `nasa:event:select` → `NasaEventPanel` renders detail popup

---

## Components and Interfaces

### NasaEngine

**File:** `src/engines/NasaEngine.js`

Singleton. No React dependency. Mirrors the `DataEngine` pattern.

```js
class NasaEngine {
  constructor()

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Fetch EONET events. Returns cached data if age < TTL_5MIN.
   * Deduplicates concurrent calls with identical params.
   * @param {{ category?: string, status?: 'open'|'closed'|'all', limit?: number }} params
   * @returns {Promise<GeoJSONFeatureCollection | null>}
   */
  async fetchEvents(params = {})

  /**
   * Client-side filter on cached data. No network request.
   * @param {string} category — one of EventCategory values
   * @returns {GeoJSONFeatureCollection | null}
   */
  getEventsByCategory(category)

  /**
   * Client-side filter: returns only events with status === 'open'.
   * @returns {GeoJSONFeatureCollection | null}
   */
  getActiveEvents()

  /**
   * Remove all in-memory cache entries.
   */
  clearCache()

  /**
   * Start the auto-refresh timer (called by NasaEventsLayerPlugin.init).
   * @param {object} params — same shape as fetchEvents params
   * @param {Function} onRefresh — callback(GeoJSONFeatureCollection) called on each refresh
   * @returns {number} intervalId
   */
  startAutoRefresh(params, onRefresh)

  /**
   * Stop the auto-refresh timer.
   * @param {number} intervalId
   */
  stopAutoRefresh(intervalId)

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Transform a raw EONET event object into a GeoJSON Feature.
   * Returns null if the event has no geometry entries.
   * @param {object} rawEvent
   * @returns {GeoJSONFeature | null}
   */
  _transformEvent(rawEvent)

  /**
   * Serialize params to a stable cache key string.
   * @param {object} params
   * @returns {string}
   */
  _cacheKey(params)

  /**
   * Fetch with exponential backoff + jitter. Up to MAX_RETRIES attempts.
   * @param {string} url
   * @returns {Promise<Response>}
   */
  async _fetchWithRetry(url)
}

export default new NasaEngine();
```

### NasaEventsLayerPlugin

**File:** `src/layers/NasaEventsLayerPlugin.js`

```js
class NasaEventsLayerPlugin extends BaseLayerPlugin {
  constructor()  // super('nasa-events')

  /**
   * Add all MapLibre sources and layers. Start auto-refresh timer.
   * @param {maplibregl.Map} map
   * @param {{ visible?: boolean, params?: object }} data
   */
  init(map, data)

  /**
   * Update GeoJSON source data without destroying layers.
   * Queues the update if init has not yet completed.
   * @param {maplibregl.Map} map
   * @param {GeoJSONFeatureCollection} geojson
   */
  update(map, geojson)

  /**
   * Toggle visibility of all managed layers.
   * Delegates to BaseLayerPlugin.toggle.
   * @param {maplibregl.Map} map
   * @param {boolean} visible
   */
  toggle(map, visible)

  /**
   * Remove all layers, sources, event listeners, and timers.
   * @param {maplibregl.Map} map
   */
  destroy(map)

  /**
   * Enable Impact Overlay Mode.
   * @param {maplibregl.Map} map
   * @param {GeoJSONFeatureCollection} populationData
   * @param {GeoJSONFeatureCollection} infrastructureData
   */
  enableImpactOverlay(map, populationData, infrastructureData)

  /**
   * Disable Impact Overlay Mode — removes overlay layers and sources.
   * @param {maplibregl.Map} map
   */
  disableImpactOverlay(map)
}
```

#### Layer IDs and Source IDs

| Constant | Value | Purpose |
|---|---|---|
| `SOURCE_POINTS` | `'nasa-events-points'` | GeoJSON source for Point geometry events |
| `SOURCE_POLYGONS` | `'nasa-events-polygons'` | GeoJSON source for Polygon geometry events |
| `LAYER_CLUSTER_CIRCLE` | `'nasa-cluster-circle'` | Cluster bubble circles |
| `LAYER_CLUSTER_COUNT` | `'nasa-cluster-count'` | Cluster count labels |
| `LAYER_UNCLUSTERED` | `'nasa-unclustered-point'` | Individual event markers |
| `LAYER_POLYGON_FILL` | `'nasa-polygon-fill'` | Polygon event fill |
| `LAYER_POLYGON_OUTLINE` | `'nasa-polygon-outline'` | Polygon event stroke |
| `SOURCE_IMPACT_POPULATION` | `'nasa-impact-population'` | Impact overlay population grid |
| `SOURCE_IMPACT_INFRA` | `'nasa-impact-infra'` | Impact overlay infrastructure points |
| `LAYER_IMPACT_FILL` | `'nasa-impact-fill'` | Impact overlay fill |
| `LAYER_IMPACT_INFRA` | `'nasa-impact-infra-circle'` | Impact overlay infrastructure circles |

### NasaEventPanel

**File:** `src/components/NasaEventPanel.jsx`

```jsx
/**
 * @param {{ event: NasaEventProperties | null, onClose: () => void }} props
 */
export default function NasaEventPanel({ event, onClose })
```

`NasaEventProperties` shape:
```ts
{
  id: string
  title: string
  category: EventCategory
  status: 'open' | 'closed'
  date: string          // ISO 8601
  sources: Array<{ id: string, url: string }>
  geometryType: 'Point' | 'Polygon'
  coordinates: number[] | number[][][] // from GeoJSON geometry
}
```

Renders: title, colored category badge, formatted date, source links, "View Satellite Data" button (opens NASA Worldview), close button. Returns `null` when `event` is null or missing required fields.

### NasaFilterBar

**File:** `src/components/NasaFilterBar.jsx`

```jsx
/**
 * @param {{
 *   activeFilter: string,
 *   onFilterChange: (category: string) => void,
 *   isLoading: boolean,
 *   isLive: boolean,
 *   isStale: boolean,
 *   lastUpdated: Date | null
 * }} props
 */
export default function NasaFilterBar({ activeFilter, onFilterChange, isLoading, isLive, isStale, lastUpdated })
```

Renders filter buttons for: `'all'`, `'wildfires'`, `'floods'`, `'severeStorms'`, `'volcanoes'`, `'drought'`. Renders `LiveIndicator` badge. Disables all buttons while `isLoading === true`.

---

## Data Models

### Cache Entry

```js
/**
 * @typedef {{
 *   data: GeoJSONFeatureCollection,
 *   timestamp: number,   // Date.now() at time of fetch
 *   params: object       // original query params
 * }} CacheEntry
 */
```

The cache is a `Map<string, CacheEntry>` keyed by `_cacheKey(params)`.

### GeoJSON Feature (transformed from EONET)

```js
{
  type: 'Feature',
  geometry: {
    type: 'Point',          // or 'Polygon'
    coordinates: [lng, lat] // or polygon ring array
  },
  properties: {
    id: string,             // EONET event ID
    title: string,
    category: string,       // EventCategory slug
    status: 'open' | 'closed',
    date: string,           // ISO 8601 — most recent geometry date
    sources: Array<{ id: string, url: string }>,
    geometryType: 'Point' | 'Polygon'
  }
}
```

### CategoryColor Constants

```js
export const CATEGORY_COLORS = {
  wildfires:    '#ef4444',  // red-500
  floods:       '#3b82f6',  // blue-500
  severeStorms: '#eab308',  // yellow-500
  volcanoes:    '#f97316',  // orange-500
  drought:      '#92400e',  // amber-800
};

export const DEFAULT_COLOR = '#6b7280'; // gray-500 fallback
```

### MapLibre `match` Expression for Category Colors

Used in both the unclustered circle layer and the polygon fill layer:

```js
const categoryColorExpression = [
  'match',
  ['get', 'category'],
  'wildfires',    '#ef4444',
  'floods',       '#3b82f6',
  'severeStorms', '#eab308',
  'volcanoes',    '#f97316',
  'drought',      '#92400e',
  /* default */   '#6b7280'
];
```

---

## Algorithms

### GeoJSON Transformation Algorithm

```
function _transformEvent(rawEvent):
  IF rawEvent.geometry is null OR rawEvent.geometry is empty array:
    log.warn(`[NasaEngine] Skipping event ${rawEvent.id}: no geometry`)
    RETURN null

  // Use the most recent geometry entry
  geometryEntry = rawEvent.geometry[0]
  geometryType  = geometryEntry.type  // 'Point' or 'Polygon'

  IF geometryType === 'Point':
    coordinates = [geometryEntry.coordinates[0], geometryEntry.coordinates[1]]
  ELSE:
    coordinates = geometryEntry.coordinates  // polygon ring array

  // Pick the most recent date from geometry entries
  date = rawEvent.geometry
    .filter(g => g.date != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.date
    ?? rawEvent.closed ?? rawEvent.open ?? null

  // Normalize category slug
  category = rawEvent.categories?.[0]?.id ?? 'unknown'

  RETURN {
    type: 'Feature',
    geometry: { type: geometryType, coordinates },
    properties: {
      id:           rawEvent.id,
      title:        rawEvent.title,
      category:     category,
      status:       rawEvent.closed ? 'closed' : 'open',
      date:         date,
      sources:      rawEvent.sources ?? [],
      geometryType: geometryType
    }
  }
```

### Retry Algorithm (Exponential Backoff + Jitter)

```
const MAX_RETRIES = 3
const BASE_DELAY  = 800   // ms
const JITTER      = 0.3

async function _fetchWithRetry(url):
  FOR attempt = 0 TO MAX_RETRIES:
    TRY:
      response = await fetch(url)
      IF response.ok:
        RETURN response
      THROW new Error(`HTTP ${response.status}`)
    CATCH err:
      IF attempt === MAX_RETRIES:
        THROW err
      delay = BASE_DELAY * (2 ** attempt)
      jitterMs = delay * JITTER * Math.random()
      await sleep(delay + jitterMs)
  // unreachable
```

### Cache Key Serialization

```
function _cacheKey(params):
  // Sort keys for stability regardless of insertion order
  sorted = Object.keys(params).sort()
  RETURN sorted.map(k => `${k}=${params[k] ?? ''}`).join('&')
  // e.g. "category=wildfires&limit=50&status=open"
```

### Request Deduplication

```
_pendingRequests: Map<cacheKey, Promise>

async fetchEvents(params):
  key = _cacheKey(params)

  // 1. Return in-flight promise if identical request is pending
  IF _pendingRequests.has(key):
    RETURN _pendingRequests.get(key)

  // 2. Return cache if fresh
  cached = _cache.get(key)
  IF cached AND (Date.now() - cached.timestamp) < TTL_5MIN:
    RETURN cached.data

  // 3. Make new request
  promise = _doFetch(params)
  _pendingRequests.set(key, promise)
  TRY:
    result = await promise
    RETURN result
  FINALLY:
    _pendingRequests.delete(key)
```

### Auto-Refresh Timer Design

```
startAutoRefresh(params, onRefresh):
  intervalId = setInterval(async () => {
    TRY:
      // Force bypass cache by temporarily clearing the entry
      _cache.delete(_cacheKey(params))
      data = await fetchEvents(params)
      IF data:
        onRefresh(data)
        _liveStatus = 'live'
      ELSE:
        _liveStatus = 'stale'
    CATCH:
      _liveStatus = 'stale'
  }, TTL_5MIN)  // 300,000 ms
  RETURN intervalId

stopAutoRefresh(intervalId):
  clearInterval(intervalId)
```

### Impact Overlay Mode Algorithm

```
enableImpactOverlay(map, populationData, infrastructureData):
  IF _impactOverlayActive:
    disableImpactOverlay(map)

  activeEvents = getActiveEvents()
  IF activeEvents is null OR activeEvents.features.length === 0:
    RETURN

  // Build set of event centroids
  eventCentroids = activeEvents.features.map(f => {
    IF f.geometry.type === 'Point':
      RETURN { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }
    ELSE:
      RETURN centroidOfPolygon(f.geometry.coordinates)
  })

  // Filter population grid cells within 50km of any event
  riskCells = populationData.features.filter(cell => {
    cellCenter = centroidOfCell(cell)
    RETURN eventCentroids.some(ec =>
      haversineDistance(ec, cellCenter) <= 50  // km
    )
  })

  // Filter infrastructure points within 50km of any event
  riskInfra = infrastructureData.features.filter(point => {
    coord = { lng: point.geometry.coordinates[0], lat: point.geometry.coordinates[1] }
    RETURN eventCentroids.some(ec =>
      haversineDistance(ec, coord) <= 50
    )
  })

  // Add population risk fill layer (red-to-yellow ramp by density)
  _addSource(map, SOURCE_IMPACT_POPULATION, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: riskCells }
  })
  _addLayer(map, {
    id: LAYER_IMPACT_FILL,
    type: 'fill',
    source: SOURCE_IMPACT_POPULATION,
    paint: {
      'fill-color': [
        'interpolate', ['linear'],
        ['get', 'density'],
        0,    '#fef08a',   // low density — yellow
        5000, '#ef4444'    // high density — red
      ],
      'fill-opacity': 0.45
    }
  })

  // Add infrastructure risk circle layer (orange stroke)
  _addSource(map, SOURCE_IMPACT_INFRA, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: riskInfra }
  })
  _addLayer(map, {
    id: LAYER_IMPACT_INFRA,
    type: 'circle',
    source: SOURCE_IMPACT_INFRA,
    paint: {
      'circle-radius': 8,
      'circle-color': 'transparent',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#f97316'
    }
  })

  _impactOverlayActive = true
```

---

## LayerEngine Registration Changes

### Plugin Registration (in `LayerEngine` constructor)

```js
import NasaEventsLayerPlugin from '../layers/NasaEventsLayerPlugin';

// In constructor, add to registry chain:
.register(new NasaEventsLayerPlugin())
```

### Layer Config Registration (in `_registerBuiltins`)

```js
this.registerLayer('environment.nasa', {
  group: 'environment',
  zIndex: 55,
  pluginId: 'nasa-events',
  enabled: false,
});
```

### `syncAllToggles` Addition

```js
// Add inside syncAllToggles(map, layers):
this.toggleLayer('environment.nasa', map, !!layers.nasaEvents);
```

### `initAllLayers` / `recoverAllLayers` Addition

```js
// Add to dataMap in both methods:
'nasa-events': layers.nasaEvents ? { visible: true } : false,
```

---

## Zustand Store Changes (`mapSlice`)

Add `nasaEvents: false` to the `layers` object:

```js
layers: {
  aqi: true,
  flood: false,
  traffic: false,
  floodDepth: false,
  hospitals: false,
  policeStations: false,
  fireStations: false,
  schools: false,
  nasaEvents: false,   // ← new
},
```

No new actions are required — the existing `toggleLayer('nasaEvents')` and `setLayers` actions handle this key automatically.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Cache freshness prevents network requests

*For any* valid cache entry whose age is strictly less than TTL_5MIN (300,000 ms), calling `fetchEvents` with the same parameters SHALL return the cached data and SHALL NOT invoke the network fetch function.

**Validates: Requirements 1.2, 2.1**

---

### Property 2: Retry exhaustion returns stale data or null

*For any* failing network endpoint (fetch always rejects), after exactly MAX_RETRIES + 1 total attempts, `fetchEvents` SHALL return the last known stale cached data if one exists, or `null` if the cache is empty — and SHALL NOT propagate the exception to the caller.

**Validates: Requirements 1.4, 1.5, 10.3**

---

### Property 3: Category filter is a subset with no false positives

*For any* cached GeoJSON FeatureCollection containing events of mixed categories, `getEventsByCategory(cat)` SHALL return a FeatureCollection where every feature has `properties.category === cat`, and no feature with `properties.category === cat` is absent from the result.

**Validates: Requirements 1.6, 6.3**

---

### Property 4: Active events filter returns exactly open events

*For any* cached GeoJSON FeatureCollection containing events of mixed statuses, `getActiveEvents()` SHALL return a FeatureCollection where every feature has `properties.status === 'open'`, and no feature with `properties.status === 'open'` is absent from the result.

**Validates: Requirements 1.7**

---

### Property 5: Request deduplication — single in-flight request

*For any* N ≥ 2 concurrent calls to `fetchEvents` with identical parameters (where no valid cache exists), the underlying fetch function SHALL be invoked exactly once, and all N callers SHALL receive a result equal to that single fetch response.

**Validates: Requirements 1.8, 10.4**

---

### Property 6: GeoJSON transformation preserves all required fields

*For any* valid EONET event object with at least one geometry entry, `_transformEvent` SHALL return a GeoJSON Feature whose `properties` object contains non-null values for `id`, `title`, `category`, `status`, `date`, `sources`, and `geometryType`, and whose `geometry.type` is either `'Point'` or `'Polygon'`.

**Validates: Requirements 1.9**

---

### Property 7: Events with no geometry are excluded from output

*For any* array of EONET events where some events have null or empty geometry arrays, the transformed GeoJSON FeatureCollection SHALL contain no feature corresponding to those geometry-less events, and SHALL contain a feature for every event that has at least one geometry entry.

**Validates: Requirements 1.10, 10.2**

---

### Property 8: Cache round-trip preserves data equivalence

*For any* valid EONET API response object, storing it in the cache and immediately retrieving it with the same parameter key SHALL return a data structure that is deeply equal to the original stored value.

**Validates: Requirements 2.4**

---

### Property 9: Impact overlay includes only events within 50km radius

*For any* set of active event centroids and population grid cells, `enableImpactOverlay` SHALL include in the risk fill layer only those grid cells whose centroid is within 50 km (haversine) of at least one active event centroid, and SHALL exclude all cells farther than 50 km from all events.

**Validates: Requirements 9.2**

---

## Error Handling

| Scenario | NasaEngine Behavior | Plugin Behavior |
|---|---|---|
| HTTP 4xx from EONET API | Classify as non-retryable; log error; return stale cache or `null` | Render empty FeatureCollection; set `isStale = true` |
| HTTP 5xx from EONET API | Retry up to 3 times; return stale cache or `null` | Same as above |
| Network timeout / fetch rejection | Retry with exponential backoff; return stale cache or `null` | Same as above |
| Empty `events` array in response | Transform to empty FeatureCollection; cache it | Render empty FeatureCollection without error |
| Event with null/empty geometry | Skip event; log warning with event ID | Not applicable (filtered before plugin receives data) |
| `update()` called before `init()` | N/A | Queue the update; apply after `init` completes |
| Style switch while layer active | N/A | `LayerEngine.recoverAllLayers` calls `init` again; plugin re-adds sources and layers |
| `enableImpactOverlay` called twice | N/A | Call `disableImpactOverlay` first, then re-apply |

---

## Testing Strategy

### Unit Tests (example-based)

- `NasaEngine._transformEvent` — valid event, event with null geometry, event with empty geometry array, event with Polygon geometry
- `NasaEngine._cacheKey` — parameter ordering stability (same params in different insertion order produce same key)
- `NasaEngine.clearCache` — cache is empty after call; subsequent `fetchEvents` triggers network
- `NasaEngine.startAutoRefresh` / `stopAutoRefresh` — timer starts and stops correctly (mock `setInterval`/`clearInterval`)
- `NasaEventsLayerPlugin.init` — correct MapLibre API calls with mocked map
- `NasaEventsLayerPlugin.update` — calls `setData` on existing sources, does not re-add layers
- `NasaEventsLayerPlugin.toggle` — sets visibility on all layer IDs
- `NasaEventsLayerPlugin.destroy` — removes all layers, sources, and clears timer
- `NasaEventPanel` — renders null when event is null; renders all required fields when event is valid
- `NasaFilterBar` — disables buttons when `isLoading`; highlights active filter

### Property-Based Tests

Property-based testing is appropriate for this feature because NasaEngine contains pure transformation and filtering logic (cache lookup, event transformation, category/status filtering) where input variation meaningfully exercises edge cases.

**Library:** [fast-check](https://github.com/dubzzz/fast-check) (already consistent with the JS/React stack)

**Minimum iterations:** 100 per property test

**Tag format:** `// Feature: nasa-eonet-layer, Property N: <property_text>`

Each correctness property above maps to one property-based test:

| Property | Test file | Arbitraries |
|---|---|---|
| P1: Cache freshness | `NasaEngine.cache.test.js` | `fc.record({ category: fc.constantFrom(...), status: fc.constantFrom(...), limit: fc.integer({min:1,max:500}) })`, `fc.integer({min:0, max:299999})` for age |
| P2: Retry exhaustion | `NasaEngine.retry.test.js` | `fc.boolean()` for stale cache presence; mock fetch always rejects |
| P3: Category filter subset | `NasaEngine.filter.test.js` | `fc.array(fc.record({ category: fc.constantFrom('wildfires','floods','severeStorms','volcanoes','drought'), status: fc.constantFrom('open','closed') }))` |
| P4: Active events filter | `NasaEngine.filter.test.js` | Same array arbitrary as P3 |
| P5: Request deduplication | `NasaEngine.dedup.test.js` | `fc.integer({min:2, max:10})` for N concurrent calls |
| P6: Transformation fields | `NasaEngine.transform.test.js` | `fc.record(...)` generating valid EONET event shapes |
| P7: Geometry exclusion | `NasaEngine.transform.test.js` | Mix of events with and without geometry |
| P8: Cache round-trip | `NasaEngine.cache.test.js` | `fc.record(...)` generating valid EONET API response shapes |
| P9: Impact overlay radius | `NasaEventsLayerPlugin.impact.test.js` | `fc.array(fc.record({ lat: fc.float({min:-90,max:90}), lng: fc.float({min:-180,max:180}) }))` for events and grid cells |

### Integration Tests

- LayerEngine has `'nasa-events'` plugin registered (smoke)
- `mapSlice` initial state has `layers.nasaEvents === false` (smoke)
- `syncAllToggles` with `nasaEvents: true` calls `toggleLayer('environment.nasa', map, true)` (example)
- Auto-refresh timer fires `update` after TTL_5MIN with mocked timer (example)
- Style switch triggers `recoverAllLayers` which re-initializes the plugin (example)
