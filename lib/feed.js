const SPORTS=["soccer_epl","soccer_uefa_champs_league","soccer_spain_la_liga","soccer_italy_serie_a","soccer_germany_bundesliga","basketball_nba","icehockey_nhl","americanfootball_nfl"];
const BASE="https://api.the-odds-api.com/v4/sports";
exports.SPORTS=SPORTS;
exports.feed=async(type,sport)=>{
  if(!SPORTS.includes(sport))throw new Error("unknown sport");
  const key=process.env.ODDS_API_KEY;if(!key)throw new Error("ODDS_API_KEY not set");
  const url=type==="scores"?`${BASE}/${sport}/scores/?daysFrom=3&apiKey=${key}`:`${BASE}/${sport}/odds/?regions=eu&markets=h2h,totals&oddsFormat=decimal&apiKey=${key}`;
  const r=await fetch(url);if(!r.ok)throw new Error("provider error "+r.status);
  return (await r.json()).map(e=>{
    if(type==="scores")return{id:e.id,home:e.home_team,away:e.away_team,time:e.commence_time,completed:e.completed,scores:e.scores?e.scores.map(s=>({name:s.name,score:s.score})):null};
    const sums={home:[0,0],draw:[0,0],away:[0,0]},tot={};
    (e.bookmakers||[]).forEach(b=>b.markets.forEach(m=>{
      if(m.key==="h2h")m.outcomes.forEach(o=>{const k=o.name===e.home_team?"home":o.name===e.away_team?"away":"draw";sums[k][0]+=o.price;sums[k][1]++});
      if(m.key==="totals")m.outcomes.forEach(o=>{const t=tot[o.point]=tot[o.point]||{n:0,O:0,U:0};if(o.name==="Over"){t.O+=o.price;t.n++}else t.U+=o.price})}));
    const avg=s=>s[1]?Math.round(s[0]/s[1]*100)/100:null,pts=Object.keys(tot).sort((a,b)=>tot[b].n-tot[a].n),t0=tot[pts[0]];
    const ou=pts.length?{pt:+pts[0],o:[Math.round(t0.O/t0.n*100)/100,Math.round(t0.U/t0.n*100)/100]}:null;
    return{id:e.id,league:e.sport_title,home:e.home_team,away:e.away_team,time:e.commence_time,odds:[avg(sums.home),avg(sums.draw),avg(sums.away)],ou};
  });
};
const TT={h2h:"Match result",totals:"Total goals / points",spreads:"Handicap",btts:"Both teams to score",double_chance:"Double chance",draw_no_bet:"Draw no bet"};
exports.TT=TT;
exports.eventOdds=async(sport,id)=>{
  if(!SPORTS.includes(sport))throw new Error("unknown sport");
  const key=process.env.ODDS_API_KEY;if(!key)throw new Error("ODDS_API_KEY not set");
  const mk=sport.startsWith("soccer")?Object.keys(TT):["h2h","totals","spreads"];
  const r=await fetch(`${BASE}/${sport}/events/${id}/odds?regions=eu&markets=${mk.join(",")}&oddsFormat=decimal&apiKey=${key}`);
  if(!r.ok)throw new Error("provider error "+r.status);return r.json();
};
const priceFor=(e,bk,mk,nm,pt)=>{const v=[];
  (e.bookmakers||[]).filter(b=>bk==="avg"||b.key===bk).forEach(b=>{const m=b.markets.find(m=>m.key===mk);if(!m)return;
    const o=m.outcomes.find(o=>o.name===nm&&(o.point??null)===(pt??null));if(o)v.push(o.price)});
  return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length*100)/100:null};
exports.priceFor=priceFor;
exports.view=(e,bk)=>{const markets=[];
  Object.keys(TT).forEach(mk=>{const seen=new Map();
    (e.bookmakers||[]).forEach(b=>{const m=b.markets.find(m=>m.key===mk);if(m)m.outcomes.forEach(o=>seen.set(o.name+"|"+(o.point??""),{nm:o.name,pt:o.point??null}))});
    const outs=[...seen.values()].map(o=>({...o,p:priceFor(e,bk,mk,o.nm,o.pt)})).filter(o=>o.p);
    if(outs.some(o=>o.pt!==null))outs.sort((a,b)=>(a.pt??-99)-(b.pt??-99)||(a.nm<b.nm?-1:1));
    if(outs.length)markets.push({mk,title:TT[mk],outs})});
  return{home:e.home_team,away:e.away_team,time:e.commence_time,
    books:[{key:"avg",title:"Average of all bookmakers"},...(e.bookmakers||[]).map(b=>({key:b.key,title:b.title}))],markets}};
