/** GPS Map Camera–style stamp for installation Live photo + Upload. */

export type GeotagCoords = {
  latitude: number
  longitude: number
  accuracy?: number
}

export type GeotagPlace = {
  title: string
  address: string
  countryCode?: string
}

export type GeotagPhotoResult = {
  file: File
  coords: GeotagCoords | null
  place: GeotagPlace | null
  stamped: boolean
  source: "live" | "upload"
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read the photo."))
    }
    img.src = url
  })
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    const timer = window.setTimeout(() => resolve(null), 8000)
    img.onload = () => {
      window.clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      window.clearTimeout(timer)
      resolve(null)
    }
    img.src = url
  })
}

function normalizePlaceText(s: string): string {
  return s.toLowerCase().replace(/[,\s]+/g, " ").trim()
}

export async function readDeviceGeolocation(timeoutMs = 18000): Promise<GeotagCoords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null

  const once = (enableHighAccuracy: boolean, timeout: number) =>
    new Promise<GeotagCoords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          })
        },
        () => resolve(null),
        { enableHighAccuracy, timeout, maximumAge: enableHighAccuracy ? 0 : 60_000 },
      )
    })

  return (await once(true, timeoutMs)) || (await once(false, 10_000))
}

export async function reverseGeocodePlace(coords: GeotagCoords): Promise<GeotagPlace | null> {
  try {
    const latlng = `${coords.latitude},${coords.longitude}`
    const googleUrl =
      `https://maps.googleapis.com/maps/api/geocode/json` +
      `?latlng=${encodeURIComponent(latlng)}` +
      `&language=en`
    const googleRes = await fetch(googleUrl)
    if (googleRes.ok) {
      const googleData = (await googleRes.json()) as {
        status?: string
        results?: Array<{
          formatted_address?: string
          address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>
        }>
      }
      if (googleData.status === "OK" && Array.isArray(googleData.results) && googleData.results.length) {
        const best = googleData.results[0]
        const components = best.address_components || []
        const pick = (type: string, key: "long_name" | "short_name" = "long_name") =>
          String(components.find((c) => (c.types || []).includes(type))?.[key] || "").trim()
        const city = pick("locality") || pick("administrative_area_level_2")
        const state = pick("administrative_area_level_1")
        const country = pick("country")
        const countryCode = pick("country", "short_name").toUpperCase()
        const title = [city, state, country]
          .filter(Boolean)
          .filter(
            (v, i, arr) =>
              arr.findIndex((x) => normalizePlaceText(String(x)) === normalizePlaceText(String(v))) === i,
          )
          .join(", ")
        const address = String(best.formatted_address || "").trim()
        return {
          title: title || "Current location",
          address:
            normalizePlaceText(address) === normalizePlaceText(title) ||
            normalizePlaceText(address).includes(normalizePlaceText(title))
              ? ""
              : address,
          countryCode,
        }
      }
    }
  } catch {
    // Fall back to provider below when Google Geocoding is blocked/unavailable.
  }

  try {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode-client` +
      `?latitude=${encodeURIComponent(String(coords.latitude))}` +
      `&longitude=${encodeURIComponent(String(coords.longitude))}` +
      `&localityLanguage=en`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>

    const city = String(data.city || "").trim()
    const locality = String(data.locality || "").trim()
    const state = String(data.principalSubdivision || "").trim()
    const country = String(data.countryName || "").trim()
    const countryCode = String(data.countryCode || "").trim().toUpperCase()
    const postcode = String(data.postcode || "").trim()

    const placeName = city || locality || state
    const title =
      [placeName, state && placeName.toLowerCase() !== state.toLowerCase() ? state : null, country]
        .filter(Boolean)
        .filter(
          (v, i, arr) =>
            arr.findIndex((x) => normalizePlaceText(String(x)) === normalizePlaceText(String(v))) === i,
        )
        .join(", ") || "Current location"

    const localityInfo = data.localityInfo as
      | {
          informative?: Array<{ name?: string; order?: number }>
        }
      | undefined

    const informative = [...(localityInfo?.informative || [])].sort(
      (a, b) => Number(a.order ?? 99) - Number(b.order ?? 99),
    )
    const streetParts = informative
      .map((a) => String(a?.name || "").trim())
      .filter(Boolean)
      .filter((n) => {
        const low = n.toLowerCase()
        return (
          !low.includes("india") &&
          low !== normalizePlaceText(city) &&
          low !== normalizePlaceText(state) &&
          low !== normalizePlaceText(locality)
        )
      })

    const street = streetParts.slice(0, 2).join(", ")
    const addressBits = [
      street,
      locality && locality.toLowerCase() !== city.toLowerCase() ? locality : "",
      city,
      state,
      postcode,
      country,
    ]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.findIndex((x) => normalizePlaceText(x) === normalizePlaceText(v)) === i)

    let address = addressBits.join(", ")
    if (!address || normalizePlaceText(address) === normalizePlaceText(title)) address = ""

    return { title, address, countryCode }
  } catch {
    return null
  }
}

function countryFlagEmoji(countryCode?: string): string {
  const code = String(countryCode || "").toUpperCase()
  if (code.length !== 2) return ""
  const A = 0x1f1e6
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65))
}

function formatCaptureTimestamp(capturedAt: Date): string {
  const weekday = capturedAt.toLocaleDateString("en-IN", { weekday: "long" })
  const date = capturedAt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
  const time = capturedAt.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
  const offsetMin = -capturedAt.getTimezoneOffset()
  const sign = offsetMin >= 0 ? "+" : "-"
  const abs = Math.abs(offsetMin)
  const hh = String(Math.floor(abs / 60)).padStart(2, "0")
  const mm = String(abs % 60).padStart(2, "0")
  return `${weekday}, ${date} ${time} GMT${sign}${hh}:${mm}`
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length >= maxLines) break
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]
    if (ctx.measureText(last).width > maxWidth) {
      let trimmed = last
      while (trimmed.length > 3 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1)
      }
      lines[maxLines - 1] = `${trimmed}…`
    }
  }
  return lines
}

function latLngToTile(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom
  const x = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { x, y, n }
}

/** Classic GPS Map Camera red teardrop pin. */
function drawRedLocationPin(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  const r = Math.max(7, scale * 0.11)
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)"
  ctx.beginPath()
  ctx.ellipse(cx, cy + r * 2.35, r * 0.7, r * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()

  // Teardrop body
  ctx.fillStyle = "#e53935"
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 2.15)
  ctx.lineTo(cx, cy + r * 2.15)
  ctx.closePath()
  ctx.fill()

  // Highlight ring
  ctx.strokeStyle = "#b71c1c"
  ctx.lineWidth = Math.max(1, r * 0.12)
  ctx.beginPath()
  ctx.arc(cx, cy, r, Math.PI * 0.85, Math.PI * 2.15)
  ctx.stroke()

  // Inner white/black center (GPS Map Camera style)
  ctx.fillStyle = "#ffffff"
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = "#212121"
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2)
  ctx.fill()
}

function drawFallbackSatelliteMap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  coords: GeotagCoords | null,
) {
  const g = ctx.createLinearGradient(x, y, x + size, y + size)
  g.addColorStop(0, "#3a5c32")
  g.addColorStop(0.4, "#5d8a45")
  g.addColorStop(0.7, "#7a9e55")
  g.addColorStop(1, "#4e6f3a")
  ctx.fillStyle = g
  ctx.fillRect(x, y, size, size)

  // Fields / patches
  ctx.fillStyle = "rgba(40, 70, 35, 0.5)"
  ctx.fillRect(x + size * 0.05, y + size * 0.1, size * 0.4, size * 0.35)
  ctx.fillStyle = "rgba(120, 100, 60, 0.35)"
  ctx.fillRect(x + size * 0.5, y + size * 0.45, size * 0.42, size * 0.4)

  // Roads
  ctx.strokeStyle = "rgba(235, 225, 200, 0.9)"
  ctx.lineWidth = Math.max(2.5, size * 0.04)
  ctx.beginPath()
  ctx.moveTo(x, y + size * 0.58)
  ctx.quadraticCurveTo(x + size * 0.4, y + size * 0.45, x + size, y + size * 0.62)
  ctx.stroke()
  ctx.lineWidth = Math.max(2, size * 0.028)
  ctx.beginPath()
  ctx.moveTo(x + size * 0.38, y)
  ctx.lineTo(x + size * 0.52, y + size)
  ctx.stroke()

  // Building blocks
  ctx.fillStyle = "rgba(180, 180, 170, 0.55)"
  for (let i = 0; i < 5; i += 1) {
    ctx.fillRect(x + size * (0.12 + i * 0.14), y + size * 0.22, size * 0.08, size * 0.08)
  }

  if (coords) drawRedLocationPin(ctx, x + size / 2, y + size * 0.42, size)
}

/**
 * Build a real map thumbnail centered on coords with a red pin
 * (Carto / OSM tiles — same look as GPS Map Camera map inset).
 */
async function buildRealMapWithRedPin(coords: GeotagCoords, size: number): Promise<HTMLCanvasElement | null> {
  const googleStaticMapUrl =
    `https://maps.googleapis.com/maps/api/staticmap` +
    `?center=${encodeURIComponent(`${coords.latitude},${coords.longitude}`)}` +
    `&zoom=18` +
    `&size=640x640` +
    `&scale=2` +
    `&maptype=hybrid` +
    `&markers=color:red%7C${encodeURIComponent(`${coords.latitude},${coords.longitude}`)}`
  const googleMapImage = await loadImageFromUrl(googleStaticMapUrl)
  if (googleMapImage) {
    const googleCanvas = document.createElement("canvas")
    googleCanvas.width = size
    googleCanvas.height = size
    const gctx = googleCanvas.getContext("2d")
    if (gctx) {
      gctx.drawImage(googleMapImage, 0, 0, size, size)
      try {
        gctx.getImageData(0, 0, 1, 1)
        gctx.strokeStyle = "rgba(255,255,255,0.55)"
        gctx.lineWidth = 2
        gctx.strokeRect(1, 1, size - 2, size - 2)
        return googleCanvas
      } catch {
        // Canvas tainted by CORS or blocked source; continue with fallback tile sources.
      }
    }
  }

  const zoom = 16
  const { x: xf, y: yf } = latLngToTile(coords.latitude, coords.longitude, zoom)
  const tileSize = 256
  const centerTileX = Math.floor(xf)
  const centerTileY = Math.floor(yf)
  const fracX = xf - centerTileX
  const fracY = yf - centerTileY

  // Cover the view with a 2x2 tile mosaic around the point
  const tileOffsets = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const

  const carto = ["a", "b", "c", "d"] as const
  // Prefer satellite (GPS Map Camera look), then street map. All must allow CORS for canvas stamp.
  const tileUrls = (tx: number, ty: number) => [
    `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`,
    `https://${carto[(tx + ty) % 4]}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${tx}/${ty}.png`,
  ]

  const loaded: Array<{ ox: number; oy: number; img: HTMLImageElement }> = []
  for (const [ox, oy] of tileOffsets) {
    const tx = centerTileX + ox
    const ty = centerTileY + oy
    let img: HTMLImageElement | null = null
    for (const url of tileUrls(tx, ty)) {
      img = await loadImageFromUrl(url)
      if (img) break
    }
    if (!img) return null
    loaded.push({ ox, oy, img })
  }

  // Assemble tiles then crop to centered square
  const mosaic = document.createElement("canvas")
  mosaic.width = tileSize * 2
  mosaic.height = tileSize * 2
  const mctx = mosaic.getContext("2d")
  if (!mctx) return null
  for (const t of loaded) {
    mctx.drawImage(t.img, t.ox * tileSize, t.oy * tileSize, tileSize, tileSize)
  }

  // Point position inside mosaic
  const px = fracX * tileSize
  const py = fracY * tileSize
  const crop = Math.min(tileSize * 1.35, mosaic.width)
  let sx = px - crop / 2
  let sy = py - crop / 2
  sx = Math.max(0, Math.min(sx, mosaic.width - crop))
  sy = Math.max(0, Math.min(sy, mosaic.height - crop))

  const out = document.createElement("canvas")
  out.width = size
  out.height = size
  const octx = out.getContext("2d")
  if (!octx) return null
  octx.drawImage(mosaic, sx, sy, crop, crop, 0, 0, size, size)

  // Soft vignette like GPS Map Camera inset
  const vig = octx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.75)
  vig.addColorStop(0, "rgba(0,0,0,0)")
  vig.addColorStop(1, "rgba(0,0,0,0.18)")
  octx.fillStyle = vig
  octx.fillRect(0, 0, size, size)

  // Exact center pin (location)
  drawRedLocationPin(octx, size / 2, size * 0.42, size)

  octx.strokeStyle = "rgba(255,255,255,0.55)"
  octx.lineWidth = 2
  octx.strokeRect(1, 1, size - 2, size - 2)

  // If tiles blocked CORS, canvas is tainted — fall back to drawn map.
  try {
    octx.getImageData(0, 0, 1, 1)
  } catch {
    return null
  }

  return out
}

async function drawLocationMap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  coords: GeotagCoords | null,
) {
  if (coords) {
    const real = await buildRealMapWithRedPin(coords, size)
    if (real) {
      ctx.drawImage(real, x, y, size, size)
      ctx.strokeStyle = "rgba(255,255,255,0.45)"
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2)
      return
    }
  }
  drawFallbackSatelliteMap(ctx, x, y, size, coords)
  ctx.strokeStyle = "rgba(255,255,255,0.45)"
  ctx.lineWidth = 2
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2)
}

/** Draw GPS Map Camera–style overlay; returns JPEG File. */
export async function stampGpsMapCameraOntoPhoto(
  source: File,
  coords: GeotagCoords | null,
  place: GeotagPlace | null,
  capturedAt = new Date(),
): Promise<File> {
  const img = await loadImageFromFile(source)
  const canvas = document.createElement("canvas")
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const maxSide = 2000
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH))
  canvas.width = Math.max(1, Math.round(srcW * scale))
  canvas.height = Math.max(1, Math.round(srcH * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas unavailable for geotag stamp.")

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  const w = canvas.width
  const h = canvas.height
  const pad = Math.max(14, Math.round(w * 0.022))
  const mapSize = Math.max(120, Math.min(Math.round(w * 0.26), Math.round(h * 0.22), 240))
  const titleSize = Math.max(16, Math.round(w * 0.03))
  const bodySize = Math.max(13, Math.round(w * 0.022))
  const smallSize = Math.max(12, Math.round(w * 0.018))
  const lineGap = 1.28

  const title = place?.title || (coords ? "Current location" : "Location unavailable")
  const flag = countryFlagEmoji(place?.countryCode)
  const titleLine = flag ? `${title}  ${flag}` : title
  const addressRaw = String(place?.address || "").trim()
  const showAddress =
    Boolean(addressRaw) &&
    normalizePlaceText(addressRaw) !== normalizePlaceText(title) &&
    !normalizePlaceText(title).includes(normalizePlaceText(addressRaw)) &&
    !normalizePlaceText(addressRaw).includes(normalizePlaceText(title))

  ctx.font = `500 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`
  const textMaxW = Math.max(80, w - mapSize - pad * 3)
  const addressLines = showAddress ? wrapText(ctx, addressRaw, textMaxW, 2) : []

  const textBlockH =
    titleSize * lineGap +
    addressLines.length * bodySize * lineGap +
    (coords ? bodySize * lineGap : 0) +
    smallSize * lineGap +
    smallSize * lineGap

  const overlayH = Math.max(mapSize + pad * 2, Math.round(textBlockH + pad * 2.2))
  const overlayY = h - overlayH

  ctx.fillStyle = "rgba(0, 0, 0, 0.78)"
  ctx.fillRect(0, overlayY, w, overlayH)

  const mapX = pad
  const mapY = overlayY + Math.round((overlayH - mapSize) / 2)
  await drawLocationMap(ctx, mapX, mapY, mapSize, coords)

  const textX = mapX + mapSize + pad
  let ty = overlayY + pad + titleSize

  ctx.fillStyle = "rgba(255,255,255,0.9)"
  ctx.font = `600 ${smallSize}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.fillText("GPS Map Camera", w - pad, overlayY + pad + smallSize)
  ctx.textAlign = "start"

  ctx.fillStyle = "#ffffff"
  ctx.font = `700 ${titleSize}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.fillText(titleLine, textX, ty, textMaxW)
  ty += titleSize * lineGap

  if (addressLines.length) {
    ctx.fillStyle = "rgba(255,255,255,0.92)"
    ctx.font = `500 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`
    for (const line of addressLines) {
      ctx.fillText(line, textX, ty, textMaxW)
      ty += bodySize * lineGap
    }
  }

  if (coords) {
    ctx.fillStyle = "#ffffff"
    ctx.font = `600 ${bodySize}px system-ui, -apple-system, Segoe UI, sans-serif`
    ctx.fillText(
      `Lat ${coords.latitude.toFixed(6)}, Long ${coords.longitude.toFixed(6)}`,
      textX,
      ty,
      textMaxW,
    )
    ty += bodySize * lineGap
  }

  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.font = `500 ${smallSize}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.fillText(formatCaptureTimestamp(capturedAt), textX, ty, textMaxW)
  ty += smallSize * lineGap

  ctx.fillStyle = "rgba(255,255,255,0.78)"
  ctx.font = `500 ${smallSize}px system-ui, -apple-system, Segoe UI, sans-serif`
  ctx.fillText("Note : Captured by GPS Map Camera", textX, Math.min(ty, h - pad * 0.6), textMaxW)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode geotagged photo."))),
      "image/jpeg",
      0.93,
    )
  })

  const base = source.name.replace(/\.[^.]+$/, "") || "site-photo"
  return new File([blob], `${base}-gps-${Date.now()}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  })
}

/** Shared for Live photo and gallery Upload: GPS + address + map stamp. */
export async function buildGpsMapCameraPhoto(
  file: File,
  source: "live" | "upload",
): Promise<GeotagPhotoResult> {
  const coords = await readDeviceGeolocation()
  const place = coords ? await reverseGeocodePlace(coords) : null
  try {
    const stamped = await stampGpsMapCameraOntoPhoto(file, coords, place)
    return { file: stamped, coords, place, stamped: true, source }
  } catch {
    return { file, coords, place, stamped: false, source }
  }
}

/** @deprecated use buildGpsMapCameraPhoto(file, "live") */
export async function buildLiveGeotagPhoto(file: File): Promise<GeotagPhotoResult> {
  return buildGpsMapCameraPhoto(file, "live")
}

/** @deprecated use stampGpsMapCameraOntoPhoto */
export async function stampGeotagOntoPhoto(
  source: File,
  coords: GeotagCoords | null,
  capturedAt = new Date(),
): Promise<File> {
  return stampGpsMapCameraOntoPhoto(source, coords, null, capturedAt)
}
