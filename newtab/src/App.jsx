import LiquidChrome from './fx/LiquidChrome.jsx'

const AMBIENT = [0.096, 0.017, 0.027]

function Engraved({ text }) {
  return (
    <svg className="engraved" viewBox="0 0 600 170" role="img" aria-label={text}>
      <defs>
        <linearGradient id="eg-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9c9cc" />
          <stop offset="0.55" stopColor="#f3eaeb" />
          <stop offset="1" stopColor="#fbf6f6" />
        </linearGradient>
        <filter id="eg-cut" x="-5%" y="-15%" width="110%" height="140%">
          <feComponentTransfer in="SourceAlpha" result="outside"><feFuncA type="table" tableValues="1 0" /></feComponentTransfer>
          <feOffset in="outside" dy="4" result="outsideLow" />
          <feGaussianBlur in="outsideLow" stdDeviation="1.5" result="wallBlur" />
          <feFlood floodColor="#2a0710" floodOpacity="0.92" />
          <feComposite in2="wallBlur" operator="in" result="wallColor" />
          <feComposite in="wallColor" in2="SourceAlpha" operator="in" result="wall" />
          <feOffset in="SourceAlpha" dy="1.6" result="lipLow" />
          <feGaussianBlur in="lipLow" stdDeviation="0.7" result="lipBlur" />
          <feFlood floodColor="#ffe3ea" floodOpacity="0.4" />
          <feComposite in2="lipBlur" operator="in" result="lipColor" />
          <feComposite in="lipColor" in2="SourceAlpha" operator="out" result="lip" />
          <feOffset in="SourceAlpha" dy="-1" result="rimHigh" />
          <feGaussianBlur in="rimHigh" stdDeviation="0.6" result="rimBlur" />
          <feFlood floodColor="#0c0205" floodOpacity="0.7" />
          <feComposite in2="rimBlur" operator="in" result="rimColor" />
          <feComposite in="rimColor" in2="SourceAlpha" operator="out" result="rim" />
          <feMerge><feMergeNode in="rim" /><feMergeNode in="lip" /><feMergeNode in="SourceGraphic" /><feMergeNode in="wall" /></feMerge>
        </filter>
      </defs>
      <text x="300" y="128" textAnchor="middle" fill="url(#eg-fill)" filter="url(#eg-cut)">{text}</text>
    </svg>
  )
}

export default function App() {
  return (
    <div className="ntp">
      <div className="fx">
        <LiquidChrome color="#6a1a29" speed={0.1} amplitude={0.3} roughness={0.25} exposure={0.72} intro={false} ambient={AMBIENT} interactive={false} tilt={0} rippleStrength={0} />
      </div>
      <div className="over">
        <Engraved text="Google" />
        <form className="search" action="https://www.google.com/search">
          <input name="q" placeholder="Search Google or type a URL" autoFocus autoComplete="off" />
        </form>
      </div>
    </div>
  )
}
