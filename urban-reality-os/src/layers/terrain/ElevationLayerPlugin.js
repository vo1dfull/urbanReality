// ================================================
// Elevation Layer Plugin
// Handles elevation & slope vector tile visualization
// ================================================
import BaseLayerPlugin from '../BaseLayerPlugin';

const ELEVATION_COLORS = [
  [0, '#2d5016'],      // Deep green (low elevation)
  [100, '#4a7c59'],    // Green
  [300, '#7cb342'],    // Light green
  [600, '#c0ca33'],    // Yellow-green
  [1000, '#fdd835'],   // Yellow
  [1500, '#fb8c00'],   // Orange
  [2000, '#f4511e'],   // Red-orange
  [2500, '#d32f2f'],   // Red
  [3000, '#8d6e63']    // Brown (high elevation)
];

const SLOPE_COLORS = [
  [0, '#2e7d32'],      // Green (flat)
  [5, '#66bb6a'],      // Light green
  [15, '#ffee58'],     // Yellow
  [30, '#ff9800'],     // Orange
  [45, '#f44336'],     // Red
  [60, '#8d6e63']      // Brown (steep)
];

export default class ElevationLayerPlugin extends BaseLayerPlugin {
  constructor() {
    super('terrainElevation');
  }

  /**
   * @param {maplibregl.Map} map
   * @param {{ visible: boolean, mode: string }} data
   */
  init(map, data) {
    if (!map) return;

    try {
      this._addSource(map, 'elevation-data', {
        type: 'vector',
        url: 'https://api.maptiler.com/tiles/contours/tiles.json?key=UQBNCVHquLf1PybiywBt'
      });

      this._addLayer(map, {
        id: 'elevation-fill',
        type: 'fill',
        source: 'elevation-data',
        'source-layer': 'contour',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'ele'],
            ...ELEVATION_COLORS.flat()
          ],
          'fill-opacity': 0.6
        },
        layout: {
          visibility: (data?.visible && data?.mode === 'elevation') ? 'visible' : 'none'
        }
      });

      this._addLayer(map, {
        id: 'slope-fill',
        type: 'fill',
        source: 'elevation-data',
        'source-layer': 'contour',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'slope'],
            ...SLOPE_COLORS.flat()
          ],
          'fill-opacity': 0.6
        },
        layout: {
          visibility: (data?.visible && data?.mode === 'slope') ? 'visible' : 'none'
        }
      });

      this.initialized = true;
    } catch (err) {
      console.error('[ElevationLayerPlugin] init error:', err);
    }
  }

  /**
   * Toggle visibility based on mode.
   * @param {maplibregl.Map} map
   * @param {boolean} visible
   * @param {string} mode - 'elevation' or 'slope'
   */
  toggleMode(map, visible, mode) {
    if (!map) return;
    try {
      if (map.getLayer('elevation-fill')) {
        map.setLayoutProperty('elevation-fill', 'visibility', (visible && mode === 'elevation') ? 'visible' : 'none');
      }
      if (map.getLayer('slope-fill')) {
        map.setLayoutProperty('slope-fill', 'visibility', (visible && mode === 'slope') ? 'visible' : 'none');
      }
    } catch (err) {
      console.warn('[ElevationLayerPlugin] toggleMode error:', err);
    }
  }

  toggle(map, visible) {
    // Rely on toggleMode for proper dispatching based on UI mode,
    // but provide fallback that leaves the previous mode
    if (!map) return;
    try {
      if (!visible) {
        if (map.getLayer('elevation-fill')) map.setLayoutProperty('elevation-fill', 'visibility', 'none');
        if (map.getLayer('slope-fill')) map.setLayoutProperty('slope-fill', 'visibility', 'none');
      }
    } catch (err) {}
  }
}
