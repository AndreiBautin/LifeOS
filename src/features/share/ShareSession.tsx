import { Download, Share2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/shared/primitives'

import { drawShareCard, type ShareCard } from './session-card'

/**
 * A button that turns a session into a picture and offers it.
 *
 * **The picture is shown before it goes anywhere.** Pressing Share draws
 * the card and opens it full screen with Share and Save under it, so
 * what leaves the app is what was looked at — and the share itself is
 * then a second press, which is what the Web Share API needs anyway: it
 * refuses a call that is not inside a tap, and drawing the image first
 * would have spent that tap.
 *
 * **Share only where the platform can send a file**
 * (`navigator.canShare({ files })`) — a phone, mostly. Elsewhere Save
 * downloads the PNG, which is the honest version of the same thing.
 */
export function ShareSession({ card }: { readonly card: ShareCard }) {
  const [image, setImage] = useState<{ readonly blob: Blob; readonly url: string } | undefined>(
    undefined,
  )
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (image === undefined) return
    return () => {
      URL.revokeObjectURL(image.url)
    }
  }, [image])

  const fileName = `liftos-${card.date}.png`
  const file =
    image === undefined ? undefined : new File([image.blob], fileName, { type: 'image/png' })
  const canShare =
    file !== undefined &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setFailed(false)
          drawShareCard(card)
            .then((blob) => {
              setImage({ blob, url: URL.createObjectURL(blob) })
            })
            .catch(() => {
              setFailed(true)
            })
            .finally(() => {
              setBusy(false)
            })
        }}
      >
        <Share2 size={14} aria-hidden />
        {busy ? 'Drawing…' : 'Share'}
      </Button>
      {failed && (
        <span role="alert" className="text-warn-500 text-xs">
          The image could not be made here.
        </span>
      )}

      {image !== undefined && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Share this session"
          className="bg-ink-950/90 fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4 backdrop-blur-sm"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setImage(undefined)
          }}
        >
          <img
            src={image.url}
            alt={`${card.title}, ${String(card.sets)} sets`}
            className="max-h-[70vh] w-auto max-w-full rounded-2xl shadow-[0_24px_60px_-20px_rgb(0_0_0/90%)]"
          />
          <div className="flex gap-2">
            {canShare && (
              <Button
                variant="primary"
                onClick={() => {
                  navigator.share({ files: [file], title: card.title }).catch(() => {
                    // Dismissing the share sheet rejects; nothing to say.
                  })
                }}
              >
                <Share2 size={16} aria-hidden />
                Share
              </Button>
            )}
            <a
              href={image.url}
              download={fileName}
              className="control-surface tap-target text-ink-50 inline-flex items-center gap-2 rounded-xl px-4 text-sm font-medium"
            >
              <Download size={16} aria-hidden />
              Save image
            </a>
            <Button
              variant="ghost"
              aria-label="Close"
              autoFocus
              onClick={() => {
                setImage(undefined)
              }}
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
