const crypto=require("crypto"),{feed,eventOdds,priceFor,TT}=require("../lib/feed");
const SEC=process.env.APP_SECRET||"change-me";
const {createClient}=require("redis");let cl=null;
const r=async c=>{try{if(!cl){cl=createClient({url:process.env.REDIS_URL});cl.on("error",()=>{});await cl.connect()}return await cl.sendCommand(c)}catch(e){cl=null;throw e}};
const getU=async n=>{const v=await r(["HGET","users",n]);return v?JSON.parse(v):null};
const putU=(n,u)=>r(["HSET","users",n,JSON.stringify(u)]);
const hash=(p,s)=>crypto.scryptSync(String(p),s,32).toString("hex");
const tok=(n,u)=>n+"."+crypto.createHmac("sha256",SEC).update(n+u.h).digest("hex");
const round=x=>Math.round(x*100)/100;
const view=(n,u)=>({name:n,bal:u.bal,bets:u.bets.slice(0,50),admin:n===String(process.env.ADMIN_USER||"").toLowerCase()});
function legNew(x,e,h,a){const r=h>a?0:h<a?2:1,mk=x.mk,nm=x.nm,pt=x.pt,soc=x.sport.startsWith("soccer");
  if(mk==="h2h"){if(nm==="Draw")return r===1;if(r===1)return soc?false:"p";return r===(nm===e.home?0:2)}
  if(mk==="totals"){const t=h+a;return t===pt?"p":(nm==="Over"?t>pt:t<pt)}
  if(mk==="spreads"){const d=nm===e.home?h+pt-a:a+pt-h;return d>0?true:d<0?false:"p"}
  if(mk==="btts"){const b=h>0&&a>0;return nm==="Yes"?b:!b}
  if(mk==="double_chance"){return(r===0&&nm.includes(e.home))||(r===2&&nm.includes(e.away))||(r===1&&/draw/i.test(nm))}
  if(mk==="draw_no_bet"){if(r===1)return"p";return r===(nm===e.home?0:2)}
  return null}
async function settle(u){
  const sp=[...new Set(u.bets.filter(x=>x.st=="pending").flatMap(x=>x.sel.map(s=>s.sport)))],sc={};
  for(const s of sp){try{sc[s]=await feed("scores",s)}catch(e){}}
  u.bets.forEach(b=>{if(b.st!="pending")return;
    const rs=b.sel.map(x=>{const e=(sc[x.sport]||[]).find(e=>e.id==x.id);if(!e||!e.completed||!e.scores)return null;
      const h=+e.scores.find(s=>s.name==e.home).score,a=+e.scores.find(s=>s.name==e.away).score;if(x.mk)return legNew(x,e,h,a);if(x.m==="ou"){const t=h+a;return t===x.pt?"p":(t>x.pt?0:1)===x.k}return(h>a?0:h<a?2:1)===x.k});
    if(rs.includes(false))b.st="lost";
    else if(rs.every(x=>x===true||x==="p")){b.st="won";u.bal=round(u.bal+b.stake*b.sel.reduce((a,x,i)=>a*(rs[i]==="p"?1:x.odds),1))}});
}
module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).end();
  const b=req.body||{},out=(c,o)=>res.status(c).json(o);
  try{
    if(b.a==="signup"||b.a==="login"){
      const n=String(b.u||"").toLowerCase();
      if(!/^[a-z0-9_]{3,16}$/.test(n)||String(b.p||"").length<4)return out(400,{error:"Username: 3-16 letters/numbers. Password: 4+ characters."});
      let u=await getU(n);
      if(b.a==="signup"){if(u)return out(400,{error:"Username already taken"});
        const s=crypto.randomBytes(8).toString("hex");u={s,h:hash(b.p,s),bal:1000,bets:[]};await putU(n,u)}
      else if(!u||hash(b.p,u.s)!==u.h)return out(401,{error:"Wrong username or password"});
      return out(200,{token:tok(n,u),...view(n,u)});
    }
    const n=String(b.t||"").split(".")[0],u=n&&await getU(n);
    if(!u||tok(n,u)!==b.t)return out(401,{error:"Please log in again"});
    if(b.a==="state"){await settle(u);await putU(n,u);return out(200,view(n,u))}
    if(b.a==="board"){const a=await r(["HGETALL","users"]),rows=[];
      for(let i=0;i<a.length;i+=2)rows.push({name:a[i],bal:JSON.parse(a[i+1]).bal});
      return out(200,{rows:rows.sort((x,y)=>y.bal-x.bal).slice(0,50)})}
    if(b.a==="give"){if(n!==String(process.env.ADMIN_USER||"").toLowerCase())return out(403,{error:"Admin only"});
      const t=String(b.to||"").toLowerCase(),tu=await getU(t),amt=Number(b.amt);
      if(!tu||!isFinite(amt))return out(400,{error:"User not found or bad amount"});
      tu.bal=Math.max(0,round(tu.bal+amt));await putU(t,tu);return out(200,{ok:true,bal:tu.bal})}
    if(b.a==="bet"){
      const sel=Array.isArray(b.sel)?b.sel.slice(0,10):[],stake=Number(b.stake),multi=b.mode==="multi";
      if(!sel.length||!(stake>0))return out(400,{error:"Add a selection and a stake"});
      const cost=round(multi?stake:stake*sel.length);
      if(cost>u.bal)return out(400,{error:"Not enough credits"});
      if(multi&&new Set(sel.map(x=>x.id)).size<sel.length)return out(400,{error:"A multiple can't have two picks from the same match"});
      const locked=[],fc={};
      for(const x of sel){
        if(x.mk){const key=x.sport+"|"+x.id;fc[key]=fc[key]||await eventOdds(x.sport,x.id);const ev=fc[key];
          if(Date.now()-new Date(ev.commence_time)>4*36e5)return out(400,{error:"That match is no longer available"});
          const bk=typeof x.bk==="string"?x.bk:"avg",pt=x.pt==null?null:Number(x.pt);
          if(pt!==null&&(pt*4)%2!==0)return out(400,{error:"That line type isn't supported"});
          const o=priceFor(ev,bk,x.mk,x.nm,pt);
          if(!o)return out(400,{error:"Those odds aren't available right now"});
          if(Number(x.o)>0&&o<Number(x.o)*0.97)return out(400,{error:"Odds changed to "+o.toFixed(2)+". Check your slip and try again."});
          locked.push({id:x.id,sport:x.sport,mk:x.mk,nm:x.nm,pt,bk,odds:o,lb:x.nm+(pt!==null?" "+pt:"")+" · "+TT[x.mk],name:ev.home_team+" – "+ev.away_team});continue}
        const m=x.m==="ou"?"ou":"h2h",k=x.k===1?1:(x.k===2&&m==="h2h"?2:0);
        fc[x.sport]=fc[x.sport]||await feed("odds",x.sport);
        const ev=fc[x.sport].find(e=>e.id===x.id);
        if(!ev||Date.now()-new Date(ev.time)>4*36e5)return out(400,{error:"That match is no longer available"});
        const o=m==="ou"?(ev.ou&&ev.ou.o[k]):ev.odds[k];
        if(!o)return out(400,{error:"Those odds aren't available right now (market may be suspended)"});
        if(Number(x.o)>0&&o<Number(x.o)*0.97)return out(400,{error:"Odds changed to "+o.toFixed(2)+". Check your slip and try again."});
        locked.push({id:ev.id,sport:x.sport,m,k,odds:o,pt:m==="ou"?ev.ou.pt:undefined,name:ev.home+" – "+ev.away})}
      u.bal=round(u.bal-cost);
      if(multi)u.bets.unshift({type:"Multiple ("+locked.length+")",sel:locked,stake,st:"pending"});
      else locked.forEach(l=>u.bets.unshift({type:"Single",sel:[l],stake,st:"pending"}));
      await putU(n,u);return out(200,view(n,u));
    }
    out(400,{error:"unknown action"});
  }catch(e){out(500,{error:e.message})}
};
