# Implementation Plan: NASA EONET Layer

## Overview

Implement the NASA EONET natural events layer following the existing `BaseLayerPlugin` / `LayerEngine` / DataEngine patterns. Tasks are ordered for sequential execution: data engine first, then map plugin, then engine wiring, then store, then UI components, then app integration.

## Tasks

- [x] 1. Implement NasaEngine (`src/engines/NasaEngine.js`)
  - [x] 1.1 Create the file and define constants + class skeleton
    - Create `src/engines/NasaEngine.js`
    - Define module-level constants: `EONET_BASE_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events'`, `TTL_5MIN = 300_000`, `MAX_RETRIES = 3`, `BASE_DELAY = 800`, `JITTER = 0.3`
    - Define `CATEGORY_COLORS` and `DEFAULT_COLOR` exports as specified in the design
    - Declare the `NasaEngine` class with constructor initializing `_cache` (`Map`), `_pendingRequests` (`Map`), and `_liveStatus` (`'live'|'stale'`)
    - Export `default new NasaEngine()`
    - _Requirements: 1.1, 2.1_

  - [x] 1.2 Implement `_cacheKey(params)` and `_fetchWithRetry(url)`
    - `_cacheKey`: sort `Object.keys(params)`, map to `k=v` pairs joined by `&`; empty string for missing values
    - `_fetchWithRetry`: loop `attempt = 0..MAX_RETRIES`; on success return response; on failure compute `delay = BASE_DELAY * 2**attempt + delay * JITTER * Math.random()`, await sleep, rethrow on last attempt
    - Add a private `_sleep(ms)` helper using `new Promise(resolve => setTimeout(resolve, ms))`
    - _Requirements: 1.4_

  - [x] 1.3 Implement `_transformEvent(rawEvent)`
    - Return `null` and `console.warn` if `rawEvent.geometry` is null/empty
    - Use `rawEvent.geometry[0]` as the geometry entry; extract `type` and `coordinates`
    - For `'Point'`: coordinates = `[entry.coordinates[0], entry.coordinates[1]]`
    - For `'Polygon'`: coordinates = `entry.coordinates`
    - Derive `date` by sorting geometry entries descending by `.date`, falling back to `rawEvent.closed ?? rawEvent.open ?? null`
    - Normalize `category` from `rawEvent.categories?.[0]?.id ?? 'unknown'`
    - Derive `status` from `rawEvent.closed ? 'closed' : 'open'`
    - Return a GeoJSON Feature with `properties: { id, title, category, status, date, sources, geometryType }`
    - _Requirements: 1.9, 1.10, 10.2_

  - [x] 1.4 Implement `fetchEvents(params)` with cache + dedup
    - Compute `key = _cacheKey(params)`
    - If `_pendingRequests.has(key)` return the in-flight promise
    - If cache entry exists and `Date.now() - entry.timestamp < TTL_5MIN` return `entry.data`
    - Otherwise build the EONET URL with query params (`category`, `status`, `limit`), call `_fetchWithRetry`, parse JSON, transform each event via `_transformEvent` (filter nulls), build a `FeatureCollection`, store in `_cache`, return it
    - Wrap the fetch in a promise stored in `_pendingRequests`; delete from map in `finally`
    - On any error: log it, return stale `_cache.get(key)?.data ?? null` — never propagate
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.8, 2.1, 10.3, 10.4_

  - [x] 1.5 Implement `getEventsByCategory(category)`, `getActiveEvents()`, `clearCache()`
    - `getEventsByCategory`: iterate all cache entries, collect features where `properties.category === category`, return a new `FeatureCollection` or `null` if cache is empty
    - `getActiveEvents`: same but filter `properties.status === 'open'`
    - `clearCache`: call `this._cache.clear()`
    - _Requirements: 1.6, 1.7, 2.3, 2.5_

  - [x] 1.6 Implement `startAutoRefresh(params, onRefresh)` and `stopAutoRefresh(intervalId)`
    - `startAutoRefresh`: use `setInterval` at `TTL_5MIN`; inside the callback delete the cache entry for `_cacheKey(params)`, call `fetchEvents(params)`, on success call `onRefresh(data)` and set `_liveStatus = 'live'`, on failure set `_liveStatus = 'stale'`; return the interval ID
    - `stopAutoRefresh`: call `clearInterval(intervalId)`
    - _Requirements: 7.1, 7.5, 7.6_

  - [ ]* 1.7 Write property tests for NasaEngine cache and filter logic
    - Create `src/engines/__tests__/NasaEngine.cache.test.js`
    - **Property 1: Cache freshness prevents network requests** — use `fc.record({ category: fc.constantFrom('wildfires','floods','severeStorms','volcanoes','drought'), status: fc.constantFrom('open','closed','all'), limit: fc.integer({min:1,max:500}) })` and `fc.integer({min:0,max:299999})` for age; assert fetch not called when cache is fresh
    - **Property 8: Cache round-trip preserves data equivalence** — generate valid EONET API response shapes; store then retrieve; assert deep equality
    - **Validates: Requirements 1.2, 2.1, 2.4**

  - [ ]* 1.8 Write property tests for NasaEngine retry and dedup
    - Create `src/engines/__tests__/NasaEngine.retry.test.js`
    - **Property 2: Retry exhaustion returns stale data or null** — mock fetch to always reject; assert exactly `MAX_RETRIES + 1` attempts; assert return is stale cache or null; assert no exception propagated
    - **Validates: Requirements 1.4, 1.5, 10.3**
    - Create `src/engines/__tests__/NasaEngine.dedup.test.js`
    - **Property 5: Request deduplication — single in-flight request** — use `fc.integer({min:2,max:10})` for N; fire N concurrent `fetchEvents` calls; assert underlying fetch called exactly once; assert all N callers receive equal result
    - **Validates: Requirements 1.8, 10.4**

  - [ ]* 1.9 Write property tests for NasaEngine transform and filter
    - Create `src/engines/__tests__/NasaEngine.transform.test.js`
    - **Property 6: GeoJSON transformation preserves all required fields** — generate valid EONET event shapes with at least one geometry entry; assert all required `properties` fields are non-null; assert `geometry.type` is `'Point'` or `'Polygon'`
    - **Property 7: Events with no geometry are excluded** — mix events with and without geometry; assert no feature for geometry-less events; assert feature present for every event with geometry
    - **Validates: Requirements 1.9, 1.10, 10.2**
    - Create `src/engines/__tests__/NasaEngine.filter.test.js`
    - **Property 3: Category filter is a subset with no false positives** — generate mixed-category FeatureCollections; assert every returned feature matches the requested category; assert no matching feature is absent
    - **Property 4: Active events filter returns exactly open events** — same arbitrary; assert every returned feature has `status === 'open'`; assert no open event is absent
    - **Validates: Requirements 1.6, 1.7, 6.3**

- [x] 2. Checkpoint — NasaEngine complete
  - Ensure all NasaEngine tests pass. Verify `fetchEvents`, `getEventsByCategory`, `getActiveEvents`, `clearCache`, `startAutoRefresh`, and `stopAutoRefresh` are exported correctly from the singleton. Ask the user if questions arise.

- [x] 3. Implement NasaEventsLayerPlugin (`src/layers/NasaEventsLayerPlugin.js`)
  - [x] 3.1 Create file, define constants, and class skeleton
    - Create `src/layers/NasaEventsLayerPlugin.js`
    - Import `BaseLayerPlugin` from `'./BaseLayerPlugin'` and `NasaEngine` from `'../engines/NasaEngine'`
    - Define and export constants: `SOURCE_POINTS`, `SOURCE_POLYGONS`, `LAYER_CLUSTER_CIRCLE`, `LAYER_CLUSTER_COUNT`, `LAYER_UNCLUSTERED`, `LAYER_POLYGON_FILL`, `LAYER_POLYGON_OUTLINE`, `SOURCE_IMPACT_POPULATION`, `SOURCE_IMPACT_INFRA`, `LAYER_IMPACT_FILL`, `LAYER_IMPACT_INFRA` — use the exact string values from the design
    - Define `categoryColorExpression` array using the `match` expression from the design
    - Declare `NasaEventsLayerPlugin extends BaseLayerPlugin` with constructor calling `super('nasa-events')`; initialize `_autoRefreshId = null`, `_updateQueue = []`, `_impactOverlayActive = false`
    - Export `default new NasaEventsLayerPlugin()`
    - _Requirements: 3.1_

  - [x] 3.2 Implement `init(map, data)`
    - Call `NasaEngine.fetchEvents(data?.params ?? {})` to get the initial GeoJSON
    - Split the FeatureCollection into `pointsFC` (features where `geometry.type === 'Point'`) and `polygonsFC` (features where `geometry.type === 'Polygon'`)
    - Add `SOURCE_POINTS` with `{ type: 'geojson', data: pointsFC, cluster: true, clusterRadius: 50 }` via `_addSource`
    - Add `SOURCE_POLYGONS` with `{ type: 'geojson', data: polygonsFC }` via `_addSource`
    - Add `LAYER_CLUSTER_CIRCLE` (type `'circle'`, source `SOURCE_POINTS`, filter `['has', 'point_count']`) with cluster bubble paint
    - Add `LAYER_CLUSTER_COUNT` (type `'symbol'`, source `SOURCE_POINTS`, filter `['has', 'point_count']`) with count label layout
    - Add `LAYER_UNCLUSTERED` (type `'circle'`, source `SOURCE_POINTS`, filter `['!', ['has', 'point_count']]`) with `circle-color: categoryColorExpression`, `circle-radius: 8`
    - Add `LAYER_POLYGON_FILL` (type `'fill'`, source `SOURCE_POLYGONS`) with `fill-color: categoryColorExpression`, `fill-opacity: 0.4`
    - Add `LAYER_POLYGON_OUTLINE` (type `'line'`, source `SOURCE_POLYGONS`) with `line-color: categoryColorExpression`, `line-width: 2`
    - Attach mouse/click event listeners (see task 3.3)
    - Start auto-refresh: `this._autoRefreshId = NasaEngine.startAutoRefresh(data?.params ?? {}, (newData) => this.update(map, newData))`
    - Call `_setInitialized(true)`; flush `_updateQueue`
    - Set `data?.visible === false` → call `toggle(map, false)`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 7.1, 10.5, 10.6_

  - [x] 3.3 Implement map interactivity event listeners (called from `init`)
    - On `mouseenter` of `LAYER_UNCLUSTERED`: set `map.getCanvas().style.cursor = 'pointer'`; call `map.setPaintProperty(LAYER_UNCLUSTERED, 'circle-radius', 12)`
    - On `mouseleave` of `LAYER_UNCLUSTERED`: reset cursor to `''`; reset radius to `8`
    - On `click` of `LAYER_UNCLUSTERED`: emit `map.fire('nasa:event:select', { feature: e.features[0].properties })`
    - On `click` of `LAYER_POLYGON_FILL`: emit `map.fire('nasa:event:select', { feature: e.features[0].properties })`
    - On `click` of `LAYER_CLUSTER_CIRCLE`: call `map.easeTo({ center: e.features[0].geometry.coordinates, zoom: map.getZoom() + 2 })`
    - On `mouseenter` of `LAYER_CLUSTER_CIRCLE`: set cursor to `'pointer'`
    - On `mouseleave` of `LAYER_CLUSTER_CIRCLE`: reset cursor to `''`
    - Store bound listener references on `this` for cleanup in `destroy`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 3.4 Implement `update(map, geojson)`
    - If `!this.initialized`: push `geojson` to `_updateQueue` and return
    - Split `geojson` into `pointsFC` and `polygonsFC` by geometry type
    - Call `map.getSource(SOURCE_POINTS)?.setData(pointsFC)`
    - Call `map.getSource(SOURCE_POLYGONS)?.setData(polygonsFC)`
    - _Requirements: 3.6, 10.7_

  - [x] 3.5 Implement `destroy(map)`
    - Call `NasaEngine.stopAutoRefresh(this._autoRefreshId)`; set `_autoRefreshId = null`
    - Remove all map event listeners attached in `init` using stored bound references
    - Call `super.destroy(map)` to remove all layers and sources
    - Clear `_updateQueue`
    - _Requirements: 3.8, 7.5_

  - [x] 3.6 Implement `enableImpactOverlay(map, populationData, infrastructureData)` and `disableImpactOverlay(map)`
    - `disableImpactOverlay`: remove `LAYER_IMPACT_FILL`, `LAYER_IMPACT_INFRA`, `SOURCE_IMPACT_POPULATION`, `SOURCE_IMPACT_INFRA` from `this.layerIds` / `this.sourceIds` and from the map; set `_impactOverlayActive = false`
    - `enableImpactOverlay`: if `_impactOverlayActive` call `disableImpactOverlay` first; get `activeEvents = NasaEngine.getActiveEvents()`; return early if null or empty
    - Compute event centroids (Point → coordinates directly; Polygon → average of outer ring coordinates)
    - Filter `populationData.features` to those within 50km haversine of any centroid
    - Filter `infrastructureData.features` to those within 50km haversine of any centroid
    - Add `SOURCE_IMPACT_POPULATION` and `LAYER_IMPACT_FILL` (fill with red-to-yellow density ramp as per design)
    - Add `SOURCE_IMPACT_INFRA` and `LAYER_IMPACT_INFRA` (circle with orange stroke as per design)
    - Set `_impactOverlayActive = true`
    - Add a private `_haversineKm(a, b)` helper
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 3.7 Write unit tests for NasaEventsLayerPlugin
    - Create `src/layers/__tests__/NasaEventsLayerPlugin.test.js`
    - Test `init`: assert correct `addSource` and `addLayer` calls on a mocked map
    - Test `update`: assert `setData` called on existing sources; assert layers not re-added
    - Test `toggle`: assert `setLayoutProperty` called with `'visible'` / `'none'` for all layer IDs
    - Test `destroy`: assert all layers/sources removed; assert auto-refresh timer cleared
    - _Requirements: 3.6, 3.7, 3.8_

  - [ ]* 3.8 Write property test for impact overlay radius
    - Create `src/layers/__tests__/NasaEventsLayerPlugin.impact.test.js`
    - **Property 9: Impact overlay includes only events within 50km radius**
    - Use `fc.array(fc.record({ lat: fc.float({min:-90,max:90}), lng: fc.float({min:-180,max:180}) }))` for event centroids and grid cells
    - Assert included cells are all ≤ 50km from at least one centroid; assert excluded cells are all > 50km from all centroids
    - **Validates: Requirements 9.2**

- [x] 4. Checkpoint — NasaEventsLayerPlugin complete
  - Ensure all plugin tests pass. Verify `init`, `update`, `toggle`, `destroy`, `enableImpactOverlay`, and `disableImpactOverlay` behave correctly with a mocked MapLibre map. Ask the user if questions arise.

- [x] 5. Wire NasaEventsLayerPlugin into LayerEngine (`src/engines/LayerEngine.js`)
  - [x] 5.1 Register the plugin in the LayerEngine constructor
    - Add `import NasaEventsLayerPlugin from '../layers/NasaEventsLayerPlugin';` at the top of `LayerEngine.js`
    - In the constructor's `.register(...)` chain, append `.register(new NasaEventsLayerPlugin())`
    - _Requirements: 8.1_

  - [x] 5.2 Register the layer config in `_registerBuiltins`
    - Add `this.registerLayer('environment.nasa', { group: 'environment', zIndex: 55, pluginId: 'nasa-events', enabled: false });` inside `_registerBuiltins`
    - _Requirements: 8.2_

  - [x] 5.3 Add `nasaEvents` toggle to `syncAllToggles`
    - Inside `syncAllToggles(map, layers)`, add: `this.toggleLayer('environment.nasa', map, !!layers.nasaEvents);`
    - _Requirements: 8.3, 8.4_

  - [x] 5.4 Add `nasa-events` entry to `initAllLayers` and `recoverAllLayers` dataMaps
    - In both `initAllLayers` and `recoverAllLayers`, add to the `dataMap` object: `'nasa-events': layers.nasaEvents ? { visible: true } : false,`
    - _Requirements: 8.3, 10.6_

  - [ ]* 5.5 Write integration smoke tests for LayerEngine registration
    - Create `src/engines/__tests__/LayerEngine.nasa.test.js`
    - Assert `LayerEngine.registry.get('nasa-events')` is an instance of `NasaEventsLayerPlugin`
    - Assert `LayerEngine.layerConfigs.get('environment.nasa')` has `zIndex: 55` and `pluginId: 'nasa-events'`
    - Assert `syncAllToggles` with `{ nasaEvents: true }` calls `toggleLayer('environment.nasa', map, true)` on a mocked map
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 6. Add `nasaEvents` to Zustand mapSlice (`src/store/slices/mapSlice.js`)
  - In the `layers` object inside `createMapSlice`, add `nasaEvents: false` after the `schools` entry
  - No new actions are needed — `toggleLayer('nasaEvents')` and `setLayers` already handle this key
  - _Requirements: 8.5_

- [x] 7. Implement NasaEventPanel (`src/components/NasaEventPanel.jsx`)
  - Create `src/components/NasaEventPanel.jsx`
  - Accept props: `{ event, onClose }` where `event` is `NasaEventProperties | null`
  - Return `null` if `event` is null or missing `id`, `title`, or `category`
  - Render a fixed/absolute panel with:
    - Event `title` as heading
    - Colored category badge using `CATEGORY_COLORS[event.category] ?? DEFAULT_COLOR` as background
    - Formatted `date` using `new Date(event.date).toLocaleDateString()`
    - List of `event.sources` as `<a>` tags with `target="_blank" rel="noopener noreferrer"`
    - "View Satellite Data" button that opens `https://worldview.earthdata.nasa.gov/?v=${lng-2},${lat-2},${lng+2},${lat+2}` in a new tab (derive lat/lng from `event.coordinates`)
    - Close button that calls `onClose()`
  - Import `CATEGORY_COLORS` and `DEFAULT_COLOR` from `'../engines/NasaEngine'`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 7.1 Write unit tests for NasaEventPanel
    - Create `src/components/__tests__/NasaEventPanel.test.jsx`
    - Test: renders `null` when `event` is `null`
    - Test: renders `null` when `event` is missing required fields
    - Test: renders title, category badge, formatted date, source links, and "View Satellite Data" button when event is valid
    - Test: calls `onClose` when close button is clicked
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 8. Implement NasaFilterBar (`src/components/NasaFilterBar.jsx`)
  - Create `src/components/NasaFilterBar.jsx`
  - Accept props: `{ activeFilter, onFilterChange, isLoading, isLive, isStale, lastUpdated }`
  - Render filter buttons for: `'all'` (label "All"), `'wildfires'`, `'floods'`, `'severeStorms'` (label "Storms"), `'volcanoes'`, `'drought'`
  - Each button: `disabled={isLoading}`, `onClick={() => onFilterChange(category)}`, highlighted with `CATEGORY_COLORS[category]` border/background when `activeFilter === category`
  - Render a `LiveIndicator` inline component:
    - If `isLoading`: show a spinner or "Loading…" text
    - If `isLive && !isStale`: show a pulsing green dot + "LIVE" text (CSS `@keyframes pulse` animation)
    - If `isStale`: show a gray dot + "STALE" text
    - If `lastUpdated`: show `Last updated: ${lastUpdated.toLocaleTimeString()}`
  - _Requirements: 6.1, 6.2, 6.5, 6.6, 7.3, 7.4_

  - [ ]* 8.1 Write unit tests for NasaFilterBar
    - Create `src/components/__tests__/NasaFilterBar.test.jsx`
    - Test: all 6 filter buttons render
    - Test: all buttons are disabled when `isLoading === true`
    - Test: active filter button has distinct styling
    - Test: clicking a button calls `onFilterChange` with the correct category
    - Test: "LIVE" badge renders when `isLive && !isStale`; "STALE" badge renders when `isStale`
    - _Requirements: 6.1, 6.5, 6.6, 7.3, 7.4_

- [x] 9. Wire NasaFilterBar and NasaEventPanel into the app UI (`src/components/MapView.jsx`)
  - [x] 9.1 Add state and map event listener for selected NASA event
    - In `MapView`, add `const [nasaEvent, setNasaEvent] = useState(null)`
    - In a `useEffect` that runs when `mapReady` becomes true, get the map via `MapEngine.getMap()` and attach: `map.on('nasa:event:select', (e) => setNasaEvent(e.feature))`
    - Return a cleanup that calls `map.off('nasa:event:select', handler)`
    - _Requirements: 5.1_

  - [x] 9.2 Add filter state and NasaEngine callback wiring
    - Add `const [nasaFilter, setNasaFilter] = useState('all')`
    - Add `const [nasaLoading, setNasaLoading] = useState(false)`
    - Add `const [nasaLive, setNasaLive] = useState(false)`
    - Add `const [nasaStale, setNasaStale] = useState(false)`
    - Add `const [nasaLastUpdated, setNasaLastUpdated] = useState(null)`
    - Implement `handleNasaFilterChange(category)`: set `nasaLoading = true`; call `NasaEngine.getEventsByCategory(category)` (or `NasaEngine.fetchEvents({})` for `'all'`); get the plugin via `LayerEngine.getPlugin('nasa-events')`; call `plugin.update(map, filteredData)`; set `nasaLoading = false`, `nasaLastUpdated = new Date()`
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 9.3 Render NasaFilterBar and NasaEventPanel conditionally
    - Import `NasaFilterBar` from `'./NasaFilterBar'` and `NasaEventPanel` from `'./NasaEventPanel'`
    - Import `NasaEngine` from `'../engines/NasaEngine'` and `LayerEngine` from `'../engines/LayerEngine'`
    - In `ModernLayoutRoot` (or directly in `MapView`), render `NasaFilterBar` when `layers.nasaEvents === true`, positioned as a fixed overlay (e.g., `top: 14, right: 80, zIndex: 20`)
    - Render `NasaEventPanel` when `nasaEvent !== null`, positioned as a fixed overlay (e.g., `top: 76, right: 16, zIndex: 25`), with `onClose={() => setNasaEvent(null)}`
    - Pass all required props to both components
    - _Requirements: 6.1, 5.1, 7.3, 7.4_

  - [x] 9.4 Add NASA Events toggle to LayerSwitcher (`src/ui/controls/LayerSwitcher.jsx`)
    - Add a NASA preview SVG to the `PREVIEWS` map (use a simple dark background with colored dots representing event markers)
    - Add `{ id: 'nasa', label: 'NASA Events', previewSrc: PREVIEWS.nasa }` to the `items` array in `LayerSwitcher`
    - In `applyLayer`, handle `id === 'nasa'`: call `setLayers((prev) => ({ ...prev, nasaEvents: !prev.nasaEvents }))`
    - Update `derivedActive` to include: `if (layers.nasaEvents) return 'nasa';`
    - _Requirements: 8.3, 8.4, 8.5_

- [x] 10. Final checkpoint — Full integration
  - Ensure all tests pass. Toggle the NASA Events layer card in the UI and verify: events appear on the map, filter bar shows, clicking a marker opens NasaEventPanel, auto-refresh timer starts, destroying the layer clears the timer. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- `NasaEventsLayerPlugin` is exported as a singleton (`default new NasaEventsLayerPlugin()`) — do not instantiate it again in LayerEngine; import the singleton directly or import the class and instantiate once in the constructor
- The `toggle` method is fully inherited from `BaseLayerPlugin` — no override needed unless custom behavior is required
- Property tests use [fast-check](https://github.com/dubzzz/fast-check); install with `npm install --save-dev fast-check` if not already present
