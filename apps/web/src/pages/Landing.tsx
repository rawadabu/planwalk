import { useEffect } from 'react'
import '../styles/landing.css'
import { STATIC } from '../api'
import { HeroAnimation } from './HeroAnimation'
// Start = create an account and upload a plan (the static demo build has no accounts: it points to pricing)
const START = STATIC ? '#pricing' : '/signup'

// Marketing page. No example house: the hero is an animation of the product loop.
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
          <div className="links"><a href="#how">How it works</a><a href="#design">Design &amp; price</a><a href="#pricing">Pricing</a></div>
          <a className="btn sm primary" href={START}>Upload a plan</a>
        </div>
      </nav>
      
      <main id="top">
        <div className="wrap hero stagger">
          <div style={{ "--i": 0 } as React.CSSProperties}>
            <div className="eyebrow">Architect's plans → a home you can walk, design and price</div>
            <h1 style={{ marginTop: 14 }}>Walk through your home before the first wall goes up.</h1>
            <p className="lede">Upload the architect's plans. Planwalk rebuilds every storey 1:1 in 3D, lets your buyers choose walls, floors, windows and the kitchen with the price changing as they go, and hands the carpenter a PDF they can build from.</p>
            <div className="ctas">
              <a className="btn primary" href={START}>Upload a plan
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>
              <a className="btn" href="#how">How it works</a>
            </div>
            <div className="chips"><span className="chip">PDF plans</span><span className="chip">1:1 to the drawing</span><span className="chip">Hebrew &amp; English</span><span className="chip">No app to install</span></div>
          </div>
          <div style={{ "--i": 2 } as React.CSSProperties}><HeroAnimation /></div>
        </div>
      
        <div className="wrap">
          <div className="proof stagger">
            <div style={{ "--i": 0 } as React.CSSProperties}><b>1:1</b><span>walls and rooms taken from the drawing, not guessed</span></div>
            <div style={{ "--i": 1 } as React.CSSProperties}><b>Live price</b><span>every finish and change priced from real quantities</span></div>
            <div style={{ "--i": 2 } as React.CSSProperties}><b>Carpenter PDF</b><span>elevations, cabinet schedule and cut list, generated</span></div>
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
              <div className="step"><div className="n">Step 2</div><h3>Walk it 1:1</h3><p>Walls come from the drawing's vector data, so every room is the size on the plan. Share a link; buyers walk it on a phone.</p></div>
              <div className="step"><div className="n">Step 3</div><h3>Design and price</h3><p>Click any wall, floor or window and change it; lay out the kitchen. The price updates with every choice.</p></div>
              <div className="step"><div className="n">Step 4</div><h3>Send it to the carpenter</h3><p>One click makes the drawing set: plan, elevations, cabinet schedule, cut list and worktop, in Hebrew.</p></div>
            </div>
          </div>
        </section>
      
        <section>
          <div className="wrap">
            <div className="sechead" id="design"><div><div className="eyebrow">Design &amp; price</div><h2>Built for buyers judging a space, and the people building it</h2></div></div>
            <div className="features">
              <div className="feat"><h3>Click to change</h3><p>Paint one room, change a floor, resize a window, move a partition. The area table follows.</p></div>
              <div className="feat"><h3>Kitchen designer</h3><p>Standard modules fill the real wall to the centimetre, with a fitter's rules built in.</p></div>
              <div className="feat"><h3>Live cost</h3><p>Quantities from the geometry, prices from your own price book, VAT and budget included.</p></div>
              <div className="feat"><h3>Drawings for the workshop</h3><p>A3 sheets with dimensions, cut list and board layouts, ready to print as PDF.</p></div>
              <div className="feat"><h3>Real sun, guided tour</h3><p>Sunlight for the address, date and hour; a tour that walks buyers room by room.</p></div>
              <div className="feat"><h3>Versions and comments</h3><p>Every design saved as a version; buyers pin comments to the spot they mean.</p></div>
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
                <a className="btn" href={START}>Start</a>
              </div>
              <div className="price featured">
                <div className="tier">Studio</div>
                <div className="amt">₪1,190 <small>/ month</small></div>
                <ul><li>Up to 10 homes a month</li><li>Your logo on shared walkthroughs</li><li>For architects and interior designers</li></ul>
                <a className="btn primary" href={START}>Start</a>
              </div>
              <div className="price">
                <div className="tier">Developer</div>
                <div className="amt">Custom</div>
                <ul><li>Every unit type in a project</li><li>Walkthroughs embedded on your sales site</li><li>Invoicing and a dedicated contact</li></ul>
                <a className="btn" href="#top">Talk to us</a>
              </div>
            </div>
            <div className="cta">
              <div><h2>Start with your plan.</h2><p>Upload the architect's PDF and walk your home in 3D.</p></div>
              <a className="btn primary" href={START}>Upload a plan</a>
            </div>
          </div>
        </section>
      </main>
      
      <footer><div className="wrap"><span>Planwalk · concept build</span><span>Prices are placeholders</span></div></footer>
    </>
  )
}
