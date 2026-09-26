import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Logo } from "../components/ui";

const features = [
  ["shot-claims.jpg", "Claims adjudication & fraud triage", "Screen every claim automatically, flag the ones that need a human, and hand adjusters full context in seconds — not tabs."],
  ["shot-underwriting.jpg", "Underwriting intake", "Turn every application into structured risk signals the moment it arrives, with an AI review queue ranked by confidence."],
  ["shot-chat.jpg", "Policyholder chat & voice", "Give every policyholder an instant, accurate answer — day or night — without adding headcount to your support desk."],
] as const;

const stats = [["70%", "Faster claim resolution"], ["50%", "Less manual workload"], ["99.9%", "Accuracy in fraud detection"]] as const;

const plans = [
  ["Starter", "$0", "/mo", "For small teams getting started.", ["Up to 200 claims / mo", "Core adjudication tools", "Email support"], false],
  ["Growth", "$499", "/mo", "For carriers and MGAs scaling operations.", ["Unlimited claims", "AI fraud triage & underwriting intake", "Policyholder chat & voice agent", "Priority support"], true],
  ["Enterprise", "Custom", "", "For carriers with complex, regulated workflows.", ["Everything in Growth", "Dedicated infrastructure & SSO", "Custom integrations", "Dedicated onboarding & SLA"], false],
] as const;

const footerCols = [
  ["Product", ["Claims", "Underwriting", "Chat & voice", "Documents"]],
  ["Company", ["About", "Careers", "Blog"]],
  ["Resources", ["Docs", "API reference", "Changelog", "Status"]],
  ["Legal", ["Privacy", "Terms", "Security"]],
] as const;

export default function Landing(){return <div className="min-h-screen bg-[#F4F1EC] text-[#1A1A1A]">

<header className="sticky top-0 z-30 bg-[#1A1A1A]"><div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4"><Logo/><nav className="hidden items-center gap-8 text-[13px] font-semibold text-[#b8b5c2] lg:flex"><a href="#features" className="hover:text-white">Product</a><a href="#pricing" className="hover:text-white">Pricing</a><a href="#customers" className="hover:text-white">Customers</a><a href="#contact" className="hover:text-white">Contact</a></nav><div className="flex items-center gap-5"><a className="hidden text-[13px] font-bold text-white sm:block" href="/dashboard">Log in</a><a className="btn btn-primary" href="/dashboard">Get started <ArrowRight size={14}/></a></div></div></header>

<main>

<section className="relative overflow-hidden bg-[#1A1A1A] pt-16 text-white">
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute left-1/2 top-[-160px] h-[440px] w-[780px] -translate-x-1/2 rounded-full bg-[#C6572A] opacity-25 blur-[130px]"/><div className="absolute right-[-140px] top-[120px] h-[360px] w-[360px] rounded-full bg-[#6b5aa8] opacity-25 blur-[120px]"/><div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:26px_26px] opacity-40"/></div>

  <div className="relative mx-auto max-w-[820px] px-6 pt-16 text-center">
    <a href="#features" className="fade-up inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[11px] font-semibold text-[#e7c3ab]"><span className="relative inline-flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C6572A] opacity-60"/><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#C6572A]"/></span>New — AI-assisted fraud triage is now live</a>
    <h1 className="display fade-up mt-7 text-[44px] font-medium leading-[1.08] tracking-[-0.01em] sm:text-[64px]" style={{animationDelay:".08s"}}>Run claims, underwriting, and support from <em className="text-[#e0895f]">one platform.</em></h1>
    <p className="fade-up mx-auto mt-6 max-w-[540px] text-[16px] leading-7 text-[#b8b5c2]" style={{animationDelay:".16s"}}>InsureFlow automates the repetitive parts of insurance operations, so your team spends time on judgment calls — not data entry.</p>
    <div className="fade-up mt-9 flex flex-wrap items-center justify-center gap-4" style={{animationDelay:".24s"}}><a className="btn btn-primary px-6 py-3.5 text-[13px]" href="/dashboard">Get started free <ArrowRight size={15}/></a><a className="rounded-md border border-white/20 px-6 py-3.5 text-[13px] font-bold text-white hover:bg-white/5" href="#features">See it in action</a></div>
    <p className="fade-up mt-8 text-[12px] text-[#8b869a]" style={{animationDelay:".3s"}}>No credit card required · Processing 50,000+ claims a month across regional carriers</p>
  </div>

  <div className="fade-up relative mx-auto mt-16 max-w-[1140px] px-6 pb-24 sm:pb-36" style={{animationDelay:".38s"}}>
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#111114] shadow-[0_0_0_1px_rgba(198,87,42,0.12),0_40px_100px_-30px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-[#17171b] px-4 py-2.5"><span className="h-2 w-2 rounded-full bg-white/15"/><span className="h-2 w-2 rounded-full bg-white/15"/><span className="h-2 w-2 rounded-full bg-white/15"/><span className="mx-auto rounded-sm bg-white/5 px-3 py-1 text-[10px] text-[#8b869a]">app.insureflow.io/dashboard</span></div>
      <img src="/shot-dashboard.jpg" alt="InsureFlow operations dashboard" className="block w-full"/>
    </div>
    <div className="absolute -bottom-6 -left-2 flex items-center gap-3 rounded-lg border border-[#2a2830] bg-[#1e1c24] px-4 py-3 shadow-2xl sm:left-10 sm:-bottom-8"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#1f3a2b] text-[#5BBC6E]"><CheckCircle2 size={16}/></span><div><div className="text-[11px] font-bold text-white">Claim CLM-2025-4812 approved</div><div className="text-[10px] text-[#8b869a]">Auto-adjudicated · 2 min ago</div></div></div>
    <div className="absolute -top-5 -right-2 hidden items-center gap-2.5 rounded-lg border border-[#2a2830] bg-[#1e1c24] px-3.5 py-2.5 shadow-2xl sm:right-10 sm:flex"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#3D241A] text-[#e0895f] font-mono text-[10px]">91</span><div><div className="text-[10px] font-bold text-white">AI risk score</div><div className="text-[9px] text-[#8b869a]">Low exposure</div></div></div>
  </div>
</section>

<section className="border-b border-[#ded8cf] bg-[#F4F1EC] py-6"><div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 text-center text-[11px] font-semibold uppercase tracking-[.08em] text-[#8b867f]"><span>SOC 2 Type II</span><span className="text-[#c9c2b6]">·</span><span>HIPAA-ready</span><span className="text-[#c9c2b6]">·</span><span>99.99% uptime SLA</span><span className="text-[#c9c2b6]">·</span><span>SSO &amp; audit logs</span></div></section>

<section id="customers" className="border-b border-[#ded8cf] bg-[#F4F1EC] py-16"><div className="mx-auto flex max-w-[1140px] flex-wrap items-center justify-between gap-6 px-6"><span className="text-[11px] font-bold uppercase tracking-[.13em] text-[#8b867f]">Built for modern insurance teams</span>{["NORTHSTAR","KINETIC","AURELIA","COMMONWEALTH","MERIDIAN"].map(x=><span key={x} className="text-sm font-bold uppercase tracking-[.16em] text-[#a9a39b]">{x}</span>)}</div></section>

<section id="features" className="mx-auto max-w-[1140px] px-6 py-24"><div className="max-w-[560px]"><span className="text-[11px] font-bold uppercase tracking-[.13em] text-[#C6572A]">Product</span><h2 className="display mt-4 text-[34px]">One workspace for the whole claims lifecycle.</h2><p className="mt-4 text-[14px] leading-6 text-[#5c5852]">Every screen below is the actual InsureFlow product — not a mockup.</p></div>
  <div className="mt-12 grid gap-6 sm:grid-cols-3">{features.map(([img,title,text])=><div key={title} className="group overflow-hidden rounded-xl border border-[#ded8cf] bg-white shadow-sm transition hover:shadow-lg"><div className="overflow-hidden border-b border-[#ede8e0]"><img src={`/${img}`} alt={title} className="h-[170px] w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"/></div><div className="p-5"><h3 className="text-[14px] font-bold">{title}</h3><p className="mt-2 text-[12.5px] leading-5 text-[#5c5852]">{text}</p></div></div>)}</div>
</section>

<section id="pricing" className="border-t border-[#ded8cf] bg-[#efeae1] py-24"><div className="mx-auto max-w-[1140px] px-6"><div className="max-w-[560px]"><span className="text-[11px] font-bold uppercase tracking-[.13em] text-[#C6572A]">Pricing</span><h2 className="display mt-4 text-[34px]">Straightforward pricing, no surprises.</h2><p className="mt-4 text-[14px] leading-6 text-[#5c5852]">Start free. Upgrade when your team needs more than the basics.</p></div>
  <div className="mt-12 grid gap-6 lg:grid-cols-3">{plans.map(([name,price,period,desc,perks,featured])=><div key={name} className={`rounded-xl border p-7 ${featured?"border-[#C6572A] bg-[#1A1A1A] text-white shadow-xl":"border-[#ded8cf] bg-white"}`}><div className={`text-[13px] font-bold ${featured?"text-[#e0895f]":"text-[#C6572A]"}`}>{name}</div><div className="mt-3 flex items-baseline gap-1"><span className="display text-4xl">{price}</span><span className={`text-[12px] ${featured?"text-[#b8b5c2]":"text-[#8b867f]"}`}>{period}</span></div><p className={`mt-3 text-[12.5px] leading-5 ${featured?"text-[#b8b5c2]":"text-[#5c5852]"}`}>{desc}</p><ul className="mt-6 space-y-3">{perks.map(p=><li key={p} className="flex items-start gap-2 text-[12.5px]"><CheckCircle2 size={15} className={featured?"mt-0.5 shrink-0 text-[#5BBC6E]":"mt-0.5 shrink-0 text-[#5BBC6E]"}/>{p}</li>)}</ul><a href="/dashboard" className={`mt-7 block rounded-md px-4 py-2.5 text-center text-[12.5px] font-bold ${featured?"bg-[#C6572A] text-white hover:bg-[#A8461F]":"border border-[#1A1A1A] text-[#1A1A1A] hover:bg-[#1A1A1A] hover:text-white"}`}>{name==="Enterprise"?"Talk to sales":"Get started"}</a></div>)}</div>
</div></section>

<section className="bg-[#1A1A1A] py-20 text-white"><div className="mx-auto grid max-w-[1000px] gap-10 px-6 sm:grid-cols-3">{stats.map(([value,label])=><div key={label} className="text-center"><div className="display text-[44px] text-[#e0895f]">{value}</div><div className="mt-2 text-[13px] text-[#b8b5c2]">{label}</div></div>)}</div></section>

<section className="mx-auto max-w-[720px] px-6 py-24"><div className="rounded-xl border border-[#ded8cf] bg-white p-10 shadow-sm sm:p-12"><div className="flex gap-0.5 text-[#C6572A]">{Array.from({length:5}).map((_,i)=><span key={i}>★</span>)}</div><blockquote className="display mt-6 text-2xl leading-[1.5]">&ldquo;InsureFlow cut our average claim cycle from 11 days to under 2. Our adjusters finally have time to actually adjust claims.&rdquo;</blockquote><div className="mt-7 flex items-center gap-3"><img src="/image%20for%20design.jpeg" alt="Jordan Whitfield" className="h-11 w-11 rounded-full object-cover object-[75%_28%]"/><div><div className="text-[13px] font-bold">Jordan Whitfield</div><div className="text-[12px] text-[#8b867f]">VP of Claims, Northstar Insurance</div></div></div></div></section>

<section id="contact" className="mx-6 mb-24 overflow-hidden rounded-2xl bg-[#1A1A1A] px-6 py-20 text-center text-white"><h2 className="display text-4xl">Ready to modernize your operations?</h2><p className="mx-auto mt-4 max-w-md text-sm text-[#b8b5c2]">Join the teams building a faster, more responsive insurance business.</p><div className="mt-8 flex flex-wrap justify-center gap-4"><a className="btn btn-primary px-6 py-3.5" href="/dashboard">Get started free <ArrowRight size={15}/></a><a className="rounded-md border border-white/20 px-6 py-3.5 text-[13px] font-bold text-white hover:bg-white/5" href="mailto:hello@insureflow.io">Talk to sales</a></div></section>

</main>

<footer className="bg-[#1A1A1A] text-white"><div className="mx-auto max-w-[1280px] px-6 py-16"><div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]"><div><Logo/><p className="mt-4 max-w-[220px] text-[12px] leading-5 text-[#8b869a]">The intelligent operating system for modern insurance teams.</p></div>{footerCols.map(([col,links])=><div key={col}><div className="text-[11px] font-bold uppercase tracking-[.1em] text-[#8b869a]">{col}</div><ul className="mt-4 space-y-3">{links.map(l=><li key={l}><a href="#" className="text-[13px] text-[#c9c6d3] hover:text-white">{l}</a></li>)}</ul></div>)}</div><div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-[12px] text-[#8b869a]"><span>© 2025 InsureFlow, Inc.</span><span>Made for the people who read police reports for a living.</span></div></div></footer>
</div>}
