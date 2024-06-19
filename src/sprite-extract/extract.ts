type Point = [x: number, y: number]
type Color = [r: number, g: number, b: number, a: number]

function getPixel(imageData: ImageData, [x, y]: Point): Color {
  const offset = (imageData.width * y + x) * 4
  return [
    imageData.data[offset],
    imageData.data[offset + 1],
    imageData.data[offset + 2],
    imageData.data[offset + 3]
  ]
}

function setPixel(imageData: ImageData, [x, y]: Point, color: Color) {
  const offset = (imageData.width * y + x) * 4
  imageData.data.set(color, offset)
}

function equalsColor(a: Color, b: Color, threshold = 10) {
  return Math.abs(a[0] - b[0]) < threshold && Math.abs(a[1] - b[1]) < threshold && Math.abs(a[2] - b[2]) < threshold && Math.abs(a[3] - b[3]) < threshold
}

export type Rect = {
  startX: number
  startY: number
  endX: number
  endY: number
}

function hasOverlap(a: Rect, b: Rect) {
  return a.startX <= b.endX && a.endX >= b.startX && a.startY <= b.endY && a.endY >= b.startY
}

function getRect(imageData: ImageData, satrtPoint: Point, bgColor: Color): Rect {
  const { width, height } = imageData
  const [startX, startY] = satrtPoint
  const stack = [[startX, startY]]
  let rect: Rect = {
    startX: startX,
    startY: startY,
    endX: startX,
    endY: startY
  }
  while (stack.length > 0) {
    const [x, y] = stack.pop()!
    setPixel(imageData, [x, y], bgColor)
    if (x < rect.startX) rect.startX = x
    if (x > rect.endX) rect.endX = x
    if (y < rect.startY) rect.startY = y
    if (y > rect.endY) rect.endY = y; ([
      [x - 1, y - 1],
      [x - 1, y],
      [x - 1, y + 1],
      [x, y - 1],
      [x, y + 1],
      [x + 1, y - 1],
      [x + 1, y],
      [x + 1, y + 1],
    ] satisfies Point[]).forEach(p => {
      if (p[0] < 0 || p[0] >= width || p[1] < 0 || p[1] >= height) return
      if (equalsColor(getPixel(imageData, p), bgColor)) return
      stack.push(p)
    })
  }
  return rect
}

function* getRects(imageData: ImageData, bgColor: Color) {
  const { width, height } = imageData
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = getPixel(imageData, [x, y])
      if (equalsColor(color, bgColor)) {
        continue
      }
      const rect = getRect(imageData, [x, y], bgColor)
      yield rect
    }
  }
}

function mergeRects(rects: Rect[]) {
  let mergedRects: Rect[] = []
  for (let i = 0; i < rects.length; i++) {
    let rect = { ...rects[i] }
    let toMerge: Rect | null = null
    for (const mergedRect of mergedRects) {
      if (hasOverlap(mergedRect, rect)) {
        toMerge = mergedRect
        break
      }
    }
    if (toMerge != null) {
      console.log('toMerge', toMerge.startX, toMerge.startY, toMerge.endX, toMerge.endY)
      console.log('target', rect.startX, rect.startY, rect.endX, rect.endY)
      toMerge.startX = Math.min(toMerge.startX, rect.startX)
      toMerge.startY = Math.min(toMerge.startY, rect.startY)
      toMerge.endX = Math.max(toMerge.endX, rect.endX)
      toMerge.endY = Math.max(toMerge.endY, rect.endY)
    } else {
      mergedRects.push(rect)
    }
  }
  return mergedRects
}

function getBgColor(data: ImageData) {
  return getPixel(data, [0, 0]); // TODO
}

export type ExtractYieldedTypeSize = {
  type: 'size'
  width: number
  height: number
}

export type ExtractYieldedTypeRect = {
  type: 'rect'
  rect: Rect
}

export type ExtractYieldedTypeRects = {
  type: 'rects'
  rects: Rect[]
}

export type ExtractYieldedTypeMergedRects = {
  type: 'mergedRects'
  rects: Rect[]
}

export type ExtractYieldedTypeRows = {
  type: 'rows'
  rowNum: number
  colNum: number
  rows: Rect[][]
}

type ExtractYielded = ExtractYieldedTypeSize | ExtractYieldedTypeRect | ExtractYieldedTypeRects | ExtractYieldedTypeMergedRects | ExtractYieldedTypeRows

export async function* extractSprites(img: HTMLImageElement): AsyncGenerator<ExtractYielded> {
  const maxCanvasSize = 800 * 800
  const scale = Math.min(Math.sqrt(maxCanvasSize / (img.naturalWidth * img.naturalHeight)), 1)
  const size = { width: img.naturalWidth * scale, height: img.naturalHeight * scale }
  yield { type: 'size', ...size }

  const canvas = new OffscreenCanvas(size.width, size.height)
  const context = canvas.getContext('2d')!
  context.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height)
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const bgColor = getBgColor(imageData)

  const rects: Rect[] = []
  for (const rect of getRects(imageData, bgColor)) {
    rects.push(rect)
    yield { type: 'rect', rect }
  }

  yield { type: 'rects', rects }

  let mergedRects = rects
  while (true) {
    const newMergedRects = mergeRects(mergedRects)
    console.log(`merge: ${mergedRects.length} -> ${newMergedRects.length}`)
    if (newMergedRects.length === mergedRects.length) break
    mergedRects = newMergedRects
  }

  yield { type: 'mergedRects', rects: mergedRects }

  const rows: Rect[][] = []
  let row: Rect[] = []
  for (let i = 0; i < mergedRects.length; i++) {
    const rect = mergedRects[i]
    const prevRect = mergedRects[i - 1]
    if (prevRect == null || rect.startY < prevRect.endY) {
      row.push(rect)
      continue
    }
    rows.push(row)
    row = [rect]
  }
  rows.push(row)
  const rowNum = Math.max(...rows.map(row => row.length))
  const colNum = rows.length
  yield { type: 'rows', rowNum, colNum, rows }
}
