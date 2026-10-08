import PixelIcon from './PixelIcon'
import { Button } from './ui'
export default function Intro({ onStart }: { onStart: () => void }) {
  return <div className="intro-screen">
    <PixelIcon size={60} className="text-blood" aria-hidden="true" />
    <h1 className="display intro-title">Can you<br /><span className="text-blood">survive</span><span className="text-amber">?</span></h1>
    {/* The one rule of the question rounds. The boss is still a secret here, so it isn't named. */}
    <p className="boss-rule intro-rule">Any right answer works, unless it’s the same one the boss picked.</p>
    <Button variant="danger" className="hero-button mt-10 w-full" onClick={onStart}>Play <span aria-hidden="true" className="ml-3">→</span></Button>
  </div>
}
