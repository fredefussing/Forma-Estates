const express = require('express');
const router = express.Router();

// Pris side
router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="da">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Priser - Nordic Sketch</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
          background: #f5f5f0; 
          color: #2c2c2c;
          line-height: 1.6;
        }
        nav { 
          background: #fff; 
          padding: 1rem 2rem; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        .nav-container { 
          max-width: 1200px; 
          margin: 0 auto; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
        }
        .logo { 
          font-size: 1.5rem; 
          font-weight: 700; 
          color: #1a1a1a; 
          text-decoration: none; 
        }
        .nav-links { 
          display: flex; 
          gap: 2rem; 
          list-style: none; 
        }
        .nav-links a { 
          text-decoration: none; 
          color: #555; 
          font-weight: 500; 
        }
        .nav-links a.active { 
          color: #e74c3c; 
        }
        .container { 
          max-width: 1000px; 
          margin: 0 auto; 
          padding: 3rem 2rem; 
        }
        h1 { 
          text-align: center; 
          font-size: 2.5rem; 
          margin-bottom: 0.5rem; 
        }
        .subtitle { 
          text-align: center; 
          color: #666; 
          margin-bottom: 3rem; 
        }
        .pricing-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); 
          gap: 2rem; 
        }
        .pricing-card { 
          background: #fff; 
          border-radius: 16px; 
          padding: 2rem; 
          text-align: center; 
          box-shadow: 0 10px 40px rgba(0,0,0,0.08);
          transition: transform 0.3s;
        }
        .pricing-card:hover { 
          transform: translateY(-5px); 
        }
        .pricing-card.popular { 
          border: 2px solid #1a1a1a; 
          position: relative; 
        }
        .popular-badge { 
          position: absolute; 
          top: -12px; 
          left: 50%; 
          transform: translateX(-50%); 
          background: #1a1a1a; 
          color: #fff; 
          padding: 0.3rem 1rem; 
          border-radius: 20px; 
          font-size: 0.85rem; 
        }
        .pricing-title { 
          font-size: 1.5rem; 
          margin-bottom: 0.5rem; 
        }
        .pricing-price { 
          font-size: 3rem; 
          font-weight: 700; 
          margin: 1rem 0; 
        }
        .pricing-price span { 
          font-size: 1rem; 
          color: #666; 
        }
        .pricing-features { 
          list-style: none; 
          margin: 2rem 0; 
          text-align: left;
        }
        .pricing-features li { 
          padding: 0.5rem 0; 
          padding-left: 1.5rem; 
          position: relative; 
        }
        .pricing-features li::before { 
          content: '✓'; 
          position: absolute; 
          left: 0; 
          color: #27ae60; 
          font-weight: bold; 
        }
        .pricing-btn { 
          width: 100%; 
          background: #1a1a1a; 
          color: #fff; 
          padding: 1rem; 
          border: none; 
          border-radius: 8px; 
          font-size: 1.1rem; 
          cursor: pointer; 
          transition: background 0.2s;
        }
        .pricing-btn:hover { 
          background: #333; 
        }
        .free-note { 
          background: #fff3cd; 
          padding: 1rem; 
          border-radius: 8px; 
          margin-bottom: 2rem; 
          text-align: center;
        }
        .lock-message {
          background: #f8f9fa;
          border: 2px solid #e74c3c;
          border-radius: 12px;
          padding: 2rem;
          text-align: center;
          margin-bottom: 2rem;
        }
        .lock-message h2 {
          color: #e74c3c;
          margin-bottom: 1rem;
        }
      </style>
    </head>
    <body>
      <nav>
        <div class="nav-container">
          <a href="/" class="logo">Nordic Sketch</a>
          <ul class="nav-links">
            <li><a href="/">Forside</a></li>
            <li><a href="/find-stil">Find din stil</a></li>
            <li><a href="/trending">Trending</a></li>
            <li><a href="/pris" class="active">Pris</a></li>
            <li><a href="/om-os">Om os</a></li>
          </ul>
        </div>
      </nav>

      <div class="container">
        <div class="free-note">
          💡 <strong>Start gratis:</strong> 2 billeder i Skandinavisk eller Moderne stil. Opgrader for at låse op for alle stilarter!
        </div>

        <h1>Vælg dit abonnement</h1>
        <p class="subtitle">Få adgang til alle stilarter og generér flere billeder</p>

        <div class="pricing-grid">

          <div class="pricing-card">
            <h3 class="pricing-title">Basic</h3>
            <div class="pricing-price">49<span> kr</span></div>
            <p>Perfekt til at prøve flere stilarter</p>
            <ul class="pricing-features">
              <li>10 AI-billeder</li>
              <li>Alle 8 stilarter</li>
              <li>Alle 15 rum-typer</li>
              <li>Alle 3 budget-niveauer</li>
            </ul>
            <button class="pricing-btn" onclick="buy('basic')">Vælg Basic</button>
          </div>

          <div class="pricing-card popular">
            <div class="popular-badge">Mest populær</div>
            <h3 class="pricing-title">Pro</h3>
            <div class="pricing-price">99<span> kr</span></div>
            <p>Til dig der vil eksperimentere</p>
            <ul class="pricing-features">
              <li>25 AI-billeder</li>
              <li>Alle 8 stilarter</li>
              <li>Alle 15 rum-typer</li>
              <li>Alle 3 budget-niveauer</li>
              <li>Hurtigere generering</li>
            </ul>
            <button class="pricing-btn" onclick="buy('pro')">Vælg Pro</button>
          </div>

          <div class="pricing-card">
            <h3 class="pricing-title">Unlimited</h3>
            <div class="pricing-price">199<span> kr</span></div>
            <p>Fuld frihed til dit hjem</p>
            <ul class="pricing-features">
              <li>60 AI-billeder</li>
              <li>Alle 8 stilarter</li>
              <li>Alle 15 rum-typer</li>
              <li>Alle 3 budget-niveauer</li>
              <li>Prioriteret support</li>
            </ul>
            <button class="pricing-btn" onclick="buy('unlimited')">Vælg Unlimited</button>
          </div>

        </div>
      </div>

      <script>
        function buy(package) {
          const urls = {
            basic: 'https://ej8jeq-rs.myshopify.com/cart/10220649021782:1',
            pro: 'https://ej8jeq-rs.myshopify.com/cart/10220626149718:1',
            unlimited: 'https://ej8jeq-rs.myshopify.com/cart/10220614877526:1'
          };
          window.location.href = urls[package];
        }
      </script>
    </body>
    </html>
  `);
});

module.exports = router;