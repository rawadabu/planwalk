import { useEffect } from 'react'
import '../styles/landing.css'
import { STATIC } from '../api'
// In the static demo build, links are hash routes and images sit next to index.html
const L = (p: string) => (STATIC ? '#' + p : p)
const IMG = STATIC ? './img/' : '/img/'

// Marketing page. All "walk the demo" links open the real viewer at /h/twin-a.
export default function Landing() {
  useEffect(() => { document.title = 'Planwalk' }, [])
  return (
    <>
      <nav>
        <div className="wrap">
          <a className="logo" href="#top">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M3 3h18v18H3z"/><path d="M3 12h9v9M12 3v5"/><circle cx="17" cy="16" r="1.6" fill="currentColor" stroke="none"/></svg>
            Planwalk
          </a>
          <div className="links"><a href="#how">How it works</a><a href="#demo">Demo house</a><a href="#pricing">Pricing</a><a href={L('/app')}>Sign in</a></div>
          <a className="btn sm primary" href={L('/h/twin-a')}>Walk the demo</a>
        </div>
      </nav>
      
      <main id="top">
        <div className="wrap hero stagger">
          <div style={{ "--i": 0 } as React.CSSProperties}>
            <div className="eyebrow">Architect's plans → a house you can walk</div>
            <h1 style={{ marginTop: 14 }}>Walk through your home before the first wall goes up.</h1>
            <p className="lede">Upload the architect's plans. Planwalk rebuilds every storey 1:1 in 3D, with walls taken straight from the drawing and furniture designed with AI, and gives your buyers a link they can walk through on any phone.</p>
            <div className="ctas">
              <a className="btn primary" href={L('/h/twin-a')}>Walk the demo house
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
              <a className="btn" href="#how">How it works</a>
            </div>
            <div className="chips"><span className="chip">PDF · DWG plans</span><span className="chip">Scale 1:100</span><span className="chip">Hebrew &amp; English</span><span className="chip">No app to install</span></div>
          </div>
          <a className="shot" href={L('/h/twin-a')} style={{ "--i": 2, textDecoration: "none" } as React.CSSProperties} aria-label="Open the demo walkthrough">
            <div className="bar"><i></i><i></i><i></i><span>planwalk · twin house, unit A · living room</span></div>
            <img src={IMG + 'living.jpg'} alt="Walkthrough view of the demo house living room: bouclé sofa and armchairs, floating oak stair, double-height space" width="986" height="684" />
            <div className="tag"><b>Living room</b> · 780 × 410 cm, as on the plan</div>
          </a>
        </div>
      
        <div className="wrap">
          <div className="proof stagger">
            <div style={{ "--i": 0 } as React.CSSProperties}><b>±2 cm</b><span>room sizes vs. the architect's dimensions</span></div>
            <div style={{ "--i": 1 } as React.CSSProperties}><b>3 storeys</b><span>ground, first and top floor, joined by stairs you climb</span></div>
            <div style={{ "--i": 2 } as React.CSSProperties}><b>22 rooms</b><span>each named and measured on a live plan map</span></div>
            <div style={{ "--i": 3 } as React.CSSProperties}><b>0 installs</b><span>opens from a link on phone, tablet or laptop</span></div>
          </div>
        </div>
      
        <section id="how">
          <div className="wrap">
            <div className="sechead">
              <div><div className="eyebrow">How it works</div><h2>From a PDF to a house your buyers can walk</h2></div>
              <p>Geometry comes from the drawing, never from an AI guess. AI is used only for what the plan doesn't specify: the furniture and the finish.</p>
            </div>
            <div className="steps">
              <div className="step"><div className="n">Step 1</div><h3>Upload the plans</h3><p>Floor plans per storey as PDF or DWG. We read the scale from the dimensions on the sheet.</p></div>
              <div className="step"><div className="n">Step 2</div><h3>Walls from the vectors</h3><p>Walls are taken from the drawing's vector data and aligned across storeys, so every room is 1:1.</p></div>
              <div className="step"><div className="n">Step 3</div><h3>Furnish with AI</h3><p>Concept images set the style; each piece becomes a 3D model and sits on its footprint from the plan.</p></div>
              <div className="step"><div className="n">Step 4</div><h3>Share a link</h3><p>Buyers walk, climb the stairs, change the time of day and measure anything with the tape.</p></div>
            </div>
          </div>
        </section>
      
        <section id="demo">
          <div className="wrap">
            <div className="sechead">
              <div><div className="eyebrow">Demo house</div><h2>Twin house, unit A</h2></div>
              <a className="btn" href={L('/h/twin-a')}>Open the walkthrough</a>
            </div>
            <div className="gallery">
              <figure className="big"><img src={IMG + 'golden.jpg'} alt="Golden-hour light with leaf shadows on the walls, kitchen and island in the background" loading="lazy" /><figcaption><b>Golden hour</b> · sunlight enters through the real window openings</figcaption></figure>
              <figure><img src={IMG + 'kitchen.jpg'} alt="Kitchen with a sculptural travertine island, dining chairs and walnut cabinetry" loading="lazy" /><figcaption><b>Kitchen</b> · 440 × 460 cm, island and table on their plan footprint</figcaption></figure>
              <figure><img src={IMG + 'master.jpg'} alt="Master bedroom with king bed and sliding door to the balcony" loading="lazy" /><figcaption><b>Master bedroom</b> · top floor, 400 × 360 cm</figcaption></figure>
            </div>
          </div>
        </section>
      
        <section>
          <div className="wrap">
            <div className="sechead"><div><div className="eyebrow">In the walkthrough</div><h2>Built for buyers judging a space</h2></div></div>
            <div className="features">
              <div className="feat"><h3>Tape measure</h3><p>Tap two points on the floor to get the distance in centimetres.</p></div>
              <div className="feat"><h3>Every storey, real stairs</h3><p>Walk up and down the staircase, or jump between floors from the bar.</p></div>
              <div className="feat"><h3>Time of day</h3><p>Morning, noon, golden hour or evening, with the sun coming through the actual windows.</p></div>
              <div className="feat"><h3>Live plan map</h3><p>The architect's own plan, with the current room highlighted. Tap the map to move there.</p></div>
              <div className="feat"><h3>Top view</h3><p>See a whole storey at once, then drop back to eye level where you tapped.</p></div>
              <div className="feat"><h3>Fast on phones</h3><p>Quality adapts from high to low, and the house is drawn in a few dozen draw calls.</p></div>
            </div>
          </div>
        </section>
      
        <section id="pricing">
          <div className="wrap">
            <div className="sechead"><div><div className="eyebrow">Pricing</div><h2>Pay per home, or subscribe if you sell many</h2></div></div>
            <div className="prices">
              <div className="price">
                <div className="tier">Single home</div>
                <div className="amt">₪349 <small>/ home</small></div>
                <ul><li>All storeys of one home</li><li>Furnished walkthrough link</li><li>Tape measure and time of day</li></ul>
                <a className="btn" href={L('/h/twin-a')}>See the demo</a>
              </div>
              <div className="price featured">
                <div className="tier">Studio</div>
                <div className="amt">₪1,190 <small>/ month</small></div>
                <ul><li>Up to 10 homes a month</li><li>Your logo on shared walkthroughs</li><li>For architects and interior designers</li></ul>
                <a className="btn primary" href={L('/h/twin-a')}>Walk the demo</a>
              </div>
              <div className="price">
                <div className="tier">Developer</div>
                <div className="amt">Custom</div>
                <ul><li>Every unit type in a project</li><li>Walkthroughs embedded on your sales site</li><li>Invoicing and a dedicated contact</li></ul>
                <a className="btn" href="#top">Talk to us</a>
              </div>
            </div>
            <div className="cta">
              <div><h2>See it on a real plan.</h2><p>The demo is a two-family house built from its architect's PDF.</p></div>
              <a className="btn primary" href={L('/h/twin-a')}>Walk the demo house</a>
            </div>
          </div>
        </section>
      </main>
      
      <footer><div className="wrap"><span>Planwalk · concept build</span><span>Prices are placeholders · <a href={L('/app')} style={{ color: "inherit" }}>Customer dashboard</a></span></div></footer>
    </>
  )
}
