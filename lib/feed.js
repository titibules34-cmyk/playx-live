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
