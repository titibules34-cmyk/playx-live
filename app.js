const crypto=require("crypto"),{feed}=require("../lib/feed");
const U=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,T=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN,SEC=process.env.APP_SECRET||"change-me";
const r=async c=>(await(await fetch(U,{method:"POST",headers:{Authorization:"Bearer "+T},body:JSON.stringify(c)})).json()).result;
const getU=async n=>{const v=await r(["HGET","users",n]);return v?JSON.parse(v):null};
const putU=(n,u)=>r(["HSET","users",n,JSON.stringify(u)]);
const hash=(p,s)=>crypto.scryptSync(String(p),s,32).toString("hex");
const tok=(n,u)=>n+"."+crypto.createHmac("sha256",SEC).update(n+u.h).digest("hex");
const round=x=>Math.round(x*100)/100;
const view=(n,u)=>({name:n,bal:u.bal,bets:u.bets.slice(0,50),admin:n===String(process.env.ADMIN_USER||"").toLowerCase()});
async function settle(u){
  const sp=[...new Set(u.bets.filter(x=>x.st=="pending").flatMap(x=>x.sel.map(s=>s.sport)))],sc={};
  for(const s of sp){try{sc[s]=await feed("scores",s)}catch(e){}}
  u.bets.forEach(b=>{if(b.st!="pending")return;
    const rs=b.sel.map(x=>{const e=(sc[x.sport]||[]).find(e=>e.id==x.id);if(!e||!e.completed||!e.scores)return null;
      const h=+e.scores.find(s=>s.name==e.home).score,a=+e.scores.find(s=>s.name==e.away).score;return(h>a?0:h<a?2:1)==x.k});
    if(rs.includes(false))b.st="lost";
    else if(rs.every(x=>x===true)){b.st="won";u.bal=round(u.bal+b.stake*b.sel.reduce((a,x)=>a*x.odds,1))}});
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
      const locked=[];
      for(const x of sel){const ev=(await feed("odds",x.sport)).find(e=>e.id===x.id);
        if(!ev||new Date(ev.time)<=Date.now())return out(400,{error:"A match has already started or is no longer available"});
        const o=ev.odds[x.k];if(!o)return out(400,{error:"That odds option isn't available"});
        locked.push({id:ev.id,sport:x.sport,k:x.k,odds:o,name:ev.home+" – "+ev.away})}
      u.bal=round(u.bal-cost);
      if(multi)u.bets.unshift({type:"Multiple ("+locked.length+")",sel:locked,stake,st:"pending"});
      else locked.forEach(l=>u.bets.unshift({type:"Single",sel:[l],stake,st:"pending"}));
      await putU(n,u);return out(200,view(n,u));
    }
    out(400,{error:"unknown action"});
  }catch(e){out(500,{error:e.message})}
};
