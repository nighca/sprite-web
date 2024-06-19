import { useEffect, useRef, useState } from 'react'
import { PlayIcon, PhotoIcon } from '@heroicons/react/20/solid'
import { Rect, extractSprites, ExtractYieldedTypeSize, ExtractYieldedTypeRect, ExtractYieldedTypeRects, ExtractYieldedTypeMergedRects, ExtractYieldedTypeRows } from './extract'

type StateInitial = {
  type: 'initial'
}

type StateRecognizing = {
  type: 'recognizing'
  rects: Rect[]
}

type StateMerged = {
  type: 'merged'
  rects: Rect[]
}

type StateDone = {
  type: 'done'
  rowNum: number
  colNum: number
}

type State = StateInitial | StateRecognizing | StateMerged | StateDone

export default function SpriteExtract() {

  const [state, setState] = useState<State>({ type: 'initial' })

  const [imgUrl, setImgUrl] = useState('/attack.png')
  function handleFile(file: File) {
    URL.revokeObjectURL(imgUrl)
    setImgUrl(URL.createObjectURL(file))
  }

  const [jobId, setJobId] = useState(0)
  function startJob() {
    setJobId(jobId + 1)
  }

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (imgUrl == null || canvas == null) return
    setState({ type: 'initial' })
    ;(async () => {
      const img = await createImage(imgUrl)
      const maxSize = 800 * 800
      const scale = Math.min(Math.sqrt(maxSize / (img.naturalWidth * img.naturalHeight)), 1)
      canvas.width = img.naturalWidth * scale
      canvas.height = img.naturalHeight * scale
      const context = canvas.getContext('2d')!
      context.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height)
    })()
  }, [imgUrl, canvas])

  useEffect(() => {
    if (imgUrl == null || canvas == null) return
    let cancelled = false
    ;(async () => {
      const img = await createImage(imgUrl)
      if (cancelled) return

      const extracting = extractSprites(img)

      const { value: size } = (await extracting.next()) as IteratorYieldResult<ExtractYieldedTypeSize>
      if (cancelled) return
      setState({ type: 'recognizing', rects: [] })
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d')!
      const drawImage = () => {
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, canvas.width, canvas.height)
      }
      const drawRect = (rect: Rect) => {
        context.strokeStyle = 'green'
        context.lineWidth = 1
        context.strokeRect(rect.startX, rect.startY, rect.endX - rect.startX + 1, rect.endY - rect.startY + 1)
      }

      drawImage()

      while (true) {
        const { value } = (await extracting.next()) as IteratorYieldResult<ExtractYieldedTypeRect | ExtractYieldedTypeRects>
        if (cancelled) return
        if (value.type === 'rect') {
          setState(s => ({ type: 'recognizing', rects: [...(s as StateRecognizing).rects, value.rect] }))
          drawRect(value.rect)
          await sleep(0.016)
          continue
        }
        await sleep(1)
        break
      }

      const { value: mergedRects } = (await extracting.next()) as IteratorYieldResult<ExtractYieldedTypeMergedRects>
      if (cancelled) return
      setState({ type: 'merged', rects: mergedRects.rects })
      drawImage()
      for (const rect of mergedRects.rects) {
        drawRect(rect)
      }
      await sleep(1)

      const { value: { rowNum, colNum } } = (await extracting.next()) as IteratorYieldResult<ExtractYieldedTypeRows>
      if (cancelled) return
      setState({ type: 'done', rowNum, colNum })
      drawImage()
      context.strokeStyle = '#999999'
      context.lineWidth = 1
      for (let i = 1; i < rowNum; i++) {
        const x = Math.round(i * canvas.width / rowNum)
        context.beginPath()
        context.setLineDash([5, 10])
        context.moveTo(x, 0)
        context.lineTo(x, canvas.height)
        context.stroke()
      }
      for (let i = 1; i < colNum; i++) {
        const y = Math.round(i * canvas.height / colNum)
        context.beginPath()
        context.setLineDash([5, 10])
        context.moveTo(0, y)
        context.lineTo(canvas.width, y)
        context.stroke()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [jobId])

  return (
    <section className='h-2/3 w-2/3 flex flex-col items-center'>
      <div className="lg:flex lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Sprite Extract
          </h2>
        </div>
        <div className="mt-5 flex lg:ml-8 lg:mt-0">
          <span className="hidden sm:block">
            <FileButton onFile={handleFile} />
          </span>
          {['initial', 'done'].includes(state.type) && <span className="sm:ml-3">
            <button
              type="button"
              className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              onClick={startJob}
            >
              <PlayIcon className="-ml-0.5 mr-1.5 h-5 w-5" aria-hidden="true" />
              Do Extract
            </button>
          </span>}
        </div>
      </div>
      <p className='text-xs text-slate-500 mt-6'>
        {state.type === 'initial' && `Click "Do Extract" to start`}
        {state.type === 'recognizing' && `Recognizing, ${state.rects.length} sprites`}
        {state.type === 'merged' && `Merged: ${state.rects.length} sprites`}
        {state.type === 'done' && `Done: ${state.rowNum} x ${state.colNum}`}
      </p>
      <canvas className='max-w-full max-h-80 shadow-inner p-4 rounded-lg mt-8 bg-slate-50' ref={setCanvas}></canvas>
    </section>
  )
}

type FileButtonProps = {
  onFile: (file: File) => void
}

function FileButton({ onFile }: FileButtonProps) {

  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)

  function handleFile() {
    if (inputRef.current == null) return
    const file = inputRef.current.files?.[0]
    if (file == null) return
    setFile(file)
    onFile(file)
  }

  function handleButtonClick() {
    if (inputRef.current == null) return
    inputRef.current.click()
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        onClick={handleButtonClick}
      >
        <PhotoIcon className="-ml-0.5 mr-1.5 h-5 w-5 text-gray-400" aria-hidden="true" />
        {file == null ? 'Select Image File' : file.name}
      </button>
      <input className='hidden' type="file" accept="image/*" ref={inputRef} onChange={handleFile} />
    </>
  )
}

function createImage(imgUrl: string) {
  return new Promise<HTMLImageElement>(resolve => {
    const image = new Image()
    image.src = imgUrl
    image.onload = () => {
      resolve(image)
    }
  })
}

async function sleep(duration = 0.016) {
  return new Promise(resolve => setTimeout(resolve, duration * 1000))
}
