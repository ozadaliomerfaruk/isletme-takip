<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=1440, initial-scale=1" />
<title>İşletme Takip · Onboarding v2 · Hesap maskot</title>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

<style>
  /* ============ TOKENS — uygulamadan birebir çekildi ============ */
  :root{
    /* App tokens — gerçek uygulamadan örnekleme */
    --app-green:        #0E5C4E;   /* primary, butonlar, tab aktif */
    --app-green-deep:   #0A4A3F;
    --app-green-soft:   #E6F2EE;
    --gain:             #00B86B;   /* +₺ tutarlar */
    --gain-soft:        #DFF7EA;
    --loss:             #E53935;   /* −₺ tutarlar, borç */
    --loss-soft:        #FCE6E6;
    --info-blue:        #5B7CFA;   /* alacaklar mavi */

    --ios-bg:           #F2F3F5;
    --ios-card:         #FFFFFF;
    --ios-divider:      #E9EBEE;
    --ios-text:         #16181C;
    --ios-muted:        #6B7280;
    --ios-muted-2:      #9CA3AF;

    /* Avatar pastels — gerçek app'tekiyle aynı tonlar */
    --av-mint:   #C8E6D6;
    --av-peach:  #FBDEB8;
    --av-pink:   #FAD0D0;
    --av-blue:   #DDE4F6;
    --av-lilac:  #E4D9EE;
    --av-cream:  #F8E6C7;
    --av-sage:   #D6E6CC;

    /* Page chrome */
    --bg:        #F2EBE0;        /* sıcak krem zemin, ilk mockup'tan kalan */
    --bg-2:      #EEE5D6;
    --ink:       #1B1614;
    --ink-2:     #3A3633;
    --rule:      #1B1614;
    --gold:      #C99A3E;
    --coral:     #DD7355;

    --r-card: 18px;
    --r-pill: 999px;

    --display: 'Fraunces', 'Times New Roman', serif;
    --body:    'Plus Jakarta Sans', system-ui, sans-serif;
    --mono:    'JetBrains Mono', ui-monospace, monospace;
  }

  *{box-sizing:border-box; margin:0; padding:0}
  html,body{background:var(--bg); color:var(--ink); font-family:var(--body); -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility}
  body{
    background-image:
      radial-gradient(1100px 540px at 12% -8%, rgba(255,255,255,.55), transparent 60%),
      radial-gradient(900px 460px at 90% 8%, rgba(201,154,62,.10), transparent 65%),
      linear-gradient(180deg, var(--bg) 0%, var(--bg-2) 100%);
    min-height:100vh;
    padding:48px 56px 96px;
  }

  /* film grain */
  body::before{
    content:""; position:fixed; inset:0; pointer-events:none; z-index:0; opacity:.05;
    background-image:url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence baseFrequency='0.9' /></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.6'/></svg>");
  }

  .page{ max-width:1340px; margin:0 auto; position:relative; z-index:1 }

  /* ============ Header ============ */
  .top{
    display:grid; grid-template-columns: 1.4fr 1fr; gap:48px; align-items:end;
    padding-bottom:28px; border-bottom:1.5px solid var(--rule);
  }
  .badge{
    display:inline-flex; align-items:center; gap:8px;
    font-family:var(--mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase;
    background:transparent; border:1px solid var(--ink); border-radius:999px; padding:6px 12px;
  }
  .badge .dot{width:6px;height:6px;border-radius:50%; background:var(--coral)}
  h1{
    font-family:var(--display); font-weight:500; font-style:italic;
    font-size:84px; line-height:.95; letter-spacing:-.02em; margin-top:18px;
  }
  h1 .em{ font-style:normal; font-weight:600; color:var(--app-green-deep) }
  .lead{ margin-top:18px; max-width:560px; font-size:17px; line-height:1.55; color:var(--ink-2) }
  .lead b{ color:var(--ink); font-weight:700 }

  .meta{
    border:1px solid var(--ink); border-radius:14px; padding:18px 20px; background:rgba(255,255,255,.45);
    backdrop-filter: blur(2px);
  }
  .meta h4{ font-family:var(--mono); font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--ink-2); margin-bottom:10px }
  .meta ul{ list-style:none; display:grid; gap:8px; font-size:14px }
  .meta li{ display:flex; gap:10px; align-items:flex-start }
  .meta li::before{ content:"→"; font-family:var(--mono); color:var(--coral); flex-shrink:0 }
  .meta b{ font-weight:700 }
  .meta .strike{ text-decoration: line-through; color:var(--ink-2); margin-right:4px }

  /* ============ Section heading ============ */
  .sec-head{
    margin: 56px 0 24px; display:flex; align-items:baseline; gap:14px;
    border-bottom:1px dashed rgba(27,22,20,.3); padding-bottom:14px;
  }
  .sec-head .num{
    font-family:var(--mono); font-size:13px; color:var(--coral); letter-spacing:.06em;
  }
  .sec-head h2{
    font-family:var(--display); font-weight:500; font-size:34px; letter-spacing:-.01em; line-height:1;
  }
  .sec-head .note{ margin-left:auto; font-size:13px; color:var(--ink-2); max-width:480px; text-align:right; line-height:1.4 }

  /* ============ Mascot block ============ */
  .mascot-row{
    display:grid; grid-template-columns: 1fr 1.3fr; gap:36px; align-items:center;
    padding:36px 40px; border:1.5px solid var(--ink); border-radius:24px; background:#FBF6EC;
    position:relative; overflow:hidden;
  }
  .mascot-row::after{
    content:""; position:absolute; right:-60px; bottom:-60px; width:240px; height:240px;
    background: radial-gradient(circle, rgba(201,154,62,.18), transparent 70%);
    pointer-events:none;
  }
  .mascot-grid{
    display:grid; grid-template-columns: repeat(3, 1fr); gap:18px;
  }
  .mascot-cell{
    aspect-ratio:1; background:#FFF; border:1px solid var(--ink); border-radius:16px;
    display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;
  }
  .mascot-cell .label{
    position:absolute; bottom:8px; left:10px;
    font-family:var(--mono); font-size:9.5px; letter-spacing:.14em; text-transform:uppercase;
    color:var(--ink-2);
  }
  .mascot-cell.featured{
    grid-column: span 3; aspect-ratio: auto; min-height:280px;
    background: linear-gradient(135deg, #FFFEF8, #F8EFDC);
  }
  .mascot-tag{ font-family:var(--mono); font-size:11px; letter-spacing:.14em; color:var(--coral); text-transform:uppercase }
  .mascot-name{ font-family:var(--display); font-size:64px; line-height:1; margin-top:8px; font-weight:500; font-style:italic }
  .mascot-name b{ font-style:normal; font-weight:600; color:var(--app-green-deep)}
  .mascot-desc{ margin-top:18px; font-size:15px; line-height:1.55; color:var(--ink-2); max-width:440px }
  .mascot-traits{ display:flex; gap:8px; margin-top:18px; flex-wrap:wrap }
  .trait{ font-family:var(--mono); font-size:11px; padding:5px 10px; border:1px solid var(--ink); border-radius:999px; background:#fff }

  /* ============ Phone mockups ============ */
  .phones{
    display:grid; grid-template-columns: repeat(5, 1fr); gap:22px; margin-top:8px;
  }
  .phone{
    aspect-ratio: 9 / 19.5;
    background: #0a0a0a;
    border-radius: 38px;
    padding: 8px;
    box-shadow: 0 28px 60px rgba(27,22,20,.15), 0 4px 12px rgba(27,22,20,.08);
    position:relative;
  }
  .phone .screen{
    width:100%; height:100%; background:var(--ios-bg);
    border-radius:30px; overflow:hidden; position:relative;
    display:flex; flex-direction:column;
  }
  /* Dynamic island */
  .phone .island{
    position:absolute; top:8px; left:50%; transform:translateX(-50%);
    width:74px; height:20px; background:#000; border-radius:999px; z-index:10;
  }
  /* Status bar */
  .status{
    display:flex; justify-content:space-between; align-items:center;
    padding: 10px 18px 6px; font-size:10px; font-weight:700; color:var(--ios-text);
  }
  .status .time{ font-feature-settings:"tnum"; padding-left:4px }
  .status .right{ display:flex; gap:4px; align-items:center }
  .status .right svg{ display:block }

  /* Screen content shared */
  .content{ padding: 4px 14px 0; flex:1; overflow:hidden; position:relative }
  .h-row{
    display:flex; align-items:flex-end; justify-content:space-between; margin: 8px 2px 14px;
  }
  .h-row .title{ font-size:22px; font-weight:800; letter-spacing:-.02em; color:var(--ios-text) }
  .h-row .sub{ font-size:10px; color:var(--ios-muted); margin-top:2px }
  .h-icons{ display:flex; gap:8px; align-items:center }
  .h-icons .ico{ width:22px; height:22px; display:grid; place-items:center; color:var(--ios-text) }

  /* Card primitives */
  .card{ background:var(--ios-card); border-radius:14px; padding:11px 12px; box-shadow: 0 1px 0 rgba(0,0,0,.04) }
  .row{ display:flex; align-items:center; gap:10px }
  .av{ width:30px; height:30px; border-radius:50%; display:grid; place-items:center; font-weight:700; font-size:13px; color:#2a2a2a; flex-shrink:0 }
  .col{ display:flex; flex-direction:column; min-width:0; flex:1 }
  .name{ font-size:11.5px; font-weight:600; color:var(--ios-text); line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
  .meta-line{ font-size:9px; color:var(--ios-muted); margin-top:2px }
  .right-num{ text-align:right; font-size:10.5px }
  .right-num .lab{ color:var(--ios-muted); font-size:8.5px }
  .right-num .val{ font-weight:800; font-size:11.5px; font-feature-settings:"tnum"; line-height:1.2; margin-top:1px }

  /* Bottom tab */
  .tab{
    margin-top:auto; padding: 8px 6px 14px; background:#fff;
    border-top:1px solid var(--ios-divider);
    display:grid; grid-template-columns: repeat(5,1fr); gap:2px;
  }
  .tab .t{ display:flex; flex-direction:column; align-items:center; gap:3px; font-size:9px; color:var(--ios-muted); font-weight:600 }
  .tab .t.active{ color:var(--app-green) }
  .tab .t svg{ width:18px; height:18px }

  /* ============ Screen 1: Welcome ============ */
  .welcome{
    background: linear-gradient(180deg, var(--app-green-deep) 0%, var(--app-green) 60%, #0F6957 100%);
    color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:space-between;
    padding: 56px 22px 28px; flex:1;
  }
  .welcome .brand{ font-family:var(--mono); font-size:10px; letter-spacing:.22em; text-transform:uppercase; opacity:.7 }
  .welcome .hero-mascot{ margin-top:18px }
  .welcome .h1{ font-family:var(--display); font-size:32px; line-height:1; font-weight:500; font-style:italic; text-align:center; margin-top:24px }
  .welcome .h1 b{ font-style:normal; font-weight:600; color:#FFD08A }
  .welcome .sub{ font-size:13px; opacity:.85; margin-top:10px; text-align:center; max-width:240px; line-height:1.4 }
  .welcome .actions{ width:100%; display:flex; flex-direction:column; gap:8px; margin-top:18px }
  .btn{
    width:100%; padding:13px; border-radius:14px; font-weight:700; font-size:13px;
    display:flex; align-items:center; justify-content:center; gap:8px; border:none; cursor:pointer;
  }
  .btn-primary{ background:#FFFFFF; color:var(--app-green-deep) }
  .btn-ghost{ background:rgba(255,255,255,.12); color:#fff; border:1px solid rgba(255,255,255,.25) }
  .welcome .legal{ font-size:8.5px; opacity:.55; text-align:center; max-width:200px; line-height:1.4; margin-top:10px }

  /* ============ Screen 2: Onboarding step ============ */
  .ob{ flex:1; display:flex; flex-direction:column; padding: 18px 18px 16px; background:#FFFEFA }
  .ob .dots{ display:flex; gap:5px; align-items:center; justify-content:flex-start }
  .ob .dot{ width:6px; height:6px; border-radius:50%; background:#D5D7DB }
  .ob .dot.on{ width:18px; border-radius:3px; background:var(--app-green) }
  .ob .skip{ margin-left:auto; font-size:11px; color:var(--ios-muted); font-weight:600 }
  .ob .head{ display:flex; align-items:center; width:100% }
  .ob .visual{ flex:1; display:grid; place-items:center; margin: 6px 0 }
  .ob .h2{ font-family:var(--display); font-size:24px; line-height:1.05; font-weight:500; font-style:italic; letter-spacing:-.01em }
  .ob .h2 b{ font-style:normal; font-weight:600; color:var(--app-green) }
  .ob .p{ font-size:12px; color:var(--ios-muted); margin-top:8px; line-height:1.45 }
  .ob .cta{ margin-top:14px; width:100%; padding:13px; border-radius:14px; background:var(--app-green); color:#fff; font-weight:700; font-size:13px; text-align:center }

  /* ============ Screen 3: Sign in ============ */
  .auth{ flex:1; display:flex; flex-direction:column; padding: 20px 18px 16px; background:#FFFEFA }
  .auth .badge-mini{ display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border:1px solid var(--app-green); border-radius:999px; font-size:9px; color:var(--app-green); font-weight:700; align-self:flex-start }
  .auth h2{ font-family:var(--display); font-size:26px; font-weight:500; font-style:italic; margin-top:12px; line-height:1 }
  .auth h2 b{ font-style:normal; font-weight:600; color:var(--app-green) }
  .auth .sub2{ font-size:11px; color:var(--ios-muted); margin-top:8px; line-height:1.45 }
  .auth .mas-mini{ display:grid; place-items:center; margin: 14px 0 8px }
  .auth .auth-btns{ display:flex; flex-direction:column; gap:7px; margin-top:8px }
  .a-btn{ display:flex; align-items:center; justify-content:center; gap:8px; padding:11px; border-radius:12px; font-size:12px; font-weight:700 }
  .a-apple{ background:#000; color:#fff }
  .a-google{ background:#fff; color:#1A1D1F; border:1px solid #E4E6EA }
  .a-mail{ background:var(--app-green); color:#fff }
  .or{ display:flex; align-items:center; gap:8px; font-size:9px; color:var(--ios-muted); margin:6px 2px; font-family:var(--mono); letter-spacing:.1em }
  .or::before, .or::after{ content:""; height:1px; flex:1; background:var(--ios-divider) }
  .legal-mini{ font-size:8.5px; color:var(--ios-muted-2); text-align:center; margin-top:auto; line-height:1.5; padding-top:10px }
  .legal-mini a{ color:var(--ios-text); text-decoration:underline }

  /* ============ Screen 4: Home (Ana Sayfa) ============ */
  .home-card{
    background:#fff; border-radius:14px; padding:12px 13px; margin: 6px 2px 10px;
    box-shadow: 0 1px 0 rgba(0,0,0,.04);
  }
  .home-card .ttl{ display:flex; justify-content:space-between; align-items:center }
  .home-card .lbl{ font-size:9.5px; font-weight:700; letter-spacing:.1em; color:var(--ios-muted); text-transform:uppercase }
  .home-card .chip{ font-size:8.5px; padding:2px 7px; border-radius:999px; background:var(--app-green-soft); color:var(--app-green); font-weight:700 }
  .home-card .big-num{ font-family:'Plus Jakarta Sans'; font-size:24px; font-weight:800; text-align:center; color:var(--gain); letter-spacing:-.02em; margin-top:6px; font-feature-settings:"tnum" }
  .home-card .big-num.neg{ color:var(--loss) }
  .home-card .sub-line{ font-size:9px; color:var(--ios-muted); text-align:center; margin-top:1px }
  .home-card .bar{
    margin-top:8px; height:5px; border-radius:999px; overflow:hidden; display:flex; background:#EEE;
  }
  .home-card .bar .g{ background:var(--gain) } .home-card .bar .r{ background:var(--loss) }
  .home-card .legend{ display:flex; justify-content:space-between; margin-top:6px; font-size:8.5px; color:var(--ios-muted) }
  .home-card .legend .d{ width:5px; height:5px; border-radius:50%; display:inline-block; margin-right:3px; vertical-align:middle }
  .dot-g{ background:var(--gain) } .dot-r{ background:var(--loss) }

  .sec-lbl{ font-size:9.5px; font-weight:700; letter-spacing:.12em; color:var(--ios-text); text-transform:uppercase; margin: 14px 4px 6px; display:flex; justify-content:space-between }
  .sec-lbl .add{ color:var(--app-green); font-weight:700; font-size:10px }

  .wallet-card{
    background:#fff; border-radius:14px; padding:10px 12px; margin-bottom:6px;
    display:flex; align-items:center; gap:10px;
  }
  .wallet-icon{
    width:26px; height:26px; border-radius:7px; background:var(--app-green-soft); color:var(--app-green);
    display:grid; place-items:center; flex-shrink:0;
  }
  .wallet-card .name2{ font-size:11.5px; font-weight:600; color:var(--ios-text) }
  .wallet-card .right2{ margin-left:auto; text-align:right }
  .wallet-card .amt{ font-size:11.5px; font-weight:800; font-feature-settings:"tnum"; color:var(--ios-text) }
  .wallet-card .amt.neg{ color:var(--loss) }
  .wallet-card .approx{ font-size:8.5px; color:var(--ios-muted); margin-top:1px }

  /* ============ Screen 5: Empty / first-transaction ============ */
  .empty{ flex:1; display:flex; flex-direction:column; padding: 16px 18px; align-items:center; text-align:center }
  .empty .lead-line{ font-family:var(--mono); font-size:9.5px; letter-spacing:.14em; color:var(--app-green); text-transform:uppercase; margin-top:8px }
  .empty .h3{ font-family:var(--display); font-size:22px; line-height:1.1; font-weight:500; font-style:italic; margin-top:10px; max-width:240px }
  .empty .h3 b{ font-style:normal; color:var(--app-green); font-weight:600 }
  .empty .p3{ font-size:11.5px; color:var(--ios-muted); line-height:1.5; margin-top:8px; max-width:240px }
  .empty .quick{
    width:100%; margin-top:14px; display:grid; grid-template-columns: 1fr 1fr; gap:8px;
  }
  .quick-tile{
    background:#fff; border-radius:14px; padding:14px 10px; display:flex; flex-direction:column; align-items:center; gap:6px;
  }
  .quick-tile .ic{ width:30px; height:30px; border-radius:8px; display:grid; place-items:center }
  .quick-tile .lab2{ font-size:10.5px; font-weight:700; color:var(--ios-text) }
  .quick-tile .desc{ font-size:8.5px; color:var(--ios-muted); line-height:1.3 }
  .quick-tile.gelir .ic{ background:var(--gain-soft); color:var(--gain) }
  .quick-tile.gider .ic{ background:var(--loss-soft); color:var(--loss) }
  .quick-tile.cari  .ic{ background:#DDE8FF; color:#3B5BDB }
  .quick-tile.urun  .ic{ background:#F1E8FF; color:#7D4BD6 }

  .fab{
    position:absolute; right:14px; bottom:64px;
    width:48px; height:48px; border-radius:50%; background:var(--app-green); color:#fff;
    display:grid; place-items:center; box-shadow: 0 6px 16px rgba(14,92,78,.35);
  }

  /* ============ Footer / tokens ============ */
  .tokens{
    margin-top:60px; padding-top:24px; border-top:1px solid var(--rule);
    display:grid; grid-template-columns: 1fr 1fr 1fr; gap:32px;
  }
  .tokens h4{ font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-2); margin-bottom:12px }
  .swatches{ display:grid; grid-template-columns: repeat(4, 1fr); gap:8px }
  .sw{ aspect-ratio:1; border-radius:10px; border:1px solid rgba(27,22,20,.15); position:relative; display:flex; align-items:flex-end; padding:6px; font-family:var(--mono); font-size:8.5px; color:#fff; text-shadow:0 1px 1px rgba(0,0,0,.4) }
  .sw.light{ color:var(--ink); text-shadow:none }
  .type-row{ display:flex; align-items:baseline; gap:14px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px dashed rgba(27,22,20,.2) }
  .type-row .name3{ font-family:var(--mono); font-size:10px; letter-spacing:.1em; color:var(--ink-2); width:96px; flex-shrink:0; text-transform:uppercase }
  .type-row .sample{ font-size:22px; line-height:1 }
  .type-row.frau .sample{ font-family:var(--display); font-style:italic; font-weight:500 }
  .type-row.body .sample{ font-family:var(--body); font-weight:600 }
  .type-row.mono .sample{ font-family:var(--mono); font-size:14px }
  .principles{ list-style:none; display:grid; gap:10px; font-size:13px; line-height:1.5 }
  .principles li{ display:flex; gap:10px }
  .principles li::before{ content:"·"; font-family:var(--mono); color:var(--coral); font-size:24px; line-height:.6 }
  .principles b{ font-weight:700 }

  .foot{
    margin-top:48px; padding-top:18px; border-top:1px solid var(--rule);
    display:flex; justify-content:space-between; font-family:var(--mono); font-size:11px; color:var(--ink-2); letter-spacing:.06em;
  }
</style>
</head>
<body>

<section class="page">

  <!-- ============ HEADER ============ -->
  <header class="top">
    <div>
      <span class="badge"><span class="dot"></span>v2 · maskot revizyonu · Mayıs 2026</span>
      <h1>Hesap, esnafın <span class="em">yan cebinde</span>.</h1>
      <p class="lead">
        Mascot artık <b>Hesap</b> — küçük, samimi, kasa tezgâhında durmaya hazır bir hesap makinesi.
        Onboarding ve auth ekranları gerçek uygulamanın görsel diliyle (zümrüt yeşili,
        beyaz kartlar, iOS tipografisi) aynı çerçevede yeniden çizildi.
      </p>
    </div>
    <aside class="meta">
      <h4>v1 → v2 değişiklikler</h4>
      <ul>
        <li><b><span class="strike">Kese</span> Hesap</b> — calculator maskot; isim çakışması yok, ekran/yüz analojisi doğal.</li>
        <li><b>Sıcak krem zemin → uygulama zemini</b> — beyaz kartlar, #F2F3F5 zemin, uygulamayla bire bir.</li>
        <li><b>Zümrüt yeşili sabit</b> — buton, tab, FAB; gerçek build ile aynı ton (#0E5C4E).</li>
        <li><b>Gerçek veri örnekleri</b> — Ana Sayfa kartları sendeki Mayıs 2026 görselinden referans alındı.</li>
        <li><b>Fraunces italik kalır</b> — hero başlıklar için karakter; gövde Plus Jakarta.</li>
      </ul>
    </aside>
  </header>

  <!-- ============ SECTION 1: MASCOT ============ -->
  <div class="sec-head">
    <span class="num">01 ·</span>
    <h2>Tanışın: Hesap</h2>
    <p class="note">Tek karakter, üç mood. Splash'ta selam verir, boş ekrandayken yönlendirir, başarı anlarında göz kırpar.</p>
  </div>

  <div class="mascot-row">
    <!-- Hero mascot -->
    <div>
      <span class="mascot-tag">★ Maskot · "hesap"</span>
      <div class="mascot-name">Hesap<b>.</b></div>
      <p class="mascot-desc">
        Yuvarlak hatlı, sevimli bir cep hesap makinesi. Ekranı yüzü, butonları gövdesi.
        İsmiyle uygulamanın yarısını (<b>hesap</b> kitap) zaten taşıyor — esnaf
        ilk saniyede "bu benim için" diyor.
      </p>
      <div class="mascot-traits">
        <span class="trait">+ sıcak</span>
        <span class="trait">+ sade</span>
        <span class="trait">+ Türkçe DNA</span>
        <span class="trait">+ animasyona uygun</span>
      </div>
    </div>

    <!-- Mascot grid -->
    <div class="mascot-grid">

      <!-- featured big -->
      <div class="mascot-cell featured">
        <svg width="200" height="240" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg">
          <!-- shadow -->
          <ellipse cx="100" cy="222" rx="58" ry="6" fill="rgba(0,0,0,.12)"/>
          <!-- body -->
          <rect x="34" y="20" width="132" height="200" rx="22" fill="#0E5C4E"/>
          <rect x="34" y="20" width="132" height="200" rx="22" fill="url(#bodyG)"/>
          <defs>
            <linearGradient id="bodyG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity=".08"/>
              <stop offset="1" stop-color="#000" stop-opacity=".12"/>
            </linearGradient>
          </defs>
          <!-- highlight -->
          <rect x="42" y="28" width="116" height="6" rx="3" fill="rgba(255,255,255,.18)"/>

          <!-- solar strip -->
          <rect x="48" y="40" width="48" height="10" rx="2" fill="#0A4A3F"/>
          <line x1="56" y1="40" x2="56" y2="50" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
          <line x1="64" y1="40" x2="64" y2="50" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
          <line x1="72" y1="40" x2="72" y2="50" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
          <line x1="80" y1="40" x2="80" y2="50" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
          <line x1="88" y1="40" x2="88" y2="50" stroke="rgba(255,255,255,.25)" stroke-width="1"/>

          <!-- ₺ icon brand -->
          <circle cx="148" cy="45" r="8" fill="#FFD08A"/>
          <text x="148" y="49" font-family="Plus Jakarta Sans" font-weight="800" font-size="11" fill="#0E5C4E" text-anchor="middle">₺</text>

          <!-- Screen (face) -->
          <rect x="48" y="58" width="104" height="48" rx="8" fill="#D6E8DA"/>
          <rect x="48" y="58" width="104" height="48" rx="8" fill="url(#screenG)"/>
          <defs>
            <linearGradient id="screenG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff" stop-opacity=".4"/>
              <stop offset="1" stop-color="#0E5C4E" stop-opacity=".1"/>
            </linearGradient>
          </defs>
          <!-- eyes -->
          <circle cx="78" cy="82" r="4.5" fill="#0E2C26"/>
          <circle cx="122" cy="82" r="4.5" fill="#0E2C26"/>
          <!-- blink highlight -->
          <circle cx="80" cy="80" r="1.4" fill="#fff"/>
          <circle cx="124" cy="80" r="1.4" fill="#fff"/>
          <!-- smile -->
          <path d="M 88 94 Q 100 100 112 94" stroke="#0E2C26" stroke-width="2" fill="none" stroke-linecap="round"/>
          <!-- cheeks -->
          <ellipse cx="70" cy="92" rx="4" ry="2.5" fill="#F2A99B" opacity=".6"/>
          <ellipse cx="130" cy="92" rx="4" ry="2.5" fill="#F2A99B" opacity=".6"/>

          <!-- button grid -->
          <g>
            <!-- row1 -->
            <rect x="48" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="74" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="100" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="126" y="118" width="26" height="18" rx="4" fill="#FFD08A"/>
            <!-- row2 -->
            <rect x="48" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="74" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="100" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="126" y="142" width="26" height="42" rx="4" fill="#DD7355"/>
            <!-- row3 -->
            <rect x="48" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="74" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="100" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <!-- row4 -->
            <rect x="48" y="190" width="48" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="100" y="190" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
            <rect x="126" y="190" width="26" height="18" rx="4" fill="#fff" opacity=".92"/>

            <!-- + symbol on featured key -->
            <line x1="139" y1="124" x2="139" y2="130" stroke="#0E5C4E" stroke-width="2" stroke-linecap="round"/>
            <line x1="136" y1="127" x2="142" y2="127" stroke="#0E5C4E" stroke-width="2" stroke-linecap="round"/>
            <!-- = symbol on tall key -->
            <line x1="135" y1="160" x2="143" y2="160" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
            <line x1="135" y1="165" x2="143" y2="165" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
          </g>

          <!-- tiny feet -->
          <ellipse cx="60" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
          <ellipse cx="140" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
        </svg>
        <div class="label">01 · default · selam</div>
      </div>

      <!-- mood 2: wink (success) -->
      <div class="mascot-cell">
        <svg width="100" height="120" viewBox="0 0 200 240">
          <ellipse cx="100" cy="222" rx="58" ry="6" fill="rgba(0,0,0,.12)"/>
          <rect x="34" y="20" width="132" height="200" rx="22" fill="#0E5C4E"/>
          <rect x="48" y="58" width="104" height="48" rx="8" fill="#D6E8DA"/>
          <!-- wink: one eye closed -->
          <circle cx="78" cy="82" r="4.5" fill="#0E2C26"/>
          <circle cx="80" cy="80" r="1.4" fill="#fff"/>
          <path d="M 117 82 Q 122 78 127 82" stroke="#0E2C26" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <!-- big smile -->
          <path d="M 84 91 Q 100 104 116 91" stroke="#0E2C26" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <ellipse cx="70" cy="93" rx="4" ry="2.5" fill="#F2A99B" opacity=".7"/>
          <ellipse cx="130" cy="93" rx="4" ry="2.5" fill="#F2A99B" opacity=".7"/>
          <!-- buttons (simplified) -->
          <rect x="48" y="118" width="104" height="92" rx="4" fill="rgba(255,255,255,.15)"/>
          <!-- spark -->
          <g transform="translate(150,30)">
            <path d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" fill="#FFD08A"/>
          </g>
          <ellipse cx="60" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
          <ellipse cx="140" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
        </svg>
        <div class="label">02 · göz kırp · başarı</div>
      </div>

      <!-- mood 3: thinking -->
      <div class="mascot-cell">
        <svg width="100" height="120" viewBox="0 0 200 240">
          <ellipse cx="100" cy="222" rx="58" ry="6" fill="rgba(0,0,0,.12)"/>
          <rect x="34" y="20" width="132" height="200" rx="22" fill="#0E5C4E"/>
          <rect x="48" y="58" width="104" height="48" rx="8" fill="#D6E8DA"/>
          <!-- thinking eyes (looking up) -->
          <circle cx="76" cy="80" r="4.5" fill="#0E2C26"/>
          <circle cx="120" cy="80" r="4.5" fill="#0E2C26"/>
          <!-- mouth: small o -->
          <ellipse cx="100" cy="94" rx="3.5" ry="2.5" fill="#0E2C26"/>
          <!-- ? bubble -->
          <circle cx="155" cy="35" r="14" fill="#FFFEF8" stroke="#0E2C26" stroke-width="1.5"/>
          <text x="155" y="40" font-family="Plus Jakarta Sans" font-weight="800" font-size="14" fill="#0E2C26" text-anchor="middle">?</text>
          <rect x="48" y="118" width="104" height="92" rx="4" fill="rgba(255,255,255,.15)"/>
          <ellipse cx="60" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
          <ellipse cx="140" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
        </svg>
        <div class="label">03 · merak · yardım</div>
      </div>

      <!-- mood 4: money happy -->
      <div class="mascot-cell">
        <svg width="100" height="120" viewBox="0 0 200 240">
          <ellipse cx="100" cy="222" rx="58" ry="6" fill="rgba(0,0,0,.12)"/>
          <rect x="34" y="20" width="132" height="200" rx="22" fill="#0E5C4E"/>
          <rect x="48" y="58" width="104" height="48" rx="8" fill="#D6E8DA"/>
          <!-- ₺ eyes -->
          <text x="78" y="88" font-family="Plus Jakarta Sans" font-weight="800" font-size="11" fill="#00B86B" text-anchor="middle">₺</text>
          <text x="122" y="88" font-family="Plus Jakarta Sans" font-weight="800" font-size="11" fill="#00B86B" text-anchor="middle">₺</text>
          <!-- big smile -->
          <path d="M 82 92 Q 100 106 118 92" stroke="#0E2C26" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <ellipse cx="70" cy="93" rx="4" ry="2.5" fill="#F2A99B" opacity=".7"/>
          <ellipse cx="130" cy="93" rx="4" ry="2.5" fill="#F2A99B" opacity=".7"/>
          <rect x="48" y="118" width="104" height="92" rx="4" fill="rgba(255,255,255,.15)"/>
          <ellipse cx="60" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
          <ellipse cx="140" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
        </svg>
        <div class="label">04 · gelir · kâr</div>
      </div>
    </div>

  </div>

  <!-- ============ SECTION 2: PHONES ============ -->
  <div class="sec-head">
    <span class="num">02 ·</span>
    <h2>Akış · 5 ekran</h2>
    <p class="note">Splash → onboarding (2) → auth → ilk açılış (empty). Renkler, kartlar, alt tab gerçek build ile birebir.</p>
  </div>

  <div class="phones">

    <!-- ===== PHONE 1: WELCOME / SPLASH ===== -->
    <div class="phone">
      <div class="island"></div>
      <div class="screen">
        <div class="welcome">
          <div class="brand">İşletme Takip</div>
          <div class="hero-mascot">
            <!-- big mascot -->
            <svg width="150" height="180" viewBox="0 0 200 240">
              <ellipse cx="100" cy="222" rx="58" ry="6" fill="rgba(0,0,0,.25)"/>
              <rect x="34" y="20" width="132" height="200" rx="22" fill="#0A4A3F"/>
              <rect x="42" y="28" width="116" height="6" rx="3" fill="rgba(255,255,255,.18)"/>
              <rect x="48" y="40" width="48" height="10" rx="2" fill="#063026"/>
              <circle cx="148" cy="45" r="8" fill="#FFD08A"/>
              <text x="148" y="49" font-family="Plus Jakarta Sans" font-weight="800" font-size="11" fill="#0E5C4E" text-anchor="middle">₺</text>
              <rect x="48" y="58" width="104" height="48" rx="8" fill="#D6E8DA"/>
              <circle cx="78" cy="82" r="4.5" fill="#0E2C26"/>
              <circle cx="122" cy="82" r="4.5" fill="#0E2C26"/>
              <circle cx="80" cy="80" r="1.4" fill="#fff"/>
              <circle cx="124" cy="80" r="1.4" fill="#fff"/>
              <path d="M 88 94 Q 100 100 112 94" stroke="#0E2C26" stroke-width="2" fill="none" stroke-linecap="round"/>
              <ellipse cx="70" cy="92" rx="4" ry="2.5" fill="#F2A99B" opacity=".6"/>
              <ellipse cx="130" cy="92" rx="4" ry="2.5" fill="#F2A99B" opacity=".6"/>
              <!-- buttons -->
              <rect x="48" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="74" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="100" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="126" y="118" width="26" height="18" rx="4" fill="#FFD08A"/>
              <rect x="48" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="74" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="100" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="126" y="142" width="26" height="42" rx="4" fill="#DD7355"/>
              <rect x="48" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="74" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="100" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="48" y="190" width="48" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="100" y="190" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="126" y="190" width="26" height="18" rx="4" fill="#fff" opacity=".92"/>
              <ellipse cx="60" cy="222" rx="8" ry="3" fill="#063026"/>
              <ellipse cx="140" cy="222" rx="8" ry="3" fill="#063026"/>
            </svg>
          </div>
          <div>
            <div class="h1">Esnafın <b>yan cebi</b>.</div>
            <div class="sub">Kasa, cari, personel, ürün — hepsi tek bir hesapta.</div>
          </div>
          <div class="actions">
            <button class="btn btn-primary">Başlayalım</button>
            <button class="btn btn-ghost">Hesabım var, gir</button>
          </div>
          <div class="legal">Devam ederek Şartlar ve Gizlilik politikasını kabul ediyorsun.</div>
        </div>
      </div>
    </div>

    <!-- ===== PHONE 2: ONBOARDING 1 ===== -->
    <div class="phone">
      <div class="island"></div>
      <div class="screen">
        <div class="status">
          <div class="time">23:56</div>
          <div class="right">
            <svg width="14" height="10" viewBox="0 0 14 10"><rect x="0" y="6" width="2" height="4" rx=".5" fill="#16181C"/><rect x="3" y="4" width="2" height="6" rx=".5" fill="#16181C"/><rect x="6" y="2" width="2" height="8" rx=".5" fill="#16181C"/><rect x="9" y="0" width="2" height="10" rx=".5" fill="#16181C" opacity=".4"/></svg>
            <svg width="12" height="10" viewBox="0 0 12 10"><path d="M6 2 Q3 2 0 5 L2 7 Q4 5 6 5 Q8 5 10 7 L12 5 Q9 2 6 2 Z" fill="#16181C"/></svg>
            <svg width="20" height="10" viewBox="0 0 20 10"><rect x="0" y="1" width="17" height="8" rx="2" stroke="#16181C" stroke-width=".8" fill="none"/><rect x="1.5" y="2.5" width="13.5" height="5" rx=".5" fill="#16181C"/></svg>
          </div>
        </div>
        <div class="ob">
          <div class="head">
            <div class="dots"><div class="dot on"></div><div class="dot"></div><div class="dot"></div></div>
            <div class="skip">Geç</div>
          </div>
          <div class="visual">
            <!-- mini hesap with floating coins -->
            <svg width="160" height="200" viewBox="0 0 200 240">
              <!-- floating coins behind -->
              <g opacity=".9">
                <circle cx="40" cy="60" r="14" fill="#FFD08A"/>
                <text x="40" y="65" font-family="Plus Jakarta Sans" font-weight="800" font-size="14" fill="#0E5C4E" text-anchor="middle">₺</text>
                <circle cx="170" cy="100" r="11" fill="#FFD08A"/>
                <text x="170" y="104" font-family="Plus Jakarta Sans" font-weight="800" font-size="11" fill="#0E5C4E" text-anchor="middle">₺</text>
                <circle cx="30" cy="180" r="9" fill="#FFD08A"/>
                <text x="30" y="184" font-family="Plus Jakarta Sans" font-weight="800" font-size="9" fill="#0E5C4E" text-anchor="middle">₺</text>
              </g>
              <ellipse cx="100" cy="222" rx="58" ry="6" fill="rgba(0,0,0,.12)"/>
              <rect x="34" y="20" width="132" height="200" rx="22" fill="#0E5C4E"/>
              <rect x="42" y="28" width="116" height="6" rx="3" fill="rgba(255,255,255,.18)"/>
              <rect x="48" y="40" width="48" height="10" rx="2" fill="#0A4A3F"/>
              <circle cx="148" cy="45" r="8" fill="#FFD08A"/>
              <text x="148" y="49" font-family="Plus Jakarta Sans" font-weight="800" font-size="11" fill="#0E5C4E" text-anchor="middle">₺</text>
              <rect x="48" y="58" width="104" height="48" rx="8" fill="#D6E8DA"/>
              <!-- money eyes -->
              <text x="78" y="88" font-family="Plus Jakarta Sans" font-weight="800" font-size="11" fill="#00B86B" text-anchor="middle">₺</text>
              <text x="122" y="88" font-family="Plus Jakarta Sans" font-weight="800" font-size="11" fill="#00B86B" text-anchor="middle">₺</text>
              <path d="M 84 92 Q 100 104 116 92" stroke="#0E2C26" stroke-width="2.5" fill="none" stroke-linecap="round"/>
              <ellipse cx="70" cy="93" rx="4" ry="2.5" fill="#F2A99B" opacity=".7"/>
              <ellipse cx="130" cy="93" rx="4" ry="2.5" fill="#F2A99B" opacity=".7"/>
              <rect x="48" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="74" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="100" y="118" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="126" y="118" width="26" height="18" rx="4" fill="#FFD08A"/>
              <rect x="48" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="74" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="100" y="142" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="126" y="142" width="26" height="42" rx="4" fill="#DD7355"/>
              <rect x="48" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="74" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="100" y="166" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="48" y="190" width="48" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="100" y="190" width="22" height="18" rx="4" fill="#fff" opacity=".92"/>
              <rect x="126" y="190" width="26" height="18" rx="4" fill="#fff" opacity=".92"/>
              <ellipse cx="60" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
              <ellipse cx="140" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
            </svg>
          </div>
          <div class="h2">Her kuruşun <b>ne tarafta</b> olduğunu gör.</div>
          <p class="p">Gelir, gider, kâr — tek bir ekranda, bugünkü gibi net.</p>
          <div class="cta">İlerle</div>
        </div>
      </div>
    </div>

    <!-- ===== PHONE 3: ONBOARDING 2 (cari/personel) ===== -->
    <div class="phone">
      <div class="island"></div>
      <div class="screen">
        <div class="status">
          <div class="time">23:56</div>
          <div class="right">
            <svg width="14" height="10" viewBox="0 0 14 10"><rect x="0" y="6" width="2" height="4" rx=".5" fill="#16181C"/><rect x="3" y="4" width="2" height="6" rx=".5" fill="#16181C"/><rect x="6" y="2" width="2" height="8" rx=".5" fill="#16181C"/><rect x="9" y="0" width="2" height="10" rx=".5" fill="#16181C" opacity=".4"/></svg>
            <svg width="12" height="10" viewBox="0 0 12 10"><path d="M6 2 Q3 2 0 5 L2 7 Q4 5 6 5 Q8 5 10 7 L12 5 Q9 2 6 2 Z" fill="#16181C"/></svg>
            <svg width="20" height="10" viewBox="0 0 20 10"><rect x="0" y="1" width="17" height="8" rx="2" stroke="#16181C" stroke-width=".8" fill="none"/><rect x="1.5" y="2.5" width="13.5" height="5" rx=".5" fill="#16181C"/></svg>
          </div>
        </div>
        <div class="ob">
          <div class="head">
            <div class="dots"><div class="dot"></div><div class="dot on"></div><div class="dot"></div></div>
            <div class="skip">Geç</div>
          </div>

          <!-- mini cari list -->
          <div style="margin: 12px 0 8px;">
            <div style="font-size:9px; font-weight:700; color:#6B7280; text-transform:uppercase; letter-spacing:.1em; margin-bottom:6px">CARİLER · 39 kayıt</div>

            <div class="card" style="margin-bottom:6px">
              <div class="row">
                <div class="av" style="background:var(--av-peach)">A</div>
                <div class="col">
                  <div class="name">Abuzer Dikmen</div>
                  <div class="meta-line">Tedarikçi</div>
                </div>
                <div class="right-num">
                  <div class="lab">Borcumuz</div>
                  <div class="val" style="color:var(--loss)">₺36.685,00</div>
                </div>
              </div>
            </div>

            <div class="card" style="margin-bottom:6px">
              <div class="row">
                <div class="av" style="background:var(--av-mint)">A</div>
                <div class="col">
                  <div class="name">Arpaoğlu Peynir</div>
                  <div class="meta-line">Tedarikçi</div>
                </div>
                <div class="right-num">
                  <div class="lab">Borcumuz</div>
                  <div class="val" style="color:var(--loss)">₺289.378,38</div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="row">
                <div class="av" style="background:var(--av-blue)">B</div>
                <div class="col">
                  <div class="name">Bedrettin Dener</div>
                  <div class="meta-line">Personel · 21 gün izin</div>
                </div>
                <div class="right-num">
                  <div class="lab">Bakiye</div>
                  <div class="val" style="color:var(--ios-muted)">₺0,00</div>
                </div>
              </div>
            </div>
          </div>

          <div class="h2">Cari, personel, ürün — <b>tek liste</b>.</div>
          <p class="p">Borçlu kim, alacaklı kim — açıp bakman 3 saniye.</p>
          <div class="cta">İlerle</div>
        </div>
      </div>
    </div>

    <!-- ===== PHONE 4: SIGN IN ===== -->
    <div class="phone">
      <div class="island"></div>
      <div class="screen">
        <div class="status">
          <div class="time">23:56</div>
          <div class="right">
            <svg width="14" height="10" viewBox="0 0 14 10"><rect x="0" y="6" width="2" height="4" rx=".5" fill="#16181C"/><rect x="3" y="4" width="2" height="6" rx=".5" fill="#16181C"/><rect x="6" y="2" width="2" height="8" rx=".5" fill="#16181C"/><rect x="9" y="0" width="2" height="10" rx=".5" fill="#16181C" opacity=".4"/></svg>
            <svg width="12" height="10" viewBox="0 0 12 10"><path d="M6 2 Q3 2 0 5 L2 7 Q4 5 6 5 Q8 5 10 7 L12 5 Q9 2 6 2 Z" fill="#16181C"/></svg>
            <svg width="20" height="10" viewBox="0 0 20 10"><rect x="0" y="1" width="17" height="8" rx="2" stroke="#16181C" stroke-width=".8" fill="none"/><rect x="1.5" y="2.5" width="13.5" height="5" rx=".5" fill="#16181C"/></svg>
          </div>
        </div>
        <div class="auth">
          <span class="badge-mini">★ 30 saniyede hesap</span>
          <h2>Hoş geldin. <b>Devam edelim mi?</b></h2>
          <p class="sub2">Apple veya Google ile tek dokunuşta gir. Verilerin sadece sende kalır.</p>

          <div class="mas-mini">
            <svg width="100" height="110" viewBox="0 0 200 240">
              <ellipse cx="100" cy="222" rx="58" ry="6" fill="rgba(0,0,0,.12)"/>
              <rect x="34" y="20" width="132" height="200" rx="22" fill="#0E5C4E"/>
              <rect x="48" y="58" width="104" height="48" rx="8" fill="#D6E8DA"/>
              <circle cx="78" cy="82" r="4.5" fill="#0E2C26"/>
              <circle cx="122" cy="82" r="4.5" fill="#0E2C26"/>
              <circle cx="80" cy="80" r="1.4" fill="#fff"/>
              <circle cx="124" cy="80" r="1.4" fill="#fff"/>
              <path d="M 88 94 Q 100 100 112 94" stroke="#0E2C26" stroke-width="2" fill="none" stroke-linecap="round"/>
              <ellipse cx="70" cy="92" rx="4" ry="2.5" fill="#F2A99B" opacity=".6"/>
              <ellipse cx="130" cy="92" rx="4" ry="2.5" fill="#F2A99B" opacity=".6"/>
              <rect x="48" y="118" width="104" height="92" rx="4" fill="rgba(255,255,255,.15)"/>
              <ellipse cx="60" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
              <ellipse cx="140" cy="222" rx="8" ry="3" fill="#0A4A3F"/>
            </svg>
          </div>

          <div class="auth-btns">
            <div class="a-btn a-apple">
              <svg width="13" height="14" viewBox="0 0 13 14"><path d="M10.5 7.4c0-2 1.6-3 1.7-3-1-1.3-2.4-1.5-2.9-1.5-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.6-.4 6.4 1 8.5.7 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.8-.7 1.3 0 1.7.7 2.8.7 1.2 0 1.9-1 2.6-2.1.8-1.2 1.1-2.4 1.2-2.5-.1 0-2.3-.9-2.3-3.6zM8.6 1.8c.6-.7 1-1.7.9-2.6-.9 0-1.9.6-2.5 1.3-.6.6-1.1 1.6-1 2.5 1 .1 2-.5 2.6-1.2z" fill="#fff"/></svg>
              Apple ile devam et
            </div>
            <div class="a-btn a-google">
              <svg width="12" height="12" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8c-.2 1.1-.8 2-1.8 2.6v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.4z"/><path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3C2.4 15.9 5.5 18 9 18z"/><path fill="#FBBC05" d="M3.9 10.7c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7V5H.9C.3 6.2 0 7.5 0 9s.3 2.8.9 4l3-2.3z"/><path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6C13.5.9 11.4 0 9 0 5.5 0 2.4 2.1.9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z"/></svg>
              Google ile devam et
            </div>
            <div class="or">veya</div>
            <div class="a-btn a-mail">
              <svg width="12" height="10" viewBox="0 0 14 11"><rect x="0" y="0" width="14" height="11" rx="2" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M1 1 L7 6 L13 1" stroke="#fff" stroke-width="1.3" fill="none"/></svg>
              E-posta ile devam et
            </div>
          </div>

          <div class="legal-mini">
            Devam ederek <a>Şartlar</a> ve <a>Gizlilik</a> politikasını kabul ediyorsun.
          </div>
        </div>
      </div>
    </div>

    <!-- ===== PHONE 5: First open / empty home ===== -->
    <div class="phone">
      <div class="island"></div>
      <div class="screen">
        <div class="status">
          <div class="time">23:56</div>
          <div class="right">
            <svg width="14" height="10" viewBox="0 0 14 10"><rect x="0" y="6" width="2" height="4" rx=".5" fill="#16181C"/><rect x="3" y="4" width="2" height="6" rx=".5" fill="#16181C"/><rect x="6" y="2" width="2" height="8" rx=".5" fill="#16181C"/><rect x="9" y="0" width="2" height="10" rx=".5" fill="#16181C" opacity=".4"/></svg>
            <svg width="12" height="10" viewBox="0 0 12 10"><path d="M6 2 Q3 2 0 5 L2 7 Q4 5 6 5 Q8 5 10 7 L12 5 Q9 2 6 2 Z" fill="#16181C"/></svg>
            <svg width="20" height="10" viewBox="0 0 20 10"><rect x="0" y="1" width="17" height="8" rx="2" stroke="#16181C" stroke-width=".8" fill="none"/><rect x="1.5" y="2.5" width="13.5" height="5" rx=".5" fill="#16181C"/></svg>
          </div>
        </div>
        <div class="content">
          <div class="h-row">
            <div>
              <div class="title">Ana Sayfa</div>
            </div>
            <div class="h-icons">
              <div class="ico"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="#16181C" stroke-width="1.5"/><path d="M11 11l3 3" stroke="#16181C" stroke-width="1.5" stroke-linecap="round"/></svg></div>
              <div class="ico" style="position:relative">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 1 C5 1 3 3 3 6 v3 l-1 2 h12 l-1-2 V6 C13 3 11 1 8 1z M6 13 a2 2 0 0 0 4 0" stroke="#16181C" stroke-width="1.3" fill="none"/></svg>
                <div style="position:absolute; top:-3px; right:-3px; width:11px; height:11px; border-radius:50%; background:var(--loss); color:#fff; font-size:7px; font-weight:800; display:grid; place-items:center">2</div>
              </div>
            </div>
          </div>

          <div class="home-card">
            <div class="ttl">
              <div class="lbl">Genel Durum</div>
              <div class="chip">Anlık</div>
            </div>
            <div style="text-align:center; font-size:9px; color:var(--ios-muted); margin-top:8px">Hoş geldin · ilk işlemi bekliyorum 👀</div>
            <div class="big-num">₺0,00</div>
            <div class="sub-line">Net Varlık</div>
            <div class="bar"><div class="g" style="width:50%"></div><div class="r" style="width:50%"></div></div>
            <div class="legend">
              <span><span class="d dot-g"></span>Varlıklar ₺0</span>
              <span><span class="d" style="background:var(--info-blue)"></span>Alacaklar ₺0</span>
              <span><span class="d dot-r"></span>Borçlar ₺0</span>
            </div>
          </div>

          <div class="sec-lbl">HIZLI BAŞLAT <span class="add">＋ Ekle</span></div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px">
            <div class="quick-tile gelir">
              <div class="ic"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 12 V2 M3 6 L7 2 L11 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
              <div class="lab2">Gelir ekle</div>
              <div class="desc">Satış, ödeme, tahsilat</div>
            </div>
            <div class="quick-tile gider">
              <div class="ic"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 2 V12 M3 8 L7 12 L11 8" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
              <div class="lab2">Gider ekle</div>
              <div class="desc">Fatura, alım, ödeme</div>
            </div>
            <div class="quick-tile cari">
              <div class="ic"><svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="5" r="2.4" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M2 12 C2 10 4 9 7 9 C10 9 12 10 12 12" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></div>
              <div class="lab2">Cari ekle</div>
              <div class="desc">Müşteri, tedarikçi</div>
            </div>
            <div class="quick-tile urun">
              <div class="ic"><svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="3.5" width="10" height="8" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M2 6 H12" stroke="currentColor" stroke-width="1.6"/></svg></div>
              <div class="lab2">Ürün ekle</div>
              <div class="desc">Stok, fiyat</div>
            </div>
          </div>

          <div class="fab">
            <svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 4 V18 M4 11 H18" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>
          </div>
        </div>

        <!-- Bottom tab — gerçek uygulamayla aynı sıra -->
        <div class="tab">
          <div class="t active">
            <svg viewBox="0 0 22 22" fill="none"><path d="M3 10 L11 3 L19 10 V19 H13 V13 H9 V19 H3 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            <span>Ana Sayfa</span>
          </div>
          <div class="t">
            <svg viewBox="0 0 22 22" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="15" cy="9" r="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M2 18 C2 15 5 13 8 13 C11 13 14 15 14 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 18 C14 16 16 14.5 18 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <span>Cariler</span>
          </div>
          <div class="t">
            <svg viewBox="0 0 22 22" fill="none"><circle cx="11" cy="7.5" r="3.5" stroke="currentColor" stroke-width="1.6"/><path d="M4 19 C4 15 7 13 11 13 C15 13 18 15 18 19" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
            <span>Personel</span>
          </div>
          <div class="t">
            <svg viewBox="0 0 22 22" fill="none"><path d="M3 7 L11 3 L19 7 V15 L11 19 L3 15 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M3 7 L11 11 L19 7 M11 11 V19" stroke="currentColor" stroke-width="1.6"/></svg>
            <span>Ürünler</span>
          </div>
          <div class="t">
            <svg viewBox="0 0 22 22" fill="none"><circle cx="5" cy="11" r="1.5" fill="currentColor"/><circle cx="11" cy="11" r="1.5" fill="currentColor"/><circle cx="17" cy="11" r="1.5" fill="currentColor"/></svg>
            <span>Daha</span>
          </div>
        </div>
      </div>
    </div>

  </div>

  <!-- ============ SECTION 3: TOKENS ============ -->
  <div class="sec-head">
    <span class="num">03 ·</span>
    <h2>Tasarım sözlüğü</h2>
    <p class="note">Renk, tipografi ve ses tonu. Gerçek build'de halihazırda kullanıyorsun — burası sadece referans.</p>
  </div>

  <div class="tokens">
    <div>
      <h4>Renk</h4>
      <div class="swatches">
        <div class="sw" style="background:#0E5C4E">#0E5C4E<br><span style="opacity:.7">primary</span></div>
        <div class="sw" style="background:#00B86B">#00B86B<br><span style="opacity:.7">gelir/+</span></div>
        <div class="sw" style="background:#E53935">#E53935<br><span style="opacity:.7">gider/−</span></div>
        <div class="sw" style="background:#FFD08A; color:#7a4d10" >#FFD08A<br><span style="opacity:.7">altın aksan</span></div>
        <div class="sw light" style="background:#F2F3F5; border-color:#ccc">#F2F3F5<br><span style="opacity:.6">zemin</span></div>
        <div class="sw light" style="background:#fff; border-color:#ccc">#FFFFFF<br><span style="opacity:.6">kart</span></div>
        <div class="sw" style="background:#16181C">#16181C<br><span style="opacity:.7">metin</span></div>
        <div class="sw light" style="background:#E6F2EE; border-color:#cfe1d9">#E6F2EE<br><span style="opacity:.6">soft green</span></div>
      </div>
    </div>

    <div>
      <h4>Tipografi</h4>
      <div class="type-row frau"><div class="name3">Display</div><div class="sample">Hesap, yanında.</div></div>
      <div class="type-row body"><div class="name3">Gövde · 600</div><div class="sample">Bugün ne kazandın?</div></div>
      <div class="type-row body" style="border-bottom:none"><div class="name3">Sayı · 800</div><div class="sample" style="font-feature-settings:'tnum'">₺2.443.051,66</div></div>
    </div>

    <div>
      <h4>Ses tonu</h4>
      <ul class="principles">
        <li><b>Esnafın dilinden.</b> "Çoğu işletme ne kazandığını bilmiyor. Ya sen?" — soru bırakan ama yargılamayan.</li>
        <li><b>Sayılar büyük, cümleler kısa.</b> Karara hizmet eder, vakit çalmaz.</li>
        <li><b>Renk kararı verir.</b> Kırmızı = borç. Yeşil = gelir. Üçüncü bir yorum yok.</li>
        <li><b>Hesap konuşur, sen değil.</b> Maskot empati taşır; sen sayıyı görürsün.</li>
      </ul>
    </div>

  </div>

  <footer class="foot">
    <div>İşletme Takip · Onboarding v2 · Hesap maskot</div>
    <div>5 ekran · 4 mood · gerçek renk paleti</div>
  </footer>

</section>

</body>
</html>
