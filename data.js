const {feed}=require("../lib/feed");
module.exports=async(req,res)=>{
  try{const d=await feed(req.query.type==="scores"?"scores":"odds",req.query.sport);
    res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=120");res.status(200).json(d);
  }catch(e){res.status(500).json({error:e.message})}
};
