import type { SVGProps } from 'react'
import PixelIcon from './PixelIcon'
export default function RpsIcon({ throw: t, ...props }: { throw: string; size?: number } & SVGProps<SVGSVGElement>) {
  return <PixelIcon {...props} name={t === 'paper' || t === 'scissors' ? t : 'rock'} aria-label={t} />
}
