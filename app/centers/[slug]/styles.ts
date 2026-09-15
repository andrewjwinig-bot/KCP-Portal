// Scoped stylesheet for the public shopping-center pages. Ported verbatim from
// the Claude Design handoff tokens (Archivo / JetBrains Mono, ink #101114,
// accent #1d4ed8, square edges — no radius, no shadow; depth comes from
// hairlines + dark/light bands). All selectors are scoped under `.gc` so they
// never touch the admin portal's globals. Light-theme only by design.
//
// --gc-accent / --gc-accent-dark are set inline per-center on the .gc root.

export const centerStyles = `
.gc{
  --ink:#101114; --ink2:#22242a; --muted:#4a4a46; --secondary:#6b6b67;
  --label:#8a8a86; --faint:#a2a29d; --hair:#ebebe8; --input:#dcdcd8;
  --tint:#f7f7f5; --darkhair:#2a2c31; --ondark:#9a9a95; --ondark2:#7a7d84;
  --sans:'Archivo',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
  --mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-family:var(--sans); color:var(--ink); background:#fff;
  -webkit-font-smoothing:antialiased; scroll-behavior:smooth;
  line-height:1.5; font-size:16px;
}
@media (prefers-reduced-motion:reduce){ .gc{ scroll-behavior:auto } }
.gc *{ box-sizing:border-box }
.gc a{ color:var(--ink); text-decoration:none; transition:color .14s ease }
.gc a:hover{ color:var(--gc-accent) }
.gc h1,.gc h2,.gc p{ margin:0 }
.gc :focus-visible{ outline:2px solid var(--gc-accent); outline-offset:3px }
.gc [id]{ scroll-margin-top:24px }

.gc-wrap{ max-width:1600px; margin:0 auto; padding-left:56px; padding-right:56px; width:100% }

.gc-eyebrow{ font-family:var(--mono); font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:var(--label) }
.gc-h1{ font-size:92px; line-height:0.9; font-weight:800; letter-spacing:-0.04em; text-wrap:balance }
.gc-h1-1{ font-size:clamp(30px,5vw,60px); line-height:1.0; text-wrap:normal; white-space:nowrap }
.gc-h2{ font-size:42px; line-height:1.02; font-weight:800; letter-spacing:-0.03em }
.gc-h2-hero{ font-size:56px; line-height:1; font-weight:800; letter-spacing:-0.035em; margin:0 }
.gc-h2-big{ font-size:46px; line-height:1; font-weight:800; letter-spacing:-0.035em; margin:0 }

/* NAV */
.gc-nav-wrap{ border-bottom:0 }
.gc-nav{ display:flex; align-items:center; justify-content:space-between; height:76px }
.gc-brand{ display:flex; align-items:baseline; gap:12px }
.gc-brand:hover{ color:var(--ink) }
.gc-brand-name{ font-size:17px; font-weight:800; letter-spacing:-0.01em }
.gc-brand-sub{ font-family:var(--mono); font-size:10px; letter-spacing:0.18em; text-transform:uppercase; color:var(--label) }
.gc-nav-links{ display:flex; align-items:center; gap:32px; font-size:14px; font-weight:500 }
.gc-nav-cta{ border-bottom:2px solid var(--gc-accent); padding-bottom:2px; font-weight:600 }

/* HERO */
.gc-hero{ position:relative; height:720px; background:var(--ink); overflow:hidden }
.gc-hero-img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover }
.gc-hero-ph{ position:absolute; inset:0; background-image:repeating-linear-gradient(135deg,#22242a 0 14px,#1a1c21 14px 28px) }
.gc-hero-ph-cap{ position:absolute; top:24px; left:56px; font-family:var(--mono); font-size:11px; letter-spacing:0.16em; color:#6e727a; text-transform:uppercase }
.gc-hero-scrim{ position:absolute; inset:0; background:linear-gradient(180deg,rgba(16,17,20,0.45) 0%,rgba(16,17,20,0.05) 40%,rgba(16,17,20,0.88) 100%) }
.gc-hero-in{ position:absolute; left:0; right:0; bottom:0; padding-bottom:52px }
.gc-hero-row{ display:flex; align-items:flex-end; justify-content:space-between; gap:48px }
.gc-hero-left{ display:flex; flex-direction:column; gap:20px; max-width:820px }
.gc-eyebrow-hero{ display:flex; align-items:center; gap:10px; color:#fff; opacity:0.72 }
.gc-rule{ width:22px; height:1px; background:#fff; display:inline-block }
.gc-hero .gc-h1{ color:#fff }
.gc-hero-sub{ font-size:21px; line-height:1.35; color:#fff; opacity:0.86; max-width:600px; text-wrap:pretty }
.gc-hero-cta{ flex:none; background:#fff; color:var(--ink); padding:20px 28px; font-size:16px; font-weight:700; display:flex; flex-direction:column; gap:3px; transition:background .14s ease, color .14s ease }
.gc-hero-cta:hover{ background:var(--gc-accent); color:#fff }
.gc-hero-cta-k{ font-family:var(--mono); font-size:10px; letter-spacing:0.16em; text-transform:uppercase; opacity:0.6 }

/* OVERVIEW */
.gc-overview{ padding-top:88px; padding-bottom:88px; display:grid; grid-template-columns:1fr 1fr; gap:88px; align-items:start }
.gc-overview-left{ display:flex; flex-direction:column; gap:28px }
.gc-lede{ font-size:25px; line-height:1.45; letter-spacing:-0.015em; color:var(--ink2); text-wrap:pretty }
.gc-btn-dark{ align-self:flex-start; background:var(--ink); color:#fff; padding:16px 24px; font-size:15px; font-weight:700; transition:background .14s ease }
.gc-btn-dark:hover{ background:var(--gc-accent); color:#fff }
.gc-specs{ display:flex; flex-direction:column }
.gc-spec{ display:grid; grid-template-columns:210px 1fr; gap:32px; padding:22px 0; border-bottom:1px solid var(--hair); align-items:baseline }
.gc-spec-last{ border-bottom:0 }
.gc-spec-k{ font-family:var(--mono); font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--label) }
.gc-spec-v{ font-size:17px; line-height:1.55; color:var(--ink2); text-wrap:pretty }
.gc-spec-contact{ display:flex; flex-direction:column; gap:3px; font-size:17px; line-height:1.5 }
.gc-contact-name{ font-weight:600 }
.gc-contact-plain{ color:var(--ink2) }
.gc-contact-mail{ color:var(--gc-accent); font-weight:500 }

/* FACTS */
.gc-facts{ display:flex; flex-wrap:wrap; border-top:1px solid var(--ink); border-bottom:1px solid var(--hair) }
.gc-fact{ flex:1 1 0; min-width:170px; padding:30px 28px 30px 0; display:flex; flex-direction:column; gap:6px }
.gc-fact-k{ font-family:var(--mono); font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:var(--label) }
.gc-fact-v{ font-size:27px; font-weight:800; letter-spacing:-0.03em; font-variant-numeric:tabular-nums }

/* SITE PLAN */
.gc-plan{ padding-top:88px; padding-bottom:88px; display:flex; flex-direction:column; gap:28px }
.gc-plan-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:40px }
.gc-plan-cap{ font-family:var(--mono); font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--label) }
.gc-plan-img{ width:100%; height:620px; object-fit:contain; background:#fff; display:block }
.gc-plan-ph{ height:620px; background-image:repeating-linear-gradient(135deg,#e8e8e4 0 12px,#f0f0ed 12px 24px); display:flex; align-items:center; justify-content:center; font-family:var(--mono); font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--faint) }

/* TENANT ROSTER */
.gc-tenants{ padding-bottom:88px; display:flex; flex-direction:column; gap:28px }
.gc-tenants-head{ display:flex; align-items:flex-end; justify-content:space-between; border-top:1px solid var(--ink); padding-top:24px }
.gc-trows{ display:flex; flex-direction:column }
.gc-trow{ display:grid; grid-template-columns:1fr 300px 120px; gap:24px; align-items:center; padding:22px 0; border-bottom:1px solid var(--hair) }
.gc-tname{ font-size:28px; font-weight:700; letter-spacing:-0.025em }
.gc-tcat{ font-size:15px; color:var(--secondary) }
.gc-tstatus{ font-family:var(--mono); font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:var(--faint); text-align:right }

/* AVAILABLE NOW */
.gc-avail{ background:var(--ink); color:#fff; padding:88px 0 }
.gc-avail-in{ display:flex; flex-direction:column; gap:40px }
.gc-avail-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:40px }
.gc-avail-blurb{ font-size:16px; line-height:1.5; color:var(--ondark); max-width:360px; text-wrap:pretty }
.gc-vrows{ display:flex; flex-direction:column }
.gc-vrow{ border-top:1px solid var(--darkhair); padding:28px 0; display:grid; grid-template-columns:120px 1fr 130px 170px 170px; gap:24px; align-items:center }
.gc-vrow-cap{ border-top:1px solid var(--darkhair) }
.gc-vrow-empty{ grid-template-columns:1fr auto }
.gc-vempty{ font-size:18px; color:var(--ondark) }
.gc-vsuite{ font-family:var(--mono); font-size:12px; letter-spacing:0.1em; color:var(--gc-accent-dark) }
.gc-vdesc{ display:flex; flex-direction:column; gap:5px }
.gc-vlabel{ font-size:22px; font-weight:700; letter-spacing:-0.02em }
.gc-vkind{ font-size:14px; color:var(--ondark) }
.gc-vsf{ font-size:20px; font-weight:700; font-variant-numeric:tabular-nums }
.gc-vfront{ font-size:14px; color:var(--ondark) }
.gc-inq{ justify-self:end; border:1px solid #494c53; color:#fff; padding:12px 20px; font-size:13px; font-weight:600; transition:background .14s ease, border-color .14s ease }
.gc-inq:hover{ background:var(--gc-accent); border-color:var(--gc-accent); color:#fff }

/* LOCATION */
.gc-loc{ display:flex; flex-direction:column }
.gc-loc-head{ padding-top:88px; padding-bottom:40px; display:flex; align-items:flex-end; justify-content:space-between; gap:40px }
.gc-loc-h{ max-width:520px }
.gc-loc-blurb{ font-size:16px; line-height:1.6; color:var(--muted); max-width:420px; text-wrap:pretty }
.gc-map{ height:620px; background:#ececea }
.gc-map-frame{ width:100%; height:100%; border:0; display:block }
.gc-access{ display:grid; grid-template-columns:repeat(5,1fr); gap:1px; background:var(--hair); border-bottom:1px solid var(--hair) }
.gc-access-cell{ background:#fff; padding:26px 20px; display:flex; flex-direction:column; gap:8px }
.gc-access-v{ font-size:22px; font-weight:800; letter-spacing:-0.03em; font-variant-numeric:tabular-nums }
.gc-access-k{ font-size:14px; color:var(--secondary); line-height:1.4 }

/* NEIGHBORHOOD */
.gc-hood{ background:var(--ink); color:#fff; padding:88px 0 }
.gc-hood-in{ display:flex; flex-direction:column; gap:36px }
.gc-hood-head{ display:flex; align-items:flex-end; justify-content:space-between; gap:40px }
.gc-cap-ondark{ color:var(--ondark2) }
.gc-hood-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:28px }
.gc-hood-card{ display:flex; flex-direction:column; gap:18px }
.gc-hood-img{ width:100%; height:220px; object-fit:cover; display:block }
.gc-hood-ph{ height:220px; background-image:repeating-linear-gradient(135deg,#22242a 0 12px,#1a1c21 12px 24px); display:flex; align-items:center; justify-content:center; font-family:var(--mono); font-size:10px; letter-spacing:0.14em; text-transform:uppercase; color:#5d6068; text-align:center; padding:0 20px }
.gc-hood-text{ display:flex; flex-direction:column; gap:8px }
.gc-hood-title{ font-size:20px; font-weight:700; letter-spacing:-0.02em }
.gc-hood-body{ font-size:15px; line-height:1.6; color:var(--ondark); text-wrap:pretty }

/* INQUIRY */
.gc-inquire{ padding-top:88px; padding-bottom:88px; display:grid; grid-template-columns:1fr 1.15fr; gap:72px }
.gc-inquire-left{ display:flex; flex-direction:column; gap:22px }
.gc-inquire-contact{ display:flex; flex-direction:column; gap:4px; padding-top:8px }
.gc-contact-name-lg{ font-size:19px; font-weight:700 }
.gc-contact-co{ font-size:15px; color:var(--secondary) }
.gc-inquire-contact .gc-contact-plain{ font-size:15px }
.gc-inquire-contact .gc-contact-mail{ font-size:15px; font-weight:600 }

/* FORM */
.gc-form{ background:var(--tint); padding:36px; display:flex; flex-direction:column; gap:16px; position:relative }
.gc-form-grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px }
.gc-input{ border:1px solid var(--input); background:#fff; padding:15px 16px; font-size:15px; outline:none; font-family:var(--sans); color:var(--ink); transition:border-color .14s ease; width:100% }
.gc-input:focus{ border-color:var(--ink) }
.gc-textarea{ resize:vertical; min-height:112px }
.gc-vh{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0 }
.gc-form-foot{ display:flex; align-items:center; justify-content:space-between; gap:24px }
.gc-form-help{ font-size:12px; color:var(--label); max-width:300px; line-height:1.5 }
.gc-form-err{ font-size:14px; color:#b3341f; font-weight:500 }
.gc-send{ background:var(--gc-accent); color:#fff; border:0; padding:16px 28px; font-size:15px; font-weight:700; cursor:pointer; font-family:var(--sans); transition:background .14s ease }
.gc-send:hover{ background:var(--ink) }
.gc-send:disabled{ opacity:0.6; cursor:default }
.gc-sent{ border:1px solid var(--ink); padding:40px; display:flex; flex-direction:column; gap:12px; align-self:start }
.gc-sent-h{ font-size:26px; font-weight:800; letter-spacing:-0.02em }
.gc-sent-b{ font-size:15px; line-height:1.6; color:var(--muted) }

/* FOOTER */
.gc-footer{ border-top:1px solid var(--hair) }
.gc-footer-in{ padding-top:40px; padding-bottom:40px; display:flex; align-items:center; justify-content:space-between; font-size:13px; color:var(--label) }

/* RESPONSIVE */
@media (max-width:1100px){
  .gc-wrap{ padding-left:28px; padding-right:28px }
  .gc-hero-ph-cap{ left:28px }
  .gc-h1{ font-size:clamp(40px,9vw,92px) }
  .gc-h1-1{ font-size:clamp(28px,7vw,60px); white-space:normal }
  .gc-h2-hero{ font-size:clamp(34px,7vw,56px) }
  .gc-h2-big{ font-size:clamp(32px,6vw,46px) }
  .gc-hero{ height:72vh; min-height:460px }
  .gc-hero-row{ flex-direction:column; align-items:flex-start; gap:28px }
  .gc-overview{ grid-template-columns:1fr; gap:40px }
  .gc-inquire{ grid-template-columns:1fr; gap:40px }
  .gc-hood-grid{ grid-template-columns:1fr; gap:28px }
  .gc-plan-img,.gc-plan-ph{ height:360px }
  .gc-map{ height:420px }
  .gc-access{ grid-template-columns:repeat(2,1fr) }
  .gc-vrow{ grid-template-columns:1fr auto; gap:8px 20px; align-items:start }
  .gc-vsuite{ grid-column:1 / -1 }
  .gc-vsf{ order:2 }
  .gc-vfront{ order:3; grid-column:1 / -1 }
  .gc-inq{ order:4; align-self:center }
  .gc-trow{ grid-template-columns:1fr; gap:6px }
  .gc-tstatus{ display:none }
  .gc-fact{ flex-basis:33% }
}
@media (max-width:640px){
  .gc-nav-links a:not(.gc-nav-cta){ display:none }
  .gc-form-grid{ grid-template-columns:1fr }
  .gc-form-foot{ flex-direction:column; align-items:stretch }
  .gc-access{ grid-template-columns:1fr }
  .gc-fact{ flex-basis:50% }
  .gc-spec{ grid-template-columns:1fr; gap:6px }
}
`;
