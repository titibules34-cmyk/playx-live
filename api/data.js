const {feed,eventOdds,view}=require("../lib/feed");
module.exports=async(req,res)=>{
  try{const {type,sport,id,bk}=req.query;let d;
    if(type==="event"){if(!/^[a-f0-9]{10,64}$/i.test(id||""))throw new Error("bad id");
      d=view(await eventOdds(sport,id),/^[a-z0-9_]{2,40}$/.test(bk||"")?bk:"avg")}
    else d=await feed(type==="scores"?"scores":"odds",sport);
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=120");res.status(200).json(d);
  }catch(e){res.status(500).json({error:e.message})}
};
