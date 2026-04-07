# Requirements Document

## Introduction

This document defines the requirements for the NASA EONET Layer feature in Urban Reality OS. The feature integrates the NASA Earth Observatory Natural Event Tracker (EONET) v3 API to display real-time global natural events — wildfires, floods, severe storms, volcanoes, and droughts — as an interactive intelligence layer on the MapLibre map. Events are rendered as color-coded markers (Point geometry) or polygons (area geometry), support hover/click interactions, cluster at low zoom levels, and auto-refresh every 5 minutes. A category filter bar enables real-time client-side filtering without re-fetching when data is cached. An Impact Overlay Mode combines NASA event data with population and infrastructure layers to highlight risk zones.

## Glossary

- **NasaEngine**: The new data engine (`src/engines/NasaEngine.js`) responsible for fetching, caching, filtering, and transforming EONET v3 event data. Operates as a singleton with no React dependency.
- **NasaEventsLayerPlugin**: The new MapLibre layer plugin (`src/layers/NasaEventsLayerPlugin.js`) extending `BaseLayerPlugin`. Manages all MapLibre sources and layers for NASA event rendering.
- **NasaEventPanel**: The React component (`src/components/NasaEventPanel.jsx`) that renders the event detail popup when a marker or polygon is clicked.
- **NasaFilterBar**: The React component (`src/components/NasaFilterBar.jsx`) that renders the category filter UI and triggers client-side filtering.
- **BaseLayerPlugin**: The abstract base class (`src/layers/BaseLayerPlugin.js`) that all layer plugins extend. Provides `init`, `update`, `toggle`, `destroy`, `_addSource`, and `_addLayer` helpers.
- **LayerEngine**: The existing orchestrator (`src/engines/LayerEngine.js`) that manages plugin registration, layer toggling, fade animations, and z-order.
- **DataEngine**: The existing data singleton (`src/engines/DataEngine.js`) used as the central store for non-reactive map data.
- **EONET_BASE_URL**: The NASA EONET v3 base endpoint: `https://eonet.gsfc.nasa.gov/api/v3/events`.
- **EventCategory**: One of the five supported EONET categories: `wildfires`, `floods`, `severeStorms`, `volcanoes`, `drought`.
- **EventStatus**: One of `open`, `closed`, or `all` — the EONET API `status` filter parameter.
- **TTL_5MIN**: The 5-minute (300,000 ms) cache time-to-live applied to all EONET API responses.
- **CategoryColor**: The per-category marker/polygon fill color: wildfire → `#ef4444` (red), flood → `#3b82f6` (blue), storm → `#eab308` (yellow), volcano → `#f97316` (orange), drought → `#92400e` (brown).
- **ImpactOverlayMode**: A composite visualization mode that combines active NASA events with population density and infrastructure data to render risk zone polygons.
- **ClusterRadius**: The pixel radius (50px) within which Point event markers are grouped into a cluster symbol at low zoom levels.
- **LiveIndicator**: The UI badge that displays "LIVE" with a pulsing dot when the auto-refresh timer is active and the last fetch succeeded.

---

## Requirements

### Requirement 1: NasaEngine — Event Fetching

**User Story:** As a developer, I want a dedicated engine to fetch EONET v3 events with retry logic and caching, so that the rest of the system can consume clean, structured event data without worrying about network failures.

#### Acceptance Criteria

1. THE NasaEngine SHALL expose a `fetchEvents({ category, status, limit })` method that fetches from EONET_BASE_URL with the provided query parameters.
2. WHEN `fetchEvents` is called and a valid cached response exists with age less than TTL_5MIN, THE NasaEngine SHALL return the cached data without making a network request.
3. WHEN `fetchEvents` is called and no valid cache exists, THE NasaEngine SHALL make an HTTP GET request to EONET_BASE_URL with the provided filters.
4. WHEN a network request fails, THE NasaEngine SHALL retry up to 3 times using exponential backoff with a base delay of 800 ms and a jitter factor of 0.3.
5. IF all retry attempts fail, THEN THE NasaEngine SHALL return the last known stale cached data if available, or `null` if no cache exists.
6. THE NasaEngine SHALL expose a `getEventsByCategory(category)` method that returns all cached events matching the given EventCategory without making a new network request.
7. THE NasaEngine SHALL expose a `getActiveEvents()` method that returns all cached events with `status === 'open'` without making a new network request.
8. WHEN `fetchEvents` is called concurrently with identical parameters, THE NasaEngine SHALL deduplicate the requests and resolve all callers with the same response.
9. THE NasaEngine SHALL transform each raw EONET event into a GeoJSON Feature with `properties` containing `id`, `title`, `category`, `status`, `date`, `sources`, and `geometryType` (`Point` or `Polygon`).
10. IF an EONET event has no geometry entries, THEN THE NasaEngine SHALL exclude that event from the transformed output and log a warning.

---

### Requirement 2: NasaEngine — Cache Management

**User Story:** As a developer, I want the NasaEngine to manage its own cache with a 5-minute TTL, so that the map layer always shows reasonably fresh data without hammering the NASA API.

#### Acceptance Criteria

1. THE NasaEngine SHALL store fetched responses in an in-memory cache keyed by the serialized query parameters.
2. WHEN a cached entry's age exceeds TTL_5MIN, THE NasaEngine SHALL treat it as stale and trigger a background refresh on the next `fetchEvents` call.
3. THE NasaEngine SHALL expose a `clearCache()` method that removes all in-memory cached entries.
4. FOR ALL valid EONET API responses, caching then immediately retrieving with the same parameters SHALL return an equivalent data structure (round-trip property).
5. WHEN `clearCache()` is called, a subsequent `fetchEvents` call with any parameters SHALL make a new network request rather than returning cached data.

---

### Requirement 3: NasaEventsLayerPlugin — Map Rendering

**User Story:** As a user, I want to see NASA natural events rendered on the map as color-coded markers and polygons, so that I can immediately identify the type and location of active global events.

#### Acceptance Criteria

1. THE NasaEventsLayerPlugin SHALL extend BaseLayerPlugin with `id: 'nasa-events'`.
2. WHEN `init(map, data)` is called, THE NasaEventsLayerPlugin SHALL add a GeoJSON source for Point events and a separate GeoJSON source for Polygon events.
3. WHEN `init(map, data)` is called, THE NasaEventsLayerPlugin SHALL add a cluster circle layer and a cluster count symbol layer for the Point source, using ClusterRadius of 50px.
4. WHEN `init(map, data)` is called, THE NasaEventsLayerPlugin SHALL add an unclustered circle layer for individual Point events, colored by CategoryColor using a MapLibre `match` expression on the `category` property.
5. WHEN `init(map, data)` is called, THE NasaEventsLayerPlugin SHALL add a fill layer for Polygon events, colored by CategoryColor using a MapLibre `match` expression on the `category` property.
6. WHEN `update(map, data)` is called with new GeoJSON data, THE NasaEventsLayerPlugin SHALL call `setData` on the existing sources without destroying and re-creating layers.
7. WHEN `toggle(map, visible)` is called, THE NasaEventsLayerPlugin SHALL set the visibility of all managed layer IDs to `'visible'` or `'none'` using the inherited `BaseLayerPlugin.toggle` method.
8. WHEN `destroy(map)` is called, THE NasaEventsLayerPlugin SHALL remove all managed layers and sources using the inherited `BaseLayerPlugin.destroy` method.

---

### Requirement 4: NasaEventsLayerPlugin — Interactivity

**User Story:** As a user, I want to hover over and click on event markers to see event details, so that I can understand what each event is and access its source data.

#### Acceptance Criteria

1. WHEN the cursor enters an unclustered Point event marker, THE NasaEventsLayerPlugin SHALL change the map cursor to `'pointer'` and highlight the marker by increasing its circle radius by 4px.
2. WHEN the cursor leaves an unclustered Point event marker, THE NasaEventsLayerPlugin SHALL restore the map cursor to `''` and reset the marker radius to its default value.
3. WHEN a user clicks an unclustered Point event marker, THE NasaEventsLayerPlugin SHALL emit a `nasa:event:select` custom event on the map with the clicked feature's properties as the event payload.
4. WHEN a user clicks a Polygon event feature, THE NasaEventsLayerPlugin SHALL emit a `nasa:event:select` custom event on the map with the clicked feature's properties as the event payload.
5. WHEN a user clicks a cluster marker, THE NasaEventsLayerPlugin SHALL call `map.easeTo` to zoom in by 2 levels centered on the cluster's coordinates.
6. IF the map cursor is over a cluster marker, THEN THE NasaEventsLayerPlugin SHALL change the map cursor to `'pointer'`.

---

### Requirement 5: NasaEventPanel — Event Detail UI

**User Story:** As a user, I want to see a detail panel when I click an event, so that I can read the event name, category, date, and access the original NASA source link.

#### Acceptance Criteria

1. THE NasaEventPanel SHALL render when a `nasa:event:select` event is received with a non-null payload.
2. THE NasaEventPanel SHALL display the event `title`, `category`, formatted `date`, and a list of `sources` as clickable links opening in a new tab.
3. THE NasaEventPanel SHALL display a colored category badge using CategoryColor for the event's category.
4. THE NasaEventPanel SHALL render a "View Satellite Data" button that, when clicked, opens the NASA Worldview URL for the event's coordinates in a new browser tab.
5. WHEN the panel's close button is clicked, THE NasaEventPanel SHALL hide itself and clear the selected event state.
6. IF the event payload is `null` or missing required fields, THEN THE NasaEventPanel SHALL render nothing (return `null`).

---

### Requirement 6: NasaFilterBar — Category Filtering

**User Story:** As a user, I want to filter displayed events by category using a filter bar, so that I can focus on specific event types like wildfires or floods without reloading data.

#### Acceptance Criteria

1. THE NasaFilterBar SHALL render filter buttons for: All, Wildfires, Floods, Storms, Volcanoes, and Drought.
2. WHEN a category filter button is clicked, THE NasaFilterBar SHALL update the active filter state and notify the NasaEventsLayerPlugin to re-render with filtered GeoJSON data.
3. WHEN a category filter is applied, THE NasaEventsLayerPlugin SHALL call `update(map, filteredData)` using only the cached events matching the selected category, without making a new network request.
4. WHEN the "All" filter button is clicked, THE NasaEventsLayerPlugin SHALL display all cached events regardless of category.
5. THE NasaFilterBar SHALL visually highlight the currently active filter button using a distinct background color.
6. WHILE a data fetch is in progress, THE NasaFilterBar SHALL disable all filter buttons and display a loading indicator.

---

### Requirement 7: Auto-Refresh and Live Indicator

**User Story:** As a user, I want the NASA event layer to automatically refresh every 5 minutes and show a "Live Data" indicator, so that I always see current event information without manual intervention.

#### Acceptance Criteria

1. WHEN the NasaEventsLayerPlugin is initialized, THE NasaEngine SHALL start a repeating timer that calls `fetchEvents` with the current filter parameters every TTL_5MIN (5 minutes).
2. WHEN the auto-refresh timer fires, THE NasaEventsLayerPlugin SHALL call `update(map, newData)` with the refreshed GeoJSON data.
3. WHEN the auto-refresh timer is active and the last fetch succeeded, THE LiveIndicator SHALL display a "LIVE" badge with a pulsing animation.
4. IF the auto-refresh fetch fails, THEN THE LiveIndicator SHALL display a "STALE" badge instead of "LIVE" until the next successful fetch.
5. WHEN the NasaEventsLayerPlugin is destroyed, THE NasaEngine SHALL clear the auto-refresh timer to prevent memory leaks.
6. THE NasaEngine SHALL NOT trigger a new fetch on map pan or zoom events; fetches SHALL only occur on initial load, filter change, or auto-refresh timer.

---

### Requirement 8: LayerEngine Integration

**User Story:** As a developer, I want the NASA events layer to be registered with the LayerEngine and togglable from the UI menu, so that it integrates consistently with all other map layers.

#### Acceptance Criteria

1. THE LayerEngine SHALL register a `NasaEventsLayerPlugin` instance in its constructor under the plugin ID `'nasa-events'`.
2. THE LayerEngine SHALL register a layer config entry `'environment.nasa'` with `group: 'environment'`, `zIndex: 55`, `pluginId: 'nasa-events'`, and `enabled: false`.
3. WHEN `syncAllToggles(map, layers)` is called with `layers.nasaEvents === true`, THE LayerEngine SHALL call `toggleLayer('environment.nasa', map, true)`.
4. WHEN `syncAllToggles(map, layers)` is called with `layers.nasaEvents === false`, THE LayerEngine SHALL call `toggleLayer('environment.nasa', map, false)`.
5. THE mapSlice Zustand store SHALL include a `nasaEvents: false` entry in the `layers` object.

---

### Requirement 9: Impact Overlay Mode

**User Story:** As an analyst, I want to enable an Impact Overlay Mode that combines NASA events with population and infrastructure data, so that I can identify which populated areas and critical infrastructure are at risk from active natural events.

#### Acceptance Criteria

1. THE NasaEventsLayerPlugin SHALL expose an `enableImpactOverlay(map, populationData, infrastructureData)` method that adds risk zone layers to the map.
2. WHEN Impact Overlay Mode is enabled, THE NasaEventsLayerPlugin SHALL add a fill layer that highlights grid cells within 50km of any active event using a red-to-yellow color ramp based on population density.
3. WHEN Impact Overlay Mode is enabled, THE NasaEventsLayerPlugin SHALL add a circle layer that highlights infrastructure points (hospitals, fire stations) within 50km of any active event with an orange stroke.
4. WHEN `disableImpactOverlay(map)` is called, THE NasaEventsLayerPlugin SHALL remove all impact overlay layers and sources from the map.
5. IF `enableImpactOverlay` is called while Impact Overlay Mode is already active, THEN THE NasaEventsLayerPlugin SHALL call `disableImpactOverlay` first before re-applying the overlay with updated data.

---

### Requirement 10: Performance and Edge Case Handling

**User Story:** As a developer, I want the NASA layer to handle empty results, missing geometry, and API failures gracefully without causing UI lag or map errors, so that the rest of the application remains stable under all conditions.

#### Acceptance Criteria

1. WHEN the EONET API returns an empty `events` array, THE NasaEventsLayerPlugin SHALL render an empty GeoJSON FeatureCollection without throwing an error.
2. IF an EONET event's geometry array is empty or `null`, THEN THE NasaEngine SHALL skip that event during GeoJSON transformation and log a warning with the event ID.
3. IF the EONET API returns an HTTP error status (4xx or 5xx), THEN THE NasaEngine SHALL classify the error, log it, and return stale cached data or `null` without propagating the exception to the caller.
4. THE NasaEngine SHALL debounce concurrent `fetchEvents` calls with identical parameters within a 300 ms window to prevent duplicate in-flight requests.
5. WHEN the NasaEventsLayerPlugin adds markers to the map, THE NasaEventsLayerPlugin SHALL use MapLibre's built-in source clustering rather than DOM-based markers to ensure smooth rendering with no UI thread blocking.
6. WHEN the map style is switched while the NASA layer is active, THE NasaEventsLayerPlugin SHALL re-initialize all sources and layers in the `init` call triggered by `LayerEngine.recoverAllLayers`.
7. IF `update(map, data)` is called before `init` has completed, THEN THE NasaEventsLayerPlugin SHALL queue the update and apply it after initialization completes.
