import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { useEffect, useRef } from 'react'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import type { MapAdapterProps, MapMarker } from '@/application/use-cases/atlas/MapAdapterProps'
import type { BoundingBox } from '@/domain/atlas/exploration/GeoCell'
import type { Coordinates } from '@/domain/atlas/place/Coordinates'

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/**
 * Leaflet's `divIcon` takes raw HTML, so anything interpolated into it is an
 * injection point. Today's icons come from the hardcoded category list, but
 * that is a property of the current call site rather than of this function —
 * the day categories become user-editable, an unescaped version here becomes
 * an XSS hole. Escaping costs nothing and removes the trap.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createMarkerIcon(marker: MapMarker): L.DivIcon {
  const state = marker.visited ? 'visited' : 'unvisited'
  const star = marker.favorite ? '<span class="atlas-marker-star">★</span>' : ''
  const tick = marker.visited ? '<span class="atlas-marker-tick">✓</span>' : ''

  return L.divIcon({
    html: `<span class="atlas-marker-emoji">${escapeHtml(marker.icon)}</span>${tick}${star}`,
    className: `atlas-marker-icon atlas-marker-${state}`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })
}

/**
 * Applies `center`/`zoom` changes to an already-mounted map.
 *
 * MapContainer's own `center` prop is initial-only by design, so without this
 * the map would never move. The mount is skipped because MapContainer has
 * already applied it, and re-applying fights Leaflet's own setup.
 *
 * `animate: false` is load-bearing. Leaflet drops a `setView` that arrives
 * while a previous pan animation is still running, so an animated follow mode
 * lags exactly one fix behind for as long as you keep moving — the map trails
 * you down the street. Jumping straight to each fix is also cheaper on a
 * phone, which is where follow mode is actually used.
 */
function RecenterOnChange({
  center,
  zoom,
}: {
  readonly center: Coordinates
  readonly zoom: number
}) {
  const map = useMap()
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    map.setView([center.latitude, center.longitude], zoom, { animate: false })
  }, [map, center.latitude, center.longitude, zoom])

  return null
}

/**
 * The whole world, wound one way, with explored cells wound the other.
 *
 * Leaflet treats the first ring of a polygon as the outline and every
 * subsequent ring as a hole, so a single polygon covers the globe in fog and
 * punches out everywhere you have been — far cheaper than one shape per cell,
 * and it leaves no seams between neighbouring cells.
 */
const WORLD_RING: [number, number][] = [
  [90, -180],
  [90, 180],
  [-90, 180],
  [-90, -180],
]

function toRing(bounds: BoundingBox): [number, number][] {
  return [
    [bounds.north, bounds.west],
    [bounds.north, bounds.east],
    [bounds.south, bounds.east],
    [bounds.south, bounds.west],
  ]
}

function FogLayer({ explored }: { readonly explored: readonly BoundingBox[] }) {
  return (
    <Polygon
      positions={[WORLD_RING, ...explored.map(toRing)]}
      pathOptions={{
        stroke: false,
        fillColor: '#0b0b0f',
        fillOpacity: 0.82,
        // Without this the fog would swallow every marker click underneath it.
        interactive: false,
      }}
    />
  )
}

function MapClickHandler({
  onMapClick,
}: {
  readonly onMapClick?: (coordinates: Coordinates) => void
}) {
  useMapEvents({
    click(event) {
      onMapClick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng })
    },
  })
  return null
}

export function LeafletMapAdapter({
  center,
  zoom,
  markers,
  onMarkerClick,
  onMapClick,
  userPosition,
  exploredBounds,
}: MapAdapterProps) {
  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={zoom}
      className="h-full w-full"
    >
      <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
      {onMapClick !== undefined && <MapClickHandler onMapClick={onMapClick} />}
      <RecenterOnChange center={center} zoom={zoom} />
      {exploredBounds && <FogLayer explored={exploredBounds} />}

      {userPosition && (
        <>
          {/* Accuracy first, so the dot always sits on top of its own halo. */}
          <Circle
            center={[userPosition.coordinates.latitude, userPosition.coordinates.longitude]}
            radius={userPosition.accuracyMeters}
            pathOptions={{
              color: '#3b82f6',
              weight: 1,
              fillColor: '#3b82f6',
              fillOpacity: 0.12,
            }}
          />
          <CircleMarker
            center={[userPosition.coordinates.latitude, userPosition.coordinates.longitude]}
            radius={6}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: '#3b82f6',
              fillOpacity: 1,
            }}
          />
        </>
      )}
      <MarkerClusterGroup chunkedLoading>
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.coordinates.latitude, marker.coordinates.longitude]}
            icon={createMarkerIcon(marker)}
            eventHandlers={{
              click: () => {
                onMarkerClick(marker.id)
              },
            }}
          >
            <Popup>{marker.label}</Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
